// Reports 143-144 (Xiaomi 22101316G, Android 14): the picture froze while the
// music went on, with the game on screen (oom_score_adj 0), once even with no
// trip to the background. The thread dump showed Unity's Java thread asleep
// in epoll_wait. Unity 2017's UnityMain thread (UnityPlayer$e) draws a frame
// from its message queue's idle handler only while two of its flags are set:
// b (running: set after nativeResume, cleared by a pause) and c (a surface:
// set after nativeRecreateGfxState got one, cleared when it went). With either
// clear it posts nothing and sleeps until another message comes; the game
// then stays frozen until it is restarted.
//
// The script has no Java bridge, so this talks JNI. It finds UnityPlayer's
// natives in libunity's RegisterNatives table (checked by name), logs the
// lifecycle calls (pause, resume, focus, surface), keeps a global reference to
// the UnityPlayer from the first nativeRender and, when the hang watch sees no
// frame on screen, reads those flags and Unity's own state (class l: running,
// paused by the activity, window focus) and sets back what Android says:
// the surface the SurfaceView has, the focus the window has, the resume the
// resumed activity had.
// BEGIN android-ui: unity-loop-plan
// What to set back, in order, from what Unity's loop and Android say: the
// surface the SurfaceView has; the window focus Unity missed
// (windowFocusChanged(true) resumes Unity by itself when nothing else holds
// it back); the resume Unity missed (UnityPlayer.f); or, with Unity resumed
// and its loop stopped, the loop's own running flag. Nothing while the
// activity is paused or finishing.
function unityLoopPlan(s: { loopRunning: boolean, loopSurface: boolean, unityRunning: boolean, unityPaused: boolean,
    unityFocus: boolean, windowFocus: boolean | null, surfaceValid: boolean, finishing: boolean | null }): string[] {
  if (s.unityPaused || s.finishing !== false) return [];
  const plan: string[] = [];
  if (!s.loopSurface && s.surfaceValid) plan.push("surface");
  if (!s.loopRunning) {
    if (!s.unityFocus && s.windowFocus === true) plan.push("focus");
    plan.push(s.unityRunning ? "loop" : "resume");
  }
  return plan;
}
// END android-ui: unity-loop-plan

