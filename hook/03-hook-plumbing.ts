// Shared listeners keep calling the other sections when one throws, as
// separate listeners would; the first error of each section is logged so a
// broken section does not fail unseen (later ones are only counted).
const hookFailures = new Map<string, number>();
function reportingFailures(name: string, fn: Function): Function {
  return function (this: any, ...args: any[]) {
    try { return fn.apply(this, args); }
    catch (error) {
      const count = (hookFailures.get(name) || 0) + 1;
      hookFailures.set(name, count);
      if (count === 1 || count === 100 || count === 10000) log(`hook failed in ${name} (${count}x): ${error}`);
    }
  };
}
// Each Interceptor listener is its own native -> JS crossing; a dozen
// sections ran an onLeave on ServicesManager.Update every frame. Leave-only
// hooks on one function now share a single listener that calls them in turn.
const sharedLeaves = new Map<string, Function[]>();
let frameLeaves: any = null;
function sharedLeave(target: NativePointerValue, onLeave: Function): InvocationListener {
  const key = ptr(target as any).toString();
  let list = sharedLeaves.get(key);
  if (!list) {
    const calls: Function[] = list = [];
    sharedLeaves.set(key, calls);
    Interceptor.attach(target, { onLeave(retval) {
      for (let i = 0; i < calls.length; i++) { try { calls[i].call(this, retval); } catch (_) { /* as a separate listener would: the others still run */ } }
    } });
  }
  const call = reportingFailures(currentSection, onLeave);
  list.push(call);
  return { detach() { const i = list!.indexOf(call); if (i >= 0) list!.splice(i, 1); } } as any;
}

function hookAttach(target: NativePointerValue, callbacks: any): InvocationListener {
  if (typeof callbacks === "object" && callbacks !== null && callbacks.touchOnly && callbacks.onEnter && !callbacks.onLeave && frameLeaves && ptr(target as any).equals(frameLeaves.update))
    return frameLeaves.onTouch(callbacks.onEnter);
  if (typeof callbacks === "object" && callbacks !== null && callbacks.onLeave && !callbacks.onEnter && frameLeaves && ptr(target as any).equals(frameLeaves.update))
    return frameLeaves.onLeave(callbacks.onLeave);
  if (typeof callbacks === "object" && callbacks !== null && callbacks.onLeave && !callbacks.onEnter)
    return sharedLeave(target, hookTimer ? hookTimer(currentSection, callbacks.onLeave) : callbacks.onLeave);
  if (!hookTimer || typeof callbacks !== "object" || callbacks === null) return Interceptor.attach(target, callbacks);
  const name = currentSection, wrapped: any = {};
  if (callbacks.onEnter) wrapped.onEnter = hookTimer(name, callbacks.onEnter);
  if (callbacks.onLeave) wrapped.onLeave = hookTimer(name, callbacks.onLeave);
  return Interceptor.attach(target, wrapped);
}

// A listener that enters JS only while its native flag is set: hooks on
// functions that run every frame (Canvas.SendWillRenderCanvases) but only
// have work now and then. Returns the switch for the flag.
const gatedKeep: any[] = [];
function gatedHook(target: NativePointerValue, side: "enter" | "leave", fn: () => void, everyMs = 0): (on: boolean) => void {
  // int armed @0, int every_ms @4, int64 last_ms @8
  const flag = Memory.alloc(16);
  flag.add(4).writeS32(everyMs);
  const timed = reportingFailures(currentSection, hookTimer ? hookTimer(currentSection, fn) : fn);
  const work = new NativeCallback(() => { try { timed(); } catch (_) { /* as a listener would */ } }, "void", []);
  try {
    const cm = new CModule(`
#include <gum/guminterceptor.h>
typedef struct { long s; long ns; } ts_t;
typedef struct { int armed; int every_ms; long long last_ms; } Gate;
extern Gate gate;
extern void work (void);
extern int clock_gettime (int clock, ts_t * t);
void ${side === "enter" ? "onEnter" : "onLeave"} (GumInvocationContext * ic) {
  if (!gate.armed) return;
  if (gate.every_ms) {
    ts_t t; clock_gettime (1, &t);
    long long now = (long long) t.s * 1000LL + t.ns / 1000000;
    if (now - gate.last_ms < gate.every_ms) return;
    gate.last_ms = now;
  }
  work ();
}
`, { gate: flag, work, clock_gettime: Process.getModuleByName("libc.so").getExportByName("clock_gettime") });
    Interceptor.attach(target, cm as any);
    gatedKeep.push(cm, work);
  } catch (_) {
    let last = 0;
    const call = () => {
      if (!flag.readS32()) return;
      if (everyMs) { const now = Date.now(); if (now - last < everyMs) return; last = now; }
      try { timed(); } catch (_) {}
    };
    Interceptor.attach(target, side === "enter" ? { onEnter: call } : { onLeave: call });
    gatedKeep.push(work);
  }
  return (on: boolean) => flag.writeS32(on ? 1 : 0);
}

function section(name: string, fn: () => void) {
  currentSection = name;
  try { fn(); log(`OK   ${name}`); }
  catch (e) { log(`FAIL ${name}: ${e}`); }
  finally { currentSection = "later"; }
}
function cls(img: Il2Cpp.Image, full: string): Il2Cpp.Class {
  const c = img.tryClass(full);
  if (c) return c;
  const short = full.split(".").pop()!;
  const alt = img.classes.find(k => k.name === short && k.declaringClass == null);
  if (!alt) throw new Error(`class ${full} not found`);
  return alt;
}
// Calls a managed delegate whose single parameter is a reference (e.g. Action<string>).
function invokeDelegatePtr(del: Il2Cpp.Object, value: NativePointer) {
  const method = del.method("Invoke"), handle = value?.handle ?? value;
  const argument = method.parameters[0].type.name === "System.String" ? new Il2Cpp.String(handle) : new Il2Cpp.Object(handle);
  method.invoke(argument);
}


