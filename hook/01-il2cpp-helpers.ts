// Calls a managed delegate whose single parameter is a 32-bit value (e.g. Action<ResultCode>).
function invokeDelegateInt(del: Il2Cpp.Object, value: number) {
  const method = del.method("Invoke"), klass = method.parameters[0].type.class;
  if (klass.isEnum) {
    const boxed = klass.alloc(); boxed.field("value__").value = value;
    method.invoke(boxed.unbox());
  } else method.invoke(value);
}

// Through the outer class: image.classes reads every type of the image
// (Assembly.GetTypes), and that first read, early in the setup, sometimes
// never came back on a OnePlus 7 Pro.
function nested(image: Il2Cpp.Image, outer: string, inner: string): Il2Cpp.Class {
  const c = image.tryClass(outer)?.nestedClasses.find(k => k.name === inner)
    ?? image.classes.find(k => k.name === inner && k.declaringClass?.name === outer);
  if (!c) throw new Error(`class ${outer}/${inner} not found`);
  return c;
}

  // A managed enum field reads back as a value type; dig the number out of it.
  function enumVal(v: any): number {
    if (v == null) return -1;
    if (typeof v === "number") return v;
    try { return Number((v as any).field("value__").value); } catch (_) { return -1; }
  }

function channelFrom(settings: Il2Cpp.Object | null): string {
  try {
    if (settings && !settings.handle.isNull()) {
      const names = settings.field<Il2Cpp.Array<Il2Cpp.String>>("_channelNames").value;
      const idx = enumVal(settings.field<any>("_channel").value);
      return names.get(idx).content ?? "live";
    }
  } catch (e) { log(`channel lookup failed: ${e}`); }
  return "live";
}

function fillBase(req: Il2Cpp.Object, channel: string) {
  req.field<Il2Cpp.String>("channel").value = Il2Cpp.string(channel);
  req.field<Il2Cpp.String>("majorVersion").value = Il2Cpp.string(MAJOR_VERSION);
  req.field<Il2Cpp.String>("changelist").value = Il2Cpp.string(CHANGELIST);
  req.field<Il2Cpp.String>("componentType").value = Il2Cpp.string(COMPONENT_TYPE);
}

function call(o: Il2Cpp.Object, name: string, ...a: any[]): any { return (o.method(name) as any).invoke(...a); }


// Request body as text with secrets masked (never log passwords or tickets).
function bodyOf(req: Il2Cpp.Object): string {
  try {
    const raw = call(req, "get_RawData");
    if (!raw || raw.handle.isNull()) return "(none)";
    const n = Math.min(Number(raw.length), 1500);
    let t = "";
    for (let i = 0; i < n; i++) t += String.fromCharCode(Number(raw.get(i)));
    return redactLog(t);
  } catch (e) { return `(unreadable: ${e})`; }
}

// Overrides applied to every auth request before it is sent, so the server sees a Windows PC client.
// Defaults mirror the capture of the real Windows/Steam client; any key can be changed (or added, e.g.
// loginPlatform, bnetKeyPlatform, channel, deviceName) without rebuilding via:
//   adb push tesl-hook.json /sdcard/Android/data/com.bethsoft.theelderscrollslegends/files/tesl-hook.json
const OVERRIDES_PATH = "/sdcard/Android/data/com.bethsoft.theelderscrollslegends/files/tesl-hook.json";
function loadOverrides(): Record<string, string> {
  const o: Record<string, string> = {
    componentType: COMPONENT_TYPE, majorVersion: MAJOR_VERSION, changelist: CHANGELIST,
    channel: "prod-live", os: "WINDOWS", platform: "PC_CLIENT", osVersion: "10",
  };
  try {
    const extra = JSON.parse((File as any).readAllText(OVERRIDES_PATH));
    for (const k of Object.keys(extra)) o[k] = String(extra[k]);
    log(`overrides loaded from ${OVERRIDES_PATH}`);
  } catch (_) { log("no tesl-hook.json, using default overrides"); }
  return o;
}