const unityPlayerLoop = (() => {
  // JNINativeMethod {name, signature, fnPtr} rows of UnityPlayer in this
  // libunity build, from nativeDone on.
  const TABLE = 0xe68bc0;
  const ROWS = ["nativeDone", "nativePause", "nativeRecreateGfxState", "nativeRender", "nativeResume", "nativeLowMemory", "nativeFocusChanged"];
  const recent: string[] = [];
  // Set by the first native call (no Frida globals while the script loads).
  let vm: NativePointer | null = null, player: NativePointer | null = null;
  const none = (p: NativePointer | null): boolean => !p || p.isNull();
  const keep: any[] = [];
  const functions = new Map<string, any>();
  const note = (event: string) => {
    recent.push(`${new Date().toISOString().slice(11, 19)} ${event}`);
    if (recent.length > 8) recent.shift();
    log(`unity player: ${event}`);
  };
  // A function of the JNIEnv (or JavaVM) table, by its index.
  const table = (self: NativePointer, index: number, ret: string, args: string[]) => {
    const at = self.readPointer().add(index * Process.pointerSize).readPointer(), key = `${at}`;
    let f = functions.get(key);
    if (!f) { f = new NativeFunction(at, ret as any, ["pointer", ...args] as any); functions.set(key, f); }
    return (...rest: any[]) => f(self, ...rest);
  };
  const capture = (env: NativePointer, thiz: NativePointer) => {
    if (!none(player) || thiz.isNull()) return;
    const out = Memory.alloc(Process.pointerSize);
    if (table(env, 219, "int", ["pointer"])(out) !== 0) return; // GetJavaVM
    vm = out.readPointer();
    player = table(env, 21, "pointer", ["pointer"])(thiz); // NewGlobalRef
  };

  function install(): string {
    const unity = Process.findModuleByName("libunity.so");
    if (!unity) return "libunity.so not loaded";
    const at: Record<string, NativePointer> = {};
    for (let i = 0; i < ROWS.length; i++) {
      const row = unity.base.add(TABLE + i * 3 * Process.pointerSize);
      let name = "";
      try { name = row.readPointer().readCString() || ""; } catch (_) {}
      if (name !== ROWS[i]) return `another libunity build (row ${i}: ${name || "?"})`;
      at[name] = row.add(2 * Process.pointerSize).readPointer();
    }
    const render = Interceptor.attach(at.nativeRender, {
      onEnter(args) { if (none(player)) { capture(args[0], args[1]); if (!none(player)) setTimeout(() => render.detach(), 0); } },
    });
    const watch = (name: string, event: (args: InvocationArguments) => string) =>
      keep.push(Interceptor.attach(at[name], { onEnter(args) { capture(args[0], args[1]); note(event(args)); } }));
    watch("nativePause", () => "pause");
    watch("nativeResume", () => "resume");
    watch("nativeDone", () => "done");
    watch("nativeLowMemory", () => "low memory");
    watch("nativeFocusChanged", (args) => `focus ${(args[2].toInt32() & 0xff) ? "gained" : "lost"}`);
    watch("nativeRecreateGfxState", (args) => `surface ${args[3].isNull() ? "gone" : "attached"}${args[2].toInt32() ? ` (display ${args[2].toInt32()})` : ""}`);
    keep.push(render);
    return "";
  }

  // Runs fn on this thread attached to the VM (as a daemon, kept attached),
  // inside a local reference frame.
  function withJni<T>(fn: (j: any) => T): T | null {
    if (none(vm) || none(player)) return null;
    const out = Memory.alloc(Process.pointerSize);
    if (table(vm, 6, "int", ["pointer", "int"])(out, 0x10006) !== 0 // GetEnv
        && table(vm, 7, "int", ["pointer", "pointer"])(out, NULL) !== 0) return null; // AttachCurrentThreadAsDaemon
    const env = out.readPointer();
    const f = (index: number, ret: string, args: string[]) => table(env, index, ret, args);
    const pending = f(228, "uint8", []), clear = f(17, "void", []);
    const checked = <R>(value: R, what: string): R => { if (pending()) { clear(); throw Error(what); } return value; };
    const classOf = (o: NativePointer) => f(31, "pointer", ["pointer"])(o);
    const field = (o: NativePointer, name: string, sig: string) =>
      checked(f(94, "pointer", ["pointer", "pointer", "pointer"])(classOf(o), Memory.allocUtf8String(name), Memory.allocUtf8String(sig)), `no field ${name}`);
    const values = (args: (number | NativePointer)[]) => {
      const block = Memory.alloc(8 * Math.max(1, args.length));
      args.forEach((a, i) => { if (typeof a === "number") block.add(8 * i).writeS64(a); else block.add(8 * i).writePointer(a); });
      return block;
    };
    // Called non-virtually on the object's own class: private methods too.
    const call = (index: number, ret: string) => (o: NativePointer, name: string, sig: string, args: (number | NativePointer)[] = []) => {
      const cls = classOf(o);
      const id = checked(f(33, "pointer", ["pointer", "pointer", "pointer"])(cls, Memory.allocUtf8String(name), Memory.allocUtf8String(sig)), `no method ${name}${sig}`);
      return checked(f(index, ret, ["pointer", "pointer", "pointer", "pointer"])(o, cls, id, values(args)), `${name} threw`);
    };
    const j = {
      player,
      object: (o: NativePointer, name: string, sig: string) => f(95, "pointer", ["pointer", "pointer"])(o, field(o, name, sig)) as NativePointer,
      bool: (o: NativePointer, name: string) => f(96, "uint8", ["pointer", "pointer"])(o, field(o, name, "Z")) !== 0,
      int: (o: NativePointer, name: string) => f(100, "int", ["pointer", "pointer"])(o, field(o, name, "I")) as number,
      setBool: (o: NativePointer, name: string, value: boolean) => f(105, "void", ["pointer", "pointer", "uint8"])(o, field(o, name, "Z"), value ? 1 : 0),
      callObject: call(66, "pointer"),
      callBool: (o: NativePointer, name: string, sig: string, args: (number | NativePointer)[] = []) => call(69, "uint8")(o, name, sig, args) !== 0,
      callVoid: call(93, "void"),
    };
    if (f(19, "int", ["int"])(32) !== 0) return null; // PushLocalFrame
    try { return fn(j); }
    finally { if (pending()) clear(); f(20, "pointer", ["pointer"])(NULL); } // PopLocalFrame
  }

  const THREAD = "Lcom/unity3d/player/UnityPlayer$e;";
  function inspect(j: any) {
    const thread = j.object(j.player, "a", THREAD), state = j.object(j.player, "f", "Lcom/unity3d/player/l;");
    const activity = j.object(j.player, "p", "Landroid/content/Context;");
    const view = j.object(j.player, "q", "Landroid/view/SurfaceView;");
    let surface = NULL, surfaceValid = false;
    if (!view.isNull()) {
      const holder = j.callObject(view, "getHolder", "()Landroid/view/SurfaceHolder;");
      if (!holder.isNull()) surface = j.callObject(holder, "getSurface", "()Landroid/view/Surface;");
      surfaceValid = !surface.isNull() && j.callBool(surface, "isValid", "()Z");
    }
    const activityCall = (name: string) => { try { return j.callBool(activity, name, "()Z"); } catch (_) { return null; } };
    return {
      thread, surface,
      loopRunning: j.bool(thread, "b"), loopSurface: j.bool(thread, "c"), loopFocus: j.int(thread, "d"),
      unityRunning: j.bool(state, "d"), unityPaused: j.bool(state, "e"), unityFocus: j.bool(state, "c"),
      windowFocus: activityCall("hasWindowFocus"), finishing: activityCall("isFinishing"), surfaceValid,
    };
  }
  const describe = (s: any) =>
    `loop running ${s.loopRunning}, surface ${s.loopSurface}, focus state ${s.loopFocus}; unity running ${s.unityRunning}, paused ${s.unityPaused}, focus ${s.unityFocus}; window focus ${s.windowFocus}, surface valid ${s.surfaceValid}, finishing ${s.finishing}`;

  return {
    install,
    // Called by the hang watch when no frame came for a while with the game
    // on screen: says what Unity's loop waits for and sets back what Android's
    // state says it should have. Never while the activity is paused.
    revive(): string {
      if (none(player)) return "unity player: no reference (no frame was drawn since the start)";
      try {
        return withJni((j) => {
          const s = inspect(j), done: string[] = [];
          const unityRunning = () => j.bool(j.object(j.player, "f", "Lcom/unity3d/player/l;"), "d");
          for (const step of unityLoopPlan(s)) {
            if (step === "surface") { j.callBool(j.player, "b", "(ILandroid/view/Surface;)Z", [0, s.surface]); done.push("surface attached again"); }
            else if (step === "focus") { j.callVoid(j.player, "windowFocusChanged", "(Z)V", [1]); done.push("window focus sent again"); }
            // The focus above may have resumed Unity already.
            else if (step === "resume") { if (!unityRunning()) { j.callVoid(j.player, "f", "()V"); done.push("resume sent again"); } }
            else if (step === "loop") { j.callVoid(s.thread, "b", "()V"); done.push("loop restarted"); }
          }
          return `unity player: ${describe(s)}; ${done.length ? done.join(", ") : "nothing to set back"}; recent: ${recent.join(", ") || "-"}`;
        }) ?? "unity player: no JNI environment";
      } catch (error) { return `unity player: ${error}`; }
    },
    // The test channel's experiments "loopStallSurface" and "loopStallResume":
    // 45 s after the first frame one of the loop's flags is cleared, as on
    // the Xiaomi, so the hang watch has a hang to set right.
    testStall(kind: "Surface" | "Resume") {
      const timer = setInterval(() => {
        if (none(player)) return;
        clearInterval(timer);
        setTimeout(() => {
          try {
            withJni((j) => j.setBool(j.object(j.player, "a", THREAD), kind === "Surface" ? "c" : "b", false));
            log(`unity player: experiment cleared the loop's ${kind === "Surface" ? "surface" : "running"} flag`);
          } catch (error) { log(`unity player: experiment failed: ${error}`); }
        }, 45000);
      }, 1000);
    },
  };
})();
