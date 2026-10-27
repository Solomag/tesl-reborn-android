// @ts-nocheck
// TESL Reborn client hooks for the Android (IL2CPP) build.
// Mirrors the patches of TeslRebornPlugin 1.3.1 (BepInEx/Harmony, Windows):
// the connectivity patches (config redirect, auth bypass, HTTP) plus the
// feature patches (rewards refresh, match history, deck statistics, news,
// custom titles, translations, credits, title banners and player title
// banners).
import "frida-il2cpp-bridge";
declare const console: { log(...a: any[]): void };

const CONFIG_LOCAL = "http://localhost:3000/config.json";
const CONFIG_URL = "https://tesl-reborn.com/config.json";
const PLUGIN_VERSION = "1.3.1-beta";     // sent as X-TeslRebornPlugin-Version (= Plugin.GetVersionString(): version + "-beta"); bump when the plugin updates
// The server expects a Windows/Steam client, so we present as one:
const COMPONENT_TYPE = "win";
const LOGIN_PLATFORM = "Steam";          // value of BNETAuthUtilities.GetLoginPlatform() on Windows
const MAJOR_VERSION = "db-630167952";    // hardcoded by the plugin
const CHANGELIST = "317259";             // SourceControlVersion.GetChangelist() on the Windows build
const TAG = "[tesl-hook]";

let androidLogWrite: NativeFunction<number, [number, NativePointer, NativePointer]> | null = null;
try {
  androidLogWrite = new NativeFunction(
    (Process as any).getModuleByName("liblog.so").getExportByName("__android_log_write"),
    "int", ["int", "pointer", "pointer"]);
} catch (e) { console.log(`${TAG} no liblog: ${e}`); }
const tagPtr = Memory.allocUtf8String("tesl-hook");
function redactLog(message) {
  // Handle escaped quotes and unterminated values before limiting log length.
  return String(message)
    .replace(/("(?:password|encryptedAppTicket|token|sessionToken|access_token|refresh_token|authorization|x-session-token)"\s*:\s*")(?:[^"\\]|\\[\s\S])*(?:"|\\?$)/gi, '$1[REDACTED]"')
    .replace(/\b(?:Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/((?:authorization|x-session-token)\s*:\s*)[^\r\n]*/gi, '$1[REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]*){0,2}/g, '[REDACTED-JWT]');
}

let portLog = null;
try { portLog = createNativePortLog(redactLog); } catch (_) {}
const log = (m: string) => {
  m = redactLog(m);
  portLog?.(m);
  console.log(`${TAG} ${m}`);
  try { androidLogWrite?.(4, tagPtr, Memory.allocUtf8String(m.length > 900 ? m.slice(0, 900) + "..." : m)); } catch (_) {}
};
let nativeRename = null;
function atomicRename(from: string, to: string): boolean {
  try {
    if (!nativeRename) nativeRename = new NativeFunction(Process.getModuleByName("libc.so").getExportByName("rename"), "int", ["pointer", "pointer"]);
    return nativeRename(Memory.allocUtf8String(from), Memory.allocUtf8String(to)) === 0;
  } catch (_) { return false; }
}
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function fakeTicket(len = 32): string {      // base64 of `len` random bytes, like the plugin's Generate()
  const b: number[] = [];
  for (let i = 0; i < len; i++) b.push(Math.floor(Math.random() * 256));
  let o = "";
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    o += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    o += i + 1 < b.length ? B64[(n >> 6) & 63] : "=";
    o += i + 2 < b.length ? B64[n & 63] : "=";
  }
  return o;
}

// Calls a managed delegate whose single parameter is a 32-bit value (e.g. Action<ResultCode>).
function invokeDelegateInt(del: Il2Cpp.Object, value: number) {
  const method = del.method("Invoke"), klass = method.parameters[0].type.class;
  if (klass.isEnum) {
    const boxed = klass.alloc(); boxed.field("value__").value = value;
    method.invoke(boxed.unbox());
  } else method.invoke(value);
}

function nested(image: Il2Cpp.Image, outer: string, inner: string): Il2Cpp.Class {
  const c = image.classes.find(k => k.name === inner && k.declaringClass?.name === outer);
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

function section(name: string, fn: () => void) {
  try { fn(); log(`OK   ${name}`); }
  catch (e) { log(`FAIL ${name}: ${e}`); }
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

const CREATE_ACCOUNT = false;            // the plugin sends false; flip to true if the server says "account not found"

Il2Cpp.perform(() => {
  const img = Il2Cpp.domain.assembly("Assembly-CSharp").image;
  // BEGIN android-ui: resource-events
  // Bounded startup trace, without request/response bodies or credentials.
  const resourceTrace = [], resourceTraceStarted = Date.now();
  function recordResourceEvent(kind, path, status = 0) {
    if (Date.now() - resourceTraceStarted > 900000) return;
    resourceTrace.push({ at: Date.now(), kind, path: String(path).replace(/[?#].*$/, "").slice(0,240), status });
    if (resourceTrace.length > 128) resourceTrace.shift();
  }
  // END android-ui: resource-events
  log(`attached, Unity ${Il2Cpp.unityVersion}, Android patch ${globalThis.TeslRebornUpdater?.current()?.revision ?? "embedded"}`);
  // --- shared: the Steam-style requests the server accepts ---
  const utils = cls(img, "SparkleServices.HTTPUtils");
  const authResult = nested(img, "AuthBase", "AuthResult");
  const steamReq = nested(img, "AuthBase", "AuthBNETSteamRequest");
  const linkReq = nested(img, "AuthBase", "SteamSessionLinkRequest");
  const postGeneric = utils.methods.find(m => m.name === "Post" && m.isGeneric && m.generics.length === 2)!;
  const postLogin = postGeneric.inflate(steamReq, authResult);
  const postLink = postGeneric.inflate(linkReq, authResult);

  function sendLogin(language: Il2Cpp.String, settings: Il2Cpp.Object | null, endpoint: Il2Cpp.String, cb: Il2Cpp.Object) {
    const body = steamReq.new();
    fillBase(body, channelFrom(settings));
    body.field<Il2Cpp.String>("loginPlatform").value = Il2Cpp.string(LOGIN_PLATFORM);
    body.field<Il2Cpp.String>("bnetKeyPlatform").value = Il2Cpp.string(LOGIN_PLATFORM);
    body.field<boolean>("createAccount").value = CREATE_ACCOUNT;
    body.field<Il2Cpp.String>("language").value = resourceLanguage() ? Il2Cpp.string(shapedLanguage(resourceLanguage(), language.content || "en")) : language;
    body.field<Il2Cpp.String>("steamId").value = Il2Cpp.string("");
    body.field<Il2Cpp.String>("encryptedAppTicket").value = Il2Cpp.string(fakeTicket());
    postLogin.invoke(body, endpoint, Il2Cpp.string("bnetSteamLogin"), NULL, cb);
  }
  function sendLink(sessionAuth: Il2Cpp.Object, language: Il2Cpp.String, settings: Il2Cpp.Object | null, endpoint: Il2Cpp.String, cb: Il2Cpp.Object) {
    const body = linkReq.new();
    fillBase(body, channelFrom(settings));
    body.field<Il2Cpp.String>("loginPlatform").value = Il2Cpp.string(LOGIN_PLATFORM);
    body.field<Il2Cpp.String>("bnetKeyPlatform").value = Il2Cpp.string(LOGIN_PLATFORM);
    body.field<Il2Cpp.String>("language").value = resourceLanguage() ? Il2Cpp.string(shapedLanguage(resourceLanguage(), language.content || "en")) : language;
    body.field<Il2Cpp.String>("steamId").value = Il2Cpp.string("");
    body.field<Il2Cpp.String>("encryptedAppTicket").value = Il2Cpp.string(fakeTicket());
    postLink.invoke(body, endpoint, Il2Cpp.string("bnetSteamLinkToSession"),
      sessionAuth.field<Il2Cpp.String>("token").value, cb);
  }

  // 1a) Auth, Windows/NSO entry points (same as the plugin)
  section("auth hooks (BNETPlatformAuthInstance)", () => {
    const bnet = cls(img, "SparkleServices.BNETPlatformAuthInstance");
    bnet.method("SignIn").implementation = function (_request, cb) {
      log("Bypassing BNET SignIn");
      invokeDelegateInt(cb as Il2Cpp.Object, 0);
    };
    bnet.method("DoNsoAuth").implementation = function (_createAnon, request, cb) {
      log("Bypassing NSO Auth");
      const req = request as Il2Cpp.Object;
      sendLogin(req.field<Il2Cpp.String>("LanguageCode").value,
        req.field<Il2Cpp.Object>("ServicesSettings").value,
        req.field<Il2Cpp.String>("AccountEndPoint").value, cb as Il2Cpp.Object);
    };
    bnet.method("DoNsoToSessionLink").implementation = function (sessionAuth, language, _dev, settings, endpoint, cb) {
      log("Bypassing NSO To Session Link");
      sendLink(sessionAuth as Il2Cpp.Object, language as Il2Cpp.String, settings as Il2Cpp.Object,
        endpoint as Il2Cpp.String, cb as Il2Cpp.Object);
    };
  });

  // 1b) Auth, Android entry points: the Android build signs in through Google Play instead
  section("auth hooks (GooglePlayAuthUtilities)", () => {
    const gp = cls(img, "SparkleServices.GooglePlayAuthUtilities");
    gp.method("SignOn").implementation = function (cb) {
      log("Bypassing Google Play SignOn");
      invokeDelegateInt(cb as Il2Cpp.Object, 0);
    };
    gp.method("RequestGooglePlayServerAuthCode").implementation = function (cb) {
      log("Bypassing Google Play server auth code");
      invokeDelegatePtr(cb as Il2Cpp.Object, Il2Cpp.string("").handle);
    };
    gp.method("DoAuth").implementation = function (_createAnon, language, _dev, settings, endpoint, cb) {
      log("Google Play DoAuth -> Steam-style login");
      sendLogin(language as Il2Cpp.String, settings as Il2Cpp.Object, endpoint as Il2Cpp.String, cb as Il2Cpp.Object);
    };
    gp.method("LinkToSession").implementation = function (sessionAuth, language, _dev, settings, endpoint, cb) {
      log("Google Play LinkToSession -> Steam-style link");
      sendLink(sessionAuth as Il2Cpp.Object, language as Il2Cpp.String, settings as Il2Cpp.Object,
        endpoint as Il2Cpp.String, cb as Il2Cpp.Object);
    };
  });

  // 1c) Make every auth request look like the Windows client. The server expects a Windows PC client; Android
  //     values such as componentType "android" are the prime suspects for its HTTP 500 on username/password login.
  //     The body is rewritten by the hook in the "http header" section below, which runs on the HTTP worker
  //     thread right before the request is written to the socket. It has to be done there and not in
  //     HTTPRequest.Send(): a request that the game creates from within our own callback (the auto login)
  //     would escape the Send() interceptor completely, because Frida cannot run a nested interceptor
  //     callback while our callback is still on the stack.
  const overrides = loadOverrides();
  const byteClass = Il2Cpp.corlib.class("System.Byte");

  function pinRequestLanguage(req: Il2Cpp.Object): string {
    let uri = String(call(req, "get_Uri"));
    const chosen = resourceLanguage(), next = localizedGameUri(uri, chosen);
    if (next !== uri) {
      const value = newWith(ucls("System.Uri"), Il2Cpp.string(next));
      try { call(req, "set_Uri", value); }
      catch (_) { req.field("<Uri>k__BackingField").value = value; }
      uri = next;
    }
    return uri;
  }
  section("request language before send", () => {
    const send = cls(img, "BestHTTP.HTTPRequest").tryMethod("Send", 0);
    if (send && !send.virtualAddress.isNull()) Interceptor.attach(send.virtualAddress, {
      onEnter(args) { try { pinRequestLanguage(new Il2Cpp.Object(args[0])); } catch (error) { log(`request language: ${error}`); } }
    });
  });

  // Rewrites the JSON body of an auth request so that the service sees a Windows client.
  function rewriteAuthBody(req: Il2Cpp.Object, uri: string): void {
    try {
      if (uri.indexOf("/api/account/") < 0) return;
      const raw = call(req, "get_RawData");
      if (!raw || raw.handle.isNull()) { log(`normalizer: ${uri.split("/").pop()} has no body`); return; }
      const len = Number(raw.length);
      let bin = "";
      for (let i = 0; i < len; i++) bin += String.fromCharCode(Number(raw.get(i)));
      const obj = JSON.parse(decodeURIComponent(Array.from(bin, ch => "%" + ch.charCodeAt(0).toString(16).padStart(2, "0")).join("")));
      if (typeof obj !== "object" || obj === null || !("componentType" in obj)) {
        log(`normalizer: ${uri.split("/").pop()} has no componentType`);
        return;
      }
      const changed: string[] = [];
      const language = resourceLanguage();
      if (language && typeof obj.language === "string") {
        const selected = shapedLanguage(language, obj.language);
        if (obj.language !== selected) { obj.language = selected; changed.push("language"); }
      }
      for (const k of Object.keys(overrides)) {
        if (k in obj && obj[k] !== overrides[k]) { obj[k] = overrides[k]; changed.push(k); }
      }
      // The service registers the source fingerprint instead of updating it, so a fingerprint can only be
      // used once. Every login therefore needs a new one (the Linux rebuild retries with a fresh one too).
      if (uri.indexOf("bnetUsernameAndPasswordLogin") >= 0) {
        obj.fingerprint = freshFingerprint();
        if (changed.indexOf("fingerprint") < 0) changed.push("fingerprint");
      }
      if (changed.length === 0) { log(`normalizer: ${uri.split("/").pop()} needs no change`); return; }
      const out = encodeURIComponent(JSON.stringify(obj)).replace(/%([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
      const arr = Il2Cpp.array<number>(byteClass, out.length);
      for (let i = 0; i < out.length; i++) arr.set(i, out.charCodeAt(i));
      call(req, "set_RawData", arr);
      log(`rewrote ${uri.split("/").pop()}: ${changed.join(",")}`);
    } catch (e) { log(`normalizer error: ${e}`); }
  }

  // The credentials of the login that is being sent; they are stored once the service accepted them.
  let pendingLogin: { username: string; password: string } | null = null;
  function captureLogin(req: Il2Cpp.Object, uri: string): void {
    try {
      if (uri.indexOf("bnetUsernameAndPasswordLogin") < 0) return;
      const raw = call(req, "get_RawData");
      if (!raw || raw.handle.isNull()) return;
      const length = Number(raw.length);
      if (length > 65536) { log("login request exceeds capture limit"); return; }
      let text = "";
      for (let i = 0; i < length; i++) text += "%" + Number(raw.get(i)).toString(16).padStart(2, "0");
      const body = JSON.parse(decodeURIComponent(text));
      if (body && body.username) pendingLogin = { username: String(body.username), password: String(body.password ?? "") };
    } catch (e) { log("could not read login credentials from request body"); }
  }

  // 2) Config redirect: FetchConfig.StartProcess(localConfigUrl, configUrl, attemptLocalConnect, callback)
  section("config redirect", () => {
    Interceptor.attach(cls(img, "SparkleServices.FetchConfig").method("StartProcess").virtualAddress, {
      onEnter(args) {
        args[1] = Il2Cpp.string(CONFIG_LOCAL).handle;
        args[2] = Il2Cpp.string(CONFIG_URL).handle;
        args[3] = ptr(1);
        log("FetchConfig.StartProcess redirected");
      },
    });
  });

  // 3) HTTP: caching on, and the plugin version header on every request (BestHTTP namespace)
  section("http caching", () => {
    Interceptor.attach(cls(img, "BestHTTP.HTTPManager").method("get_IsCachingDisabled").virtualAddress, {
      onLeave(ret) { ret.replace(ptr(0)); },
    });
  });
  section("http header", () => {
    let seen = 0;
    const m = cls(img, "BestHTTP.HTTPRequest").method("EnumerateHeaders", 2);   // (callback, callBeforeSendCallback); the 1-arg overload is an 8-byte stub
    Interceptor.attach(m.virtualAddress, {
      onEnter(args) {
        try {
          const req = new Il2Cpp.Object(args[0]);
          let hasVersion = false;
          try { hasVersion = Boolean(call(req, "HasHeader", Il2Cpp.string("X-TeslRebornPlugin-Version"))); } catch (_) {}
          if (!hasVersion) req.method("AddHeader").invoke(Il2Cpp.string("X-TeslRebornPlugin-Version"), Il2Cpp.string(PLUGIN_VERSION));
          const uri = pinRequestLanguage(req);
          captureLogin(req, uri);
          rewriteAuthBody(req, uri);
          if (seen++ < 60) log(`-> ${diagnosticUri(uri)} body: ${bodyOf(req)}`);
        } catch (e) { log(`header hook error: ${e}`); }
      },
    });
  });
  // trace results via CallCallback (runs when a request completes; the state setter is inlined, so it can't be hooked)
  // BEGIN android-ui: http-diagnostics
function loginOutcome(status, body) {
  if (status !== 200) return "unknown";
  try {
    const json = JSON.parse(body), code = json?.resultCode;
    const token = json?.data?.token ?? json?.token;
    if (typeof token === "string" && token.length > 0 && (code === 0 || code == null)) return "success";
    if (code === 15 || code === 17) return "rejected";
  } catch (_) {}
  return "unknown";
}
function diagnosticUri(uri) { return String(uri).replace(/[?#].*$/, ""); }
  function reportHttpResult(req, ordinaryBudget) {
    const uri = String(call(req, "get_Uri"));
    const state = String(call(req, "get_State"));
    const response = call(req, "get_Response");
    let status = 0, info = "no response";
    if (!isNull(response)) {
      status = Number(call(response, "get_StatusCode"));
      info = `status ${status}`;
    } else {
      try {
        const exception = call(req, "get_Exception");
        if (!isNull(exception)) info = `exception: ${String(exception)}`;
      } catch (_) {}
    }
    // Failures and authentication completions must remain visible beyond the
    // first 80 responses. Bodies and headers are deliberately omitted here.
    if (ordinaryBudget || status === 0 || status >= 400 || /\/api\/account\//.test(uri))
      log(`<- ${state} ${diagnosticUri(uri)} ${info}`);
    if (typeof recordResourceEvent === "function") recordResourceEvent("http-" + state, diagnosticUri(uri), status);
    if (pendingLogin && uri.indexOf("bnetUsernameAndPasswordLogin") >= 0) {
      let body = ""; try { body = String(call(response, "get_DataAsText")?.content ?? ""); } catch (_) {}
      const outcome = loginOutcome(status, body);
      if (outcome === "success") writeSavedLogin(pendingLogin.username, pendingLogin.password);
      else if (outcome === "rejected") {
        // A session refusal during restart must not erase a previously successful login.
        const saved = readSavedLogin();
        if (!saved?.password) writeSavedLogin(pendingLogin.username, "");
        log("login: refused; previous successful credentials retained");
      } else log(`login: HTTP ${status}; saved credentials unchanged`);
      pendingLogin = null;
    }
  }
  section("http trace", () => {
    let seen = 0;
    Interceptor.attach(cls(img, "BestHTTP.HTTPRequest").method("CallCallback").virtualAddress, {
      onEnter(args) {
        try { reportHttpResult(new Il2Cpp.Object(args[0]), seen++ < 80); }
        catch (error) { log(`trace error: ${error}`); }
      }
    });
  });
// END android-ui: http-diagnostics

  const strOf = (p: NativePointer) => { try { return p.isNull() ? "" : String(new Il2Cpp.String(p).content ?? ""); } catch (_) { return "?"; } };
  const msgOf = (p: NativePointer) => { try { return p.isNull() ? "" : String(call(new Il2Cpp.Object(p), "get_Message")); } catch (_) { return "?"; } };
  const byName = (full: string, suffix: string, minParams = 0) => {
    const k = cls(img, full);
    const m = k.methods.find(x => x.name.endsWith(suffix) && x.parameterCount >= minParams);
    if (!m) throw new Error(`${full}::${suffix} not found`);
    return m;
  };

  section("error tracing: ErrorHandler.OnError", () => {
    Interceptor.attach(byName("ErrorHandler", "OnError", 4).virtualAddress, {
      onEnter(args) { log(`ErrorHandler.OnError code=${args[1].toInt32()} endpoint=${strOf(args[2])}`); },
    });
  });
  section("error tracing: websocket transport", () => {
    const wt = "BestHTTP.SocketIO.Transports.WebSocketTransport";
    Interceptor.attach(byName(wt, "OnOpen").virtualAddress, { onEnter() { log("ws transport: open"); } });
    Interceptor.attach(byName(wt, "OnError").virtualAddress, { onEnter(args) { log(`ws transport: ERROR ${msgOf(args[2])}`); } });
    Interceptor.attach(byName(wt, "OnClosed").virtualAddress, {
      onEnter(args) { log(`ws transport: closed code=${args[2].toInt32() & 0xffff} msg=${strOf(args[3])}`); },
    });
  });
  section("error tracing: socket.io manager", () => {
    const sm = "BestHTTP.SocketIO.SocketManager";
    Interceptor.attach(byName(sm, "OnTransportConnected").virtualAddress, { onEnter() { log("socket.io: transport connected"); } });
    Interceptor.attach(byName(sm, "OnTransportError").virtualAddress, { onEnter(args) { log(`socket.io: transport error ${strOf(args[2])}`); } });
    Interceptor.attach(byName(sm, "EmitError").virtualAddress, { onEnter(args) { log(`socket.io: EmitError code=${args[1].toInt32()} msg=${strOf(args[2])}`); } });
  });

  const rawStr = (q: NativePointer): string => {
    try {
      if (q.isNull()) return "(null)";
      const n = q.add(0x10).readS32();
      return n >= 0 && n < 512 ? (q.add(0x14).readUtf16String(n) ?? "") : `(bad length ${n})`;
    } catch (_) { return "(unreadable)"; }
  };
  // 5) Asset bundles. On desktop the game treats bundles as local files; on mobile it downloads them from a CDN that
  //    no longer exists. Two decisions matter:
  //    a) AssetCatalog.PlatformDownloadsBundles(): when true the game fetches versions.json from the dead CDN, and when
  //       that fails it shows the "Error {0} - Please check your internet..." popup. Make it false, like desktop.
  //    b) The same check inside LoadAssetBundleInternal decides whether the platform manifest (shipped in the OBB as
  //       assets/android) is read locally or downloaded. Force "local" for that call only.
  section("bundles: desktop behaviour", () => {
    let inLoad = false;
    Interceptor.attach(byName("AssetBundles.AssetBundleManager", "LoadAssetBundleInternal").virtualAddress, {
      onEnter() { inLoad = true; },
      onLeave() { inLoad = false; },
    });
    let once = 0;
    Interceptor.attach(byName("PlatformUtils", "PlatformDownloadsBundles").virtualAddress, {
      onLeave(ret) { if (inLoad) { ret.replace(ptr(0)); if (once++ < 3) log("PlatformUtils.PlatformDownloadsBundles -> false (manifest from OBB)"); } },
    });
    let once2 = 0;
    Interceptor.attach(byName("AssetCatalog", "PlatformDownloadsBundles").virtualAddress, {
      onLeave(ret) { ret.replace(ptr(0)); if (once2++ < 3) log("AssetCatalog.PlatformDownloadsBundles -> false (no CDN download)"); },
    });
    // Where do the streaming assets (the OBB) come from?
    try {
      let seenLocal = 0;
      const mgr = cls(img, "AssetBundles.AssetBundleManager");
      Interceptor.attach(mgr.method("SetSourceAssetBundleURL").virtualAddress, {
        onEnter(args) { log(`AssetBundleManager.SetSourceAssetBundleURL("${rawStr(args[1])}")`); },
      });
      const local = cls(img, "AssetBundles.AssetBundleLoadFromLocalOperation");
      Interceptor.attach(local.method(".ctor", 1).virtualAddress, {
        onEnter(args) { if (seenLocal++ < 4) log(`AssetBundleLoadFromLocalOperation("${rawStr(args[1])}")`); },
      });
    } catch (e) { log(`obb trace failed: ${e}`); }
  });

  // 5b) AssetBundleManager.Initialize() fills its bundle storage-mode table (streaming vs downloadable) from
  //     AssetCatalog._remoteBundleVersionInfo, which is normally downloaded versions.json. With the CDN skipped it is
  //     empty, every bundle then defaults to "local" and downloadable ones (e.g. the cached de_de filemanifests) are
  //     opened from the OBB and fail, so loading stalls. Fill it from the restored local versions.json instead.
  section("storage modes from local versions.json", () => {
    const catalog = cls(img, "AssetCatalog");
    const mgr = cls(img, "AssetBundles.AssetBundleManager");
    const init = mgr.methods.find(x => x.name === "Initialize");
    if (!init) throw new Error("AssetBundleManager.Initialize not found");
    const className = (o: any): string => {
      try { return isNull(o) ? "(null)" : (o as Il2Cpp.Object).class.name; } catch (_) { return "(?)"; }
    };
    Interceptor.attach(init.virtualAddress, {
      onEnter(args) {
        try {
          // Initialize(string manifestBundleName, BundleVersionInfo versionInfo) fills the
          // bundle storage mode table from that version info. It is normally the versions.json
          // downloaded from the CDN, which is gone, so the table stays empty and every bundle
          // is treated as a local one. Fill it from the versions.json in the app's data folder.
          let versionInfo: Il2Cpp.Object | null = null;
          for (const arg of [args[0], args[1], args[2]]) {
            if (className(arg) === "BundleVersionInfo") { versionInfo = new Il2Cpp.Object(arg); break; }
          }
          if (!versionInfo) {
            const remote = catalog.field<Il2Cpp.Object>("_remoteBundleVersionInfo").value;
            if (className(remote) === "BundleVersionInfo") versionInfo = remote;
          }
          if (!versionInfo) {
            log(`storage modes: no version info found (args: ${className(args[0])}, ${className(args[1])})`);
            return;
          }
          const count = () => Number(call(versionInfo!.field<Il2Cpp.Object>("_entries").value, "get_Count"));
          const before = count();
          if (before === 0) {
            const path = String((catalog.method("GetVersionJsonPath") as any).invoke()?.content ?? "");
            log(`storage modes: loading ${path}`);
            call(versionInfo, "Load", Il2Cpp.string(path));
            // On Android the unity file system rejects the JSON (result = FAILED, 0 parsed)
            // even though the file is perfectly readable. Retry by feeding the exact JSON
            // through the IL2CPP LoadFromMemory, which deserializes without going through
            // the PlatformAllowsBundleManifest gate.
            if (count() === 0) {
              try {
                const fileClass = Il2Cpp.corlib.class("System.IO.File");
                const exists = (fileClass.method("Exists") as any).invoke(Il2Cpp.string(path));
                if (Boolean(exists)) {
                  const text = String((fileClass.method("ReadAllText") as any).invoke(Il2Cpp.string(path))?.content ?? "");
                  if (text.length > 0) {
                    (versionInfo.method("LoadFromMemory") as any).invoke(Il2Cpp.string(text));
                    log(`storage modes: LoadFromMemory added ${count()} entries (path failed)`);
                  }
                }
              } catch (e) { log(`storage modes: recovery failed: ${e}`); }
            }
          }
          log(`AssetBundleManager.Initialize: version info entries ${before} -> ${count()}`);
        } catch (e) { log(`storage mode fill error: ${e}`); }
      },
    });
  });

  section("versions.json load", () => {
    const m = cls(img, "BundleVersionInfo").methods.find(x => x.name === "Load");
    if (!m) throw new Error("BundleVersionInfo.Load not found");
    let path = "";
    Interceptor.attach(m.virtualAddress, {
      onEnter(args) { path = rawStr(args[1]); },    // instance: args[0] = this, args[1] = path
      onLeave(ret) { log(`BundleVersionInfo.Load("${path}") -> ${ret.toInt32() & 0xff ? "ok" : "FAILED"}`); },
    });
  });

  // 6) Unity deletes cached bundles that were not used for `expirationDelay` seconds (the game sets 45 days),
  //    and the game itself removes the cached bundles that its version info does not know about. The bundles
  //    that were restored into the cache have to survive both, so the expiration is set to the maximum and
  //    the removal of cached versions is ignored.
  section("cache never expires", () => {
    const core = Il2Cpp.domain.assembly("UnityEngine.CoreModule").image;
    const cache = core.class("UnityEngine.Cache");
    const caching = core.class("UnityEngine.Caching");
    // The property setter is inlined by the IL2CPP compiler, so the internal
    // method that does the work is hooked instead. Its native signature has
    // three slots: the handle is in x1, the new delay in x2. Unity refuses a
    // delay above 12960000 seconds.
    const MAX_DELAY = 12960000;
    const setDelay = cache.method("Cache_SetExpirationDelay", 2);
    Interceptor.attach(setDelay.virtualAddress, {
      onEnter(args) {
        const delay = args[2].toInt32();
        if (delay < MAX_DELAY) {
          log(`Cache.expirationDelay ${delay} -> ${MAX_DELAY}`);
          args[2] = ptr(MAX_DELAY);
        }
      },
    });
    // The game removes the cached versions that are not in its version info.
    let cleared = 0;
    Interceptor.attach(caching.method("ClearCachedVersion", 2).virtualAddress, {
      onEnter() { if (cleared++ < 5) log("Caching.ClearCachedVersion -> ignored"); },
      onLeave(ret) { ret.replace(ptr(1)); },
    });
  });

  // =======================================================================
  // Tesl Reborn plugin parity (TeslRebornPlugin 1.3.1)
  //
  // The patches ported here are the ones the hook did not cover yet:
  //
  //   * EndGameStatePatch / SoloArenaPatch - the reborn server does not push
  //     the reward notices itself, so the client asks for the refresh.
  //   * StatsPatch / GetResponseStatusPatch - match history with deck names
  //     and win/loss, from the server's /fetchExtendedData endpoint.
  //   * InventoryPatch / DeckTileAwakePatch - per deck win/loss statistics,
  //     from the server's /fetchDeckStats endpoint.
  //   * NewsPatch - the game's own news feed is dead, tesl-reborn.com serves
  //     its own news.json.
  //   * GameConfigurationPatch - the custom "TESL Reborn" titles and the
  //     Frost Troll scenario image.
  //   * LocalizationManagerPatch - the plugin's translation fixes.
  //   * CreditsLoaderPatch - the TESL Reborn credits.
  //   * UIResourceManagerPatch - legendary title banners fall back to common.
  // =======================================================================
  const NEWS_URL = "https://tesl-reborn.com/news.json";
  const ENDPOINT_INVENTORY = 6;      // Endpoints.EndpointType.Inventory
  const ENDPOINT_STATS = 11;         // Endpoints.EndpointType.Stats
  const RARITY_LEGENDARY = 3;        // CardRarity.Legendary
  const CREDIT_GROUP = 1, CREDIT_TITLE = 2, CREDIT_NAME = 3;   // CreditsWin.CreditType

  // The plugin's data/translations/*.json, verbatim.
  const TRANSLATIONS: Record<string, Record<string, string>> = {
    en: {
      "reborn.titles.keeper.description": "Awarded to Alpha testers of TESL Reborn.",
      "reborn.titles.keeper.title": "The Keeper of TESL Reborn",
      "reborn.titles.founder.title": "The Founder of TESL Reborn",
      "reborn.titles.founder.description": "Awarded to developers of TESL Reborn.",
      "reborn.chat.doinker.description": "Use Ctrl + Mouse Wheel or Ctrl + +/- to adjust chat font size. Your preference will be saved for future sessions.",
    },
    de: {
      "reborn.titles.keeper.description": "Verliehen an Alpha-Tester von TESL Reborn.",
      "reborn.titles.keeper.title": "Der Hüter von TESL Reborn",
      "reborn.titles.founder.title": "Der Gründer von TESL Reborn",
      "reborn.titles.founder.description": "Verliehen an Entwickler von TESL Reborn.",
    },
    es: {
      "reborn.titles.keeper.description": "Otorgado a los testers alfa de TESL Reborn.",
      "reborn.titles.keeper.title": "El Guardián de TESL Reborn",
      "reborn.titles.founder.title": "El Fundador de TESL Reborn",
      "reborn.titles.founder.description": "Otorgado a los desarrolladores de TESL Reborn.",
    },
    fr: {
      "reborn.titles.keeper.description": "Décerné aux testeurs alpha de TESL Reborn.",
      "reborn.titles.keeper.title": "Le Gardien de TESL Reborn",
      "reborn.titles.founder.title": "Le Fondateur de TESL Reborn",
      "reborn.titles.founder.description": "Décerné aux développeurs de TESL Reborn.",
    },
    it: {
      "reborn.titles.keeper.description": "Assegnato ai tester alpha di TESL Reborn.",
      "reborn.titles.keeper.title": "Il Custode di TESL Reborn",
      "reborn.titles.founder.title": "Il Fondatore di TESL Reborn",
      "reborn.titles.founder.description": "Assegnato agli sviluppatori di TESL Reborn.",
    },
    pl: {
      "reborn.titles.keeper.description": "Przyznane testerom alpha TESL Reborn.",
      "reborn.titles.keeper.title": "Strażnik TESL Reborn",
      "reborn.titles.founder.title": "Założyciel TESL Reborn",
      "reborn.titles.founder.description": "Przyznane twórcom TESL Reborn.",
    },
    pt: {
      "reborn.titles.keeper.description": "Concedido aos testadores alpha do TESL Reborn.",
      "reborn.titles.keeper.title": "O Guardião do TESL Reborn",
      "reborn.titles.founder.title": "O Fundador do TESL Reborn",
      "reborn.titles.founder.description": "Concedido aos desenvolvedores do TESL Reborn.",
    },
    ru: {
      "reborn.titles.keeper.description": "Вручается альфа-тестировщикам TESL Reborn.",
      "reborn.titles.keeper.title": "Хранитель TESL Reborn",
      "reborn.titles.founder.title": "Основатель TESL Reborn",
      "reborn.titles.founder.description": "Вручается разработчикам TESL Reborn.",
    },
    tr: {
      "reborn.titles.keeper.description": "TESL Reborn alfa testçilerine verilmiştir.",
      "reborn.titles.keeper.title": "TESL Reborn'ın Bekçisi",
      "reborn.titles.founder.title": "TESL Reborn'ın Kurucusu",
      "reborn.titles.founder.description": "TESL Reborn geliştiricilerine verilmiştir.",
    },
  };

  // ---------------------------------------------------------------------
  // Small helpers shared by the plugin-parity sections
  // ---------------------------------------------------------------------

  // The game's own data directory (/sdcard/Android/data/<package>/files).
  function persistentPath(): string {
    try {
      const path = (ucls("UnityEngine.Application").method("get_persistentDataPath") as any).invoke();
      return String(path?.content ?? "/sdcard/Android/data/com.bethsoft.theelderscrollslegends/files");
    } catch (e) { return "/sdcard/Android/data/com.bethsoft.theelderscrollslegends/files"; }
  }

  function readTextFile(path: string): string {
    try {
      const file = Il2Cpp.corlib.class("System.IO.File");
      if (!Boolean((file.method("Exists") as any).invoke(Il2Cpp.string(path)))) return "";
      return String((file.method("ReadAllText") as any).invoke(Il2Cpp.string(path))?.content ?? "");
    } catch (e) { return ""; }
  }

  function writeTextFile(path: string, text: string): boolean {
    try {
      (Il2Cpp.corlib.class("System.IO.File").method("WriteAllText") as any)
        .invoke(Il2Cpp.string(path), Il2Cpp.string(text));
      return true;
    } catch (e) { return false; }
  }

  // A new source fingerprint: 32 hex digits without dashes, the way the game
  // generates it (Guid.NewGuid().ToString("N")).
  function freshFingerprint(): string {
    let hex = "";
    for (let i = 0; i < 16; i++) hex += Math.floor(Math.random() * 256).toString(16).padStart(2, "0");
    return hex;
  }

  // Allocates an object and runs its constructor with the given arguments.
  function newWith(klass: Il2Cpp.Class, ...args: any[]): Il2Cpp.Object {
    const o = klass.alloc(), root = o.ref(false);
    try {
      (o.method(".ctor", args.length) as any).invoke(...args);
      return o;
    } finally { root.free(); }
  }

  function isNull(o: any): boolean {
    return !o || !o.handle || o.handle.isNull();
  }

  // Unity's own classes live in other assemblies, so they need a lookup that
  // walks all the loaded images.
  const classCache: Record<string, Il2Cpp.Class> = {};
  let allImages: Il2Cpp.Image[] | null = null;
  function ucls(name: string): Il2Cpp.Class {
    const cached = classCache[name];
    if (cached) return cached;
    if (!allImages) allImages = Il2Cpp.domain.assemblies.map(a => a.image);
    const image = allImages.find(i => i.tryClass(name) != null);
    if (!image) throw new Error(`class ${name} not found in any assembly`);
    const found = image.tryClass(name)!;
    classCache[name] = found;
    return found;
  }

  // Builds a value type for a managed enum.
  function unityStruct(name, fields) {
    const boxed = ucls(name).alloc();
    for (const key of Object.keys(fields)) boxed.field(key).value = fields[key];
    return boxed.unbox();
  }
  function vec2(x, y) {
    return unityStruct("UnityEngine.Vector2", { x, y });
  }
  function rgba(r, g, b, a) {
    return unityStruct("UnityEngine.Color", { r, g, b, a });
  }
  function enumBox(enumClass: Il2Cpp.Class, n: number): Il2Cpp.ValueType {
    const boxed = enumClass.alloc();
    boxed.field<number>("value__").value = n;
    return boxed.unbox();
  }

  // The base URL of one of the server's endpoints ("" when not logged in).
  function endpointUrl(kind: number): string {
    try {
      const sm = (cls(img, "SparkleServices.ServicesManager").method("get_Instance") as any).invoke();
      if (isNull(sm)) return "";
      const eps = call(sm, "get_Endpoints");
      if (isNull(eps)) return "";
      return String(call(eps, "Get", kind)?.content ?? "");
    } catch (e) { return ""; }
  }

  // The bearer token of the current session ("" when not logged in).
  function authToken(): string {
    try {
      const sm = (cls(img, "SparkleServices.ServicesManager").method("get_Instance") as any).invoke();
      if (isNull(sm)) return "";
      const data = call(sm, "get_AuthData") as Il2Cpp.Object;
      if (isNull(data)) return "";
      return String((data.field<any>("token").value as Il2Cpp.String)?.content ?? "");
    } catch (e) { return ""; }
  }

  // A GET through the game's own HTTP stack. The callback is invoked by
  // BestHTTP from its update loop, so it runs on the Unity main thread.
  function httpGet(url, withAuth, cb, updateRequest = false) {
    // Avoid constructing a nested request in Inventory/Stats.OnResponse.
    schedule(0, () => {
      let stage = "URI constructor";
      try {
        const uri = ucls("System.Uri").alloc();
        uri.method(".ctor").overload("System.String").invoke(Il2Cpp.string(url));
        stage = "callback delegate";
        const del = Il2Cpp.delegate(cls(img, "BestHTTP.OnRequestFinishedDelegate"), (req, resp) => {
          try {
            if (isNull(resp)) {
              let detail = "response is null";
              try { detail += `, state=${call(req, "get_State")}, exception=${call(req, "get_Exception")}`; } catch (_) {}
              log(`GET ${url} failed: ${detail}`);
              cb(-1, detail);
              return;
            }
            const status = Number(call(resp, "get_StatusCode"));
            let body = "";
            try { body = String(call(resp, "get_DataAsText")?.content ?? ""); } catch (_) {}
            log(`GET ${url} completed: HTTP ${status}`);
            const cachedBody = status === 304 && body.trim().length > 0;
            if (cachedBody) log(`GET ${url}: cached response body accepted`);
            cb(cachedBody ? 200 : status, body);
          } catch (e) {
            log(`GET ${url} callback failed: ${e}`);
            cb(-1, String(e));
          }
        });
        stage = "HTTPRequest(Uri, OnRequestFinishedDelegate) constructor";
        const req = cls(img, "BestHTTP.HTTPRequest").alloc();
        req.method(".ctor").overload("System.Uri", "BestHTTP.OnRequestFinishedDelegate").invoke(uri, del);
        stage = "update request constraints";
        if (updateRequest) {
          // Do not allow HTTPS release URLs to redirect to a different origin.
          req.method("set_MaxRedirects").invoke(0);
        }
        stage = "headers";
        req.method("AddHeader").invoke(Il2Cpp.string("Accept"), Il2Cpp.string("application/json"));
        req.method("AddHeader").invoke(Il2Cpp.string("X-TeslRebornPlugin-Version"), Il2Cpp.string(PLUGIN_VERSION));
        if (withAuth) {
          const token = authToken();
          if (!token) throw new Error("session token unavailable in ServicesManager.AuthData");
          req.method("AddHeader").invoke(Il2Cpp.string("Authorization"), Il2Cpp.string("Bearer " + token));
        }
        stage = "Send";
        req.method("Send").invoke();
        log(`GET ${url} queued`);
      } catch (e) {
        log(`GET ${url} setup failed at ${stage}: ${e}`);
        cb(-1, String(e));
      }
    });
  }

    section("rewards refresh", () => {
    const pubSub = cls(img, "SparkleServices.PubSub");
    const createPush = pubSub.method("CreatePushNotification");
    const gameNetwork = cls(img, "SPTESL.GameNetworkManager");

    Interceptor.attach(cls(img, "EndGameState").method("OnEnable").virtualAddress, {
      onEnter() {
        try {
          const instance = (gameNetwork.method("get_Instance") as any).invoke();
          const matchId = isNull(instance) ? "" : String(call(instance, "get_MatchId")?.content ?? "");
          const payload = JSON.stringify({ receivedRewards: true, matchId });
          (createPush as any).invoke(Il2Cpp.string("matchrewards"), Il2Cpp.string(payload));
          log(`EndGameState: pushed matchrewards (${matchId || "no match id"})`);
        } catch (e) { log(`matchrewards push failed: ${e}`); }
      },
    });

    Interceptor.attach(cls(img, "SoloArena").method("SoloArenaEndSequence").virtualAddress, {
      onEnter() {
        try {
          (createPush as any).invoke(Il2Cpp.string("rewards"), Il2Cpp.string("{}"));
          log("SoloArena: pushed rewards");
        } catch (e) { log(`rewards push failed: ${e}`); }
      },
    });
  });

  // ---------------------------------------------------------------------
  // StatsPatch / InventoryPatch: the server exposes extra statistics that
  // the original client does not know about.
  //   GET <inventory>/fetchDeckStats   -> { items: [ { deckId, wins, losses } ] }
  //   GET <stats>/fetchExtendedData    -> { entries: [ { playedAt, deckId,
  //                                        deckName, deckStats, opponent... } ] }
  // ---------------------------------------------------------------------
  const deckStats = new Map<number, { wins: number; losses: number }>();
  let matchEntryData: any[] = [];
  let statsFinishedLoading = false;
  let statsLoadingSince = 0;

  // Deferred work has to run on the Unity main thread, so it is queued here
  // and executed by the services manager's update loop. The work itself is
  // handed to Unity's synchronisation context: calling managed code straight
  // from inside a hook would nest the interceptor callbacks, and Frida cannot
  // run those (the request would then not be rewritten).
  const pending: { at: number; fn: () => void; tag?: string }[] = [];
  function schedule(delayMs: number, fn: () => void, tag?: string) {
    pending.push({ at: Date.now() + delayMs, fn, tag });
  }
  function runPending() {
    const now = Date.now();
    for (let i = pending.length - 1; i >= 0; i--) {
      if (pending[i].at > now) continue;
      const task = pending.splice(i, 1)[0];
      try {
        Il2Cpp.mainThread.schedule(() => {
          const started = Date.now();
          try { task.fn(); } catch (e) { log(`scheduled task failed: ${e}`); }
          // Deferred hook work runs on the main thread, so a slow task is a
          // hitch the player feels. Name it instead of folding it into a
          // faceless stall report, and count it for the stall probe.
          const took = Date.now() - started;
          const probe = (globalThis as any).__teslRebornStallProbe;
          if (probe) probe.tasks++;
          if (took >= 100) log(`scheduled task slow ${took}ms (${task.tag || "untagged"})`);
        });
      } catch (e) { log(`could not schedule a task: ${e}`); }
    }
  }
  section("main thread scheduler", () => {
    const services = cls(img, "SparkleServices.ServicesManager");
    const update = services.methods.find(m => m.name === "Update");
    if (!update) throw new Error("ServicesManager.Update not found");
    Interceptor.attach(update.virtualAddress, { onEnter() { runPending(); } });
  });

  // A gap between two service updates means the main thread was busy or
  // blocked: every hook writes timestamped messages to the port log, so the
  // last message before a reported stall names the code that ran right before
  // it. The probe only observes; long gaps after the app was backgrounded are
  // ignored, and it reports at most once per second. Hitches the player feels
  // in a match are shorter than the loading ones, so 200ms is the floor, and
  // the report carries counters of what the blocked window executed: deferred
  // hook tasks and asset lookups (the trace counts each lookup once even when
  // nested overloads deliver it twice).
  // BEGIN android-ui: stall-probe
  section("main loop stall probe", () => {
    const update = cls(img, "SparkleServices.ServicesManager").method("Update", 0);
    const probe = (globalThis as any).__teslRebornStallProbe = { loads: 0, tasks: 0 };
    let last = Date.now(), quietUntil = 0;
    Interceptor.attach(update.virtualAddress, {
      onEnter() {
        const now = Date.now(), gap = now - last;
        last = now;
        const loads = probe.loads, tasks = probe.tasks;
        probe.loads = 0; probe.tasks = 0;
        if (gap >= 200 && gap < 60000 && now >= quietUntil) {
          quietUntil = now + 1000;
          log(`main loop stalled ${gap}ms` + ((loads || tasks) ? ` (asset loads ${loads}, tasks ${tasks})` : ""));
        }
      },
    });
  });
  // END android-ui: stall-probe

  // The inventory refreshes on its own, so the statistics are not pulled
  // more often than necessary.
  let lastDeckStatsFetch = 0;

  function winRate(wins: number, losses: number): number {
    const total = wins + losses;
    return total === 0 ? 0 : Math.round((wins * 100) / total);
  }

  function refreshDeckStats(force = false) {
    const base = endpointUrl(ENDPOINT_INVENTORY);
    if (!base) return;
    const now = Date.now();
    if (!force && now - lastDeckStatsFetch < 5000) return;
    lastDeckStatsFetch = now;
    httpGet(`${base}/fetchDeckStats`, true, (status, body) => {
      if (status !== 200) { log(`fetchDeckStats -> HTTP ${status}`); return; }
      try {
        const json = JSON.parse(body);
        const items = json.items ?? json.data ?? [];
        deckStats.clear();
        for (const it of items) {
          deckStats.set(Number(it.deckId), { wins: Number(it.wins) | 0, losses: Number(it.losses) | 0 });
        }
        log(`deck stats: ${deckStats.size} decks`);
        refreshDeckTileLabels();
      } catch (e) { log(`fetchDeckStats parse error: ${e}`); }
    });
  }

  function refreshMatchEntries() {
    const base = endpointUrl(ENDPOINT_STATS);
    if (!base) return;
    httpGet(`${base}/fetchExtendedData`, true, (status, body) => {
      if (status !== 200) { log(`fetchExtendedData -> HTTP ${status}`); statsFinishedLoading = true; return; }
      try {
        const json = JSON.parse(body);
        const entries = json.entries ?? [];
        matchEntryData = entries.map((e: any) => ({
          playedAt: e.playedAt,
          deckId: Number(e.deckId),
          deckName: String(e.deckName ?? ""),
          deckStats: e.deckStats ? { wins: Number(e.deckStats.wins) | 0, losses: Number(e.deckStats.losses) | 0 } : null,
          opponentDeckName: String(e.opponentDeckName ?? ""),
          opponentDeckStats: e.opponentDeckStats ? { wins: Number(e.opponentDeckStats.wins) | 0, losses: Number(e.opponentDeckStats.losses) | 0 } : null,
        }));
        statsFinishedLoading = true;
        log(`match history: ${matchEntryData.length} entries`);
        refreshHistoryTooltips();
      } catch (e) { log(`fetchExtendedData parse error: ${e}`); statsFinishedLoading = true; }
    });
  }

  section("stats and deck statistics", () => {
    // Stats.OnResponse: the statistics arrived, ask for the extended data.
    Interceptor.attach(cls(img, "SparkleServices.Stats").method("OnResponse").virtualAddress, {
      onEnter(args) {
        try {
          const response = new Il2Cpp.Object(args[1]);
          if (enumVal(response.field<any>("resultCode").value) !== 0) return;
          statsFinishedLoading = false;
          statsLoadingSince = Date.now();
          refreshMatchEntries();
        } catch (e) { log(`stats hook failed: ${e}`); }
      },
    });

    // Inventory.OnResponse: the deck list arrived, ask for the deck stats.
    Interceptor.attach(cls(img, "SparkleServices.Inventory").method("OnResponse").virtualAddress, {
      onEnter(args) {
        try {
          const response = new Il2Cpp.Object(args[1]);
          if (enumVal(response.field<any>("resultCode").value) !== 0) return;
          refreshDeckStats();
        } catch (e) { log(`inventory hook failed: ${e}`); }
      },
    });

    // Creating, saving or deleting a deck changes the statistics, so pull
    // them again once the request went through.
    for (const name of ["CreateDeck", "SaveDeck", "DeleteDeck"]) {
      const method = cls(img, "SparkleServices.Inventory").method(name);
      if (!method) continue;
      Interceptor.attach(method.virtualAddress, {
        onLeave() { schedule(1000, () => refreshDeckStats(true), "deck stats refresh"); },
      });
    }

    // GetResponseStatus is shared by every service (generic sharing), so the
    // return value is only changed for the statistics service: while the
    // extended data is still loading the match history keeps waiting.
    const getResponseStatus = cls(img, "SparkleServices.Stats").method("GetResponseStatus");
    if (getResponseStatus) {
      Interceptor.attach(getResponseStatus.virtualAddress, {
        onEnter(args) { this.instance = args[0]; },
        onLeave(retval) {
          try {
            if (isNull(this.instance)) return;
            const obj = new Il2Cpp.Object(this.instance);
            if (obj.class.namespace !== "SparkleServices" || obj.class.name !== "Stats") return;   // only the stats service
            const original = retval.toInt32();
            const loading = !statsFinishedLoading && Date.now() - statsLoadingSince < 10000;
            if (loading) { retval.replace(ptr(1)); return; }      // wait for the extended data
            if (original === 2) retval.replace(ptr(2));
          } catch (_) {}
        },
      });
    }
  });

  // ---------------------------------------------------------------------
  // DeckTileAwakePatch: show the win/loss ratio on every deck tile.
  // ---------------------------------------------------------------------
  // Keep the actual components we created. The deck-name parent may be several
  // levels below DeckTile; Transform.Find(name) does not search recursively.
  // Keep the actual components we created. The deck-name parent may be several
  // levels below DeckTile; Transform.Find(name) does not search recursively.
  // BEGIN android-ui: deck-ui
// Keep the actual components we created. The deck-name parent may be several
  // levels below DeckTile; Transform.Find(name) does not search recursively.
  const deckTiles = new Map();
  let deckUiCreated = 0, deckUiShown = 0, deckUiMissing = 0;
  let deckUiLastError = "", deckUiFailures = 0;

  function rememberDeckTile(tile) {
    const key = tile.handle.toString();
    let record = deckTiles.get(key);
    if (!record) {
      record = { tile: tile.weakRef(false), container: null, label: null, shown: false, missing: false, rect: null };
      deckTiles.set(key, record);
    }
    return record;
  }

  function forgetDeckTile(key) {
    const record = deckTiles.get(key);
    if (!record) return;
    for (const handle of [record.tile, record.container, record.label, record.rect]) {
      try { if (handle) handle.free(); } catch (_) {}
    }
    deckTiles.delete(key);
  }

  function refreshDeckTileLabels() {
    for (const [key, record] of Array.from(deckTiles)) {
      try {
        const tile = record.tile.target;
        if (isNull(tile)) { forgetDeckTile(key); continue; }
        updateDeckTileLabel(tile);
      } catch (error) {
        forgetDeckTile(key);
        log(`stats UI: discarded destroyed tile: ${error}`);
      }
    }
  }

  function createDeckTileLabel(tile) {
    const record = rememberDeckTile(tile);
    if (record.container && record.label) return true;
    let container = null;
    const roots=[];const hold=value=>{if(!isNull(value))roots.push(value.ref(false));return value;};
    try {
      hold(tile);
      const nameText = hold(tile.field("DeckNameText").value);
      if (isNull(nameText)) return false;
      const ancestry = Array.from(nameText.class.hierarchy()).map(c => c.type.name);
      const isTmp = ancestry.includes("TMPro.TextMeshProUGUI") || ancestry.includes("TMPro.TMP_Text");
      const isLegacy = ancestry.includes("UnityEngine.UI.Text");
      if (!isTmp && !isLegacy) throw Error(`Unsupported deck-name renderer: ${nameText.class.type.name}`);
      const parent = hold(call(tile, "get_transform"));
      if (isNull(parent)) return false;
      const rectType = ucls("UnityEngine.RectTransform");
      const gameObject = ucls("UnityEngine.GameObject");
      const layer = Number(call(call(parent, "get_gameObject"), "get_layer"));
      const makeUiObject = (name, parentTransform) => {
        const go = hold(newWith(gameObject, Il2Cpp.string(name),
          Il2Cpp.array(Il2Cpp.corlib.class("System.Type"), [rectType.type.object])));
        call(go, "set_layer", layer);
        call(go, "get_transform").method("SetParent")
          .overload("UnityEngine.Transform", "System.Boolean").invoke(parentTransform, false);
        return go;
      };
      const rectOf = go => hold(go.method("GetComponent").overload("System.Type").invoke(rectType.type.object));
      const addComponent = (go, type) => hold(go.method("AddComponent").overload("System.Type").invoke(ucls(type).type.object));
      const stretch = rect => {
        call(rect, "set_anchorMin", vec2(0, 0));
        call(rect, "set_anchorMax", vec2(1, 1));
        call(rect, "set_offsetMin", vec2(0, 0));
        call(rect, "set_offsetMax", vec2(0, 0));
      };
      container = makeUiObject("WinLossRatioContainer", parent);
      call(container, "SetActive", false);
      const containerTransform = hold(call(container, "get_transform"));
      const containerRect = rectOf(container);
      call(containerRect, "set_anchorMin", vec2(1, 0));
      call(containerRect, "set_anchorMax", vec2(1, 0));
      call(containerRect, "set_pivot", vec2(1, 0));
      call(containerRect, "set_anchoredPosition", vec2(-1, 1));
      call(containerRect, "set_sizeDelta", vec2(100, 24));
      const background = makeUiObject("Background", containerTransform);
      stretch(rectOf(background));
      const backgroundImage = addComponent(background, "UnityEngine.UI.Image");
      call(backgroundImage, "set_color", rgba(0, 0, 0, 0.7));
      call(backgroundImage, "set_raycastTarget", false);
      // Match the actual renderer family. A TMP_FontAsset must never be passed
      // to UnityEngine.UI.Text.set_font, which expects UnityEngine.Font.
      const labelObject = makeUiObject("WinLossRatioLabel", containerTransform);
      stretch(rectOf(labelObject));
      const renderer = isTmp ? "TMPro.TextMeshProUGUI" : "UnityEngine.UI.Text";
      const label = addComponent(labelObject, renderer);
      const font = hold(call(nameText, "get_font"));
      if (isNull(font)) throw Error("DeckNameText has no font");
      call(label, "set_font", font);
      call(label, "set_fontSize", 16);
      if (isTmp) {
        call(label, "set_enableAutoSizing", false);
        const alignmentClass = ucls("TMPro.TextAlignmentOptions");
        const center = enumVal(alignmentClass.field("Center").value);
        call(label, "set_alignment", enumBox(alignmentClass, center));
        const wrapping = label.tryMethod("set_enableWordWrapping", 1);
        if (wrapping) wrapping.invoke(false);
      } else {
        call(label, "set_resizeTextForBestFit", false);
        call(label, "set_alignment", 4); // MiddleCenter
        call(label, "set_horizontalOverflow", 1); // Overflow
        call(label, "set_verticalOverflow", 1); // Overflow
      }
      call(label, "set_color", rgba(1, 1, 1, 1));
      call(label, "set_raycastTarget", false);
      call(label, "set_enabled", true);
      record.rect = containerRect.ref(false);
      record.container = container.ref(false);
      record.label = label.ref(false);
      if (++deckUiCreated <= 8) log(`stats UI: created panel ${deckUiCreated}, layer=${layer}, renderer=${renderer}, template=${nameText.class.type.name}`);
      return true;
    } catch (error) {
      if (container) {
        try { ucls("UnityEngine.Object").method("Destroy").overload("UnityEngine.Object").invoke(container); } catch (_) {}
      }
      const detail = String(error);
      if (detail !== deckUiLastError) { deckUiLastError = detail; deckUiFailures = 0; }
      deckUiFailures++;
      if (deckUiFailures <= 3 || deckUiFailures % 25 === 0)
        log(`stats UI: creation failed (${deckUiFailures}): ${detail}`);
      return false;
    } finally {for(const root of roots.reverse())root.free();}
  }

  function updateDeckTileLabel(tile) {
    const key = tile.handle.toString();
    try {
      const record = rememberDeckTile(tile);
      if (!createDeckTileLabel(tile)) return;
      const container = record.container.target;
      const label = record.label.target;
      if (isNull(container) || isNull(label)) { forgetDeckTile(key); return; }
      call(container, "SetActive", false);
      const deckId = Number(call(tile, "GetDeckId"));
      const stats = deckStats.get(deckId);
      if (!stats) {
        if (!record.missing && deckUiMissing++ < 8) log(`stats UI: no data for deckId=${deckId}, loaded=${deckStats.size}`);
        record.missing = true;
        return;
      }
      const text = `${stats.wins}/${stats.losses} (${winRate(stats.wins, stats.losses)}%)`;
      call(label, "set_text", Il2Cpp.string(text));
      // preferredWidth is available on both legacy Text and TMP_Text. Keep the
      // right edge anchored and size the plate to the current ratio string.
      const width = Number(call(label, "get_preferredWidth"));
      if (!Number.isFinite(width) || width < 0) throw Error("Invalid statistics text width");
      call(record.rect.target, "set_sizeDelta", vec2(Math.ceil(width) + 6, 24));
      call(container, "SetActive", true);
      if (!record.shown && deckUiShown++ < 8) log(`stats UI: shown deckId=${deckId}, ${text}`);
      record.shown = true;
    } catch (error) {
      forgetDeckTile(key);
      log(`stats UI: update failed: ${error}`);
    }
  }

  section("deck tile win/loss label", () => {
    const deckTile = cls(img, "DeckTile");
    Interceptor.attach(deckTile.method("SetData", 2).virtualAddress, {
      onEnter(args) { this.tile = args[0]; },
      onLeave() {
        try { if (this.tile) updateDeckTileLabel(new Il2Cpp.Object(this.tile)); }
        catch (error) { log(`stats UI: SetData failed: ${error}`); }
      }
    });
    // Only capture this exact class to avoid attaching to an inherited shared
    // MonoBehaviour method. Weak references do not retain destroyed deck tiles.
    const destroy = deckTile.methods.find(m => m.name === "OnDestroy" && !m.isStatic && m.parameterCount === 0);
    if (destroy && !destroy.virtualAddress.isNull()) {
      Interceptor.attach(destroy.virtualAddress, {
        onEnter(args) { forgetDeckTile(args[0].toString()); }
      });
    }
  });
// END android-ui: deck-ui


  const MONTH_KEYS = ["months.January", "months.February", "months.March", "months.April", "months.May", "months.June",
    "months.July", "months.August", "months.September", "months.October", "months.November", "months.December"];
  const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
    "October", "November", "December"];

  function monthName(month: number): string {
    try {
      const lm = (cls(img, "LocalizationManager").method("get_Instance") as any).invoke();
      if (!isNull(lm)) {
        const text = call(lm, "GetText", MONTH_KEYS[month - 1]);
        if (text && text.content) return String(text.content);
      }
    } catch (_) {}
    return MONTH_NAMES[month - 1] ?? "";
  }

  function setNewsItem(item: Il2Cpp.Object, title: string, content: string | null, date: Date, url: string, primary: boolean) {
    const root = item.field<Il2Cpp.Object>("Root").value;
    if (!isNull(root)) (root.method("SetActive") as any).invoke(true);
    const titleText = item.field<Il2Cpp.Object>("TitleText").value;
    if (!isNull(titleText)) (titleText.method("set_text") as any).invoke(Il2Cpp.string(title));
    if (primary && content != null) {
      const description = item.field<Il2Cpp.Object>("DescriptionText").value;
      if (!isNull(description)) (description.method("set_text") as any).invoke(Il2Cpp.string(content));
    }
    const monthText = item.field<Il2Cpp.Object>("MonthText").value;
    if (!isNull(monthText)) (monthText.method("set_text") as any).invoke(Il2Cpp.string(monthName(date.getMonth() + 1)));
    const dayText = item.field<Il2Cpp.Object>("DayText").value;
    if (!isNull(dayText)) (dayText.method("set_text") as any).invoke(Il2Cpp.string(String(date.getDate())));
    const button = item.field<Il2Cpp.Object>("Button").value;
    if (isNull(button)) return;
    const onClick = call(button, "get_onClick");
    if (isNull(onClick)) return;
    (onClick.method("RemoveAllListeners") as any).invoke();
    const action = Il2Cpp.delegate(ucls("UnityEngine.Events.UnityAction"), () => {
      try { (ucls("UnityEngine.Application").method("OpenURL") as any).invoke(Il2Cpp.string(url)); } catch (_) {}
    });
    (onClick.method("AddListener") as any).invoke(action);
  }

  function loadRebornNews(widget: Il2Cpp.Object) {
    httpGet(NEWS_URL, false, (status, body) => {
      try {
        if (status !== 200) { log(`news: HTTP ${status}`); return; }
        const json = JSON.parse(body);
        const items: any[] = json.items ?? [];
        const primary = widget.field<Il2Cpp.Object>("_primaryNewsItem").value;
        const secondary = widget.field<Il2Cpp.Array<Il2Cpp.Object>>("_secondaryNewsItems").value;
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const date = new Date(String(item.createdAt).replace(" ", "T"));
          if (i === 0) {
            if (!isNull(primary)) setNewsItem(primary, String(item.title ?? ""), String(item.content ?? ""), date, String(item.url ?? ""), true);
          } else if (!isNull(secondary) && i - 1 < secondary.length) {
            const entry = secondary.get(i - 1);
            if (!isNull(entry)) setNewsItem(entry, String(item.title ?? ""), null, date, String(item.url ?? ""), false);
          }
        }
        // The game shows its own "news unavailable" panel when its (dead)
        // request fails, so make sure our items are the visible ones.
        const loading = widget.field<Il2Cpp.Object>("_loadingUi").value;
        if (!isNull(loading)) (loading.method("SetActive") as any).invoke(false);
        const unavailable = widget.field<Il2Cpp.Object>("_unavailableUi").value;
        if (!isNull(unavailable)) (unavailable.method("SetActive") as any).invoke(false);
        widget.field<boolean>("_loadInProgress").value = false;
        log(`news: ${items.length} items`);
      } catch (e) { log(`news failed: ${e}`); }
    });
  }

  section("news from tesl-reborn", () => {
    const widget = cls(img, "MenuNewsWidget");
    // The game's own coroutine is neutralised: it would show the
    // "news unavailable" panel, because its feed is dead.
    const iterator = img.classes.find(c => c.name === "<LoadNews>c__Iterator0" && c.declaringClass?.name === "MenuNewsWidget");
    if (iterator) {
      const moveNext = iterator.methods.find(m => m.name === "MoveNext");
      if (moveNext) {
        Interceptor.attach(moveNext.virtualAddress, {
          onLeave(retval) { retval.replace(ptr(0)); },     // finish the coroutine at once
        });
      }
    } else log("news: the game's news coroutine was not found");

    Interceptor.attach(widget.method("OnEnable").virtualAddress, {
      onEnter(args) {
        try {
          const self = new Il2Cpp.Object(args[0]);
          self.field<Il2Cpp.String>("_lastShownShownLanguage").value = Il2Cpp.string("en");
          loadRebornNews(self);
        } catch (e) { log(`news hook failed: ${e}`); }
      },
    });
  });

  // ---------------------------------------------------------------------
  // GameConfigurationPatch: the custom "TESL Reborn" titles and the Frost
  // Troll scenario image (the shipped one points at a missing asset).
  // ---------------------------------------------------------------------
  section("custom titles and scenario image", () => {
    const config = cls(img, "SPTESL.GameConfiguration");
    const titleData = cls(img, "SPTESL.TitleData");
    const iterator = img.classes.find(c => c.name === "<LoadGameConfigurationAtRuntime>c__Iterator0"
      && c.declaringClass?.name === "GameConfiguration");
    if (!iterator) throw new Error("the configuration coroutine was not found");
    const moveNext = iterator.methods.find(m => m.name === "MoveNext");
    if (!moveNext) throw new Error("the configuration coroutine has no MoveNext");

    let applied = false;
    Interceptor.attach(moveNext.virtualAddress, {
      onEnter(args) { this.iterator = new Il2Cpp.Object(args[0]); },
      onLeave(retval) {
        if (applied) return;
        if (retval.toInt32() !== 0) return;             // still running
        applied = true;
        try {
          const instance = (this.iterator as Il2Cpp.Object).field<any>("$this").value as Il2Cpp.Object;
          if (isNull(instance)) return;
          addCustomTitles(instance, titleData);
          fixFrostTrollScenario(instance);
          log("game configuration: custom titles and scenario image applied");
        } catch (e) { log(`game configuration patch failed: ${e}`); }
      },
    });

    function addCustomTitles(instance: Il2Cpp.Object, titleClass: Il2Cpp.Class) {
      const titles = instance.field<Il2Cpp.Object>("Titles").value;
      if (isNull(titles)) return;
      const existing = (titles.method("get_Count") as any).invoke();
      for (const spec of [
        { id: -900988265, name: "title_reborn_keeper", title: "reborn.titles.keeper.title", desc: "reborn.titles.keeper.description" },
        { id: -314134087, name: "title_reborn_founder", title: "reborn.titles.founder.title", desc: "reborn.titles.founder.description" },
      ]) {
        if (titleExists(titles, spec.name)) continue;
        const data = newWith(titleClass);
        const resourceId = data.field<any>("ResourceId").value as Il2Cpp.ValueType;
        resourceId.field("Id").value = spec.id;
        resourceId.field("UniqueName").value = Il2Cpp.string(spec.name);
        resourceId.field("CompletionType").value = enumBox(cls(img, "SPTESL.ResourceCompletionType"), 1);   // Partial
        (data.field<any>("Title").value as Il2Cpp.ValueType).field("RawKey").value = Il2Cpp.string(spec.title);
        (data.field<any>("Description").value as Il2Cpp.ValueType).field("RawKey").value = Il2Cpp.string(spec.desc);
        data.field<any>("Rarity").value = enumBox(cls(img, "SPTESL.CardRarity"), RARITY_LEGENDARY);
        data.field<boolean>("Hidden").value = false;
        (titles.method("Add") as any).invoke(data);
        // Read the values back: the title data is built field by field, so
        // this shows whether the game sees what we wrote.
        const check = (titles.method("get_Item", 1).invoke(Number(titles.method("get_Count").invoke()) - 1) as Il2Cpp.Object);
        const checkName = ((check.field<any>("ResourceId").value as Il2Cpp.ValueType)
          .field("UniqueName").value as Il2Cpp.String)?.content;
        const checkTitle = ((check.field<any>("Title").value as Il2Cpp.ValueType)
          .field("RawKey").value as Il2Cpp.String)?.content;
        log(`game configuration: added title ${checkName} (${checkTitle})`);
      }
      log(`game configuration: ${existing} + 2 titles`);
    }

    function titleExists(titles: Il2Cpp.Object, uniqueName: string): boolean {
      try {
        const count = Number((titles.method("get_Count") as any).invoke());
        for (let i = 0; i < count; i++) {
          const entry = titles.method("get_Item", 1).invoke(i) as Il2Cpp.Object;
          if (isNull(entry)) continue;
          const name = ((entry.field<any>("ResourceId").value as Il2Cpp.ValueType)
            .field("UniqueName").value as Il2Cpp.String)?.content;
          if (name === uniqueName) return true;
        }
      } catch (_) {}
      return false;
    }

    // Builds a value type for a managed enum.
    function rarityValue(rarity: number): Il2Cpp.ValueType {
      return enumBox(cls(img, "SPTESL.CardRarity"), rarity);
    }

    function fixFrostTrollScenario(instance: Il2Cpp.Object) {
      const scenarios = instance.field<Il2Cpp.Object>("Scenarios").value;
      if (isNull(scenarios)) return;
      const count = Number((scenarios.method("get_Count") as any).invoke());
      for (let i = 0; i < count; i++) {
        const scenario = scenarios.method("get_Item", 1).invoke(i) as Il2Cpp.Object;
        if (isNull(scenario)) continue;
        const name = ((scenario.field<any>("ResourceId").value as Il2Cpp.ValueType)
          .field("UniqueName").value as Il2Cpp.String)?.content;
        if (name !== "CWC_M_Act1_Ep2_FrostTroll_B" && name !== "CWC_Act1_Ep2_FrostTroll_B") continue;
        const modal = scenario.field<any>("IntroModalData").value as Il2Cpp.Object;
        if (isNull(modal)) continue;
        const overview = modal.field<any>("OverviewSection").value as Il2Cpp.Object;
        if (isNull(overview)) continue;
        overview.field<any>("Image").value =
          Il2Cpp.string("ContentPack000/Cards/Visuals/Ice_Storm_v2/Ice_Storm_v2");
        log(`game configuration: fixed the scenario image of ${name}`);
      }
    }
  });

  // Number of entries of a Dictionary<string, string>. The internal field of
  // the dictionary cannot be read (its name differs in this framework), so
  // the count is asked from the dictionary itself.
  function countOf(dictionary: Il2Cpp.Object | null): number {
    if (isNull(dictionary)) return 0;
    try { return Number((dictionary.method("get_Count") as any).invoke()); } catch (_) { return 0; }
  }

  // Puts the strings that were recovered from the cached text bundle into the
  // game's localization dictionary, so the user interface shows the text
  // instead of the raw keys.
  function restoreLocalization(manager: Il2Cpp.Object, code: string): number {
    try {
      let text = "";
      // The file is named after the language ("en"), but the game also uses
      // the full language name ("en_US") for the text bundles.
      const selected = resourceLanguage() || code;
      const regional = selected.includes("_") ? selected.slice(0, 2) + "_" + selected.slice(3).toUpperCase() : selected;
      for (const name of [selected, regional, shortLanguage(selected)]) {
        text = readTextFile(`${persistentPath()}/tesl-localization-${name}.json`);
        if (text) break;
      }
      if (!text) return 0;
      const json = JSON.parse(text);
      const keys = Object.keys(json);
      if (keys.length === 0) return 0;
      const stringClass = Il2Cpp.corlib.class("System.String");
      const dictionary = Il2Cpp.corlib.class("System.Collections.Generic.Dictionary`2")
        .inflate(stringClass, stringClass).new();
      // This dictionary is not owned by the manager until the complete table
      // has been filled. Thousands of string allocations can trigger a GC.
      const retained = dictionary.ref(false);
      try {
        for (const key of keys) {
          (retained.target.method("set_Item") as any).invoke(Il2Cpp.string(key), Il2Cpp.string(String(json[key])));
        }
        const fixes = TRANSLATIONS[selected] || TRANSLATIONS[shortLanguage(selected)] || {};
        for (const key of Object.keys(fixes))
          (retained.target.method("set_Item") as any).invoke(Il2Cpp.string(key), Il2Cpp.string(fixes[key]));
        manager.field<any>("_localizedData").value = retained.target;
      } finally { retained.free(); }
      return keys.length;
    } catch (e) { log(`could not restore the localization: ${e}`); return 0; }
  }

  // ---------------------------------------------------------------------
  // LocalizationManagerPatch: the plugin ships translation fixes for the
  // strings the original client got wrong.
  // ---------------------------------------------------------------------
  let resourceSettingsWindow: any = null;
  function resourceLanguage(): string {
    try {
      const choice = JSON.parse(readTextFile(`${persistentPath()}/tesl-reborn-language.json`) || "null");
      if (choice && /^(en_us|de_de|es_es|es_mx|fr_fr|it_it|pl_pl|pt_br|ru_ru|tr_tr)$/.test(choice.language)) return choice.language;
    } catch (_) {}
    return "";
  }

  function languageSetupUri(query: string): string {
    let host = "resources";
    try {
      const setup = JSON.parse(readTextFile(`${persistentPath()}/tesl-reborn-setup.json`) || "{}");
      if (setup.languageTransition === true) host = "language";
    } catch (_) {}
    return "teslreborn://" + host + "?" + query;
  }

  function resourceSettingsOpen(): boolean {
    try { return resourceSettingsWindow != null && Boolean(call(resourceSettingsWindow.target, "get_activeInHierarchy")); }
    catch (_) { return false; }
  }

  function shortLanguage(code: string): string { return String(code).toLowerCase().replace("-", "_").split("_")[0]; }
  function localizedGameUri(uri: string, code: string): string {
    if (!code || !/^https?:\/\/(?:[a-z0-9-]+\.)?tesl-reborn\.com(?=[:/]|$)/i.test(uri)) return uri;
    return uri.replace(/([?&](?:language|locale)=)([^&#]*)/gi, (_, prefix, old) => prefix + shapedLanguage(code, decodeURIComponent(old)));
  }
  function localizedAssetPath(path: string, code: string): string {
    if (!code) return path;
    return path.replace(/(\/Localization\/(?:Text|Audio)\/)(?:en|de|es|fr|it|pl|pt|ru|tr)(?:[_-][a-z]{2})?(?=\/|$)/gi,
      (_, prefix) => prefix + code.slice(0,2) + "_" + code.slice(3).toUpperCase());
  }

  function shapedLanguage(code: string, old: string): string {
    return /[_-]/.test(old) ? code.slice(0, 2) + "_" + code.slice(3).toUpperCase() : code.slice(0, 2);
  }

  function languageLabel(text: string): string | undefined {
    const label = String(text).replace(/<[^>]*>/g, "").toLowerCase().replace(/[\s()_-]/g, "");
    const native = { en_us:["english","englishus","английский"],de_de:["deutsch","german","немецкий"],
      es_es:["español","spanish","испанский"],es_mx:["españolmexicano","españollatinoamérica","latinamericanspanish","españolméxico"],
      fr_fr:["français","french","французский"],it_it:["italiano","italian","итальянский"],
      pl_pl:["polski","polish","польский"],pt_br:["portuguêsbrasil","brazilianportuguese","português","portuguese"],
      ru_ru:["русский","русскийязык","russian"],tr_tr:["türkçe","turkish","турецкий"] };
    return Object.keys(native).find(code => native[code].includes(label));
  }

  section("translation fixes", () => {
    const localization = cls(img, "LocalizationManager");
    let lastLanguage = "", lastRestored = "", lastRestoredDictionary = "", lastFixed = "", loaded = false, switching = false, languageInputDepth = 0, recentInputAt = 0, recentExplicitInputAt = 0, switchingAt = 0;
    function noteLanguageInput() {
      try {
        const input = ucls("UnityEngine.Input");
        if (Number(input.method("get_touchCount", 0).invoke()) > 0 ||
            input.method("GetMouseButtonDown", 1).invoke(0) || input.method("GetMouseButtonUp", 1).invoke(0)) {
          recentExplicitInputAt = Date.now();
          if (resourceSettingsOpen()) recentInputAt = recentExplicitInputAt;
        }
      } catch (_) {}
    }
    // Settings may save a preference and load its language asynchronously, after
    // the UI callback has returned. Remember actual input, not just stack depth.
    try {
      Interceptor.attach(cls(img, "SparkleServices.ServicesManager").method("Update", 0).virtualAddress, {
        onEnter() { noteLanguageInput(); }
      });
    } catch (error) { log(`resources: settings input trace unavailable: ${error}`); }
    // Account/bootstrap code also calls SetLanguage. Only an actual settings
    // handler may open setup; background locale changes must not restart login.
    const languageHandlers = new Set();
    for (const owner of img.classes.filter(c => /settings|options|language/i.test(c.name))) {
      for (const method of owner.methods.filter(m => /^(On.*(?:Language|Locale|Lang|ValueChanged|SelectionChanged).*|(?:Select|Change|Set).*(?:Language|Locale|Lang)|LanguageChanged)$/i.test(m.name)
          && !m.isStatic && !m.virtualAddress.isNull())) {
        const key = method.virtualAddress.toString(); if (languageHandlers.has(key)) continue;
        languageHandlers.add(key);
        Interceptor.attach(method.virtualAddress, {
          onEnter() { languageInputDepth++; },
          onLeave() { languageInputDepth = Math.max(0, languageInputDepth - 1); }
        });
      }
    }
    const languageNames = { en_us: ["english", "en"], de_de: ["german", "de"], es_es: ["spanish", "es"],
      es_mx: ["mexicanspanish", "spanishmexican", "latinamericanspanish", "spanishlatinamerica"],
      fr_fr: ["french", "fr"], it_it: ["italian", "it"], pl_pl: ["polish", "pl"],
      pt_br: ["brazilianportuguese", "portuguesebrazilian", "portuguese", "pt"], ru_ru: ["russian", "ru"], tr_tr: ["turkish", "tr"] };
    function requestLanguage(target: string | undefined, current: string, explicit = false): boolean {
      if (globalThis.__teslLanguageSyncing) return false;
      noteLanguageInput();
      if (!explicit && (!target || target === current || !loaded || !recentInputAt || Date.now() - recentInputAt > 3000)) return false;
      if (switching && Date.now() - switchingAt < 1500 || target && target === current) return true;
      switching = true;
      switchingAt = Date.now();
      const link = target ? "language=" + target + "&apply=1" : "chooseLanguage=1";
      try {
        writeTextFile(`${persistentPath()}/tesl-reborn-language-status.json`, JSON.stringify({
          revision: 30, status: "opening-game-data", current, requested: target || "chooser", at: new Date().toISOString()
        }));
      } catch (_) {}
      log(`resources: language control -> Game data (${target || "chooser"}); native handler suppressed`);
      schedule(0, () => {
        try {
          ucls("UnityEngine.Application").method("OpenURL", 1).invoke(Il2Cpp.string(languageSetupUri(link)));
        } catch (error) {
          switching = false;
          log(`resources: could not open language setup: ${error}`);
        }
      });
      return true;
    }
    // Intercept the user-facing control BEFORE Unity invokes the game's change
    // listeners. Observing SetLanguage afterwards is too late: those listeners
    // can already have logged out and loaded only part of the new locale.
    // Show is an explicit user action and needs neither the guessed Settings
    // root nor a touch timestamp. Read option labels, never numeric locale IDs.
    const replacedLanguageControls = new Set<string>();
    function replaceLanguageControl(method, route) {
      if (!method || method.isStatic || method.virtualAddress.isNull()) return;
      const key = method.virtualAddress.toString();
      if (replacedLanguageControls.has(key)) return;
      replacedLanguageControls.add(key);
      method.implementation = function (...args) {
        try { if (route(this, args)) return; }
        catch (error) { log(`resources: language control ${method.name}: ${error}`); }
        return method.invokeRaw(this.handle, ...args);
      };
    }
    for (const name of ["UnityEngine.UI.Dropdown", "TMPro.TMP_Dropdown"]) {
      try {
        replaceLanguageControl(ucls(name).tryMethod("Show", 0), self => {
          if (globalThis.__teslNativeLanguageCallback) return false;
          const options = call(self, "get_options"), count = Number(call(options, "get_Count"));
          if (count < 2 || count > 16) return false;
          let recognized = 0;
          for (let i=0; i<count; i++) if (languageLabel(String(call(call(options, "get_Item", i), "get_text")?.content || ""))) recognized++;
          if (recognized < 2) return false;
          return requestLanguage(undefined, resourceLanguage(), true);
        });
      } catch (error) { log(`resources: ${name} language entry: ${error}`); }
    }
    // Some game prefabs use a button/custom selector instead of a Unity
    // dropdown. A language-specific persistent callback identifies that button
    // without guessing which Settings/Options prefab is the real dialog.
    try {
      replaceLanguageControl(ucls("UnityEngine.UI.Button").tryMethod("Press", 0), self => {
        settingsButtonPressed(self);
        if (globalThis.__teslNativeLanguageCallback) return false;
        const event = call(self, "get_onClick"), count = Number(call(event, "GetPersistentEventCount"));
        let languageAction = false;
        for (let i=0; i<count; i++) {
          const name = String(call(event, "GetPersistentMethodName", i)?.content || "");
          if (/^(?:On|Show|Open|Select|Change|Choose|Set).*(?:Language|Locale)/i.test(name)) languageAction = true;
        }
        if (!languageAction) {
          const node = call(self, "get_transform");
          const name = String(call(node,"get_name")?.content || "");
          languageAction = /language|locale/i.test(name) && !/cancel|close|back|download/i.test(name);
        }
        if (!languageAction) return false;
        return requestLanguage(undefined, resourceLanguage(), true);
      });
    } catch (error) { log(`resources: language button entry: ${error}`); }
    // Catch custom Settings callbacks too. Only UI components and language-
    // specific void handlers qualify; profile/model setters remain observers.
    for (const owner of img.classes.filter(c => /settings|options|language/i.test(c.name))) {
      let component = false;
      try { component = Array.from(owner.hierarchy()).some(base => base.type.name === "UnityEngine.Component"); } catch (_) {}
      if (!component) continue;
      for (const method of owner.methods.filter(m => /^(?:On|Select|Change|Choose|Show|Open).*Language/i.test(m.name)
          && !/load|ready|initializ|complete|response|success/i.test(m.name)
          && m.returnType.name === "System.Void" && m.parameterCount <= 1)) {
        replaceLanguageControl(method, (self, args) => {
          if (!Boolean(call(call(self, "get_gameObject"), "get_activeInHierarchy"))) return false;
          noteLanguageInput();
          if (!recentExplicitInputAt || Date.now() - recentExplicitInputAt > 3000) return false;
          let target;
          if (method.parameterCount === 1) {
            const type = method.parameters[0].type;
            if (type.name === "System.String") target = languageLabel(args[0]?.content || "");
            else if (type.class.isEnum) {
              const field = type.class.fields.find(f => f.isStatic && enumVal(f.value) === Number(args[0]));
              target = field && Object.keys(languageNames).find(code => languageNames[code].includes(field.name.toLowerCase().replace(/[^a-z]/g, "")));
            }
          }
          return requestLanguage(target, resourceLanguage(), true);
        });
      }
    }
    // The Android options UI can update a profile/settings setter without
    // calling LocalizationManager inside its callback. Capture that source too.
    for (const owner of img.classes) for (const method of owner.methods.filter(m =>
        /^(?:set_(?:GameLanguage|Language|LanguageCode|CurrentLanguage|SelectedLanguage|Locale|LocaleCode)|Set(?:Game|Client)?Language|(?:On|Select|Change).*Language.*)$/i.test(m.name)
        && m.parameterCount >= 1 && !m.isStatic && owner !== localization && !m.virtualAddress.isNull())) {
      Interceptor.attach(method.virtualAddress, {
        onEnter(args) {
          try {
            const type = method.parameters[0].type;
            let requested = "";
            if (type.name === "System.String") requested = rawStr(args[1]);
            else if (type.class.isEnum) requested = type.class.fields.find(f => f.isStatic && enumVal(f.value) === args[1].toInt32())?.name || "";
            const normalized = requested.toLowerCase().replace("-", "_");
            const target = Object.keys(languageNames).find(code => code === normalized || languageNames[code].includes(normalized.replace(/[^a-z]/g, "")));
            if (target) requestLanguage(target, resourceLanguage());
          } catch (error) { log(`resources: settings language setter ${owner.name}.${method.name}: ${error}`); }
        }
      });
    }
    // Unity dropdowns may store a numeric index directly, without a game
    // language setter. Read their actual option labels instead of guessing IDs.
    for (const name of ["UnityEngine.UI.Dropdown", "TMPro.TMP_Dropdown"]) {
      try {
        const dropdown = ucls(name), method = dropdown.tryMethod("OnSelectItem", 1) || dropdown.tryMethod("Set", 2) || dropdown.tryMethod("set_value", 1);
        if (!method || method.virtualAddress.isNull()) continue;
        Interceptor.attach(method.virtualAddress, {
          onEnter(args) {
            this.index = method.name === "OnSelectItem" ? null : args[1].toInt32();
            this.active = !globalThis.__teslNativeLanguageCallback && resourceSettingsOpen() && (method.name === "OnSelectItem" || method.parameterCount < 2 || args[2].toInt32() !== 0);
            if (this.active) this.dropdown = new Il2Cpp.Object(args[0]).ref(false);
          },
          onLeave() {
            if (!this.dropdown) return;
            const retained = this.dropdown, index = this.index;
            schedule(0, () => {
              try {
                const selectedIndex = index == null ? Number(call(retained.target, "get_value")) : index;
                const options = call(retained.target, "get_options"), count = Number(call(options, "get_Count"));
                if (selectedIndex < 0 || selectedIndex >= count || count < 2 || count > 16) return;
                const labels = [];
                for (let i = 0; i < count; i++) labels.push(languageLabel(String(call(call(options, "get_Item", i), "get_text")?.content || "")));
                if (labels.filter(Boolean).length >= 2 && labels[selectedIndex]) requestLanguage(labels[selectedIndex], resourceLanguage());
              } catch (error) { log(`resources: language dropdown: ${error}`); }
              finally { retained.free(); }
            });
          }
        });
      } catch (_) {}
    }
    const setLanguage = localization.method("SetLanguage", 2);
    Interceptor.attach(setLanguage.virtualAddress, {
      onEnter(args) {
        try {
          const choice = resourceLanguage();
          if (!choice) return;
          const index = setLanguage.isStatic ? 0 : 1, type = setLanguage.parameters[0].type;
          if (type.name === "System.String") {
            const old = rawStr(args[index]);
            const normalized = old.toLowerCase().replace("-", "_");
            requestLanguage(Object.keys(languageNames).includes(normalized) ? normalized :
              Object.keys(languageNames).find(c => shortLanguage(c) === shortLanguage(old) ||
                languageNames[c].includes(normalized.replace(/[^a-z]/g, ""))), choice);
            // Keep the entire initialization consistent, not just its first SetLanguage call.
            this.languageString = Il2Cpp.string(shapedLanguage(choice, old)).object.ref(false);
            args[index] = this.languageString.target.handle;
          } else if (type.class.isEnum) {
            const requested = type.class.fields.find(f => f.isStatic && enumVal(f.value) === args[index].toInt32());
            if (requested) requestLanguage(Object.keys(languageNames).find(c =>
              languageNames[c].includes(requested.name.toLowerCase().replace(/[^a-z]/g, ""))), choice);
            const field = type.class.fields.find(f => f.isStatic && languageNames[choice].includes(f.name.toLowerCase().replace(/[^a-z]/g, "")));
            if (field) { const value = enumVal(field.value); if (value >= 0) args[index] = ptr(value); }
          }
          log(`resources: language ${choice}; SetLanguage parameter=${type.name}`);
        } catch (error) { log(`resources: language override unavailable: ${error}`); }
      },
      onLeave() { if (this.languageString) this.languageString.free(); },
    });
    // The game's bootstrap also reads the system locale and its saved preference.
    // Return the same selection there so callers and LocalizationManager agree.
    const pinnedStrings = new Map();
    const prefs = ucls("UnityEngine.PlayerPrefs");
    for (const method of prefs.methods.filter(m => m.name === "SetString" && m.parameterCount === 2)) {
      Interceptor.attach(method.virtualAddress, {
        onEnter(args) {
          const key = rawStr(args[0]);
          if (!/^(language|languagecode|selectedlanguage|currentlanguage|locale|loccode)$/i.test(key)) return;
          const value = rawStr(args[1]).toLowerCase().replace("-", "_");
          const target = Object.keys(languageNames).find(code => code === value ||
            languageNames[code].includes(value.replace(/[^a-z]/g, "")));
          requestLanguage(target, resourceLanguage());
        }
      });
    }
    for (const method of prefs.methods.filter(m => m.name === "GetString" && m.parameterCount >= 1)) {
      Interceptor.attach(method.virtualAddress, {
        onEnter(args) { this.key = rawStr(args[0]); },
        onLeave(result) {
          if (!/^(language|languagecode|selectedlanguage|currentlanguage|locale|loccode)$/i.test(this.key || "")) return;
          const choice = resourceLanguage(); if (!choice) return;
          const old = rawStr(result), value = shapedLanguage(choice, old);
          if (!pinnedStrings.has(value)) pinnedStrings.set(value, Il2Cpp.string(value).object.ref(false));
          result.replace(pinnedStrings.get(value).target.handle);
          log(`resources: language preference ${this.key}=${value}`);
        }
      });
    }
    const systemLanguage = ucls("UnityEngine.Application").tryMethod("get_systemLanguage", 0);
    if (systemLanguage) Interceptor.attach(systemLanguage.virtualAddress, {
      onLeave(result) {
        const choice = resourceLanguage(); if (!choice) return;
        const names = choice === "es_mx" ? ["spanish"] : languageNames[choice];
        const field = systemLanguage.returnType.class.fields.find(f => f.isStatic && names.includes(f.name.toLowerCase()));
        if (field) result.replace(ptr(enumVal(field.value)));
      }
    });
    Interceptor.attach(localization.method("UpdateObjects").virtualAddress, {
      onEnter(args) {
        try {
          const manager = new Il2Cpp.Object(args[0]);
          const code = String(call(manager, "get_CurrentLanguageCode")?.content ?? "en");
          let data = manager.field<Il2Cpp.Object>("_localizedData").value;
          let entries = countOf(data);
          // UpdateObjects arrives with every text refresh of the UI; the saved
          // preference is read once here instead of on each of these lines.
          const saved = resourceLanguage();
          const selection = saved || code;
          if (entries === 0 || lastLanguage !== code || lastRestored !== selection || lastRestoredDictionary !== String(data?.handle)) {
            // The game's own text bundle could not be loaded (it is a
            // downloadable bundle and the CDN is gone), so the strings that
            // were recovered from the cached bundle are used instead.
            const restored = restoreLocalization(manager, code);
            if (restored > 0) {
              lastRestored = selection;
              log(`localization: restored ${restored} strings for ${selection}; Unity locale ${code}`);
            }
            // The restore replaced the dictionary, so it has to be read again.
            data = manager.field<Il2Cpp.Object>("_localizedData").value;
            entries = countOf(data);
            lastRestoredDictionary = String(data?.handle);
          }
          loaded = entries > 0;
          const fixes = TRANSLATIONS[saved] || TRANSLATIONS[shortLanguage(selection)] || TRANSLATIONS[code];
          if (lastLanguage !== code) {
            lastLanguage = code;
            log(`localization: language ${code}, ${entries} strings${fixes ? "" : ", no fixes for it"}`);
          }
          if (!fixes) return;
          if (isNull(data)) return;
          const fingerprint = `${selection}:${data.handle}`;
          if (lastFixed === fingerprint) return;
          lastFixed = fingerprint;
          let changed = 0;
          for (const key of Object.keys(fixes)) {
            // The keys of the plugin are not in the game's text bundle, they
            // are added here.
            (data.method("set_Item") as any).invoke(Il2Cpp.string(key), Il2Cpp.string(fixes[key]));
            changed++;
          }
          log(`localization: applied ${changed} translation fixes`);
        } catch (e) { log(`translation fixes failed: ${e}`); }
      },
    });
  });

  // ---------------------------------------------------------------------
  // A single APK can carry the streaming assets (the OBB of the package) and
  // places where the game expects them on the first start:
  //   * the OBB next to the other packages of the device
  //   * the bundles into the cache of Unity
  // ---------------------------------------------------------------------
    // A small reader for the zip archives: the payload of the APK is stored
  // without a compression, so the data can be copied out of it as it is.
  class ZipReader {
    private file: any = null;
    private entries = new Map<string, any>();

    constructor(path: string) {
      try {
        this.file = new File(path, "rb");
        this.file.seek(0, File.SEEK_END);
        const length = this.file.tell();
        const tail = Math.min(length, 0x10000);
        this.file.seek(length - tail);
        const view = new DataView(this.file.readBytes(tail));
        let eocd = -1;
        for (let i = tail - 22; i >= 0; i--) {
          if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
        }
        if (eocd < 0) throw new Error("no central directory");
        const count = view.getUint16(eocd + 10, true);
        let at = view.getUint32(eocd + 16, true);
        for (let i = 0; i < count; i++) {
          this.file.seek(at);
          const head = new DataView(this.file.readBytes(46));
          const method = head.getUint16(10, true);
          const size = head.getUint32(24, true);
          const nameLen = head.getUint16(28, true);
          const extraLen = head.getUint16(30, true);
          const commentLen = head.getUint16(32, true);
          const offset = head.getUint32(42, true);
          this.file.seek(at + 46);
          const name = readString(this.file.readBytes(nameLen));
          this.entries.set(name, { method, size, offset });
          at += 46 + nameLen + extraLen + commentLen;
        }
      } catch (e) {
        log(`payload: the apk cannot be read: ${e}`);
        try { this.file?.close(); } catch (_) {}
        this.file = null;
      }
    }

    close() { try { this.file?.close(); } finally { this.file = null; } }
    valid() { return this.file !== null; }
    find(name: string): any { return this.entries.get(name) ?? null; }

    list(): string[] { return [...this.entries.keys()]; }

    read(entry: any, from: number, length: number): ArrayBuffer {
      this.file.seek(this.dataOffset(entry) + from);
      return this.file.readBytes(length);
    }

    copy(entry: any, target: string) {
      if (entry.method !== 0) throw Error("Legacy payload must be stored");
      const part = target + ".part", out = new File(part, "wb");
      try {
        let done = 0;
        while (done < entry.size) {
          const n = Math.min(4 * 1024 * 1024, entry.size - done), bytes = this.read(entry, done, n);
          if (bytes.byteLength !== n) throw Error("Truncated APK payload");
          out.write(bytes); done += n;
        }
        out.flush();
      } finally { out.close(); }
      if (!atomicRename(part, target)) throw Error("Could not commit APK payload");
    }

    private dataOffset(entry: any): number {
      this.file.seek(entry.offset);
      const head = new DataView(this.file.readBytes(30));
      return entry.offset + 30 + head.getUint16(26, true) + head.getUint16(28, true);
    }
  }

  section("payload from the apk", () => {
    const apk = apkPath();
    if (!apk) { log("payload: the apk was not found"); return; }
    const zip = new ZipReader(apk);
    if (!zip.valid()) return;
    try {
    // Keep Reborn artwork out of git, but install the verified build resources
    // from the APK so a clean installation does not require an ADB asset push.
    const emojiHashes = {
      "people.json": "ea39cac729868b482d2147ef8c5758d9f23f605cfd5eedcb9d9117408e71531d",
      "people.png": "95198a82da017136cb923b655cbe0c83d40456404bef87c86e8a2ae9e67fb4aa"
    };
    for (const [name, expected] of Object.entries(emojiHashes)) {
      const entry = zip.find(`assets/tesl-reborn/emojis/${name}`);
      if (!entry) { log(`emoji payload: missing ${name}`); continue; }
      if (entry.method !== 0 || entry.size > 2 * 1024 * 1024) throw Error("Invalid emoji APK entry");
      const directory = `${persistentPath()}/tesl-reborn-emojis`;
      const target = `${directory}/${name}`;
      let current = false;
      try { current = Checksum.compute("sha256", File.readAllBytes(target)) === expected; } catch (_) {}
      if (current) continue;
      makeDirectory(directory);
      zip.copy(entry, target);
      if (Checksum.compute("sha256", File.readAllBytes(target)) !== expected) throw Error(`Invalid emoji payload: ${name}`);
      log(`emoji payload: restored ${name}`);
    }
    const obb = zip.find("assets/tesl-payload/obb.bin");
    const cache = zip.find("assets/tesl-payload/cache.bin");
    const perFileEntries = zip.list().filter(e => e.startsWith("assets/tesl-payload/UnityCache/Shared/"));
    if (!obb && !cache && !perFileEntries.length) { log("payload: the apk carries no payload"); return; }

    if (obb) {
      const target = obbPath();
      if (target && fileSize(target) !== obb.size) {
        log(`payload: writing the streaming assets to ${target}`);
        makeDirectory(target.substring(0, target.lastIndexOf("/")));
        zip.copy(obb, target);
        log("payload: the streaming assets are ready");
      }
    }
    if (cache) {
      const target = `${persistentPath()}/UnityCache/Shared`;
      const head = new DataView(zip.read(cache, 0, 12));
      const count = head.getUint32(8, true);
      let at = 12;
      const files: { name: string; size: number }[] = [];
      for (let i = 0; i < count; i++) {
        const len = new DataView(zip.read(cache, at, 2)).getUint16(0, true);
        at += 2;
        const name = readString(zip.read(cache, at, len));
        at += len;
        const size = readUInt64(new DataView(zip.read(cache, at, 8)));
        at += 8;
        files.push({ name, size });
      }
      let offset = at;
      let written = 0;
      for (const f of files) {
        const path = `${target}/${f.name}`;
        if (!fileExists(path)) {
          makeDirectory(path.substring(0, path.lastIndexOf("/")));
          const out = new File(path, "wb");
          let done = 0;
          while (done < f.size) {
            const n = Math.min(4 * 1024 * 1024, f.size - done);
            out.write(zip.read(cache, offset + done, n));
            done += n;
          }
          out.close();
          written++;
        }
        offset += f.size;
      }
          log(`payload: ${written} of ${count} cache files written (packed)`);
    } else {
      const prefix = "assets/tesl-payload/UnityCache/Shared/";
      const perEntry = (zip as any).list().filter((e:string) => e.startsWith(prefix));
      if (perEntry.length) {
        const tgt = `${persistentPath()}/UnityCache/Shared`;
        let written = 0;
        for (const name of perEntry) {
          const rel = name.substring(prefix.length);
          const path = `${tgt}/${rel}`;
          const e = zip.find(name);
          if (fileSize(path) !== e.size) {
            makeDirectory(path.substring(0, path.lastIndexOf("/")));
            zip.copy(e, path);
            written++;
          }
        }
        log(`payload: ${written} of ${perEntry.length} cache files written (per-file)`);
      }
    }
        const versions = zip.find("assets/tesl-payload/versions.json");
    if (versions) {
      const target = `${persistentPath()}/versions.json`;
      if (!fileExists(target)) {
        log("payload: writing versions.json");
        makeDirectory(target.substring(0, target.lastIndexOf("/")));
        zip.copy(versions, target);
      }
    }
    } finally { zip.close(); }
  });

  // The path of the APK of the game, taken from the streaming assets path.
  // Discover the package's APK even when an OBB is installed.  On Android
  // both Application.dataPath and streamingAssetsPath report the OBB's path
  // once an OBB is present (that OBB would then be treated as the APK and
  // the embedded payload would be invisible).  The APK is only reliably
  // findable as a mapped module in /proc/self/maps.
  function apkPath(): string {
    try {
      const f = new File("/proc/self/maps", "rb");
      let line = "";
      let fallback = "";
      while ((line = f.readLine()) !== "") {
        const matches = line.match(/(\/[^\s]+\.apk)/g);
        if (matches) for (const cand of matches) {
          if (cand.indexOf("base.apk") >= 0) { try { f.close(); } catch (_) {}; return cand; }
          if (!fallback) fallback = cand;
        }
      }
      try { f.close(); } catch (_) {}
      if (fallback) return fallback;
    } catch (_) {}
    try {
      const path = String((ucls("UnityEngine.Application").method("get_streamingAssetsPath") as any)
        .invoke()?.content ?? "");
      const m = path.match(/^jar:file:\/\/(.*)!.*$/);
      return m ? m[1] : "";
    } catch { return ""; }
  }

  // The place where the game expects the OBB of the package.
  function obbPath(): string {
    const persistent = persistentPath();      // /sdcard/Android/data/<pkg>/files
    const android = persistent.replace(/\/data\/[^/]+\/files$/, "");
    return `${android}/obb/com.bethsoft.theelderscrollslegends/main.11009.com.bethsoft.theelderscrollslegends.obb`;
  }

  function fileSize(path: string): number {
    try { const f = new File(path, "rb"); try { f.seek(0, File.SEEK_END); return f.tell(); } finally { f.close(); } }
    catch (_) { return -1; }
  }
  function fileExists(path: string): boolean {
    try {
      return Boolean((Il2Cpp.corlib.class("System.IO.File").method("Exists") as any)
        .invoke(Il2Cpp.string(path)));
    } catch (_) { return false; }
  }

  function makeDirectory(path: string) {
    try {
      (Il2Cpp.corlib.class("System.IO.Directory").method("CreateDirectory") as any)
        .invoke(Il2Cpp.string(path));
    } catch (e) { log(`payload: cannot create ${path}: ${e}`); }
  }

  function readString(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let text = "";
    for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
    return text;
  }

  function readUInt64(view: DataView): number {
    const low = view.getUint32(0, true);
    const high = view.getUint32(4, true);
    return low + high * 4294967296;
  }


  // ---------------------------------------------------------------------
  // Auto login: the Linux rebuild of the client remembers the credentials of
  // the last successful sign-in (SparkleServices.LoginCredentials) so the
  // login window does not have to be filled in on every start. The same is
  // done here: the credentials are kept in a small file in the app's data
  // directory and used on the next start. A repeated login screen is not
  // sufficient evidence to delete these credentials.
  // ---------------------------------------------------------------------
  const LOGIN_FILE = "tesl-login.json";
  let autoLoginTried = false;

  function readSavedLogin(): { username: string; password: string } | null {
    try {
      const text = readTextFile(`${persistentPath()}/${LOGIN_FILE}`);
      if (!text) return null;
      const json = JSON.parse(text);
      if (!json || !json.username) return null;
      return { username: String(json.username), password: String(json.password ?? "") };
    } catch (e) { return null; }
  }

  function writeSavedLogin(username: string, password: string) {
    if (!username) return;
    const path = `${persistentPath()}/${LOGIN_FILE}`;
    if (!writeTextFile(path + ".part", JSON.stringify({ username, password }))) {
      log("login: credential write failed"); return;
    }
    if (atomicRename(path + ".part", path)) log("login: saved username and credential state");
    else log("login: could not commit saved credentials; previous file retained");
  }

  function prefillLoginUsername(username: string) {
    if (!username) return;
    for (const delay of [0, 300, 1200]) schedule(delay, () => {
      for (const typeName of ["UnityEngine.UI.InputField", "TMPro.TMP_InputField"]) try {
        const fields = ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type")
          .invoke(ucls(typeName).type.object);
        for (let i = 0; i < fields.length; i++) {
          const field = fields.get(i), go = call(field, "get_gameObject");
          if (!Boolean(call(go, "get_activeInHierarchy"))) continue;
          const name = String(call(go, "get_name")?.content || "");
          if (!/user[_ ]?name|account[_ ]?name|email/i.test(name)) continue;
          if (!String(call(field, "get_text")?.content || "")) call(field, "set_text", Il2Cpp.string(username));
        }
      } catch (_) {}
    });
  }

  section("auto login", () => {
    const credentials = cls(img, "SparkleServices.UsernameAndPassword");

    // Hands the remembered credentials to the login callback instead of
    // showing the login window.
    const useRemembered = (callback: any, saved: { username: string; password: string }, failed: () => void) => {
      const retained = new Il2Cpp.Object(callback?.handle ?? callback).ref(false);
      autoLoginTried = true;
      log(`auto login as ${saved.username}`);
      schedule(0, () => {
        try {
          const value = credentials.alloc();
          value.field<Il2Cpp.String>("username").value = Il2Cpp.string(saved.username);
          value.field<Il2Cpp.String>("password").value = Il2Cpp.string(saved.password);
          retained.target.method("Invoke").invoke(value.unbox() as any);
        } catch (e) { log(`auto login callback failed: ${e}`); failed(); }
        finally { retained.free(); }
      });
    };

    // The login screen of the mobile client.
    const mobile = cls(img, "LoginHandler").method("OnLogin", 3);
    const mobileOriginal = new NativeFunction(mobile.virtualAddress, "void",
      ["pointer", "pointer", "pointer", "pointer"]);
    mobile.implementation = function (title, description, callback) {
      try {
        const stored = readSavedLogin();
        const saved = autoLoginTried || !stored?.password ? null : stored;
        if (!saved) {
          if (autoLoginTried) {
            // The server did not accept the remembered credentials.
            // A second login screen can follow a network/session failure, not a credential rejection.
            log("auto login already attempted; keeping saved credentials and showing login");
          }
          mobileOriginal(this.handle, title?.handle ?? title, description?.handle ?? description, callback?.handle ?? callback);
          prefillLoginUsername(stored?.username || "");
          return;
        }
        useRemembered(callback, saved, () => {
          mobileOriginal(this.handle, title?.handle ?? title, description?.handle ?? description, callback?.handle ?? callback);
          prefillLoginUsername(stored?.username || "");
        });
      } catch (e) {
        log(`auto login error: ${e}`);
        const stored = readSavedLogin();
        mobileOriginal(this.handle, title?.handle ?? title, description?.handle ?? description, callback?.handle ?? callback);
          prefillLoginUsername(stored?.username || "");
      }
    };

    // The login screen of the desktop client (a fallback for the other builds).
    const fallback = cls(img, "SparkleServices.DefaultLoginHandler").method("LoginHandler", 3);
    const fallbackOriginal = new NativeFunction(fallback.virtualAddress, "void",
      ["pointer", "pointer", "pointer"]);
    fallback.implementation = function (title, description, callback) {
      try {
        const stored = readSavedLogin();
        const saved = autoLoginTried || !stored?.password ? null : stored;
        if (!saved) {
          if (autoLoginTried) {
            // A second login screen can follow a network/session failure, not a credential rejection.
            log("auto login already attempted; keeping saved credentials and showing login");
          }
          fallbackOriginal(title?.handle ?? title, description?.handle ?? description, callback?.handle ?? callback);
          prefillLoginUsername(stored?.username || "");
          return;
        }
        useRemembered(callback, saved, () => {
          fallbackOriginal(title?.handle ?? title, description?.handle ?? description, callback?.handle ?? callback);
          prefillLoginUsername(stored?.username || "");
        });
      } catch (e) {
        log(`auto login error: ${e}`);
        const stored = readSavedLogin();
        fallbackOriginal(title?.handle ?? title, description?.handle ?? description, callback?.handle ?? callback);
          prefillLoginUsername(stored?.username || "");
      }
    };
  });

  // ---------------------------------------------------------------------
  // CreditsLoaderPatch: the TESL Reborn team in the credits screen.
  // ---------------------------------------------------------------------
  section("tesl reborn credits", () => {
    const credits = cls(img, "CreditsLoader");
    const lineData = cls(img, "CreditsWin").nested("LineDisplayData");
    Interceptor.attach(credits.method("LoadCreditsForDisplay").virtualAddress, {
      onEnter(args) {
        try {
          const list = new Il2Cpp.Object(args[0]);
          for (const [type, text] of [
            [CREDIT_GROUP, "TESL Reborn Team"],
            [CREDIT_TITLE, "Android port · build 27 · archive installer"],
            [CREDIT_TITLE, "Project Lead"],
            [CREDIT_NAME, "Renian"],
            [CREDIT_TITLE, "Game Server Developer"],
            [CREDIT_NAME, "Martin Butlak (maker83)"],
            [CREDIT_NAME, "Renian"],
            [CREDIT_TITLE, "Game Client Patches & Mods"],
            [CREDIT_NAME, "Martin Butlak (maker83)"],
            [CREDIT_TITLE, "Tester/Contributor"],
            [CREDIT_NAME, "Vidi_Aquam"],
          ] as [number, string][]) {
            const line = newWith(lineData, type, Il2Cpp.string(text));
            (list.method("Add") as any).invoke(line);
          }
          log("credits: added the TESL Reborn team");
        } catch (e) { log(`credits failed: ${e}`); }
      },
    });
  });

  // ---------------------------------------------------------------------
  // UIResourceManagerPatch: the legendary title banner is not part of the
  // shipped assets, so it falls back to the common one.
  // ---------------------------------------------------------------------
  section("legendary title banner", () => {
    Interceptor.attach(cls(img, "UIResourceManager").method("GetTitleBannerSprite").virtualAddress, {
      onEnter(args) {
        if (args[1].toInt32() !== RARITY_LEGENDARY) return;
        args[1] = ptr(0);
        log("UIResourceManager: legendary title banner -> common");
      },
    });
  });

  // ---------------------------------------------------------------------
  // Player title patches (TeslRebornPlugin.Patch.Player.*): the custom
  // "TESL Reborn" titles are legendary, so their banners fall back to the
  // common one and get the gold colour, and the legendary rarity filter is
  // revealed in the profile title list.
  // ---------------------------------------------------------------------
  function revealLegendaryTitleFilter(self) {
    try {
      const root = call(self, "get_transform");
      if (isNull(root)) return;
      const queue = [{ transform: root, path: "", depth: 0 }];
      let found = 0, visited = 0;
      const filterPaths = [];
      while (queue.length && visited++ < 512) {
        const node = queue.shift();
        const name = String(call(node.transform, "get_name")?.content || "");
        const path = `${node.path}/${name}`;
        if (/filter/i.test(name) && filterPaths.length < 12) filterPaths.push(path);
        // Require 'filter' in the ancestry to avoid activating title-list items.
        if (/legendary/i.test(name) && /filter/i.test(path)) {
          call(call(node.transform, "get_gameObject"), "SetActive", true);
          found++;
        }
        if (node.depth >= 12) continue;
        const count = Math.min(100, Number(call(node.transform, "get_childCount")));
        for (let i = 0; i < count; i++) queue.push({ transform: call(node.transform, "GetChild", i), path, depth: node.depth + 1 });
      }
      if (found) log(`titles UI: revealed ${found} legendary filter(s)`);
      else log(`titles UI: legendary filter not found; filter nodes=${filterPaths.join(" | ") || "none"}`);
    } catch (error) { log(`titles UI: filter failed: ${error}`); }
  }
  section("player profile titles (legendary filter)", () => {
    const ppt = cls(img, "PlayerProfileTitles");
    const hooks = ppt.methods.filter(m => ["Awake", "OnEnable"].includes(m.name) && !m.isStatic && m.parameterCount === 0);
    if (!hooks.length) throw Error("No own Awake/OnEnable method on PlayerProfileTitles");
    for (const method of hooks) {
      if (method.virtualAddress.isNull()) continue;
      Interceptor.attach(method.virtualAddress, {
        onEnter(args) { this.self = args[0]; },
        // Fields and mobile UI bindings must already have been initialized.
        onLeave() { try { revealLegendaryTitleFilter(new Il2Cpp.Object(this.self)); } catch (error) { log(`titles UI: ${error}`); } }
      });
    }
  });


  // BEGIN android-ui: title-list
// Android can overwrite the initial Graphic tint from a selectable/tween.
  // Track only the actual BackgroundImage bound to a legendary title row.
  const legendaryTitleRows = new Map();
  function titleListColour(self) {
    const key = self.handle.toString();
    const data = self.field("_titleData").value;
    if (isNull(data)) return;
    const legendary = enumVal(data.field("Rarity").value) === RARITY_LEGENDARY;
    const previous = legendaryTitleRows.get(key);
    if (!legendary) {
      if (previous) { previous.row.free(); previous.image.free(); legendaryTitleRows.delete(key); }
      return;
    }
    const image = self.field("BackgroundImage").value;
    if (isNull(image)) return;
    const resources = call(ucls("UIResourceManager"), "get_Instance");
    if (!isNull(resources)) {
      const sprite = resources.method("GetTitleBannerSprite", 1).invoke(enumBox(cls(img, "SPTESL.CardRarity"), 0));
      if (!isNull(sprite)) call(image, "set_overrideSprite", sprite);
    }
    call(image, "set_color", rgba(1, 0.75, 0, 1));
    if (!previous) {
      legendaryTitleRows.set(key, { row: self.weakRef(false), image: image.weakRef(false), repairs: 0, warned: false });
      const transform = call(image, "get_transform");
      log(`titles UI: list tint target=${String(call(transform, "get_name")?.content || "?")}`);
      uiLogTree(call(self, "get_transform"), "titles UI list paths");
    }
  }
  function maintainTitleListColours() {
    for (const [key, record] of legendaryTitleRows) {
      try {
        const row = record.row.target, image = record.image.target;
        if (isNull(row) || isNull(image)) {
          record.row.free(); record.image.free(); legendaryTitleRows.delete(key); continue;
        }
        const data = row.field("_titleData").value;
        if (isNull(data) || enumVal(data.field("Rarity").value) !== RARITY_LEGENDARY) {
          record.row.free(); record.image.free(); legendaryTitleRows.delete(key); continue;
        }
        if (!Boolean(call(call(image, "get_gameObject"), "get_activeInHierarchy"))) continue;
        const colour = call(image, "get_color");
        if (Math.abs(Number(colour.field("r").value) - 1) > 0.01 ||
            Math.abs(Number(colour.field("g").value) - 0.75) > 0.01 ||
            Math.abs(Number(colour.field("b").value)) > 0.01 || Number(colour.field("a").value) < 0.99) {
          call(image, "set_color", rgba(1, 0.75, 0, 1));
          if (record.repairs++ < 2) log("titles UI: list tint restored after native UI reset");
        }
      } catch (error) {
        if (!record.warned) { record.warned = true; log(`titles UI: list maintenance failed: ${error}`); }
        record.row.free(); record.image.free(); legendaryTitleRows.delete(key);
      }
    }
  }
  section("player profile title item (legendary colour)", () => {
    const klass = cls(img, "PlayerProfileTitleItem");
    const methods = klass.methods.filter(m => ["UpdateUi", "SetData"].includes(m.name) && !m.isStatic && !m.virtualAddress.isNull());
    if (!methods.length) throw Error("Title item callbacks not found");
    const attached = new Set();
    for (const method of methods) {
      const key = method.virtualAddress.toString();
      if (attached.has(key)) continue;
      attached.add(key);
      Interceptor.attach(method.virtualAddress, {
        onEnter(args) { this.self = args[0]; },
        onLeave() { try { titleListColour(new Il2Cpp.Object(this.self)); }
          catch (error) { log(`titles UI: list tint failed: ${error}`); } }
      });
    }
    // Use a render callback when present, otherwise the existing main-thread scheduler.
    const render = ucls("UnityEngine.Canvas").tryMethod("SendWillRenderCanvases", 0);
    if (render && !render.virtualAddress.isNull()) {
      Interceptor.attach(render.virtualAddress, { onEnter() { maintainTitleListColours(); } });
      log("titles UI: list colour guard uses Canvas render callback");
    } else {
      const tick = () => { maintainTitleListColours(); schedule(100, tick, "title colours"); };
      schedule(100, tick, "title colours");
      log("titles UI: list colour guard uses main-thread scheduler");
    }
  });
// END android-ui: title-list

  section("player info panel (legendary title banner)", () => {
    const pip = cls(img, "PlayerInfoPanel");
    Interceptor.attach(pip.method("UpdateUi").virtualAddress, {
      onEnter(args) { this.self = args[0]; },
      onLeave() {
        try {
          const self = new Il2Cpp.Object(this.self);
          const banners = self.field<Il2Cpp.Array<Il2Cpp.Object>>("_titleBanners").value;
          if (isNull(banners)) return;
          let matchPlayerData: Il2Cpp.Object | null = null;
          try { matchPlayerData = self.field<Il2Cpp.Object>("_matchPlayerData").value; } catch (_) {}
          if (isNull(matchPlayerData)) return;
          const titleName = String(matchPlayerData.field<Il2Cpp.String>("Title").value?.content ?? "");
          if (!titleName) return;
          const gm = (cls(img, "SPTESL.GameManager").method("get_Instance") as any).invoke() as Il2Cpp.Object;
          if (isNull(gm)) return;
          const titles = gm.field<Il2Cpp.Object>("Config").value?.field<Il2Cpp.Object>("Titles").value;          if (isNull(titles)) return;
          let found: Il2Cpp.Object | null = null;
          const count = Number((titles.method("get_Count") as any).invoke());
          for (let i = 0; i < count; i++) {
            const t = titles.method("get_Item", 1).invoke(i) as Il2Cpp.Object;
            if (isNull(t)) continue;
            const name = ((t.field<any>("ResourceId").value as Il2Cpp.ValueType).field("UniqueName").value as Il2Cpp.String)?.content;
            if (name === titleName) { found = t; break; }
          }
          if (isNull(found)) return;
          const rarity = enumVal(found.field<any>("Rarity").value);
          if (rarity !== RARITY_LEGENDARY) return;
          log(`PlayerInfoPanel: legendary title ${titleName}`);
          try {
            const legendaryBanner = banners.get(RARITY_LEGENDARY);
            if (!isNull(legendaryBanner)) {
              const go = call(legendaryBanner, "get_gameObject");
              if (!isNull(go)) (go.method("SetActive") as any).invoke(false);
            }
          } catch (_) {}
          const commonBanner = banners.get(0);
          if (!isNull(commonBanner)) {
            const go = call(commonBanner, "get_gameObject");
            if (!isNull(go)) (go.method("SetActive") as any).invoke(true);
            (commonBanner.method("set_color") as any).invoke(rgba(1, 0.75, 0, 1));
          }
        } catch (e) { log(`player info panel update failed: ${e}`); }
      },
    });
  });

  // BEGIN android-ui: store-images
  function rebornStoreImagePath(value) {
    return typeof value==="string" && /^AppBase\/UI\/Textures\/Store\/img_-?\d+_2$/.test(value);
  }
  section("Reborn store image loading",()=>{
    const owner=cls(img,"StoreImageUtils");
    const iterator=img.classes.find(c=>c.declaringClass?.name===owner.name && /LoadStoreImageCoroutine/.test(c.name)
      && c.fields.some(f=>f.name==="imageUrl") && c.fields.some(f=>f.name==="callback"));
    if(!iterator)throw Error("Store image coroutine metadata unavailable");
    const state=iterator.fields.find(f=>f.name==="$PC"),current=iterator.fields.find(f=>f.name==="$current");
    const operation=iterator.fields.find(f=>/operation/i.test(f.name) && /AssetBundleLoadAssetOperation$/.test(f.type.name));
    const sprite=ucls("UnityEngine.Sprite"),catalog=cls(img,"AssetCatalog");
    const load=catalog.method("LoadAssetFromPathAsync").overload("System.String","System.Type","System.String");
    const move=iterator.method("MoveNext",0);
    if(!state || !current || !operation || move.virtualAddress.isNull())throw Error("Store image coroutine fields unavailable");
    function report(kind,path) {recordResourceEvent(kind,path);log(`store image: ${kind} ${path}`);}
    const jobs=new Map();
    function finish(job) {
      if(jobs.get(job.key)!==job)return;
      jobs.delete(job.key);
      try {const self=job.ref.target;self.field(state.name).value=-1;self.field(current.name).value=ptr(0);self.field(operation.name).value=ptr(0);}catch(_){}
      job.ref.free();
    }
    function poll(job) {
      if(jobs.get(job.key)!==job)return;
      try {
        const self=job.ref.target;
        if(!job.started) {
          job.started=true;report("store-request",job.path);
          // Start outside the MoveNext interceptor. Nested Frida callbacks are
          // suppressed: starting here lets the Android bundle-path hooks run.
          const result=catalog.method("get_Instance",0).invoke().method(load.name)
            .overload("System.String","System.Type","System.String").invoke(Il2Cpp.string(job.path),sprite.type.object,Il2Cpp.string("png"));
          if(isNull(result)){report("store-missing",job.path);finish(job);return;}
          self.field(operation.name).value=result;
        }
        const op=self.field(operation.name).value;
        if(call(op,"IsDone")) {
          const asset=op.method("GetAsset",0).inflate(sprite).invoke();
          // Terminal before callback, including callbacks that dispose/re-enter.
          self.field(state.name).value=-1;
          if(isNull(asset))report("store-missing",job.path);
          else {report("store-loaded",job.path);const callback=self.field("callback").value;
            if(!isNull(callback))invokeDelegatePtr(callback,asset.handle);}
          finish(job);return;
        }
        if(Date.now()>job.deadline){report("store-timeout",job.path);finish(job);return;}
        schedule(50,()=>poll(job),"store image poll");
      }catch(error){report("store-error",job.path);log(`store image failure: ${error}`);finish(job);}
    }
    // Intercept the factory itself: Unity may dispatch IEnumerator.MoveNext
    // through a cached interface thunk rather than the replaced method body.
    const factory=owner.methods.find(m=>m.name==="LoadStoreImageCoroutine" && m.isStatic && m.parameterCount===4);
    if(!factory || factory.virtualAddress.isNull())throw Error("Store image factory unavailable");
    Interceptor.attach(factory.virtualAddress,{onLeave(ret){
      if(ret.isNull())return;
      try {
        const self=new Il2Cpp.Object(ret),path=String(self.field("imageUrl").value?.content||"");
        if(!rebornStoreImagePath(path))return;
        // Return a valid, completed IEnumerator. Our independently rooted job
        // owns asset delivery; Unity disposing the empty iterator must not cancel it.
        self.field(state.name).value=-1;self.field(current.name).value=ptr(0);
        if(jobs.size>=64){report("store-busy",path);return;}
        const key=self.handle.toString();if(jobs.has(key))return;
        const job={key,ref:self.ref(false),path,deadline:Date.now()+20000,started:false};
        jobs.set(key,job);report("store-queued",path);schedule(0,()=>poll(job),"store image poll");
      }catch(error){log(`store image factory failure: ${error}`);}
    }});
    log(`store image: direct Sprite/png loading via ${iterator.name}`);
  });
  // END android-ui: store-images

  // Trace the asset lookups of the localization data: the English text lives
  // in the "appbase/en_us" bundle, and when that lookup fails the whole user
  // interface shows the raw localization keys instead of the text.
  section("localization asset trace", () => {
    const catalog = cls(img, "AssetCatalog");
    let lastEnterPath = "", lastLoggedPath = "", lastLoggedAt = 0;
    for (const m of catalog.methods.filter(x => x.name === "LoadAssetFromPathAsync")) {
      Interceptor.attach(m.virtualAddress, {
        onEnter(args) {
          this.path = rawStr(args[1]);
          // The overloads call each other, so one lookup enters both hooks
          // back to back with the same path: count the pair once for the
          // stall probe.
          if (this.path !== lastEnterPath) {
            lastEnterPath = this.path;
            const probe = (globalThis as any).__teslRebornStallProbe;
            if (probe) probe.loads++;
          }
          // Only the localization assets depend on the selected language, and
          // this hook runs for every asset load: reading the preference file
          // for the rest of them is pure disk traffic on the loading path.
          const selected = /\/Localization\/(?:Text|Audio)\//i.test(this.path) ? resourceLanguage() : "";
          const next = localizedAssetPath(this.path, selected);
          if (next !== this.path) {
            this.replacement = Il2Cpp.string(next).object.ref(false);
            args[1] = this.replacement.target.handle; this.path = next;
          }
          recordResourceEvent("asset-request", this.path);
        },
        onLeave(ret) {
          if (this.replacement) this.replacement.free();
          recordResourceEvent(ret.isNull() ? "asset-null" : "asset-operation", this.path);
          const path = this.path ?? "";
          if (path.toLowerCase().indexOf("localization") < 0 && !ret.isNull()) return;
          // The twin hook reports the same lookup a moment later: collapsing
          // the repeat keeps the port log readable without losing a failure.
          if (path === lastLoggedPath && Date.now() - lastLoggedAt < 100) return;
          lastLoggedPath = path; lastLoggedAt = Date.now();
          log(`LoadAssetFromPathAsync("${path}") -> ${ret.isNull() ? "NULL (not in the asset map)" : "ok"}`);
        },
      });
    }
  });

  // The OBB's asset bundle manifest and the versions.json of the restored
  // cache can disagree about the hash of a bundle. Unity looks the cache up by
  // that hash, so a mismatch means the bundle is downloaded again (and the CDN
  // is gone). Write the manifest's hashes to a file so the cache folders can
  // be renamed to match.
  // BEGIN android-ui: bundle-hashes
  section("bundle hash report", () => {
    const mgr = cls(img, "AssetBundles.AssetBundleManager");
    const catalog = cls(img, "AssetCatalog");
    const target = "/sdcard/Android/data/com.bethsoft.theelderscrollslegends/files/tesl-bundle-hashes.txt";
    // SetCacheExpiration is reachable from the normal asset path, and hashing
    // every entry of the manifest costs one round of managed calls per bundle
    // (seconds of main thread time). The report is a one-off diagnostic: it is
    // written once, and only retried while the manifest is still missing.
    let written = false, attempts = 0, last = 0;
    Interceptor.attach(catalog.method("SetCacheExpiration").virtualAddress, {
      onEnter() {
        const now = Date.now();
        if (written || attempts >= 3 || (attempts > 0 && now - last < 60000)) return;
        last = now; attempts++;
        const started = now;
        try {
          const manifest = mgr.field<Il2Cpp.Object>("m_AssetBundleManifest").value;
          if (isNull(manifest)) { log("bundle hashes: the manifest is not loaded yet"); return; }
          const names = manifest.method("GetAllAssetBundles").invoke() as Il2Cpp.Array<Il2Cpp.String>;
          const lines: string[] = [];
          for (let i = 0; i < names.length; i++) {
            const name = names.get(i)?.content ?? "";
            const hash = manifest.method("GetAssetBundleHash").invoke(Il2Cpp.string(name));
            const hex = String((hash as any)?.method("ToString").invoke()?.content ?? "");
            lines.push(`${name} ${hex}`);
          }
          (Il2Cpp.corlib.class("System.IO.File").method("WriteAllText") as any)
            .invoke(Il2Cpp.string(target), Il2Cpp.string(lines.join("\n")));
          written = true;
          log(`bundle hashes: wrote ${lines.length} entries to ${target} in ${Date.now() - started}ms`);
        } catch (e) { log(`bundle hash report failed: ${e}`); }
      },
    });
  });
  // END android-ui: bundle-hashes

  // The original port fetched matchEntryData without ever displaying it.
  // Gather actual mobile class/layout metadata before writing a history UI
  // patch; do not invent desktop field names or match rows by list position.
  // Exact classes identified in the previous device log; no Google Play or
  // in-match action-history probes. Log field TYPES only, never field values.
  // BEGIN android-ui: ui-common
function uiComponent(go, type) {
    return go.method("GetComponent").overload("System.Type").invoke(ucls(type).type.object);
  }
  function uiAdd(go, type) {
    return go.method("AddComponent").overload("System.Type").invoke(ucls(type).type.object);
  }
  function uiNew(name, parent) {
    const go = newWith(ucls("UnityEngine.GameObject"), Il2Cpp.string(name),
      Il2Cpp.array(Il2Cpp.corlib.class("System.Type"), [ucls("UnityEngine.RectTransform").type.object]));
    const root=go.ref(false);
    try {
    call(go, "set_layer", Number(call(call(parent, "get_gameObject"), "get_layer")));
    call(go, "get_transform").method("SetParent").overload("UnityEngine.Transform", "System.Boolean").invoke(parent, false);
    return go;
    } finally {root.free();}
  }
  function uiRect(go) { return uiComponent(go, "UnityEngine.RectTransform"); }
  function uiPlace(go, ax, ay, px, py, x, y, width, height) {
    const rect = uiRect(go);
    call(rect, "set_anchorMin", vec2(ax, ay)); call(rect, "set_anchorMax", vec2(ax, ay));
    call(rect, "set_pivot", vec2(px, py)); call(rect, "set_anchoredPosition", vec2(x, y));
    call(rect, "set_sizeDelta", vec2(width, height));
    return rect;
  }
  function uiStretch(rect) {
    call(rect, "set_anchorMin", vec2(0, 0)); call(rect, "set_anchorMax", vec2(1, 1));
    call(rect, "set_offsetMin", vec2(0, 0)); call(rect, "set_offsetMax", vec2(0, 0));
  }
  function uiXY(value) { return { x: Number(value.field("x").value), y: Number(value.field("y").value) }; }
  function uiEnum(type, field) { const c = ucls(type); return enumBox(c, enumVal(c.field(field).value)); }
  function uiList(type) {
    const klass = Il2Cpp.corlib.class("System.Collections.Generic.List`1").inflate(type);
    const list = klass.alloc(); list.method(".ctor").overload().invoke(); return list;
  }
  function uiPlain(text) { return String(text).replace(/</g, "‹").replace(/>/g, "›"); }
  function uiLogTree(root, prefix) {
    const queue = [{ node: root, path: "", depth: 0 }];
    let visited = 0, line = "";
    while (queue.length && visited++ < 140) {
      const item = queue.shift();
      const path = `${item.path}/${String(call(item.node, "get_name")?.content || "")}`;
      if (line.length + path.length > 700) { log(`${prefix}: ${line}`); line = ""; }
      line += `${path} | `;
      if (item.depth >= 6) continue;
      for (let i = 0, count = Math.min(80, Number(call(item.node, "get_childCount"))); i < count; i++)
        queue.push({ node: call(item.node, "GetChild", i), path, depth: item.depth + 1 });
    }
    if (line) log(`${prefix}: ${line}`);
  }
  let uiFontHandle = null;
  function uiFont() {
    if (uiFontHandle) return uiFontHandle.target;
    const objects = ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type")
      .invoke(ucls("TMPro.TextMeshProUGUI").type.object);
    const root=objects.object.ref(false);
    try {
    let fallback = null;
    for (let i = 0; i < objects.length; i++) {
      const font = call(objects.get(i), "get_font");
      if (isNull(font)) continue;
      fallback = fallback || font;
      try { if (/Merriweather/i.test(String(call(font, "get_name")?.content))) { fallback = font; break; } } catch (_) {}
    }
    if (!fallback) fallback = ucls("TMPro.TMP_FontAsset").method("get_defaultFontAsset").invoke();
    if (isNull(fallback)) throw Error("No loaded TMP font");
    uiFontHandle = fallback.ref(false); return fallback;
    } finally {root.free();}
  }
  function uiText(go, text, size = 20) {
    const label = uiAdd(go, "TMPro.TextMeshProUGUI"),root=label.ref(false);
    try {
    call(label, "set_font", uiFont()); call(label, "set_fontSize", size);
    call(label, "set_enableAutoSizing", false); call(label, "set_raycastTarget", false);
    call(label, "set_alignment", uiEnum("TMPro.TextAlignmentOptions", "Center"));
    call(label, "set_color", rgba(1, 1, 1, 1)); call(label, "set_text", Il2Cpp.string(text)); return label;
    } finally {root.free();}
  }
  function uiButton(go, graphic, action) {
    const button = uiAdd(go, "UnityEngine.UI.Button");
    call(button, "set_targetGraphic", graphic);
    const callback = Il2Cpp.delegate(ucls("UnityEngine.Events.UnityAction"), () => {
      try { action(); } catch (error) { log(`UI button failed: ${error}`); }
    });
    call(call(button, "get_onClick"), "AddListener", callback); return button;
  }
  function uiLabeledButton(name, parent, text, x, y, width, action) {
    const go = uiNew(name, parent); uiPlace(go, 1, 1, 1, 1, x, y, width, 28);
    const bg = uiAdd(go, "UnityEngine.UI.Image"); call(bg, "set_color", rgba(0.12, 0.12, 0.12, 0.96));
    const labelGO = uiNew("Label", call(go, "get_transform")); uiStretch(uiRect(labelGO)); uiText(labelGO, text, 18);
    uiButton(go, bg, action); return go;
  }
// END android-ui: ui-common


  // BEGIN android-ui: localized-language-state
  section("native localized language state", () => {
    const localization = cls(img, "LocalizationManager"), set = localization.method("SetLanguage", 2);
    const type = set.parameters[0].type;
    let pending = false, nextCheck = 0, attempts = 0, lastChoice = "", lastError = "";
    const resolved = new Map();
    function codeOf(name) {
      const raw = String(name || "").toLowerCase().replace(/[^a-zа-яё]/g, "")
        .replace(/^(localizedlanguage|language|locale)/, "");
      const aliases = {en_us:["en","enus","engb","english","englishus","englishuk","englishunitedstates"],
        de_de:["de","dede","german","deutsch"],es_es:["es","eses","spanish","spanishspain"],
        es_mx:["esmx","spanishmexico","mexicanspanish","spanishlatinamerica","latinamericanspanish"],
        fr_fr:["fr","frfr","french","français"],it_it:["it","itit","italian","italiano"],
        pl_pl:["pl","plpl","polish","polski"],pt_br:["pt","ptbr","portuguese","portuguesebrazil","brazilianportuguese"],
        ru_ru:["ru","ruru","russian","russianru","русский"],tr_tr:["tr","trtr","turkish","türkçe"]};
      return Object.keys(aliases).find(code => aliases[code].includes(raw)) || languageLabel(name);
    }
    function objectCode(object) {
      if (isNull(object)) return;
      for (const field of object.class.fields.filter(f => !f.isStatic && f.type.name === "System.String" && /code|name|language/i.test(f.name))) {
        const code = codeOf(object.field(field.name).value?.content); if (code) return code;
      }
    }
    function resolve(code, manager = null) {
      if (resolved.has(code)) return resolved.get(code);
      if (type.class.isEnum) {
        const field = type.class.fields.find(f => f.isStatic && codeOf(f.name) === code);
        if (!field) return null;
        const value = field.value, numeric = enumVal(value);
        if (numeric < 0) return null;
        const entry={raw:ptr(numeric),managed:value,name:field.name};resolved.set(code,entry);return entry;
      }
      // Use only real language objects owned by the game, never construct a
      // guessed LocalizedLanguage or assume that its index is a locale ID.
      if (type.class.isValueType) return null;
      const candidates = [];
      for (const field of type.class.fields.filter(f => f.isStatic && f.type.name === type.name)) candidates.push(field.value);
      if (manager) for (const field of manager.class.fields.filter(f => !f.isStatic && f.type.name.includes(type.name))) {
        const value = manager.field(field.name).value;
        if (isNull(value)) continue;
        if (field.type.name === type.name) candidates.push(value);
        else if (field.type.name.endsWith("[]")) {
          for (let i=0;i<Math.min(value.length,32);i++) candidates.push(value.get(i));
        } else {
          try { for (let i=0,n=Math.min(32,Number(call(value,"get_Count")));i<n;i++) candidates.push(call(value,"get_Item",i)); } catch (_) {}
        }
      }
      const object = candidates.find(value => objectCode(value) === code);
      if (!object) return null;
      const retained=object.ref(false), entry={raw:retained.target.handle,managed:retained.target,name:code,retained};
      resolved.set(code,entry);return entry;
    }
    function pin(method) {
      if (!method || method.virtualAddress.isNull()) return;
      Interceptor.attach(method.virtualAddress, {onEnter(args) {
        try {
          const selected=resourceLanguage(), value=selected && resolve(selected, method === set && !set.isStatic ? new Il2Cpp.Object(args[0]) : null);
          if (value) args[method.isStatic?0:1]=value.raw;
        } catch (error) { log(`language state: ${method.name} argument: ${error}`); }
      }});
    }
    pin(set);
    // SettingsManager is a second state source, separate from the text table.
    // Its getter also drives the language dropdown during window initialization.
    let settings = null;
    try {
      settings = cls(img,"SettingsManager");
      const setter = settings.tryMethod("SetCurrentLanguage",1); if (setter) pin(setter);
    } catch (_) {}
    for (const [owner,name] of [[localization,"GetSystemDefaultLanguage"],[settings,"GetCurrentLanguage"]]) {
      try {
        const method=owner?.tryMethod(name,0);
        if (!method || method.returnType.name!==type.name || method.virtualAddress.isNull()) continue;
        Interceptor.attach(method.virtualAddress,{onLeave(result) {
          try { const value=resolve(resourceLanguage()); if(value) result.replace(value.raw); } catch (_) {}
        }});
      } catch (_) {}
    }
    function check() {
      if (pending || Date.now()<nextCheck) return;
      nextCheck=Date.now()+1500;
      const selected=resourceLanguage(); if (!selected) return;
      if (selected!==lastChoice) {lastChoice=selected; attempts=0;}
      try {
        const manager=localization.method("get_Instance",0).invoke(); if(isNull(manager)) return;
        const actual=String(call(manager,"get_CurrentLanguageCode")?.content||"");
        if (codeOf(actual)===selected) return;
        const value=resolve(selected,manager); if(!value) {
          const error=`Cannot resolve ${type.name} for ${selected}`;
          if(error!==lastError){lastError=error;log(`language state: ${error}`);} return;
        }
        if (attempts>=3) return;
        pending=true;attempts++;
        const retained=manager.ref(false);
        schedule(0,()=>{
          const previous=globalThis.__teslLanguageSyncing;
          globalThis.__teslLanguageSyncing=true;
          try {
            // Replay initialization using the game's real language value. The
            // native selection coroutine (which can log out) is never called.
            retained.target.method("SetLanguage",2).invoke(value.managed,false);
            restoreLocalization(retained.target,selected);
            retained.target.method("UpdateObjects",0).invoke();
            if(settings) try {
              const current=settings.method("get_Instance",0).invoke();
              if(!isNull(current)) current.method("SetCurrentLanguage",1).invoke(value.managed);
            } catch (_) {}
            const after=String(call(retained.target,"get_CurrentLanguageCode")?.content||"");
            writeTextFile(`${persistentPath()}/tesl-reborn-language-state.json`,JSON.stringify({revision:32,selected,before:actual,after,type:type.name,value:value.name,attempt:attempts}));
            log(`language state: ${actual} -> ${after}; selected ${selected}, ${value.name}`);
          } catch(error) {log(`language state: initialization failed: ${error}`);}
          finally {globalThis.__teslLanguageSyncing=previous;pending=false;retained.free();}
        });
      } catch(error) {log(`language state: ${error}`);}
    }
    Interceptor.attach(cls(img,"SparkleServices.ServicesManager").method("Update",0).virtualAddress,{onLeave:check});
    // Observe a SetLanguage call made before the hook was installed by checking
    // live manager state as well as intercepting future calls.
    schedule(0,check);
  });
  // END android-ui: localized-language-state

  // BEGIN android-ui: native-ui-sprites
  // Loaded sprites are kept: the next window that asks for the same path gets
  // it in the same frame instead of popping in after an asset load.
  const nativeUiSprites=new Map();
  // image may be null: the sprite is then only loaded into the cache, so the
  // first window that needs it does not wait for the asset (preloading).
  function loadNativeUiSprite(path,image,onLoaded=()=>{}) {
    const cached=nativeUiSprites.get(path);
    if(cached)try{if(!isNull(cached.target)){if(image){call(image,"set_sprite",cached.target);call(image,"set_color",rgba(1,1,1,1));}onLoaded();return;}}catch(_){}
    const retained=image?image.ref(false):null,started=Date.now();let operation=null;
    function release(){if(operation){operation.free();operation=null;}if(retained)retained.free();}
    function poll(){try {
      if(!operation){const catalog=cls(img,"AssetCatalog").method("get_Instance",0).invoke();
        const value=catalog.method("LoadAssetFromPathAsync").overload("System.String","System.Type","System.String")
          .invoke(Il2Cpp.string(path),ucls("UnityEngine.Sprite").type.object,Il2Cpp.string("png"));
        if(isNull(value)){release();return;}operation=value.ref(false);
      }
      if(call(operation.target,"IsDone")){
        const sprite=operation.target.method("GetAsset",0).inflate(ucls("UnityEngine.Sprite")).invoke();
        if(!isNull(sprite)){if(!nativeUiSprites.has(path))nativeUiSprites.set(path,sprite.ref(false));
          if(retained){call(retained.target,"set_sprite",sprite);call(retained.target,"set_color",rgba(1,1,1,1));}onLoaded();}
        release();return;
      }
      if(Date.now()-started>20000){release();return;}
      schedule(50,poll);
    }catch(error){log(`native UI sprite: ${path}: ${error}`);release();}}
    schedule(0,poll);
  }
  // END android-ui: native-ui-sprites

  // BEGIN android-ui: deck-search
  function uiRetryGate(now,limit=3) {
    let first=null,next=0,failures=0;
    return {allow(){if(first===null){first=now();return false;}return failures<limit && now()-first>=500 && now()>=next;},
      fail(){failures++;next=now()+Math.min(5000,1000*failures);},success(){failures=0;next=0;},count(){return failures;}};
  }
  function deckSearchText(go,text,size) {
    // Same text/input family as the PC Reborn DeckSearchField. The legacy
    // InputField clips its own generated text and needs no TMP RectMask2D.
    const label=uiAdd(go,"UnityEngine.UI.Text"),root=label.ref(false);
    try {
    const font=ucls("UnityEngine.Resources").method("GetBuiltinResource").overload("System.Type","System.String")
      .invoke(ucls("UnityEngine.Font").type.object,Il2Cpp.string("Arial.ttf"));
    if(isNull(font))throw Error("Deck search font unavailable");
    call(label,"set_font",font);call(label,"set_fontSize",size);call(label,"set_resizeTextForBestFit",false);
    call(label,"set_alignment",uiEnum("UnityEngine.TextAnchor","MiddleLeft"));call(label,"set_supportRichText",false);
    call(label,"set_color",rgba(1,1,1,1));call(label,"set_raycastTarget",false);call(label,"set_text",Il2Cpp.string(text));
    return label;
    }finally{root.free();}
  }
  function deckSearchInput(go,label,image) {
    const input=uiAdd(go,"UnityEngine.UI.InputField"),root=input.ref(false);
    try {call(input,"set_textComponent",label);call(input,"set_targetGraphic",image);
    call(input,"set_lineType",enumBox(input.method("set_lineType",1).parameters[0].type.class,0));
    call(input,"set_characterLimit",100);return input;
    }finally{root.free();}
  }
  function deckSearchMatches(name,query) {
    const normalize=value=>String(value||"").normalize("NFKC").toLocaleLowerCase().replace(/<[^>]*>/g,"").trim();
    return normalize(name).includes(normalize(query));
  }
  section("mobile deck picker search",()=>{
    const picker=cls(img,"DeckPickerWin"),tile=cls(img,"DeckTile"),records=new Map(),retries=new Map();
    const find=ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type");
    let next=0;
    function cleanup(record) {
      for(const ref of record.hidden.values()){try{call(ref.target,"SetActive",true);}catch(_){}ref.free();}
      try {call(record.grid.target,"set_offsetMax",vec2(record.offset.x,record.offset.y));ucls("UnityEngine.Object").method("Destroy").overload("UnityEngine.Object").invoke(record.bar.target);}catch(_){}
      for(const name of ["self","input","bar","grid"])record[name].free();
    }
    function install(self) {
      const roots=[];let bar=null,gridRect=null,offset=null,committed=false,phase="root";
      const hold=value=>{if(!isNull(value))roots.push(value.ref(false));return value;};
      const create=(...args)=>hold(uiNew(...args));
      try {
      hold(self);
      const go=hold(call(self,"get_gameObject")),parent=hold(call(go,"get_transform")),grid=hold(self.field("_grid").value);
      if(isNull(grid))throw Error("Deck grid not initialized");
      gridRect=hold(call(grid,"get_transform"));
      try {const scroll=grid.method("GetComponentInParent").overload("System.Type").invoke(ucls("UnityEngine.UI.ScrollRect").type.object);
        if(!isNull(scroll)){const viewport=call(scroll,"get_viewport");if(!isNull(viewport))gridRect=hold(viewport);}}catch(_){}
      const old=call(gridRect,"get_offsetMax");offset={x:Number(old.field("x").value),y:Number(old.field("y").value)};
      const stale=call(parent,"Find",Il2Cpp.string("RebornDeckSearch"));
      if(!isNull(stale))ucls("UnityEngine.Object").method("Destroy").overload("UnityEngine.Object").invoke(call(stale,"get_gameObject"));
      phase="create bar";bar=create("RebornDeckSearch",parent);call(bar,"SetActive",false);uiPlace(bar,.5,1,.5,1,0,-6,760,68);
      const image=hold(uiAdd(bar,"UnityEngine.UI.Image"));call(image,"set_color",rgba(.08,.08,.08,.96));
      loadNativeUiSprite("AppBase/UI/Sprites/Core/UtilityAssets/input-frame",image,()=>{
        call(image,"set_type",enumBox(image.method("set_type",1).parameters[0].type.class,1));
      });
      const viewport=create("TextViewport",call(bar,"get_transform"));uiStretch(uiRect(viewport));
      call(uiRect(viewport),"set_offsetMin",vec2(18,6));call(uiRect(viewport),"set_offsetMax",vec2(-96,-6));
      const textGO=create("Text",call(viewport,"get_transform"));uiStretch(uiRect(textGO));
      phase="text/input";const label=hold(deckSearchText(textGO,"",32)),input=hold(deckSearchInput(bar,label,image));
      const placeholderGO=create("Placeholder",call(viewport,"get_transform"));uiStretch(uiRect(placeholderGO));
      const labels={en_us:"Search decks…",ru_ru:"Поиск колод…",de_de:"Decks suchen…",es_es:"Buscar mazos…",es_mx:"Buscar mazos…",fr_fr:"Rechercher un deck…",it_it:"Cerca mazzi…",pl_pl:"Szukaj talii…",pt_br:"Buscar decks…",tr_tr:"Deste ara…"};
      phase="placeholder";const hint=hold(deckSearchText(placeholderGO,labels[resourceLanguage()]||labels.en_us,30));call(hint,"set_color",rgba(.65,.65,.65,1));call(input,"set_placeholder",hint);
      phase="clear button";const clear=uiLabeledButton("Clear",call(bar,"get_transform"),"X",-8,-8,100,()=>{call(input,"set_text",Il2Cpp.string(""));});uiPlace(clear,1,.5,1,.5,-8,0,76,56);
      const clearText=call(call(clear,"get_transform"),"Find",Il2Cpp.string("Label"));
      if(!isNull(clearText))call(uiComponent(call(clearText,"get_gameObject"),"TMPro.TextMeshProUGUI"),"set_fontSize",32);
      loadNativeUiSprite("AppBase/UI/Sprites/Core/UtilityAssets/close-x-icon",uiComponent(clear,"UnityEngine.UI.Image"),()=>{
        if(!isNull(clearText))call(call(clearText,"get_gameObject"),"SetActive",false);
      });
      // Shrink the scroll viewport, not its layout-driven content grid.
      call(gridRect,"set_offsetMax",vec2(offset.x,offset.y-82));
      call(bar,"SetActive",true);
      const record={self:self.ref(false),input:input.ref(false),bar:bar.ref(false),grid:gridRect.ref(false),offset,hidden:new Map()};
      committed=true;return record;
      }catch(error){throw Error(`${phase}: ${error}`);}
      finally {
        if(!committed){if(offset&&gridRect)try{call(gridRect,"set_offsetMax",vec2(offset.x,offset.y));}catch(_){}
          if(bar)try{ucls("UnityEngine.Object").method("Destroy").overload("UnityEngine.Object").invoke(bar);}catch(_){}
        }
        for(const root of roots.reverse())root.free();
      }
    }
    // One open picker: install the bar once, then filter its tiles. The walk
    // over every tile costs 100-130 ms on the main thread (report 29), so it
    // runs only when there is something to change: a query, hidden tiles to
    // bring back, or a tile set that changed under an unchanged query.
    function scanPicker(self,go,immediate) {
      const key=self.handle.toString();
      let record=records.get(key);
      if(!record){let gate=retries.get(key);if(!gate){gate=uiRetryGate(()=>Date.now());retries.set(key,gate);}
        if(!immediate&&!gate.allow())return key;
        try{record=install(self);records.set(key,record);gate.success();log(`deck search: installed${immediate?" with the deck list":""}`);}
        catch(error){gate.fail();log(`deck search: initialization attempt ${gate.count()}/3: ${error}`);return key;}
      }
      const query=String(call(record.input.target,"get_text")?.content||"");
      if(!query&&!record.hidden.size){record.lastQuery="";return key;}
      const tiles=go.method("GetComponentsInChildren").overload("System.Type","System.Boolean").invoke(tile.type.object,true),tilesRoot=tiles.object.ref(false);
      try{
      if(query===record.lastQuery&&tiles.length===record.lastCount)return key;
      for(let j=0;j<tiles.length;j++) {
        const item=tiles.get(j),child=call(item,"get_gameObject"),id=child.handle.toString();
        if(!call(child,"get_activeSelf") && !record.hidden.has(id))continue;
        const name=String(call(item.field("DeckNameText").value,"get_text")?.content||"");
        const show=deckSearchMatches(name,query),hidden=record.hidden.get(id);
        if(!show&&!hidden){record.hidden.set(id,child.ref(false));call(child,"SetActive",false);}
        else if(show&&hidden){call(child,"SetActive",true);hidden.free();record.hidden.delete(id);}
      }
      record.lastQuery=query;record.lastCount=tiles.length;
      }finally{tilesRoot.free();}
      return key;
    }
    // The game fills the grid in UpdateUi: install right then, with the list,
    // instead of up to 750 ms later through the polling gate below.
    const updateUi=picker.tryMethod("UpdateUi",0);
    if(updateUi&&!updateUi.virtualAddress.isNull())Interceptor.attach(updateUi.virtualAddress,{onEnter(args){this.self=args[0];},onLeave(){
      const ref=new Il2Cpp.Object(this.self).ref(false);
      schedule(0,()=>{try{const go=call(ref.target,"get_gameObject");if(call(go,"get_activeInHierarchy")){const record=records.get(ref.target.handle.toString());if(record)record.lastCount=-1;scanPicker(ref.target,go,true);}}
        catch(error){log(`deck search: ${error}`);}finally{ref.free();}},"deck search install");
    }});
    // The first open of the deck list also waited for the frame and clear
    // icon (report 30). Load them into the cache once the menu has settled.
    const preloadAt=Date.now()+15000;let preloaded=false;
    Interceptor.attach(cls(img,"SparkleServices.ServicesManager").method("Update",0).virtualAddress,{onLeave(){
      if(!preloaded&&Date.now()>=preloadAt){preloaded=true;
        for(const path of ["AppBase/UI/Sprites/Core/UtilityAssets/input-frame","AppBase/UI/Sprites/Core/UtilityAssets/close-x-icon"])
          schedule(0,()=>loadNativeUiSprite(path,null),"deck search sprite preload");}
      if(Date.now()<next)return;next=Date.now()+250;
      schedule(0,()=>{
        const live=new Set();let scanned=false;
        try {
          const values=find.invoke(picker.type.object),arrayRoot=values.object.ref(false);
          try{
          for(let i=0;i<values.length;i++) {
            const self=values.get(i),go=call(self,"get_gameObject");if(!call(go,"get_activeInHierarchy"))continue;
            live.add(scanPicker(self,go,false));
          }scanned=true;}finally{arrayRoot.free();}
        }catch(error){log(`deck search: ${error}`);}
        // A failed scan does not mean that an open window was closed.
        if(scanned){for(const [key,record] of records)if(!live.has(key)){cleanup(record);records.delete(key);}
          for(const key of retries.keys())if(!live.has(key))retries.delete(key);}
      },"deck search scan");
    }});
  });
  // END android-ui: deck-search

  // BEGIN android-ui: matching-friends
  // The search window is a modal over the main menu, and the game leaves the
  // friends button alone while matching (its click path never checks the
  // queue). The button is only out of reach under the modal. Earlier versions
  // moved the button and FriendsWin into the search window and back; the
  // menu kept serving other objects, so the restored button no longer worked
  // (report 22), and the restore reached menu objects the battle scene was
  // destroying (reports 20, 21). Nothing is moved now: while the search is
  // shown, the button and the friends window get a Canvas that sorts above
  // the search window and a GraphicRaycaster, and when it ends both go back
  // to the values they had. Hierarchy, layout and button state are untouched.
  section("friends while matchmaking",()=>{
    const seeking=cls(img,"MatchSeekingWin"),records=new Map();
    const find=ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type");
    const unityObject=ucls("UnityEngine.Object");
    // Unity's own null check: a destroyed object compares equal to null
    // without throwing, so nothing is called on it.
    const alive=value=>!isNull(value)&&!unityObject.method("op_Equality").invoke(value,NULL);
    const firstLive=(type,pick)=>{
      const values=find.invoke(type);
      for(let i=0;i<values.length;i++){const value=pick(values.get(i));if(alive(value)&&call(call(value,"get_gameObject"),"get_activeInHierarchy"))return value;}
      return null;
    };
    // The objects the game itself uses: the controller's current overlay view
    // (mobile or desktop) and MainMenu._friendsWin.
    const gameFriendsButton=()=>firstLive(cls(img,"MainMenuOverlayController").type.object,c=>{const view=call(c,"get__overlayView");return alive(view)?view.field("_friendsBtn").value:null;});
    const gameFriendsWindow=()=>firstLive(cls(img,"SPTESL.MainMenu").type.object,m=>m.field("_friendsWin").value);
    // The values a component had before we first raised it. A lower that was
    // skipped (the object was being destroyed) must not make our own sorting
    // look like the original next time.
    const originals=new Map();
    const original=(component,read)=>{const key=component.handle.toString();if(!originals.has(key))originals.set(key,read());return originals.get(key);};
    function raise(go,order,layer) {
      const canvasType=ucls("UnityEngine.Canvas").type.object,rayType=ucls("UnityEngine.UI.GraphicRaycaster").type.object;
      let canvas=go.method("GetComponent").overload("System.Type").invoke(canvasType),saved;
      if(alive(canvas))saved=original(canvas,()=>({override:Boolean(call(canvas,"get_overrideSorting")),order:Number(call(canvas,"get_sortingOrder")),layer:Number(call(canvas,"get_sortingLayerID"))}));
      else{canvas=uiAdd(go,"UnityEngine.Canvas");saved=original(canvas,()=>({override:false,order:0,layer:0}));}
      let ray=go.method("GetComponent").overload("System.Type").invoke(rayType),rayEnabled;
      if(alive(ray))rayEnabled=original(ray,()=>Boolean(call(ray,"get_enabled")));
      // A nested Canvas takes its graphics away from the parent canvas's
      // raycaster, so the raycaster we add has to stay on after the search,
      // or the button and the friends panel stop receiving taps (report 23).
      else{ray=uiAdd(go,"UnityEngine.UI.GraphicRaycaster");rayEnabled=original(ray,()=>true);}
      const item={go:go.ref(false),canvas:canvas.ref(false),ray:ray.ref(false),...saved,rayEnabled};
      call(canvas,"set_overrideSorting",true);call(canvas,"set_sortingLayerID",layer);call(canvas,"set_sortingOrder",order);
      call(ray,"set_enabled",true);
      return item;
    }
    function lower(item) {
      // A Canvas or GraphicRaycaster we added stays: removing a Canvas its
      // raycaster depends on is refused by Unity. The Canvas stops overriding
      // the sorting; the raycaster stays on to serve the nested Canvas.
      try{
        if(alive(item.canvas.target)){call(item.canvas.target,"set_sortingLayerID",item.layer);call(item.canvas.target,"set_sortingOrder",item.order);call(item.canvas.target,"set_overrideSorting",item.override);}
        if(alive(item.ray.target))call(item.ray.target,"set_enabled",item.rayEnabled);
      }finally{item.go.free();item.canvas.free();item.ray.free();}
    }
    function restore(record,source) {
      log(`matching friends: lowered (${source}; ${record.items.length} item${record.items.length===1?"":"s"})`);
      for(const item of record.items)try{lower(item);}catch(error){log(`matching friends: lower (${source}) failed: ${error}`);}
      record.window.free();
    }
    const show=seeking.method("Show");
    Interceptor.attach(show.virtualAddress,{onEnter(args){this.self=args[0];},onLeave(){
      const ref=new Il2Cpp.Object(this.self).ref(false);schedule(0,()=>{let record=null,key="";try{
        const go=call(ref.target,"get_gameObject");key=go.handle.toString();
        if(!call(go,"get_activeInHierarchy"))return;
        if(records.has(key)){const stale=records.get(key);records.delete(key);restore(stale,"search reopened");}
        const window=ref.target.method("GetComponentInParent").overload("System.Type").invoke(ucls("UnityEngine.Canvas").type.object);
        if(!alive(window))throw Error("search window has no Canvas");
        const root=call(window,"get_rootCanvas");
        const order=Math.max(Number(call(window,"get_sortingOrder")),alive(root)?Number(call(root,"get_sortingOrder")):0)+10,layer=Number(call(window,"get_sortingLayerID"));
        const button=gameFriendsButton();if(!button)throw Error("the menu's _friendsBtn is unavailable");
        record={items:[],window:ref.target.ref(false)};
        record.items.push(raise(call(button,"get_gameObject"),order,layer));
        // The friends panel opens above the button's own layer.
        const friends=gameFriendsWindow();
        if(friends)record.items.push(raise(call(friends,"get_gameObject"),order+1,layer));
        records.set(key,record);armWatch();
        log(`matching friends: raised above the search window (order ${order}${friends?"":", no friends window"})`);
      }catch(error){if(record){records.delete(key);restore(record,"show failure rollback");}log(`matching friends: ${error}`);}finally{ref.free();}},"matching friends show");
    }});
    const closed=[],absent=[];
    for(const name of ["OnDisable","OnDestroy","HandleOnCancelSearch"]) {
      const method=seeking.tryMethod(name,0);if(!method||method.virtualAddress.isNull()){absent.push(name);continue;}
      closed.push(name);
      Interceptor.attach(method.virtualAddress,{onEnter(args){try{
        const key=call(new Il2Cpp.Object(args[0]),"get_gameObject").handle.toString(),record=records.get(key);
        if(record){records.delete(key);schedule(0,()=>restore(record,name),"matching friends restore");}
      }catch(error){log(`matching friends restore: ${error}`);}}});
    }
    log(`matching friends: close hooks ${closed.join(", ")}${absent.length?` (missing ${absent.join(", ")})`:""}`);
    // A close path none of the hooks see still ends with an inactive window.
    let watching=false;
    const armWatch=()=>{if(records.size&&!watching){watching=true;schedule(1000,watch,"matching friends watchdog");}};
    const watch=()=>{
      watching=false;
      for(const [key,record] of records){
        let live=false;try{live=alive(record.window.target)&&call(call(record.window.target,"get_gameObject"),"get_activeInHierarchy");}catch(_){}
        if(live)continue;
        records.delete(key);restore(record,"watchdog");
      }
      armWatch();
    };
  });
  // END android-ui: matching-friends


  // BEGIN android-ui: native-language-dropdown
  section("native Settings language selection", () => {
    const owner=img.classes.find(c=>c.name==="LanguageSelectDropdown");
    const handler=owner?.tryMethod("HandleLanguageOnValueChanged",1);
    if(!handler || handler.virtualAddress.isNull()) return;
    let selecting=0, selectionHooks=0;
    for(const name of ["UnityEngine.UI.Dropdown","TMPro.TMP_Dropdown"]) try {
      const method=ucls(name).tryMethod("OnSelectItem",1);if(!method || method.virtualAddress.isNull()) continue;
      Interceptor.attach(method.virtualAddress,{onEnter(){selecting++;},onLeave(){selecting=Math.max(0,selecting-1);}});
      selectionHooks++;
    } catch(_) {}
    if(!selectionHooks) return;
    handler.implementation=function(index) {
      if(!selecting) return handler.invokeRaw(this.handle,index);
      try {
        let dropdown=this;
        try {call(dropdown,"get_options");} catch(_) {
          const field=this.class.fields.find(f=>!f.isStatic && /^(UnityEngine.UI.Dropdown|TMPro.TMP_Dropdown)$/.test(f.type.name));
          dropdown=field ? this.field(field.name).value : null;
        }
        if(isNull(dropdown)) throw Error("Language dropdown instance unavailable");
        const options=call(dropdown,"get_options"),count=Number(call(options,"get_Count"));
        if(index<0 || index>=count || count>32) return;
        const label=String(call(call(options,"get_Item",index),"get_text")?.content||"");
        const code=languageLabel(label);
        if(!code) throw Error("Unknown language label " + JSON.stringify(label.slice(0,120)));
        if(code===resourceLanguage()) return;
        log(`native language dropdown: selected ${code}`);
        schedule(0,()=>ucls("UnityEngine.Application").method("OpenURL",1).invoke(Il2Cpp.string(languageSetupUri("language="+code+"&apply=1"))));
      } catch(error) {
        log(`native language dropdown: ${error}`);
        schedule(0,()=>ucls("UnityEngine.Application").method("OpenURL",1).invoke(Il2Cpp.string(languageSetupUri("chooseLanguage=1"))));
      }
    };
    globalThis.__teslNativeLanguageCallback=true;
  });
  // END android-ui: native-language-dropdown

  // BEGIN android-ui: settings-data
  const closingSettings = new Set();
  function settingsWindowKey(self) { return (self.class?.type.name === "UnityEngine.GameObject" ? self : call(self,"get_gameObject")).handle.toString(); }
  function settingsClosing(self, reason) {
    const key = settingsWindowKey(self);
    if (closingSettings.size > 128) closingSettings.clear();
    closingSettings.add(key);
    // Cancel restores the game's saved UI state. Do not recreate our child
    // while that restoration or the close animation is still running.
    const root = call(self,"get_transform"), child = call(root,"Find",Il2Cpp.string("RebornGameData"));
    // Let the native dialog hide its own hierarchy. No SetActive during Cancel:
    // changing a child here can trigger an unnecessary layout rebuild.
    if (resourceSettingsWindow && resourceSettingsWindow.target.handle.toString() === key) {
      resourceSettingsWindow.free(); resourceSettingsWindow = null;
    }
    log(`settings UI: ${reason}; custom control suspended`);
  }
  function settingsButtonPressed(button) {
    try {
      let node=call(button,"get_transform"),names=[];
      const buttonName=String(call(node,"get_name")?.content||"");
      try {
        const event=call(button,"get_onClick");
        const countMethod=event.tryMethod("GetPersistentEventCount",0);
        const nameMethod=event.tryMethod("GetPersistentMethodName",1);
        if(countMethod && nameMethod) {
          const count=Math.min(32,Number(countMethod.invoke()));
          for(let i=0;i<count;i++)names.push(String(nameMethod.invoke(i)?.content||""));
        } else {
          // Unity can strip the public introspection methods. Read only fields
          // whose actual runtime metadata identifies the persistent call list.
          const fields=Array.from(event.class.hierarchy()).flatMap(c=>c.fields);
          const groupField=fields.find(f=>!f.isStatic && /PersistentCallGroup$/.test(f.type.name));
          const group=groupField && event.field(groupField.name).value;
          if(!isNull(group)) {
            const listField=group.class.fields.find(f=>!f.isStatic && /List.*PersistentCall/.test(f.type.name));
            const list=listField && group.field(listField.name).value;
            if(!isNull(list))for(let i=0,count=Math.min(32,Number(call(list,"get_Count")));i<count;i++) {
              const entry=call(list,"get_Item",i),field=entry.class.fields.find(f=>!f.isStatic && /methodname/i.test(f.name) && f.type.name==="System.String");
              if(field)names.push(String(entry.field(field.name).value?.content||""));
            }
          }
        }
      }catch(_) { /* Button name and ancestor path still work without event metadata. */ }
      for(let depth=0;depth<10 && !isNull(node);depth++,node=call(node,"get_parent")) {
        const name=String(call(node,"get_name")?.content||"");
        if(!/^SettingsWin[_ -]?Mobile(?:\(Clone\))?$/i.test(name) && !/^SettingsWin(?:\(Clone\))?$/i.test(name)) continue;
        const action=[buttonName,...names].join(" ");
        log(`settings button: ${action.slice(0,240)}`);
        if(/cancel|close|back|negative|dismiss|\bok\b|confirm|accept/i.test(action)) settingsClosing(call(node,"get_gameObject"),action);
        return;
      }
    }catch(error){log(`settings button trace: ${error}`);}
  }
  function installSettingsDataButton(self) {
    if (!fileExists(`${persistentPath()}/tesl-reborn-setup.json`)) return;
    if (closingSettings.has(settingsWindowKey(self))) return;
    const root = call(self, "get_transform");
    const rootName = String(call(root, "get_name")?.content || "");
    const typeName = String(self.class?.name || "");
    const compactName=rootName.replace(/\(Clone\)$/i,"").replace(/[_ -]/g,"");
    // Captured device prefabs: OptionsWinMobile is the gear shortcut menu;
    // SettingsWin_Mobile inside PopupWinTemplate is the actual settings dialog.
    if (typeName==="OptionsWin" || /^OptionsWin(?:Mobile)?$/i.test(compactName)) {
      const old=findGameDataButton(root);
      if(!isNull(old)) ucls("UnityEngine.Object").method("Destroy").overload("UnityEngine.Object").invoke(call(old,"get_gameObject"));
      return;
    }
    if(typeName!=="SettingsWin" && !/^SettingsWin(?:Mobile)?$/i.test(compactName)) return;
    const window = call(root, "get_gameObject");
    if (resourceSettingsWindow && !resourceSettingsWindow.target.handle.equals(window.handle)) {
      try {
        const previous = call(resourceSettingsWindow.target, "get_transform");
        if (Boolean(call(resourceSettingsWindow.target, "get_activeInHierarchy")) && Boolean(call(previous, "IsChildOf", root))) return;
        if (Boolean(call(root, "IsChildOf", previous))) {
          const old = findGameDataButton(previous);
          if (!isNull(old)) ucls("UnityEngine.Object").method("Destroy").overload("UnityEngine.Object").invoke(call(old, "get_gameObject"));
        }
      } catch (_) {}
    }
    if (!isNull(window) && (!resourceSettingsWindow || !resourceSettingsWindow.target.handle.equals(window.handle))) {
      if (resourceSettingsWindow) resourceSettingsWindow.free();
      resourceSettingsWindow = window.ref(false);
    }
    const existing = findGameDataButton(root);
    if (!isNull(existing)) { const go=call(existing,"get_gameObject"); if(!call(go,"get_activeSelf"))call(go,"SetActive",true); return; }
    const labels = {en_us:"Game data",de_de:"Spieldaten",es_es:"Datos del juego",es_mx:"Datos del juego",fr_fr:"Données du jeu",it_it:"Dati di gioco",pl_pl:"Dane gry",pt_br:"Dados do jogo",ru_ru:"Данные игры",tr_tr:"Oyun verileri"};
    const button = uiLabeledButton("RebornGameData", root, labels[resourceLanguage()] || "Game data", -70, -64, 180, () => {
      ucls("UnityEngine.Application").method("OpenURL", 1).invoke(Il2Cpp.string("teslreborn://resources"));
    });
    // Fit in the free right margin beside the native tabs, not over Preferences.
    uiPlace(button,1,1,1,1,-18,-74,180,48);
    const layout = uiAdd(button, "UnityEngine.UI.LayoutElement");
    call(layout, "set_ignoreLayout", true);
    try { styleAsSettingsTab(self, button, layout); }
    catch (error) { log(`settings button: kept the plain Game data button: ${error}`); }
  }
  // The plain grey button looked foreign next to Audio and Preferences. It
  // becomes a third tab: the first tab's frame sprite, font, size and anchors,
  // in the tab row. TabGroup keeps its tabs in _toggles, and this Button is
  // not a Toggle, so tab switching is untouched. Report 31: styled but left
  // small in the corner - each step is now logged, so a report names the one
  // that fails. A row laid out by a HorizontalLayoutGroup centres the three
  // tabs itself; otherwise the button goes one tab step past the last tab and
  // the row moves back half a step, so the three stay centred as the two were.
  function styleAsSettingsTab(self, button, layout) {
    let step = "tab group";
    try {
      const group = self.field("_tabNavigation").value;
      if (isNull(group)) throw Error("no _tabNavigation");
      const toggles = group.field("_toggles").value;
      if (isNull(toggles) || !toggles.length) throw Error("no settings tabs");
      const first = toggles.get(0), last = toggles.get(toggles.length - 1);
      const firstNode = call(call(first, "get_gameObject"), "get_transform"), lastNode = call(call(last, "get_gameObject"), "get_transform");
      const row = call(lastNode, "get_parent");
      if (isNull(row)) throw Error("settings tab has no row");
      step = "frame";
      const art = call(first, "get_targetGraphic"), image = uiComponent(button, "UnityEngine.UI.Image");
      if (!isNull(art) && art.class.type.name === "UnityEngine.UI.Image" && !isNull(image)) {
        call(image, "set_sprite", call(art, "get_sprite"));
        call(image, "set_type", call(art, "get_type"));
        call(image, "set_color", call(art, "get_color"));
      }
      step = "label";
      const tmp = ucls("TMPro.TextMeshProUGUI").type.object;
      // GameObject.GetComponentInChildren(Type) is stripped in this player
      // (report 31); GetComponentsInChildren(Type, bool) is kept.
      const firstIn = go => { const all = go.method("GetComponentsInChildren").overload("System.Type", "System.Boolean").invoke(tmp, true); return all.length ? all.get(0) : null; };
      const tabLabel = firstIn(call(first, "get_gameObject"));
      const label = firstIn(button);
      if (!isNull(tabLabel) && !isNull(label)) {
        call(label, "set_font", call(tabLabel, "get_font"));
        call(label, "set_color", call(tabLabel, "get_color"));
        // Auto-sizing setters may be stripped as well: copy what exists.
        const copy = name => { const get = tabLabel.tryMethod("get_" + name, 0), set = label.tryMethod("set_" + name, 1); if (get && set) set.invoke(get.invoke()); };
        for (const name of ["enableAutoSizing", "fontSizeMin", "fontSizeMax", "fontSize"]) copy(name);
      }
      step = "size";
      const bounds = call(lastNode, "get_rect");
      const width = Number(bounds.field("m_Width").value), height = Number(bounds.field("m_Height").value);
      const vec = value => ({ x: Number(value.field("x").value), y: Number(value.field("y").value) });
      step = "row";
      const node = call(button, "get_transform");
      node.method("SetParent").overload("UnityEngine.Transform", "System.Boolean").invoke(row, false);
      call(node, "SetAsLastSibling");
      call(node, "set_localScale", call(lastNode, "get_localScale"));
      for (const name of ["anchorMin", "anchorMax", "pivot"]) call(node, "set_" + name, call(lastNode, "get_" + name));
      call(node, "set_sizeDelta", call(lastNode, "get_sizeDelta"));
      call(layout, "set_preferredWidth", width); call(layout, "set_preferredHeight", height);
      const flow = uiComponent(call(row, "get_gameObject"), "UnityEngine.UI.HorizontalLayoutGroup");
      if (!isNull(flow)) {
        call(layout, "set_ignoreLayout", false);
        log(`settings button: third tab in the row layout (${Math.round(width)}x${Math.round(height)})`);
        return;
      }
      step = "position";
      const a = vec(call(firstNode, "get_anchoredPosition")), b = vec(call(lastNode, "get_anchoredPosition"));
      const gap = toggles.length > 1 ? (b.x - a.x) / (toggles.length - 1) : width + 16;
      call(node, "set_anchoredPosition", vec2(b.x + gap, b.y));
      const rowPos = vec(call(row, "get_anchoredPosition"));
      call(row, "set_anchoredPosition", vec2(rowPos.x - gap / 2, rowPos.y));
      log(`settings button: third tab at step ${Math.round(gap)} (${Math.round(width)}x${Math.round(height)}), row centred`);
    } catch (error) { throw Error(`${step}: ${error}`); }
  }
  // Direct child of the window, or inside the tab row once styled.
  function findGameDataButton(root) {
    const direct = call(root, "Find", Il2Cpp.string("RebornGameData"));
    if (!isNull(direct)) return direct;
    const buttons = call(root, "get_gameObject").method("GetComponentsInChildren").overload("System.Type", "System.Boolean")
      .invoke(ucls("UnityEngine.UI.Button").type.object, true);
    for (let i = 0; i < buttons.length; i++) {
      const node = call(buttons.get(i), "get_transform");
      if (String(call(node, "get_name")?.content || "") === "RebornGameData") return node;
    }
    return null;
  }
  section("settings game data", () => {
    const classes = img.classes.filter(c => /^(?:Game)?(?:Options|Settings)(?:Win|Window|Panel|Dialog)$/.test(c.name))
      .filter(c => Array.from(c.hierarchy()).some(base => base.type.name === "UnityEngine.Component"));
    let hooks = 0;
    for (const owner of classes) for (const method of owner.methods.filter(m =>
        ["Show", "OnEnable", "Awake", "Start"].includes(m.name) && !m.isStatic && !m.virtualAddress.isNull())) {
      Interceptor.attach(method.virtualAddress, {
        onEnter(args) {
          this.self = args[0];
          if (method.name === "Show" || method.name === "OnEnable") {
            try { closingSettings.delete(settingsWindowKey(new Il2Cpp.Object(this.self))); } catch (_) {}
          }
        },
        onLeave() {
          const retained = new Il2Cpp.Object(this.self).ref(false);
          schedule(0, () => { try { installSettingsDataButton(retained.target); } catch (e) { log(`settings data: ${e}`); } finally { retained.free(); } });
        }
      }); hooks++;
    }
    const closeAddresses = new Set();
    for (const owner of classes) for (const method of owner.methods.filter(m =>
        /^(?:(?:On|Handle)?(?:Cancel|Close|Hide)(?:Button)?(?:Click|Clicked|Pressed)?|OnDisable|OnDestroy)$/i.test(m.name)
        && !m.isStatic && !m.virtualAddress.isNull())) {
      const key=method.virtualAddress.toString(); if(closeAddresses.has(key)) continue; closeAddresses.add(key);
      Interceptor.attach(method.virtualAddress, {onEnter(args) {
        try { settingsClosing(new Il2Cpp.Object(args[0]), owner.name+"."+method.name); }
        catch(error) { log(`settings UI close trace: ${error}`); }
      }});
    }
    // Query the settings component directly where possible. The fallback walks
    // ancestors of active UI buttons, rather than thousands of scene objects.
    let last = 0;
    const update = cls(img, "SparkleServices.ServicesManager").method("Update", 0);
    Interceptor.attach(update.virtualAddress, { onLeave() {
      if (Date.now()-last < 1000) return; last = Date.now();
      try {
        const find = ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type");
        if (classes.length) {
          for (const owner of classes) {
            const windows = find.invoke(owner.type.object);
            for (let i=0; i<windows.length; i++) {
              const window = windows.get(i);
              if (Boolean(call(call(window,"get_gameObject"),"get_activeInHierarchy"))) installSettingsDataButton(window);
            }
          }
          return;
        }
        const objects = find.invoke(ucls("UnityEngine.UI.Button").type.object), visited = new Set();
        for (let i=0; i<objects.length; i++) {
          const go=call(objects.get(i),"get_gameObject"); if (!Boolean(call(go,"get_activeInHierarchy"))) continue;
          let node=call(go,"get_transform");
          for (let depth=0; depth<8 && !isNull(node); depth++, node=call(node,"get_parent")) {
            const key=node.handle.toString(); if (visited.has(key)) break; visited.add(key);
            if (!/^(?:OptionsWinMobile|SettingsWin_Mobile|SettingsWin|OptionsWin)$/i.test(String(call(node,"get_name")?.content || "").replace(/\(Clone\)$/i, "").trim())) continue;
            const root=call(node,"get_gameObject"), rect=uiRect(root), bounds=call(rect,"get_rect");
            if (Number(bounds.field("m_Width").value)<300 || Number(bounds.field("m_Height").value)<200) continue;
            installSettingsDataButton(root);
          }
        }
      } catch (_) {}
    }});
    log(`settings game data: ${hooks} window hooks, ${closeAddresses.size} close hooks and prefab fallback`);
  });
  // END android-ui: settings-data

  // BEGIN android-ui: settings-diagnostics
  section("settings and language diagnostics", () => {
    let lastPoll = 0, lastRequest = "";
    function collect(request) {
      const report: any = { schema: 1, label: request.label, requestId: request.id,
        at: new Date().toISOString(), buttons: [], classes: [], localizationFiles: [] };
      try {
        const choice = JSON.parse(readTextFile(`${persistentPath()}/tesl-reborn-language.json`) || "null");
        report.choice = choice && { language: choice.language, system: choice.system };
      } catch (_) {}
      try {
        const status = JSON.parse(readTextFile(`${persistentPath()}/tesl-reborn-update-status.json`) || "null");
        report.core = status?.current && { revision: status.current.revision, version: status.current.version };
      } catch (_) {}
      try {
        const owner = cls(img, "LocalizationManager");
        const nativeType=owner.method("SetLanguage",2).parameters[0].type;
        report.languageType={name:nativeType.name,isEnum:nativeType.class.isEnum,fields:nativeType.class.fields.map(f=>({name:f.name,type:f.type.name,static:f.isStatic,value:nativeType.class.isEnum&&f.isStatic?enumVal(f.value):undefined}))};
        report.localizationMethods = owner.methods.filter(m => /language|locale|updateobjects/i.test(m.name))
          .slice(0,40).map(m => ({ name:m.name, parameters:m.parameters.map(p => p.type.name), returns:m.returnType.name }));
        const manager = owner.method("get_Instance",0).invoke();
        if (!isNull(manager)) report.managerLanguage = String(call(manager,"get_CurrentLanguageCode")?.content || "");
      } catch (error) { report.managerError = String(error).slice(0,300); }
      for (const code of ["en_us", "ru_ru"]) {
        try {
          const text = readTextFile(`${persistentPath()}/tesl-localization-${code}.json`);
          const values = Object.values(JSON.parse(text || "{}"));
          report.localizationFiles.push({ language:code, entries:values.length,
            cyrillicValues:values.filter(value => /[а-яё]/i.test(String(value))).length });
        } catch (_) { report.localizationFiles.push({language:code,error:"unreadable"}); }
      }
      for (const owner of img.classes.filter(c => /settings|options|language/i.test(c.name)).slice(0,80)) {
        report.classes.push({ name:owner.name, methods:owner.methods.filter(m => /language|locale|select|click|show|settings/i.test(m.name))
          .slice(0,40).map(m => ({ name:m.name, parameters:m.parameters.map(p => p.type.name), returns:m.returnType.name })) });
      }
      try {
        const buttons = ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type")
          .invoke(ucls("UnityEngine.UI.Button").type.object);
        for (let i=0; i<buttons.length && report.buttons.length<160; i++) {
          const button = buttons.get(i), go = call(button,"get_gameObject");
          if (!Boolean(call(go,"get_activeInHierarchy"))) continue;
          let node = call(button,"get_transform"); const path = [];
          for (let depth=0; depth<14 && !isNull(node); depth++,node=call(node,"get_parent"))
            path.unshift(String(call(node,"get_name")?.content || "").slice(0,120));
          const entry: any = { path:path.join("/"), callbacks:[] };
          try {
            const event=call(button,"get_onClick"), count=Number(call(event,"GetPersistentEventCount"));
            for (let j=0;j<Math.min(count,12);j++) {
              const target=call(event,"GetPersistentTarget",j);
              entry.callbacks.push({method:String(call(event,"GetPersistentMethodName",j)?.content||""),class:isNull(target)?null:target.class.name});
            }
          } catch (_) {}
          report.buttons.push(entry);
        }
      } catch (error) { report.uiError = String(error).slice(0,300); }
      writeTextFile(`${persistentPath()}/tesl-reborn-settings-report-${request.label}.json`, JSON.stringify(report,null,2));
    }
    Interceptor.attach(cls(img,"SparkleServices.ServicesManager").method("Update",0).virtualAddress, {onLeave() {
      if (Date.now()-lastPoll<1000) return; lastPoll=Date.now();
      try {
        const request=JSON.parse(readTextFile(`${persistentPath()}/tesl-reborn-inspect-request.json`)||"null");
        if (!request || typeof request.id!=="string" || request.id.length>80 || request.id===lastRequest ||
            !/^(gear|settings|english|russian)$/.test(request.label)) return;
        lastRequest=request.id;
        schedule(0,()=>{try{collect(request);}catch(error){log(`settings diagnostic failed: ${error}`);}});
      } catch (_) {}
    }});
  });
  // END android-ui: settings-diagnostics

  // BEGIN android-ui: history-ui
const historyRows = new Map(), historyTargets = new Map();
  let historyUiReports = 0, historyPopup = null, historyActiveKey = null, historyLastFetch = 0;
  let historyUsingNative = false, historyNativeFailureReported = false;
  const historyTriggerOwners = new Map();
  function historyReleaseTrigger(key, record) {
    if (!record.triggerKey) return;
    const owner = historyTriggerOwners.get(record.triggerKey);
    if (owner) {
      owner.users.delete(key);
      if (!owner.users.size) {
        try { if (!isNull(owner.trigger.target)) call(owner.trigger.target, "set_enabled", owner.wasEnabled); } catch (_) {}
        owner.trigger.free(); historyTriggerOwners.delete(record.triggerKey);
      }
    }
    record.triggerKey = null;
  }
  function historyOwnTrigger(key, record, trigger) {
    const id = trigger.handle.toString();
    if (record.triggerKey !== id) historyReleaseTrigger(key, record);
    let owner = historyTriggerOwners.get(id);
    if (!owner) {
      owner = { trigger: trigger.ref(false), wasEnabled: Boolean(call(trigger, "get_enabled")), users: new Set() };
      historyTriggerOwners.set(id, owner);
    }
    owner.users.add(key); record.triggerKey = id;
    call(trigger, "set_enabled", false); // Manual tap owns this one tooltip; suppress automatic hover.
  }
  function historyNativeManager() { return cls(img, "TooltipManager").method("get_Instance", 0).invoke(); }
  function historyTryNative(record) {
    let manager = null, boxHandle = null, messageHandle = null;
    try {
      manager = historyNativeManager();
      if (isNull(manager)) throw Error("TooltipManager is not ready");
      call(manager, "HideTooltip");
      const settingsClass = cls(img, "TooltipShowSettings"), settings = settingsClass.alloc(); boxHandle = settings.ref(false);
      settings.field("anchorRectTransform").value = record.hits[0].rect.target;
      for (const [name, number] of [["anchorEdge", 2], ["tooltipEdge", 3]]) {
        const field = settings.field(name); field.value = enumBox(field.type.class, number);
      }
      settings.field("anchorEdgeOffset").value = 0.5;
      settings.field("tooltipEdgeOffset").value = 0.5;
      settings.field("distanceFromAnchor").value = 5;
      settings.field("locKeys").value = uiList(Il2Cpp.corlib.class("System.String"));
      const messages = uiList(Il2Cpp.corlib.class("System.String")); messageHandle = messages.ref(false);
      call(messages, "Add", Il2Cpp.string(record.text));
      settings.unbox().method("SetLocalizedMessages", 1).invoke(messages);
      // Exact PC API contract: ShowTooltip(TooltipShowSettings, GameObject, Boolean).
      manager.method("ShowTooltip").overload(settingsClass.type.name, "UnityEngine.GameObject", "System.Boolean")
        .invoke(settings.unbox(), call(record.hits[0].rect.target, "get_gameObject"), true);
      return true;
    } catch (error) {
      if (manager) { try { call(manager, "HideTooltip"); } catch (_) {} }
      if (!historyNativeFailureReported) { historyNativeFailureReported = true; log(`history UI: native popup unavailable; using single fallback: ${error}`); }
      return false;
    } finally {
      if (messageHandle) messageHandle.free(); if (boxHandle) boxHandle.free();
    }
  }
  function historyPopupOpened(key, record, provider) {
    historyActiveKey = key;
    log(`history UI: popup opened index=${record.index} side=${record.side} hasName=${record.hasName} provider=${provider}`);
    if (!record.hasName && Date.now() - historyLastFetch > 5000) {
      historyLastFetch = Date.now(); schedule(0, () => refreshMatchEntries());
    }
  }
  function historyTooltipText(name, stats, deleted = false) {
    if (!name) return "No deck data available";
    const title = `<b>${uiPlain(name)}</b>`;
    if (stats) return `${title}\n${stats.wins}/${stats.losses} (${winRate(stats.wins, stats.losses)}%)`;
    return deleted ? `${title}\n<color=#FF6666>deleted</color>` : title;
  }
  function historyHidePopup() {
    if (historyUsingNative) { try { call(historyNativeManager(), "HideTooltip"); } catch (_) {} }
    if (historyPopup) call(historyPopup.go.target, "SetActive", false);
    historyActiveKey = null; historyUsingNative = false;
  }
  function historyDropTarget(key) {
    const record = historyTargets.get(key);
    if (!record) return;
    if (historyActiveKey === key) historyHidePopup();
    historyReleaseTrigger(key, record);
    for (const hit of record.hits) {
      try { const go = hit.go.target; if (!isNull(go)) ucls("UnityEngine.Object").method("Destroy").overload("UnityEngine.Object").invoke(go); } catch (_) {}
      hit.go.free(); hit.rect.free();
    }
    record.row.free(); historyTargets.delete(key);
  }
  function historyCanvas(component) {
    let canvas = component.method("GetComponentInParent").overload("System.Type").invoke(ucls("UnityEngine.Canvas").type.object);
    if (isNull(canvas)) throw Error("History canvas not found");
    const root = canvas.tryMethod("get_rootCanvas", 0);
    if (root) canvas = root.invoke();
    return canvas;
  }
  function historyShowPopup(key, toggle = true) {
    const record = historyTargets.get(key);
    if (!record) return;
    if (toggle && historyActiveKey === key) { historyHidePopup(); return; }
    historyHidePopup();
    if (historyTryNative(record)) {
      historyUsingNative = true; historyPopupOpened(key, record, "native"); return;
    }
    const canvas = historyCanvas(record.hits[0].rect.target);
    const canvasTransform = call(canvas, "get_transform"), canvasKey = canvas.handle.toString();
    if (historyPopup && historyPopup.canvasKey !== canvasKey) {
      ucls("UnityEngine.Object").method("Destroy").overload("UnityEngine.Object").invoke(historyPopup.go.target);
      historyPopup.go.free(); historyPopup.label.free(); historyPopup.rect.free(); historyPopup = null;
    }
    if (!historyPopup) {
      const go = uiNew("RebornHistoryDeckPopup", canvasTransform);
      uiPlace(go, 0.5, 0.5, 0.5, 0.5, 0, 0, 360, 100);
      call(uiAdd(go, "UnityEngine.UI.LayoutElement"), "set_ignoreLayout", true);
      const background = uiAdd(go, "UnityEngine.UI.Image");
      call(background, "set_color", rgba(0.035, 0.03, 0.02, 0.98));
      const labelGO = uiNew("Text", call(go, "get_transform"));
      const rect = uiRect(labelGO); uiStretch(rect);
      call(rect, "set_offsetMin", vec2(12, 10)); call(rect, "set_offsetMax", vec2(-12, -10));
      const label = uiText(labelGO, "", 23); call(label, "set_richText", true); call(label, "set_enableWordWrapping", true);
      const autoContainer = label.tryMethod("set_autoSizeTextContainer", 1);
      if (autoContainer) { try { autoContainer.invoke(false); } catch (_) {} }
      // TMP creation can reset its rectangle; set the fallback label bounds afterwards.
      call(rect, "set_anchorMin", vec2(0, 0)); call(rect, "set_anchorMax", vec2(1, 1)); call(rect, "set_pivot", vec2(0.5, 0.5));
      call(rect, "set_sizeDelta", vec2(-24, -20)); call(rect, "set_anchoredPosition", vec2(0, 0));
      historyPopup = { go: go.ref(false), label: label.ref(false), rect: uiRect(go).ref(false), canvasKey };
    }
    const area = call(uiRect(call(canvasTransform, "get_gameObject")), "get_rect");
    const width = Number(area.field("m_Width").value), height = Number(area.field("m_Height").value);
    const panelWidth = Math.max(100, Math.min(420, width - 24));
    call(historyPopup.label.target, "set_text", Il2Cpp.string(record.text));
    let panelHeight = 100;
    try {
      const label = historyPopup.label.target;
      const size = label.method("GetPreferredValues").overload("System.String", "System.Single", "System.Single")
        .invoke(Il2Cpp.string(record.text), panelWidth - 24, 100000);
      panelHeight = Math.max(64, Math.min(height - 24, uiXY(size).y + 24));
    } catch (_) {}
    let x = 0, y = 0;
    try {
      const point = canvasTransform.method("InverseTransformPoint").overload("UnityEngine.Vector3")
        .invoke(call(record.hits[0].rect.target, "get_position"));
      const local = uiXY(point);
      x = local.x - Number(area.field("m_XMin").value) - width / 2;
      y = local.y - Number(area.field("m_YMin").value) - height / 2 + panelHeight / 2 + 28;
    } catch (_) {} // A stripped positioning helper must not prevent displaying the text.
    x = Math.max(-width / 2 + panelWidth / 2 + 8, Math.min(width / 2 - panelWidth / 2 - 8, x));
    y = Math.max(-height / 2 + panelHeight / 2 + 8, Math.min(height / 2 - panelHeight / 2 - 8, y));
    call(historyPopup.rect.target, "set_sizeDelta", vec2(panelWidth, panelHeight));
    call(historyPopup.rect.target, "set_anchoredPosition", vec2(x, y));
    call(historyPopup.go.target, "SetActive", true);
    call(call(historyPopup.go.target, "get_transform"), "SetAsLastSibling");
    historyPopupOpened(key, record, "fallback");
  }
  function setHistoryDeckTooltip(row, fieldName, name, stats, index = -1, deleted = false) {
    const images = row.field(fieldName).value;
    if (isNull(images)) return;
    const count = Number(call(images, "get_Count")), key = `${row.handle}:${fieldName}`;
    if (!count) { historyDropTarget(key); return; }
    const imageKeys = [];
    for (let i = 0; i < count; i++) imageKeys.push(images.method("get_Item", 1).invoke(i).handle.toString());
    const signature = imageKeys.join(",");
    let record = historyTargets.get(key);
    if (record && record.signature !== signature) { historyDropTarget(key); record = null; }
    if (!record) {
      record = { row: row.weakRef(false), hits: [], signature, side: fieldName === "_userDeckImages" ? "user" : "opponent" };
      historyTargets.set(key, record);
      for (let i = 0; i < count; i++) {
        const image = images.method("get_Item", 1).invoke(i);
        const hit = uiNew("RebornDeckTap", call(image, "get_transform")), rect = uiRect(hit); uiStretch(rect);
        call(rect, "set_offsetMin", vec2(-5, -5)); call(rect, "set_offsetMax", vec2(5, 5));
        call(uiAdd(hit, "UnityEngine.UI.LayoutElement"), "set_ignoreLayout", true);
        const graphic = uiAdd(hit, "UnityEngine.UI.Image"); call(graphic, "set_color", rgba(1, 1, 1, 0));
        call(graphic, "set_raycastTarget", true);
        uiButton(hit, graphic, () => historyShowPopup(key));
        record.hits.push({ go: hit.ref(false), rect: rect.ref(false) });
      }
    }
    record.text = historyTooltipText(name, stats, deleted); record.hasName = Boolean(name); record.index = index;
    // Stop the native hover path for these deck icons; taps use TooltipManager directly.
    try {
      let parent = call(images.method("get_Item", 1).invoke(0), "get_transform"), tooltip = null;
      for (let i = 0; i < 4 && !isNull(parent); i++) {
        parent = call(parent, "get_parent");
        if (!isNull(parent)) tooltip = parent.method("GetComponent").overload("System.Type").invoke(cls(img, "TooltipTrigger").type.object);
        if (!isNull(tooltip)) break;
      }
      if (!isNull(tooltip)) {
        historyOwnTrigger(key, record, tooltip);
      }
    } catch (error) { log(`history UI: automatic tooltip suppression failed: ${error}`); }
    if (historyActiveKey === key) historyShowPopup(key, false);
  }
  function updateHistoryTooltips(row, match) {
    let index = -1;
    try {
      const manager = cls(img, "SparkleServices.ServicesManager").method("get_Instance").invoke();
      const history = call(manager.field("Stats").value, "get_MatchHistory");
      index = Number(history.method("IndexOf", 1).invoke(match));
    } catch (error) { log(`history UI: service index failed: ${error}`); }
    const extra = index >= 0 && index < matchEntryData.length ? matchEntryData[index] : null;
    setHistoryDeckTooltip(row, "_userDeckImages", extra?.deckName || "", extra?.deckStats || null, index, extra?.deckId === -1);
    const difficulty = String(match.field("aiDifficulty").value?.content || "");
    if (!difficulty || difficulty === "None")
      setHistoryDeckTooltip(row, "_opponentDeckImages", extra?.opponentDeckName || "", extra?.opponentDeckStats || null, index);
    else historyDropTarget(`${row.handle}:_opponentDeckImages`);
    if (historyUiReports++ < 12) log(`history UI: tap targets index=${index} extended=${Boolean(extra)}`);
  }
  function refreshHistoryTooltips() {
    for (const [key, handles] of historyRows) {
      try {
        const row = handles.row.target, match = handles.match.target;
        if (!isNull(row) && !isNull(match)) { updateHistoryTooltips(row, match); continue; }
      } catch (error) { log(`history UI: refresh failed: ${error}`); }
      historyDropTarget(`${key}:_userDeckImages`); historyDropTarget(`${key}:_opponentDeckImages`);
      handles.row.free(); handles.match.free(); historyRows.delete(key);
    }
  }
  function historyPoll() {
    if (!historyActiveKey || (!historyUsingNative && !historyPopup)) return;
    try {
      const record = historyTargets.get(historyActiveKey);
      if (!record || isNull(record.row.target) || !Boolean(call(call(record.row.target, "get_gameObject"), "get_activeInHierarchy"))) {
        historyHidePopup(); return;
      }
      const input = ucls("UnityEngine.Input"); let point, down;
      if (Number(input.method("get_touchCount", 0).invoke()) > 0) {
        const touch = input.method("GetTouch", 1).invoke(0);
        down = enumVal(touch.method("get_phase", 0).invoke()) === 0;
        point = uiXY(touch.method("get_position", 0).invoke());
      } else {
        down = Boolean(input.method("GetMouseButtonDown", 1).invoke(0));
        point = uiXY(input.method("get_mousePosition", 0).invoke());
      }
      if (!down) return;
      const canvas = historyCanvas(record.hits[0].rect.target), camera = call(canvas, "get_worldCamera");
      if (!historyUsingNative && chatContains(historyPopup.rect.target, point, camera)) return;
      for (const target of historyTargets.values()) for (const hit of target.hits) {
        if (Boolean(call(hit.go.target, "get_activeInHierarchy")) && chatContains(hit.rect.target, point, camera)) return;
      }
      historyHidePopup();
    } catch (error) { log(`history UI: popup input failed: ${error}`); historyHidePopup(); }
  }
  section("match history deck tooltips", () => {
    const klass = cls(img, "MatchEntry"), seen = new Set();
    for (const method of klass.methods.filter(m => ["UpdateUi", "SetData"].includes(m.name) && !m.isStatic && m.parameterCount === 1 &&
        m.parameters[0].type.name === "SparkleServices.Stats.MatchEntry")) {
      const address = method.virtualAddress.toString();
      if (method.virtualAddress.isNull() || seen.has(address)) continue; seen.add(address);
      Interceptor.attach(method.virtualAddress, {
        onEnter(args) { this.row = args[0]; this.match = args[1]; },
        onLeave() {
          try {
            const row = new Il2Cpp.Object(this.row), match = new Il2Cpp.Object(this.match);
            const key = row.handle.toString(), old = historyRows.get(key);
            if (old) { old.row.free(); old.match.free(); }
            historyRows.set(key, { row: row.weakRef(false), match: match.weakRef(false) });
            updateHistoryTooltips(row, match);
          } catch (error) { log(`history UI: binding failed: ${error}`); }
        }
      });
    }
    if (!seen.size) throw Error("MatchEntry data callbacks not found");
    log(`history UI: tap hooks installed callbacks=${seen.size}`);
    const update = cls(img, "SparkleServices.ServicesManager").methods.find(m => m.name === "Update" && m.parameterCount === 0);
    if (!update) throw Error("ServicesManager.Update not found");
    Interceptor.attach(update.virtualAddress, { onLeave() { historyPoll(); } });
  });
// END android-ui: history-ui

  // BEGIN android-ui: title-intro
  function titleDataByName(name) {
    const manager = cls(img, "SPTESL.GameManager").method("get_Instance").invoke();
    const titles = manager.field("Config").value.field("Titles").value;
    const count = Number(call(titles, "get_Count"));
    for (let i = 0; i < count; i++) {
      const title = titles.method("get_Item", 1).invoke(i);
      const id = title.field("ResourceId").value;
      if (String(id.field("UniqueName").value?.content || "") === name) return title;
    }
    return null;
  }
  // Mirrors SequenceMatchIntroPatch in PC. SequenceMatchIntro.Execute is a
  // coroutine: returning from it only creates the iterator, before the intro
  // panels are filled. Execute remembers the match data; the tint runs as a
  // scheduled task after MatchIntroWin.Show, when the panels exist. Disabled
  // from OTA 63 to 77 while the battle-entry crash was investigated; that
  // crash came from the friends restore (reports 20-22).
  section("match intro title colour", () => {
    const sequence = cls(img, "SPTESL.SequenceMatchIntro");
    const execute = sequence.methods.find(m => m.name === "Execute" && m.parameterCount === 2 &&
      /MatchLogAnimationData$/.test(m.parameters[0].type.name) && /BoardState$/.test(m.parameters[1].type.name));
    if (!execute) throw Error("SequenceMatchIntro.Execute(data, boardState) not found");
    const show = cls(img, "MatchIntroWin").tryMethod("Show", 0);
    if (!show || show.virtualAddress.isNull()) throw Error("MatchIntroWin.Show not found");
    const unityObject = ucls("UnityEngine.Object");
    const alive = value => !isNull(value) && !unityObject.method("op_Equality").invoke(value, NULL);
    let pending = null;
    const forget = () => { if (pending) { pending.data.free(); pending.board.free(); pending = null; } };
    Interceptor.attach(execute.virtualAddress, {
      onEnter(args) {
        const start = execute.isStatic ? 0 : 1;
        forget();
        pending = { data: new Il2Cpp.Object(args[start]).ref(false), board: new Il2Cpp.Object(args[start + 1]).ref(false) };
      }
    });
    function tint(data, board) {
      const players = call(data.field("ActionData").value, "get_MatchIntroPlayers");
      if (isNull(players)) return;
      const win = board.field("MatchUI").value.field("MatchIntroWin").value;
      if (!alive(win)) return;
      const network = cls(img, "SPTESL.GameNetworkManager").method("get_Instance").invoke();
      let tinted = 0;
      for (let i = 0, count = Number(call(players, "get_Count")); i < count; i++) {
        const player = players.method("get_Item", 1).invoke(i);
        const types = call(player, "get_InventoryTypes");
        const titleIndex = Number(types.method("IndexOf", 1).invoke(Il2Cpp.string("title")));
        if (titleIndex < 0) continue;
        const titleName = String(call(player, "get_InventoryValues").method("get_Item", 1).invoke(titleIndex)?.content || "");
        const title = titleDataByName(titleName);
        if (isNull(title) || enumVal(title.field("Rarity").value) !== RARITY_LEGENDARY) continue;
        const own = enumVal(network.method("GetPlayerControllerType", 1).invoke(call(player, "get_PlayerInstanceId"))) === 0;
        const panel = win.field(own ? "MyInfoPanel" : "UrInfoPanel").value;
        if (!alive(panel)) continue;
        const banner = panel.field("TitleBanner").value;
        if (!alive(banner)) continue;
        const resources = cls(img, "UIResourceManager").method("get_Instance").invoke();
        const sprite = resources.method("GetTitleBannerSprite", 1).invoke(enumBox(cls(img, "SPTESL.CardRarity"), 0));
        if (!isNull(sprite)) call(banner, "set_overrideSprite", sprite);
        call(banner, "set_color", rgba(1, 0.75, 0, 1));
        tinted++;
      }
      log(`titles UI: match intro ${tinted ? `legendary banner tinted (${tinted})` : "has no legendary title"}`);
    }
    Interceptor.attach(show.virtualAddress, {
      onLeave() {
        const match = pending; pending = null;
        if (!match) return;
        schedule(0, () => {
          try { tint(match.data.target, match.board.target); }
          catch (error) { log(`titles UI: intro tint failed: ${error}`); }
          finally { match.data.free(); match.board.free(); }
        }, "match intro tint");
      }
    });
  });
  // END android-ui: title-intro


  // BEGIN android-ui: chat-emojis
const emojiByName = new Map(), emojiByAscii = new Map();
  let emojiDefinitions = [], emojiAsset = null, emojiTexture = null, emojiInitAttempted = false;
  const emojiHandles = [];
  function emojiIndex(definition, columns) { return (definition.Row - 1) * columns + definition.Column - 1; }
  function emojiFormat(message) {
    // PC sends this markup too. Resolve its name against the verified atlas.
    let plain = String(message).replace(/<link=["']emoji\+([a-z0-9_]+)["']>[^]*?<\/link>/gi, (_, name) => `:${name}:`);
    plain = uiPlain(plain);
    plain = plain.split(" ").map(word => emojiByAscii.has(word) ? `:${emojiByAscii.get(word)}:` : word).join(" ");
    return plain.replace(/:([a-z0-9_]+):/gi, (whole, name) => {
      const definition = emojiByName.get(name);
      return definition ? `<size=130%><sprite=${definition.index}></size>` : whole;
    });
  }
  function initializeEmojis() {
    if (emojiAsset) return true;
    if (emojiInitAttempted) return false;
    emojiInitAttempted = true;
    try {
      const path = `${persistentPath()}/tesl-reborn-emojis`;
      const jsonBytes = File.readAllBytes(`${path}/people.json`), pngBytes = File.readAllBytes(`${path}/people.png`);
      if (Checksum.compute("sha256", jsonBytes) !== "ea39cac729868b482d2147ef8c5758d9f23f605cfd5eedcb9d9117408e71531d" ||
          Checksum.compute("sha256", pngBytes) !== "95198a82da017136cb923b655cbe0c83d40456404bef87c86e8a2ae9e67fb4aa") throw Error("Emoji resource checksum mismatch");
      const definition = JSON.parse(File.readAllText(`${path}/people.json`));
      const shader = ucls("UnityEngine.Shader").method("Find", 1).invoke(Il2Cpp.string("TextMeshPro/Sprite"));
      if (isNull(shader)) throw Error("TextMeshPro/Sprite shader is unavailable");
      const texture = ucls("UnityEngine.Texture2D").alloc();
      emojiHandles.push(texture.ref(false));
      texture.method(".ctor").overload("System.Int32", "System.Int32", "UnityEngine.TextureFormat", "System.Boolean")
        .invoke(2, 2, enumBox(ucls("UnityEngine.TextureFormat"), 4), false);
      const managedBytes = Il2Cpp.corlib.class("System.IO.File").method("ReadAllBytes", 1).invoke(Il2Cpp.string(`${path}/people.png`));
      const loaded = ucls("UnityEngine.ImageConversion").method("LoadImage").overload("UnityEngine.Texture2D", "System.Byte[]").invoke(texture, managedBytes);
      if (!loaded) throw Error("PNG decoding failed");
      const width = Number(call(texture, "get_width")), height = Number(call(texture, "get_height"));
      const columns = width / definition.SpriteSize, rows = height / definition.SpriteSize;
      if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns * rows > 4096) throw Error("Invalid emoji atlas dimensions");
      const material = ucls("UnityEngine.Material").alloc();
      emojiHandles.push(material.ref(false));
      material.method(".ctor").overload("UnityEngine.Shader").invoke(shader);
      call(material, "set_mainTexture", texture);
      const asset = ucls("UnityEngine.ScriptableObject").method("CreateInstance").overload("System.Type").invoke(ucls("TMPro.TMP_SpriteAsset").type.object);
      emojiHandles.push(asset.ref(false));
      asset.field("spriteSheet").value = texture; asset.field("material").value = material;
      const list = uiList(ucls("TMPro.TMP_Sprite"));
      emojiHandles.push(list.ref(false));
      for (let i = 0; i < columns * rows; i++) call(list, "Add", NULL);
      const definitions = definition.Groups.flatMap(group => group.Sprites);
      for (const item of definitions) {
        if (item.Row < 1 || item.Column < 1 || item.Row > rows || item.Column > columns || !/^[a-z0-9_]+$/.test(item.Name))
          throw Error("Invalid emoji definition");
        const index = emojiIndex(item, columns), sprite = newWith(ucls("TMPro.TMP_Sprite"));
        const spriteHandle = sprite.ref(false);
        const fields = { id: index, name: Il2Cpp.string(item.Name), unicode: index,
          x: (item.Column - 1) * definition.SpriteSize, y: height - item.Row * definition.SpriteSize,
          width: definition.SpriteSize, height: definition.SpriteSize, xOffset: 0,
          yOffset: definition.SpriteSize * 0.8, xAdvance: definition.SpriteSize, scale: 1 };
        for (const [key, value] of Object.entries(fields)) sprite.field(key).value = value;
        list.method("set_Item", 2).invoke(index, sprite);
        spriteHandle.free();
        const entry = Object.assign({}, item, { index, u: (item.Column - 1) / columns, v: 1 - item.Row / rows, du: 1 / columns, dv: 1 / rows });
        emojiByName.set(item.Name, entry);
        for (const ascii of String(item.Ascii || "").split(" ").filter(Boolean)) emojiByAscii.set(ascii, item.Name);
      }
      asset.field("spriteInfoList").value = list;
      emojiDefinitions = definitions.map(item => emojiByName.get(item.Name));
      emojiAsset = asset; emojiTexture = texture;
      log(`emoji: initialized ${emojiDefinitions.length} sprites from PC atlas`);
      return true;
    } catch (error) { emojiByName.clear(); emojiByAscii.clear(); log(`emoji: initialization failed: ${error}`); return false; }
  }
  const chatMessages = new Map();
  let chatMessageReports = 0;
  function chatResetTextRect(rect) {
    call(rect, "set_anchorMin", vec2(0, 0)); call(rect, "set_anchorMax", vec2(1, 1));
    call(rect, "set_pivot", vec2(0.5, 0.5));
    call(rect, "set_sizeDelta", vec2(-16, -8)); call(rect, "set_anchoredPosition", vec2(0, 0));
  }
  function chatFitTextBox(record) {
    const row = call(record.rect.target, "get_rect"), box = call(record.textRect.target, "get_rect");
    const expectedWidth = Number(row.field("m_Width").value) - 16;
    const expectedHeight = Number(row.field("m_Height").value) - 8;
    if (Math.abs(Number(box.field("m_Width").value) - expectedWidth) > 0.5 ||
        Math.abs(Number(box.field("m_Height").value) - expectedHeight) > 0.5) {
      chatResetTextRect(record.textRect.target);
      if (record.boxRepairs++ < 2) log("chat UI: repaired TMP text container bounds");
    }
  }
  function chatPrepareViewport(self) {
    const root = call(self, "get_transform");
    const viewport = call(root, "Find", Il2Cpp.string("Window/Section_TopBigChat/Section_Messages/Panel_Messages/Scroll_Messages/Viewport"));
    if (isNull(viewport)) { log("chat UI: viewport path missing"); return; }
    const go = call(viewport, "get_gameObject");
    ucls("UnityEngine.UI.RectMask2D"); // Check availability before disabling the original mask.
    let rectangle = uiComponent(go, "UnityEngine.UI.RectMask2D");
    if (isNull(rectangle)) rectangle = uiAdd(go, "UnityEngine.UI.RectMask2D");
    const mask = uiComponent(go, "UnityEngine.UI.Mask");
    if (!isNull(mask)) call(mask, "set_enabled", false);
    const image = uiComponent(go, "UnityEngine.UI.Image");
    if (!isNull(image)) call(image, "set_enabled", false);
    call(rectangle, "set_enabled", true);
    log("chat UI: PC viewport mask fix applied (Mask off, Image off, RectMask2D on)");
  }
  function chatLogMessageBounds(record) {
    try {
      let rect = call(record.text.target, "get_rectTransform");
      for (let depth = 0; depth < 7 && !isNull(rect); depth++) {
        const name = String(call(rect, "get_name")?.content || "?");
        const area = call(rect, "get_rect"), point = uiXY(call(rect, "get_anchoredPosition"));
        const scale = uiXY(call(rect, "get_localScale")), pivot = uiXY(call(rect, "get_pivot"));
        log(`chat UI geometry: ${depth}:${name} rect=${Number(area.field("m_Width").value).toFixed(1)}x${Number(area.field("m_Height").value).toFixed(1)} pos=${point.x.toFixed(1)},${point.y.toFixed(1)} pivot=${pivot.x.toFixed(1)},${pivot.y.toFixed(1)} scale=${scale.x.toFixed(2)},${scale.y.toFixed(2)}`);
        const parent = call(rect, "get_parent");
        if (isNull(parent)) break;
        rect = uiRect(call(parent, "get_gameObject"));
      }
    } catch (error) { log(`chat UI: geometry probe failed: ${error}`); }
  }
  function chatResizeMessage(record) {
    const row = record.row.target, text = record.text.target;
    if (isNull(row) || isNull(text)) return;
    const rect = record.rect.target;
    const area = call(rect, "get_rect");
    const width = Math.max(32, Number(area.field("m_Width").value) - 16);
    if (Math.abs(width - record.width) < 0.5 && record.height > 0) {
      const currentHeight = Number(area.field("m_Height").value);
      if (Math.abs(currentHeight - record.height) > 0.5) {
        call(record.layout.target, "set_preferredHeight", record.height);
        call(record.layout.target, "set_minHeight", record.height);
        call(record.layout.target, "set_flexibleHeight", 0);
        const delta = uiXY(call(rect, "get_sizeDelta"));
        call(rect, "set_sizeDelta", vec2(delta.x, delta.y + record.height - currentHeight));
      }
      chatFitTextBox(record);
      return;
    }
    let height;
    const preferred = text.tryMethod("GetPreferredValues", 3);
    if (preferred) height = uiXY(preferred.overload("System.String", "System.Single", "System.Single")
      .invoke(Il2Cpp.string(record.value), width, 100000)).y;
    else height = Number(call(text, "get_preferredHeight"));
    height = Math.ceil(Math.max(28, height) + 8);
    if (!Number.isFinite(height) || height > 20000) throw Error("Invalid chat message height");
    if (Math.abs(height - record.height) > 0.5 || Math.abs(width - record.width) > 0.5) {
      call(record.layout.target, "set_preferredHeight", height);
      call(record.layout.target, "set_minHeight", height);
      call(record.layout.target, "set_flexibleHeight", 0);
      const currentHeight = Number(area.field("m_Height").value), delta = uiXY(call(rect, "get_sizeDelta"));
      call(rect, "set_sizeDelta", vec2(delta.x, delta.y + height - currentHeight));
      record.height = height; record.width = width;
    }
    chatFitTextBox(record);
  }
  function chatRefreshMessageSizes() {
    for (const [key, record] of chatMessages) {
      try {
        if (!isNull(record.row.target)) {
          if (Boolean(call(call(record.row.target, "get_gameObject"), "get_activeInHierarchy"))) chatResizeMessage(record);
          continue;
        }
      } catch (error) {
        if (!record.warned) { record.warned = true; log(`chat UI: message layout failed: ${error}`); }
      }
      for (const handle of [record.row, record.text, record.rect, record.layout, record.textRect]) handle.free();
      chatMessages.delete(key);
    }
  }
  function renderChatMessage(row, message) {
    if (!initializeEmojis()) return;
    const legacy = row.field("_input").value;
    if (isNull(legacy)) return;
    const template = call(legacy, "get_textComponent");
    if (isNull(template)) return;
    const key = row.handle.toString();
    let record = chatMessages.get(key);
    if (!record) {
      // The old InputField moves its text rectangle for horizontal scrolling.
      // A message renderer must use the row's bounds, not that shifted rectangle.
      const rowGO = call(row, "get_gameObject"), rowRect = uiRect(rowGO);
      const go = uiNew("RebornEmojiMessage", call(rowGO, "get_transform")), rect = uiRect(go);
      call(uiAdd(go, "UnityEngine.UI.LayoutElement"), "set_ignoreLayout", true);
      const text = uiText(go, "", 22);
      // AddComponent<TMP> can reset sizeDelta to its default (observed +200,+50).
      // Configure the container AFTER component creation, independently of font auto-sizing.
      const autoContainer = text.tryMethod("set_autoSizeTextContainer", 1);
      let containerConfigured = false;
      if (autoContainer) { try { autoContainer.invoke(false); containerConfigured = true; } catch (_) {} }
      if (!containerConfigured) { try { text.field("m_autoSizeTextContainer").value = false; } catch (_) {} }
      call(text, "set_alignment", uiEnum("TMPro.TextAlignmentOptions", "TopLeft"));
      call(text, "set_raycastTarget", true); // ScrollRect needs a raycast target after the viewport Image is disabled.
      call(text, "set_enableWordWrapping", true); call(text, "set_richText", true);
      call(text, "set_spriteAsset", emojiAsset);
      chatResetTextRect(rect);
      let layout = uiComponent(rowGO, "UnityEngine.UI.LayoutElement");
      if (isNull(layout)) layout = uiAdd(rowGO, "UnityEngine.UI.LayoutElement");
      const parent = call(rowRect, "get_parent");
      const group = uiComponent(call(parent, "get_gameObject"), "UnityEngine.UI.VerticalLayoutGroup");
      if (!isNull(group)) {
        call(group, "set_childControlHeight", true); call(group, "set_childForceExpandHeight", false);
        call(group, "set_childControlWidth", true); call(group, "set_childForceExpandWidth", true);
        call(group, "set_childAlignment", enumBox(ucls("UnityEngine.TextAnchor"), 0));
      }
      record = { row: row.weakRef(false), text: text.ref(false), rect: rowRect.ref(false), layout: layout.ref(false), textRect: rect.ref(false),
        width: -1, height: -1, value: "", warned: false, boxRepairs: 0 };
      chatMessages.set(key, record);
      if (chatMessages.size <= 2) schedule(500, () => chatLogMessageBounds(record));
    }
    const username = String(message.field("Username").value?.content || "");
    const body = String(message.field("Text").value?.content || "");
    const value = `${username ? `<b>${uiPlain(username)}</b>\n` : ""}${emojiFormat(body)}`;
    if (record.value !== value) { record.value = value; record.width = -1; record.height = -1; }
    call(record.text.target, "set_text", Il2Cpp.string(value));
    chatResizeMessage(record);
    // Keep the native object and its event wiring, but stop InputField text scrolling.
    call(legacy, "set_enabled", false);
    call(template, "set_enabled", false);
    if (chatMessageReports++ < 4) log(`chat UI: message fitted height=${record.height}; row-relative bounds`);
  }
  section("chat emoji rendering", () => {
    const klass = cls(img, "ChatMessageEntry");
    const method = klass.methods.find(m => m.name === "SetData" && m.parameterCount >= 1 && !m.isStatic);
    if (!method || method.parameters[0].type.class.isValueType) throw Error("ChatMessageEntry.SetData reference Message not found");
    Interceptor.attach(method.virtualAddress, {
      onEnter(args) { this.row = args[0]; this.message = args[1]; },
      onLeave() { try { renderChatMessage(new Il2Cpp.Object(this.row), new Il2Cpp.Object(this.message)); }
        catch (error) { log(`emoji: message rendering failed: ${error}`); } }
    });
  });


  section("chat message layout refresh", () => {
    const render = ucls("UnityEngine.Canvas").tryMethod("SendWillRenderCanvases", 0);
    if (render && !render.virtualAddress.isNull()) {
      Interceptor.attach(render.virtualAddress, { onEnter() { chatRefreshMessageSizes(); } });
    } else {
      const tick = () => { chatRefreshMessageSizes(); schedule(100, tick, "chat message sizes"); }; schedule(100, tick, "chat message sizes");
    }
  });
// END android-ui: chat-emojis

  // BEGIN android-ui: message-preview
const messagePreviews = new Map();
  let messagePreviewReports = 0;
  function emojiPreviewFormat(source, richText) {
    // Preserve native name/time/style markup, and use the same name->sprite map as chat.
    const normalized = String(source).replace(/<link=["']emoji\+([a-z0-9_]+)["']>[^]*?<\/link>/gi, (_, name) => `:${name}:`);
    if (!richText) return emojiFormat(normalized);
    return normalized.split(/(<\/?(?:b|i|size|color)(?:=[^<>]*)?>)/gi)
      .map(part => /^<\/?(?:b|i|size|color)(?:=[^<>]*)?>$/i.test(part) ? part : emojiFormat(part)).join("");
  }
  function messagePreviewBounds(record) {
    const rect = record.rect.target;
    call(rect, "set_anchorMin", vec2(0, 0)); call(rect, "set_anchorMax", vec2(1, 1));
    call(rect, "set_pivot", vec2(0.5, 0.5)); call(rect, "set_sizeDelta", vec2(0, 0));
    call(rect, "set_anchoredPosition", vec2(0, 0));
  }
  function refreshMessagePreview(record) {
    const template = record.template.target, label = record.label.target;
    if (isNull(template) || isNull(label)) return false;
    let source = String(call(template, "get_text")?.content || "");
    if (!source) source = record.fallbackText;
    const richText = Boolean(call(template, "get_supportRichText"));
    if (source !== record.source || richText !== record.richText) {
      call(label, "set_text", Il2Cpp.string(emojiPreviewFormat(source, richText)));
      record.source = source; record.richText = richText;
    }
    const fontSize = Number(call(template, "get_fontSize"));
    if (fontSize > 0 && fontSize !== record.fontSize) { call(label, "set_fontSize", fontSize); record.fontSize = fontSize; }
    // Native preview fade/colour animations can target the legacy graphic itself.
    call(label, "set_color", call(template, "get_color"));
    try {
      const originalRenderer = call(template, "get_canvasRenderer"), renderer = call(label, "get_canvasRenderer");
      call(renderer, "SetColor", call(originalRenderer, "GetColor"));
    } catch (_) {}
    const parentArea = call(call(template, "get_rectTransform"), "get_rect");
    const area = call(record.rect.target, "get_rect");
    if (Math.abs(Number(area.field("m_Width").value) - Number(parentArea.field("m_Width").value)) > 0.5 ||
        Math.abs(Number(area.field("m_Height").value) - Number(parentArea.field("m_Height").value)) > 0.5) messagePreviewBounds(record);
    call(template, "set_enabled", false); // Keep the original GameObject, layout and click handlers active.
    return true;
  }
  function dropMessagePreview(key, record) {
    try { if (!isNull(record.template.target)) call(record.template.target, "set_enabled", true); } catch (_) {}
    try { if (!isNull(record.label.target)) ucls("UnityEngine.Object").method("Destroy").overload("UnityEngine.Object").invoke(call(record.label.target, "get_gameObject")); } catch (_) {}
    for (const handle of [record.row, record.template, record.label, record.rect]) handle.free();
    messagePreviews.delete(key);
  }
  function renderMessagePreview(row, message) {
    // A preview may arrive before chat assets/shaders have been loaded. Do not
    // consume the chat's one initialization attempt while the sprite shader is absent.
    if (!emojiAsset) {
      try {
        if (isNull(ucls("UnityEngine.Shader").method("Find", 1).invoke(Il2Cpp.string("TextMeshPro/Sprite")))) return;
      } catch (_) { return; }
    }
    if (!initializeEmojis()) return;
    const template = row.field("_text").value;
    if (isNull(template)) return;
    const key = row.handle.toString();
    let record = messagePreviews.get(key);
    if (record && (isNull(record.template.target) || record.template.target.handle.toString() !== template.handle.toString())) {
      dropMessagePreview(key, record); record = null;
    }
    if (!record) {
      let go = null;
      try {
        go = uiNew("PreviewRichText", call(template, "get_transform"));
        call(uiAdd(go, "UnityEngine.UI.LayoutElement"), "set_ignoreLayout", true);
        const label = uiText(go, "", 22);
        const autoContainer = label.tryMethod("set_autoSizeTextContainer", 1);
        let configured = false;
        if (autoContainer) { try { autoContainer.invoke(false); configured = true; } catch (_) {} }
        if (!configured) { try { label.field("m_autoSizeTextContainer").value = false; } catch (_) {} }
        call(label, "set_richText", true); call(label, "set_raycastTarget", true);
        call(label, "set_enableWordWrapping", enumVal(call(template, "get_horizontalOverflow")) === 0);
        const alignments = ["TopLeft", "Top", "TopRight", "Left", "Center", "Right", "BottomLeft", "Bottom", "BottomRight"];
        const alignment = enumVal(call(template, "get_alignment"));
        call(label, "set_alignment", uiEnum("TMPro.TextAlignmentOptions", alignments[alignment] || "TopLeft"));
        const overflow = label.method("set_overflowMode", 1);
        overflow.invoke(enumBox(overflow.parameters[0].type.class, 3)); // Truncate, same as PC MessagePreviewEntryPatch.
        call(label, "set_spriteAsset", emojiAsset);
        record = { row: row.weakRef(false), template: template.weakRef(false), label: label.ref(false), rect: uiRect(go).ref(false),
          fallbackText: "", source: null, richText: null, fontSize: null };
        messagePreviewBounds(record); // Always AFTER TMP creation and configuration.
        messagePreviews.set(key, record);
      } catch (error) {
        if (go) { try { ucls("UnityEngine.Object").method("Destroy").overload("UnityEngine.Object").invoke(go); } catch (_) {} }
        throw error;
      }
    }
    const username = String(message.field("Username").value?.content || "");
    const body = String(message.field("Text").value?.content || "");
    record.fallbackText = `${username ? `${username}: ` : ""}${body}`;
    refreshMessagePreview(record);
    if (messagePreviewReports++ < 4) log("emoji preview: rendered with shared chat sprite atlas");
  }
  function refreshMessagePreviews() {
    for (const [key, record] of messagePreviews) {
      try {
        if (!isNull(record.row.target) && !isNull(record.template.target)) {
          if (Boolean(call(call(record.template.target, "get_gameObject"), "get_activeInHierarchy"))) refreshMessagePreview(record);
          continue;
        }
      } catch (error) {
        try { if (!isNull(record.template.target)) call(record.template.target, "set_enabled", true); } catch (_) {}
        log(`emoji preview: refresh failed: ${error}`);
      }
      dropMessagePreview(key, record);
    }
  }
  section("message preview emoji rendering", () => {
    const klass = cls(img, "MessagePreviewEntry");
    const methods = klass.methods.filter(m => m.name === "SetData" && !m.isStatic && m.parameterCount >= 1 &&
      m.parameters[0].type.class.name === "Message" && !m.parameters[0].type.class.isValueType && !m.virtualAddress.isNull());
    if (!methods.length) throw Error("MessagePreviewEntry.SetData(Message, ...) not found");
    const seen = new Set();
    for (const method of methods) {
      const address = method.virtualAddress.toString(); if (seen.has(address)) continue; seen.add(address);
      Interceptor.attach(method.virtualAddress, {
        onEnter(args) { this.row = args[0]; this.message = args[1]; },
        onLeave() { try { renderMessagePreview(new Il2Cpp.Object(this.row), new Il2Cpp.Object(this.message)); }
          catch (error) { log(`emoji preview: rendering failed: ${error}`); } }
      });
    }
    const render = ucls("UnityEngine.Canvas").tryMethod("SendWillRenderCanvases", 0);
    if (render && !render.virtualAddress.isNull()) Interceptor.attach(render.virtualAddress, { onEnter() { refreshMessagePreviews(); } });
    else { const tick = () => { refreshMessagePreviews(); schedule(100, tick, "message previews"); }; schedule(100, tick, "message previews"); }
    log(`emoji preview: hooks installed callbacks=${seen.size}`);
  });
// END android-ui: message-preview

  // BEGIN android-ui: chat-scale
function chatScaleApply(record) {
    if (!record.baseScale || !Number.isFinite(record.factor)) return;
    const rect = record.rect.target, current = call(rect, "get_localScale"), base = record.baseScale;
    const x = base.x * record.factor, y = base.y * record.factor;
    if (Math.abs(Number(current.field("x").value) - x) > 0.001 || Math.abs(Number(current.field("y").value) - y) > 0.001)
      call(rect, "set_localScale", unityStruct("UnityEngine.Vector3", { x, y, z: base.z }));
  }
  function chatScaleSetup(record) {
    const rect = record.rect.target, scale = call(rect, "get_localScale");
    record.baseScale = { x: Number(scale.field("x").value) || 1, y: Number(scale.field("y").value) || 1,
      z: Number(scale.field("z").value) || 1 };
    const area = call(rect, "get_rect"), screen = chatScreen();
    const canvasScale = Math.max(0.01, Number(call(record.canvas.target, "get_scaleFactor")));
    record.maxFactor = Math.max(0.45, Math.min(1.8,
      (screen.width / canvasScale - 24) / Math.max(1, Number(area.field("m_Width").value) * Math.abs(record.baseScale.x)),
      (screen.height / canvasScale - 24) / Math.max(1, Number(area.field("m_Height").value) * Math.abs(record.baseScale.y))));
    record.factor = Math.min(1, record.maxFactor);
    try {
      const saved = JSON.parse(readTextFile(`${persistentPath()}/tesl-reborn-chat-scale.json`) || "null");
      if (saved && Number.isFinite(saved.factor)) record.factor = Math.max(0.45, Math.min(record.maxFactor, saved.factor));
    } catch (_) {}
    record.scaleEnabled = true;
    chatScaleApply(record);
    log(`chat UI: scale enabled range=0.45..${record.maxFactor.toFixed(2)}; pinch only`);
  }
  function chatScaleSet(record, factor) {
    record.factor = Math.max(0.45, Math.min(record.maxFactor, factor)); chatScaleApply(record);
  }
  function chatScaleSave(record) {
    writeTextFile(`${persistentPath()}/tesl-reborn-chat-scale.json`, JSON.stringify({ factor: record.factor }));
    log(`chat UI: scale saved factor=${record.factor.toFixed(2)}`);
  }
  function chatScaleUpdate(record) {
    if (!record.scaleEnabled) return false;
    const input = ucls("UnityEngine.Input"), count = Number(input.method("get_touchCount", 0).invoke());
    const camera = call(record.canvas.target, "get_worldCamera");
    if (count >= 2) {
      const a = input.method("GetTouch", 1).invoke(0), b = input.method("GetTouch", 1).invoke(1);
      const ap = uiXY(a.method("get_position", 0).invoke()), bp = uiXY(b.method("get_position", 0).invoke());
      const phases = [a, b].map(t => enumVal(t.method("get_phase", 0).invoke()));
      if (phases.some(p => p === 3 || p === 4)) {
        if (record.pinch) { record.pinch = null; chatScaleSave(record); } return true;
      }
      if (!record.pinch) {
        if (!chatContains(record.rect.target, ap, camera) || !chatContains(record.rect.target, bp, camera)) return false;
        record.pinch = { distance: Math.max(1, Math.hypot(ap.x - bp.x, ap.y - bp.y)), factor: record.factor };
        record.dragging = false; record.armed = false;
      }
      chatScaleSet(record, record.pinch.factor * Math.hypot(ap.x - bp.x, ap.y - bp.y) / record.pinch.distance);
      return true;
    }
    if (record.pinch) { record.pinch = null; chatScaleSave(record); return true; }
    return false;
  }
// END android-ui: chat-scale

  // BEGIN android-ui: chat-window
const chatWindows = new Map();
  const chatSetupDiagnosed = new Set();
  function chatInputInsert(record, name) {
    const input = record.input.target;
    const text = String(call(input, "get_text")?.content || "");
    const index = Math.max(0, Math.min(text.length, record.caret == null ? text.length : record.caret));
    const insertion = `:${name}: `;
    call(input, "set_text", Il2Cpp.string(text.slice(0, index) + insertion + text.slice(index)));
    record.caret = index + insertion.length;
    const caret = input.tryMethod("set_stringPosition", 1) || input.tryMethod("set_caretPosition", 1);
    if (caret) caret.invoke(record.caret);
    call(input, "ActivateInputField");
  }
  function chatBuildPicker(record) {
    if (record.picker) return true;
    if (!initializeEmojis()) return false;
    const go = uiNew("RebornEmojiPicker", record.window.target);
    uiPlace(go, 1, 0, 1, 0, -16, 84, 284, 250);
    call(uiAdd(go, "UnityEngine.UI.LayoutElement"), "set_ignoreLayout", true);
    const bg = uiAdd(go, "UnityEngine.UI.Image"); call(bg, "set_color", rgba(0.08, 0.08, 0.08, 0.98));
    const root = call(go, "get_transform");
    record.picker = go.ref(false); record.page = 0; record.cells = [];
    for (let i = 0; i < 48; i++) {
      const cell = uiNew(`Emoji${i}`, root);
      uiPlace(cell, 0, 1, 0, 1, 6 + (i % 8) * 34, -6 - Math.floor(i / 8) * 34, 30, 30);
      const icon = uiAdd(cell, "UnityEngine.UI.RawImage"); call(icon, "set_texture", emojiTexture);
      uiButton(cell, icon, () => {
        const entry = emojiDefinitions[record.page * 48 + i];
        if (!entry) return;
        chatInputInsert(record, entry.Name); call(record.picker.target, "SetActive", false);
      });
      record.cells.push({ object: cell.ref(false), image: icon.ref(false) });
    }
    uiLabeledButton("Previous", root, "<", -196, -216, 68, () => chatPickerPage(record, -1));
    uiLabeledButton("Next", root, ">", -112, -216, 68, () => chatPickerPage(record, 1));
    uiLabeledButton("Close", root, "X", -8, -216, 68, () => call(record.picker.target, "SetActive", false));
    chatPickerPage(record, 0);
    call(go, "SetActive", false);
    return true;
  }
  function chatPickerPage(record, delta) {
    const pages = Math.ceil(emojiDefinitions.length / 48);
    record.page = (record.page + delta + pages) % pages;
    for (let i = 0; i < record.cells.length; i++) {
      const entry = emojiDefinitions[record.page * 48 + i], cell = record.cells[i];
      call(cell.object.target, "SetActive", !!entry);
      if (!entry) continue;
      call(cell.image.target, "set_uvRect", unityStruct("UnityEngine.Rect", {
        m_XMin: entry.u, m_YMin: entry.v, m_Width: entry.du, m_Height: entry.dv
      }));
    }
    log(`emoji: picker page ${record.page + 1}/${pages}`);
  }
  function chatFind(root, path) {
    const value = call(root, "Find", Il2Cpp.string(path));
    if (isNull(value)) throw Error(`Chat UI path missing: ${path}`);
    return value;
  }
  function chatSetup(self) {
    const key = self.handle.toString();
    if (chatWindows.has(key)) return;
    let controls = null, pickerCreated = null, createdRecord = null;
    try {
      const root = call(self, "get_transform"), window = chatFind(root, "Window");
      const inputTransform = chatFind(root, "Window/Section_BottomSmallChat/Input_Message");
      const inputGO = call(inputTransform, "get_gameObject");
      let input = uiComponent(inputGO, "TMPro.TMP_InputField");
      if (isNull(input)) input = uiComponent(inputGO, "UnityEngine.UI.InputField");
      if (isNull(input)) throw Error("Chat input component not found");
      const canvas = window.method("GetComponentInParent").overload("System.Type").invoke(ucls("UnityEngine.Canvas").type.object);
      if (isNull(canvas)) throw Error("Chat canvas not found");
      const windowGO = call(window, "get_gameObject"), rect = uiRect(windowGO);
      // Drag the existing player header. Keep Move only as a prefab fallback.
      const header = call(root, "Find", Il2Cpp.string("Window/Section_TopBigChat/Section_PlayerInfo"));
      let handle;
      if (!isNull(header)) handle = uiRect(call(header, "get_gameObject"));
      else {
        controls = uiNew("RebornChatControls", window); uiPlace(controls, 0.5, 1, 0.5, 1, 0, -3, 70, 28);
        call(uiAdd(controls, "UnityEngine.UI.LayoutElement"), "set_ignoreLayout", true);
        handle = uiRect(uiLabeledButton("MoveChat", call(controls, "get_transform"), "Move", 0, 0, 70, () => {}));
      }
      const record = { self: self.weakRef(false), window: window.ref(false), rect: rect.ref(false),
        input: input.ref(false), canvas: canvas.ref(false), controls: (controls || windowGO).ref(false),
        dragging: false, caret: null, errors: 0, picker: null, desired: null, handle: handle.ref(false) };
      createdRecord = record;
      // Same smiley (sprite index 8), 46x46 size and input-relative placement as PC.
      const picker = uiNew("EmojiPickerButton", inputTransform);
      pickerCreated = picker;
      uiPlace(picker, 1, 1, 1, 0, -16, -63, 46, 46);
      call(uiAdd(picker, "UnityEngine.UI.LayoutElement"), "set_ignoreLayout", true);
      const hit = uiAdd(picker, "UnityEngine.UI.Image");
      call(hit, "set_color", rgba(1, 1, 1, 0));
      const labelGO = uiNew("Label", call(picker, "get_transform"));
      uiStretch(uiRect(labelGO));
      const label = uiText(labelGO, "", 30);
      if (initializeEmojis()) {
        call(label, "set_spriteAsset", emojiAsset);
        call(label, "set_richText", true);
        call(label, "set_text", Il2Cpp.string("<sprite=8>"));
      } else call(label, "set_text", Il2Cpp.string(":)"));
      // No colour transition on an invisible hit target; the sprite is the label.
      const pickerButton = uiButton(picker, hit, () => {
        if (!chatBuildPicker(record)) return;
        const panel = record.picker.target;
        call(panel, "SetActive", !Boolean(call(panel, "get_activeSelf")));
        if (Boolean(call(panel, "get_activeSelf"))) call(call(panel, "get_transform"), "SetAsLastSibling");
      });
      const transition = pickerButton.tryMethod("set_transition", 1);
      if (transition) transition.invoke(enumBox(transition.parameters[0].type.class, 0));
      record.pickerButton = uiRect(picker).ref(false);
      // Ignore positions from v9: the failed bounds calculation could leave one invalid.
      try {
        const saved = JSON.parse(readTextFile(`${persistentPath()}/tesl-reborn-chat-position-v11.json`) || "null");
        const screen = chatScreen();
        if (saved && saved.width === screen.width && saved.height === screen.height &&
            Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
          record.desired = { x: saved.x, y: saved.y };
          call(rect, "set_anchoredPosition", vec2(saved.x, saved.y));
        }
      } catch (_) {}
      chatWindows.set(key, record);
      try { chatPrepareViewport(self); } catch (error) { log(`chat UI: viewport preparation failed: ${error}`); }
      try { chatScaleSetup(record); } catch (error) { log(`chat UI: scale setup failed: ${error}`); }
      log(`chat UI: drag=${controls ? "Move fallback" : "player header"}; PC smiley installed`);
    } catch (error) {
      for (const object of [controls, pickerCreated]) if (object) {
        try { ucls("UnityEngine.Object").method("Destroy").overload("UnityEngine.Object").invoke(object); } catch (_) {}
      }
      if (createdRecord) for (const value of Object.values(createdRecord)) {
        if (value && typeof value.free === "function") { try { value.free(); } catch (_) {} }
      }
      log(`chat UI: setup failed: ${error}`);
      if (!chatSetupDiagnosed.has(key)) {
        chatSetupDiagnosed.add(key);
        try { uiLogTree(call(self, "get_transform"), "chat UI paths"); } catch (_) {}
      }
    }
  }
  function chatContains(rect, point, camera) {
    return Boolean(ucls("UnityEngine.RectTransformUtility").method("RectangleContainsScreenPoint")
      .overload("UnityEngine.RectTransform", "UnityEngine.Vector2", "UnityEngine.Camera")
      .invoke(rect, vec2(point.x, point.y), camera));
  }
  function chatScreen() {
    const screen = ucls("UnityEngine.Screen");
    return { width: Number(screen.method("get_width", 0).invoke()), height: Number(screen.method("get_height", 0).invoke()) };
  }
  function chatBoundPointer(point) {
    // Bound the grabbed handle, not the full Window RectTransform. On mobile that
    // rect may stretch across the viewport even when the visible chat is small.
    const screen = chatScreen();
    return { x: Math.max(16, Math.min(screen.width - 16, point.x)),
      y: Math.max(16, Math.min(screen.height - 16, point.y)) };
  }
  function chatApplyPosition(record) {
    if (!record.desired) return;
    const rect = record.rect.target, current = uiXY(call(rect, "get_anchoredPosition"));
    if (Math.abs(current.x - record.desired.x) > 0.1 || Math.abs(current.y - record.desired.y) > 0.1)
      call(rect, "set_anchoredPosition", vec2(record.desired.x, record.desired.y));
  }
  function chatUpdate(self) {
    const record = chatWindows.get(self.handle.toString());
    if (!record || record.errors > 3) return;
    try {
      if (!Boolean(call(record.controls.target, "get_activeInHierarchy"))) return;
      if (chatScaleUpdate(record)) return;
      const input = record.input.target;
      if (Boolean(call(input, "get_isFocused"))) {
        const caret = input.tryMethod("get_stringPosition", 0) || input.tryMethod("get_caretPosition", 0);
        if (caret) record.caret = Number(caret.invoke());
      }
      const unityInput = ucls("UnityEngine.Input");
      let point, held, down;
      if (Number(unityInput.method("get_touchCount").invoke()) > 0) {
        const touch = unityInput.method("GetTouch", 1).invoke(0);
        point = uiXY(touch.method("get_position", 0).invoke());
        const phase = enumVal(touch.method("get_phase", 0).invoke());
        down = phase === 0; // Began; independent of simulateMouseWithTouches.
        held = phase !== 3 && phase !== 4; // Ended / Canceled.
      } else {
        point = uiXY(unityInput.method("get_mousePosition").invoke());
        held = Boolean(unityInput.method("GetMouseButton", 1).invoke(0));
        down = Boolean(unityInput.method("GetMouseButtonDown", 1).invoke(0));
      }
      const camera = call(record.canvas.target, "get_worldCamera");
      const rect = record.rect.target;
      if (down && Boolean(call(call(record.handle.target, "get_gameObject"), "get_activeInHierarchy")) && chatContains(record.handle.target, point, camera)) {
        record.armed = true; record.start = point; record.origin = uiXY(call(rect, "get_anchoredPosition"));
      }
      if (record.armed && held && !record.dragging && Math.hypot(point.x - record.start.x, point.y - record.start.y) >= 8) {
        record.dragging = true;
        log("chat UI: drag started");
      }
      if (record.dragging && held) {
        const scale = Math.max(0.01, Number(call(record.canvas.target, "get_scaleFactor")));
        const bounded = chatBoundPointer(point);
        record.desired = { x: record.origin.x + (bounded.x - record.start.x) / scale,
          y: record.origin.y + (bounded.y - record.start.y) / scale };
        chatApplyPosition(record);
      }
      if (record.dragging && !held) {
        record.dragging = false;
        const screen = chatScreen();
        writeTextFile(`${persistentPath()}/tesl-reborn-chat-position-v11.json`, JSON.stringify(Object.assign({}, record.desired, screen)));
        log("chat UI: position saved");
      }
      if (!held) record.armed = false;
      chatApplyPosition(record); // Keep the chosen position after native Update rewrites it.
      chatScaleApply(record);
      if (down && record.picker && Boolean(call(record.picker.target, "get_activeSelf")) &&
          !chatContains(uiRect(record.picker.target), point, camera) && !chatContains(record.pickerButton.target, point, camera))
        call(record.picker.target, "SetActive", false);
      record.errors = 0;
    } catch (error) { record.errors++; record.dragging = false; log(`chat UI: update failed: ${error}`); }
  }
  section("movable chat and emoji picker", () => {
    const klass = cls(img, "FriendsChatWin");
    const update = klass.methods.find(m => m.name === "Update" && !m.isStatic && m.parameterCount === 0);
    if (!update) throw Error("FriendsChatWin.Update not found");
    for (const method of klass.methods.filter(m => ["Awake", "Show"].includes(m.name) && !m.isStatic)) {
      if (method.virtualAddress.isNull()) continue;
      Interceptor.attach(method.virtualAddress, {
        onEnter(args) { this.self = args[0]; },
        onLeave() { try { chatSetup(new Il2Cpp.Object(this.self)); } catch (error) { log(`chat UI: ${error}`); } }
      });
    }
    const render = ucls("UnityEngine.Canvas").tryMethod("SendWillRenderCanvases", 0);
    if (render && !render.virtualAddress.isNull()) Interceptor.attach(render.virtualAddress, {
      onLeave() { for (const record of chatWindows.values()) {
        try { if (Boolean(call(record.controls.target, "get_activeInHierarchy"))) { chatApplyPosition(record); chatScaleApply(record); } }
        catch (_) {}
      } }
    });
    Interceptor.attach(update.virtualAddress, {
      onEnter(args) { this.self = args[0]; },
      onLeave() { try { chatUpdate(new Il2Cpp.Object(this.self)); } catch (_) {} }
    });
  });
  // BEGIN android-ui: confirmed-debug-marker
  section("hide confirmed debug test marker", () => {
    const path=`${persistentPath()}/tesl-reborn-debug-marker.json`;
    const latch=`${persistentPath()}/tesl-reborn-debug-marker-confirmed32.json`;
    let applied=false;try{applied=JSON.parse(readTextFile(latch)||"{}").applied===true;}catch(_){}
    if(applied) return;
    let config:any={};try{config=JSON.parse(readTextFile(path)||"{}");}catch(_){}
    if(writeTextFile(path,JSON.stringify({...config,enabled:false}))) writeTextFile(latch,JSON.stringify({applied:true}));
  });
  // END android-ui: confirmed-debug-marker
  // BEGIN android-ui: global-shortcuts
  section("mobile global debug shortcut", () => {
    try {
      const setup = JSON.parse(readTextFile(`${persistentPath()}/tesl-reborn-setup.json`) || "null");
      if (setup?.debugInput === "android-key-events") { log("mobile debug: Android keyboard gesture backend"); return; }
    } catch (_) {}
    let taps = [], startFrame = -1, keyDownFrame = -1, lastFrame = -1, began = null, lastError = "";
    const input = ucls("UnityEngine.Input"), time = ucls("UnityEngine.Time");
    const frame = () => Number(time.method("get_frameCount", 0).invoke());
    function diagnostic(status, detail = "") {
      log(`mobile debug: ${status}${detail ? ": " + detail : ""}`);
      try { writeTextFile(`${persistentPath()}/tesl-reborn-debug-status.json`, JSON.stringify({ status, detail, at: new Date().toISOString() })); } catch (_) {}
    }
    const attached = new Set();
    function attachKey(address, name, stringKey = false) {
      if (!address || address.isNull?.() || attached.has(address.toString())) return;
      try { Interceptor.attach(address, {
        onEnter(args) { this.key = stringKey ? rawStr(args[0]).toLowerCase() : args[0]?.toInt32(); },
        onLeave(result) {
          if (startFrame < 0) return;
          const current = frame();
          if (current > startFrame + 5) { startFrame = -1; return; }
          if (current < startFrame ||
              keyDownFrame >= 0 && current !== keyDownFrame) return;
          const any = /anyKey/.test(name), down = /Down/.test(name);
          const d = stringKey ? this.key === "d" : this.key === 100;
          const ctrl = stringKey ? ["left ctrl", "right ctrl", "left control", "right control"].includes(this.key) : [305, 306].includes(this.key);
          if (!any && !d && !ctrl) return;
          // Latch on the first actual D query, regardless of script execution
          // order. anyKey guards and both public overloads receive the chord.
          if (d && down && keyDownFrame < 0) {
            keyDownFrame = current;
            diagnostic("ctrl-d-forwarded", name);
          }
          if (any || d || ctrl && !down) result.replace(ptr(1));
        }
      }); attached.add(address.toString()); }
      catch (error) { log(`mobile debug: cannot hook ${name}: ${error}`); }
    }
    for (const method of input.methods.filter(m => /^(GetKey(?:Down)?(?:Int|String)?|get_anyKey(?:Down)?)$/.test(m.name))) {
      const stringKey = method.parameters[0]?.type.name === "System.String";
      try { attachKey(method.virtualAddress, method.name, stringKey); }
      catch (error) { log(`mobile debug: input method unavailable ${method.name}: ${error}`); }
    }
    // IL2CPP can inline the public wrappers. Hook the resolved Unity input
    // functions as well, so native game callers reach the same event.
    try {
      const resolve = new NativeFunction(Il2Cpp.module.getExportByName("il2cpp_resolve_icall"), "pointer", ["pointer"]);
      for (const name of ["GetKeyInt", "GetKeyDownInt", "GetKeyString", "GetKeyDownString", "get_anyKey", "get_anyKeyDown"]) {
        const signature = name.endsWith("Int") ? "UnityEngine.KeyCode" : name.endsWith("String") ? "System.String" : "";
        for (const suffix of ["", `(${signature})`]) {
          const address = resolve(Memory.allocUtf8String(`UnityEngine.Input::${name}${suffix}`));
          attachKey(address, name, name.endsWith("String"));
        }
      }
    } catch (error) { log(`mobile debug: native input resolution unavailable: ${error}`); }
    const update = cls(img, "SparkleServices.ServicesManager").method("Update", 0);
    Interceptor.attach(update.virtualAddress, {
      onEnter() {
        try {
          const current = frame(); if (current === lastFrame) return; lastFrame = current;
          const count = Number(input.method("get_touchCount", 0).invoke());
          if (count !== 1) { began = null; if (count > 1) taps = []; return; }
          const touch = input.method("GetTouch", 1).invoke(0), phase = enumVal(touch.method("get_phase", 0).invoke());
          const point = uiXY(touch.method("get_position", 0).invoke()), screen = chatScreen();
          const size = Math.max(64, Math.min(160, Math.min(screen.width, screen.height) * .10));
          const inside = point.x >= 0 && point.x <= size && point.y >= screen.height - size && point.y <= screen.height;
          if (phase === 0) { began = inside ? { x: point.x, y: point.y, at: Date.now() } : null; return; }
          if (phase === 4) { began = null; taps = []; return; }
          if (phase !== 3) return;
          const now = Date.now();
          if (!inside || !began || now - began.at > 400 || Math.hypot(point.x-began.x, point.y-began.y) > size * .35) {
            began = null; taps = []; return;
          }
          began = null; taps = taps.filter(at => now-at < 1100); taps.push(now);
          if (taps.length >= 3) {
            taps = []; startFrame = current + 1; keyDownFrame = -1;
            diagnostic("gesture-detected");
          }
        } catch (error) {
          const message = String(error);
          if (message !== lastError) { lastError = message; diagnostic("input-error", message); }
        }
      }
    });
    diagnostic("ready", `${attached.size} input hooks; original Ctrl+D permissions preserved`);
  });
  // END android-ui: global-shortcuts
// END android-ui: chat-window


  // BEGIN android-ui: update-notices
  function createUpdateNotices(updater, io) {
    let downloadStarted = false, lastStatus = "";
    const saved = io.readNotice() || {}, current = updater.current();
    const previous = io.readStatus()?.previous;
    // OTA 36 recorded an attempted notification before its UI was drawn.
    // Only the new acknowledgement field proves it was actually displayed.
    const priorRevision = Number(saved.shownRevision || previous?.revision || 0);
    if (Number.isSafeInteger(current?.revision) && current.revision > priorRevision) {
      if (priorRevision > 0) io.emit("applied", current.revision, () => io.writeNotice({ shownRevision: current.revision }));
      else io.writeNotice({ shownRevision: current.revision });
    }
    function poll() {
      const status = updater.status();
      if (status === lastStatus) return;
      lastStatus = status;
      if (status === "restart-required") {
        downloadStarted = false;
        io.emit("restart", 0);
      } else if (status === "update-error" && downloadStarted) {
        downloadStarted = false;
        io.emit("error", 0);
      }
    }
    return {
      poll,
      check(get) {
        let requests = 0;
        try {
          updater.check((url, callback) => {
            // The stable API 1 loader fetches the manifest first, then the
            // validated payload. This also works in already installed APKs.
            if (++requests === 2) {
              downloadStarted = true;
              io.emit("downloading", 0);
            }
            get(url, (status, body) => { callback(status, body); poll(); });
          });
        } finally { poll(); }
      }
    };
  }

  function updateNoticeText(kind, revision, language) {
    const messages = {
      en: {
        downloading: "Downloading a Reborn update. You can keep playing.",
        restart: "Reborn update downloaded and verified. Restart the game when convenient to apply it.",
        applied: `Reborn update ${revision} applied.`,
        error: "Reborn update could not be downloaded or verified. You can keep playing; it will retry on the next launch."
      },
      ru: {
        downloading: "Скачивается обновление Reborn. Можно продолжать играть.",
        restart: "Обновление Reborn скачано и проверено. Перезапустите игру, когда будет удобно, чтобы применить его.",
        applied: `Обновление Reborn ${revision} применено.`,
        error: "Не удалось скачать или проверить обновление Reborn. Можно играть дальше; повторим при следующем запуске."
      },
      de: {
        downloading: "Ein Reborn-Update wird heruntergeladen. Du kannst weiterspielen.",
        restart: "Reborn-Update heruntergeladen und geprüft. Starte das Spiel neu, wenn es dir passt, um es anzuwenden.",
        applied: `Reborn-Update ${revision} angewendet.`,
        error: "Reborn-Update konnte nicht geladen oder geprüft werden. Du kannst weiterspielen; neuer Versuch beim nächsten Start."
      },
      es: {
        downloading: "Descargando una actualización de Reborn. Puedes seguir jugando.",
        restart: "Actualización de Reborn descargada y verificada. Reinicia el juego cuando quieras para aplicarla.",
        applied: `Actualización ${revision} de Reborn aplicada.`,
        error: "No se pudo descargar o verificar la actualización de Reborn. Puedes seguir jugando; se reintentará al iniciar."
      },
      fr: {
        downloading: "Téléchargement d’une mise à jour Reborn. Vous pouvez continuer à jouer.",
        restart: "Mise à jour Reborn téléchargée et vérifiée. Redémarrez le jeu quand vous le souhaitez pour l’appliquer.",
        applied: `Mise à jour Reborn ${revision} appliquée.`,
        error: "Impossible de télécharger ou vérifier la mise à jour Reborn. Vous pouvez jouer ; nouvel essai au prochain lancement."
      },
      it: {
        downloading: "Download di un aggiornamento Reborn. Puoi continuare a giocare.",
        restart: "Aggiornamento Reborn scaricato e verificato. Riavvia il gioco quando vuoi per applicarlo.",
        applied: `Aggiornamento Reborn ${revision} applicato.`,
        error: "Impossibile scaricare o verificare l’aggiornamento Reborn. Puoi giocare; nuovo tentativo al prossimo avvio."
      },
      pl: {
        downloading: "Pobieranie aktualizacji Reborn. Możesz grać dalej.",
        restart: "Aktualizacja Reborn pobrana i zweryfikowana. Uruchom grę ponownie w dogodnym momencie, aby ją zastosować.",
        applied: `Aktualizacja Reborn ${revision} zastosowana.`,
        error: "Nie udało się pobrać lub sprawdzić aktualizacji Reborn. Możesz grać dalej; ponowimy próbę przy następnym uruchomieniu."
      },
      pt: {
        downloading: "Baixando uma atualização do Reborn. Você pode continuar jogando.",
        restart: "Atualização do Reborn baixada e verificada. Reinicie o jogo quando quiser para aplicá-la.",
        applied: `Atualização ${revision} do Reborn aplicada.`,
        error: "Não foi possível baixar ou verificar a atualização do Reborn. Você pode jogar; nova tentativa na próxima inicialização."
      },
      tr: {
        downloading: "Reborn güncellemesi indiriliyor. Oynamaya devam edebilirsiniz.",
        restart: "Reborn güncellemesi indirildi ve doğrulandı. Uygulamak için uygun olduğunuzda oyunu yeniden başlatın.",
        applied: `Reborn ${revision} güncellemesi uygulandı.`,
        error: "Reborn güncellemesi indirilemedi veya doğrulanamadı. Oynamaya devam edebilirsiniz; sonraki açılışta yeniden denenecek."
      }
    };
    return (messages[String(language).slice(0, 2)] || messages.en)[kind] || "";
  }

  let cachedPortCaption = "";
  let splashVersionAnchor={x:.5,y:.34},splashAnchorReady=false;
  function locateSplashVersion() {
    if(splashAnchorReady)return splashVersionAnchor;
    try {
      const type=cls(img,"SplashWin"),values=ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type").invoke(type.type.object);
      for(let i=0;i<values.length;i++) {
        const self=values.get(i);if(!call(call(self,"get_gameObject"),"get_activeInHierarchy"))continue;
        const logo=self.field("_logoImage").value,rect=call(logo,"get_rectTransform"),bounds=call(rect,"get_rect");
        const point=unityStruct("UnityEngine.Vector3",{x:Number(bounds.field("m_XMin").value)+Number(bounds.field("m_Width").value)/2,
          y:Number(bounds.field("m_YMin").value)-12,z:0});
        const world=call(rect,"TransformPoint",point),canvas=call(logo,"get_canvas");
        let camera=null;try{camera=call(canvas,"get_worldCamera");}catch(_){}
        const screen=ucls("UnityEngine.RectTransformUtility").method("WorldToScreenPoint",2).invoke(camera,world),size=chatScreen();
        const x=Number(screen.field("x").value)/size.width,y=Number(screen.field("y").value)/size.height;
        if(x>.1&&x<.9&&y>.1&&y<.9){splashVersionAnchor={x,y:Math.max(.34,y)};splashAnchorReady=true;log("loading version: anchored below native SplashWin logo");}
        break;
      }
    }catch(_){}
    return splashVersionAnchor;
  }
  function portVersionCaption() {
    if (cachedPortCaption) return cachedPortCaption;
    let build = "legacy";
    try {
      const setup = JSON.parse(readTextFile(`${persistentPath()}/tesl-reborn-setup.json`) || "{}");
      if (Number.isSafeInteger(setup.androidBuild)) build = String(setup.androidBuild);
    } catch (_) {}
    const revision = globalThis.TeslRebornUpdater?.current()?.revision;
    return cachedPortCaption = `Reborn ${PLUGIN_VERSION}\nAndroid · APK ${build} · patch ${Number.isSafeInteger(revision) ? revision : "embedded"}`;
  }

  function noticeCanvasProperty(canvas, name, value?: number) {
    const method = canvas.tryMethod(name, value === undefined ? 0 : 1);
    if (!method) {
      const error: any = new Error(`Notice Canvas managed binding unavailable: ${name}`);
      error.noticeCanvasUnavailable = true;
      throw error;
    }
    if (value === undefined) return method.invoke();
    const type = method.parameters[0].type.class;
    return method.invoke(type.isEnum ? enumBox(type, value) : value);
  }

  function uiSystemText(go, text, size) {
    // Prefer Unity's built-in Arial before language assets arrive. Stripped
    // legacy UI APIs fall back to the same TMP path used by the working chat.
    let label = null;
    try {
      const type=ucls("UnityEngine.UI.Text");
      if (!type.tryMethod("set_font",1)) throw Error("Legacy Text setters stripped");
      const font = ucls("UnityEngine.Resources").method("GetBuiltinResource")
        .overload("System.Type", "System.String").invoke(ucls("UnityEngine.Font").type.object, Il2Cpp.string("Arial.ttf"));
      if (isNull(font)) throw Error("Built-in notice font is unavailable");
      label = uiAdd(go, "UnityEngine.UI.Text");
      call(label, "set_font", font); call(label, "set_fontSize", size);
      call(label, "set_raycastTarget", false); call(label, "set_supportRichText", false);
      call(label, "set_alignment", uiEnum("UnityEngine.TextAnchor", "MiddleCenter"));
      call(label, "set_color", rgba(1, 1, 1, 1)); call(label, "set_text", Il2Cpp.string(text));
      return label;
    } catch (_) {
      if(label) try {ucls("UnityEngine.Object").method("Destroy").overload("UnityEngine.Object").invoke(label);} catch(_){}
      return uiText(go,text,size);
    }
  }
  function noticeTextLayout(label, right = false) {
    const tmp = label.class.type.name === "TMPro.TextMeshProUGUI";
    call(label,"set_alignment",uiEnum(tmp ? "TMPro.TextAlignmentOptions" : "UnityEngine.TextAnchor",
      right ? (tmp ? "Right" : "MiddleRight") : (tmp ? "Center" : "MiddleCenter")));
    if(!right) {
      const options=tmp ? [["set_enableAutoSizing",true],["set_fontSizeMin",18],["set_fontSizeMax",22]]
        : [["set_resizeTextForBestFit",true],["set_resizeTextMinSize",18],["set_resizeTextMaxSize",22]];
      for(const [name,value] of options) label.tryMethod(String(name),1)?.invoke(value);
    }
  }

  function isLoadingVersionScreen(sceneName, names) {
    const loading=/^(?:.*[\/ _-])?(?:loading|bootstrap|splash)(?:screen|scene|canvas|win|controller)?(?:\(clone\))?$/i;
    return loading.test(String(sceneName||"")) || names.some(name=>loading.test(String(name)));
  }
  let startupVersionComplete=false,startupReadyHooked=false;
  let versionScreenCheck=0,versionScreenState={visible:false,scene:""};
  function installStartupVersionTracking() {
    try {
      const owner=img.classes.find(c=>c.name==="MainMenuNavManager");
      const init=owner?.methods.find(m=>m.name==="Init" && !m.isStatic && !m.virtualAddress.isNull());
      if(init) {Interceptor.attach(init.virtualAddress,{onLeave(){startupVersionComplete=true;versionScreenCheck=0;}});startupReadyHooked=true;}
    }catch(error){log(`loading version readiness: ${error}`);}
  }
  function startupVersionVisible(scene,ready) {
    return !ready && !/^(?:mainmenu|battle|match|gameboard|login)$/i.test(String(scene||""));
  }
  function loadingVersionState() {
    if(Date.now()<versionScreenCheck)return versionScreenState;
    versionScreenCheck=Date.now()+500;
    let scene="",names=[];
    try {const value=ucls("UnityEngine.SceneManagement.SceneManager").method("GetActiveScene",0).invoke();scene=String(value.method("get_name",0).invoke()?.content||"");}catch(_){}
    try {
      const find=ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type");
      for(const owner of img.classes.filter(c=>/^(?:LoadingScreen|LoadingWin|LoadingScreenController|GameLoadingScreen)$/.test(c.name)
        && Array.from(c.hierarchy()).some(base=>base.type.name==="UnityEngine.Component"))) {
        const values=find.invoke(owner.type.object);
        for(let i=0;i<values.length;i++){const go=call(values.get(i),"get_gameObject");if(call(go,"get_activeInHierarchy"))names.push(String(call(go,"get_name")?.content||owner.name));}
      }
    }catch(_){}
    // The splash component disappears while Unity is still loading resources.
    // Keep the version until real menu initialization, rather than that splash's lifetime.
    if(!startupVersionComplete && !startupReadyHooked)try {
      const owner=img.classes.find(c=>c.name==="MainMenuNavManager");
      if(owner) {
        const values=ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type").invoke(owner.type.object);
        for(let i=0;i<values.length;i++) {
          const go=call(values.get(i),"get_gameObject");
          if(call(go,"get_activeInHierarchy") && Number(call(call(go,"get_transform"),"get_childCount"))>0)startupVersionComplete=true;
        }
      }
    }catch(_){}
    return versionScreenState={visible:startupVersionVisible(scene,startupVersionComplete),scene};
  }

  function createUpdateBanner() {
    let root = null, label = null, canvas = null, panel = null, badge = null, badgeText = null;
    let disabled = false, canvasScale = 1, nested = false, hostRetryAt = 0, hostReportAt = 0;
    let hostKey = "", hostCheckAt = 0, shownVersion = null, hostRoots = [];
    let message = null, shownAt = 0, lastError = "";
    const unityObject = ucls("UnityEngine.Object");
    // Unity's own null check: a destroyed object compares equal to null
    // without throwing, so nothing is called on it.
    const alive = value => !isNull(value) && !unityObject.method("op_Equality").invoke(value, NULL);
    // The live root Canvas that covers the screen: ScreenSpaceOverlay (0) or
    // ScreenSpaceCamera (1), overlay first, then the highest sorting. The
    // game's whole UI is one camera-space root, CanvasRoot:1/1 (report 26);
    // WorldSpace (2) is not the screen and never hosts the notice.
    function overlayHost() {
      const values = ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type")
        .invoke(ucls("UnityEngine.Canvas").type.object);
      let host = null, rank = -Infinity;
      const seen = hostRoots = [];
      for (let i = 0; i < values.length; i++) {
        const candidate = values.get(i);
        if (!alive(candidate) || !call(candidate, "get_isRootCanvas")) continue;
        const go = call(candidate, "get_gameObject");
        if (!call(go, "get_activeInHierarchy")) continue;
        const mode = enumVal(call(candidate, "get_renderMode")), sorting = Number(call(candidate, "get_sortingOrder"));
        seen.push(`${String(call(go, "get_name")?.content || "?")}:${mode}/${sorting}`);
        if (mode !== 0 && mode !== 1) continue;
        const score = (mode === 0 ? 1e6 : 0) + sorting;
        if (score >= rank) { host = candidate; rank = score; }
      }
      // Without a host, name the live root canvases and their render modes
      // (0 overlay, 1 camera, 2 world), at most every 30 s.
      if (!host && Date.now() >= hostReportAt) {
        hostReportAt = Date.now() + 30000;
        log(`update notice: no screen Canvas to host it; live roots ${seen.slice(0, 12).join(", ") || "none"}`);
      }
      return host;
    }
    let reportedCaption = "",badgeBackground=null,gradientTexture=null,gradientSprite=null;
    function discard() {
      if (root) {
        try { ucls("UnityEngine.Object").method("Destroy").overload("UnityEngine.Object").invoke(root.target); } catch (_) {}
        root.free();
      }
      for(const asset of [gradientSprite,gradientTexture])if(asset)try{ucls("UnityEngine.Object").method("Destroy").overload("UnityEngine.Object").invoke(asset);}catch(_){}
      gradientTexture=gradientSprite=badgeBackground=null;
      root = label = canvas = panel = badge = badgeText = null;
    }
    function ensure(wanted) {
      if (disabled) return;
      let better = null;
      if (root) {
        // A banner nested in a game Canvas goes away with that Canvas's scene.
        if (!alive(root.target)) discard();
        else {
          // The host is chosen as soon as one exists, and a loading screen may
          // put a later screen Canvas above it (report 27: built under
          // CanvasRoot, yet never seen). While the badge or a message should
          // show, move to a better host when one appears.
          if (!nested || !wanted || Date.now() < hostCheckAt) return;
          hostCheckAt = Date.now() + 2000;
          better = overlayHost();
          if (!better || better.handle.toString() === hostKey) return;
          discard();
        }
      }
      // This player strips Canvas.set_renderMode, and a new root Canvas does
      // not render as an overlay (report 24); since OTA 69 that hid the
      // version badge and the update banner. Our own object then goes under
      // the game's overlay Canvas as a nested Canvas sorted above it - the
      // mechanism that raises the friends button. Game UI is never moved.
      // Without a host yet (early startup), look again in 2 s, building nothing.
      nested = !ucls("UnityEngine.Canvas").tryMethod("set_renderMode", 1);
      let host = better;
      if (nested && !host) {
        if (Date.now() < hostRetryAt) return;
        host = overlayHost();
        if (!host) { hostRetryAt = Date.now() + 2000; return; }
      }
      if (host) { hostKey = host.handle.toString(); hostCheckAt = Date.now() + 2000; }
      // The first frame may precede the game's fonts. Keep the message queued
      // and retry later instead of delaying authentication or failing startup.
      const go = newWith(ucls("UnityEngine.GameObject"), Il2Cpp.string("RebornUpdateNotice"),
        Il2Cpp.array(Il2Cpp.corlib.class("System.Type"), [ucls("UnityEngine.RectTransform").type.object]));
      root = go.ref(false);
      try {
        canvas = uiAdd(go, "UnityEngine.Canvas");
        if (!nested) {
          noticeCanvasProperty(canvas, "set_renderMode", 0); // Unity ScreenSpaceOverlay.
          noticeCanvasProperty(canvas, "set_sortingOrder", 32760);
          noticeCanvasProperty(canvas, "set_scaleFactor", 1);
          canvasScale = 1;
        } else {
          // A camera-space host is only drawn for the layers its camera
          // culls in (UI); a new GameObject sits on layer 0 and every child
          // made by uiNew copies its parent's layer. Report 28: shown under
          // CanvasRoot for 20 s, never drawn. Take the host's layer first.
          call(go, "set_layer", Number(call(call(host, "get_gameObject"), "get_layer")));
          call(go, "get_transform").method("SetParent").overload("UnityEngine.Transform", "System.Boolean").invoke(call(host, "get_transform"), false);
          uiStretch(uiRect(go));
          noticeCanvasProperty(canvas, "set_overrideSorting", true);
          noticeCanvasProperty(canvas, "set_sortingOrder", 32760);
          canvasScale = Number(call(host, "get_scaleFactor")) || 1;
          log(`update notice: nested under ${String(call(call(host, "get_gameObject"), "get_name")?.content || "?")} (order ${Number(call(host, "get_sortingOrder"))}); live roots ${hostRoots.slice(0, 12).join(", ")}`);
        }
        // No CanvasScaler or CanvasGroup: both may lose unused setters in this
        // mobile player. Every graphic is non-raycastable and has no handlers.
        panel = uiNew("Banner", call(go, "get_transform"));
        const background = uiAdd(panel, "UnityEngine.UI.Image");
        call(background, "set_color", rgba(0.09, 0.11, 0.14, 0.95));
        call(background, "set_raycastTarget", false);
        const text = uiNew("Message", call(panel, "get_transform"));
        uiStretch(uiRect(text));
        call(uiRect(text), "set_offsetMin", vec2(16, 10));
        call(uiRect(text), "set_offsetMax", vec2(-16, -10));
        label = uiSystemText(text, "", 22);
        noticeTextLayout(label);
        badge = uiNew("PortVersion", call(go, "get_transform"));
        badgeBackground=uiAdd(badge,"UnityEngine.UI.Image");call(badgeBackground,"set_raycastTarget",false);
        call(badgeBackground,"set_color",rgba(0,0,0,.8));
        // Render the same fade with UI strips; Sprite.Create overloads are
        // stripped in this Android player. No texture or fallback rectangle.
        call(badgeBackground,"set_color",rgba(0,0,0,0));
        for(let i=0;i<32;i++){
          const strip=uiNew("Fade"+i,call(badge,"get_transform")),rect=uiRect(strip);
          call(rect,"set_anchorMin",vec2(i/32,0));call(rect,"set_anchorMax",vec2((i+1)/32,1));
          call(rect,"set_offsetMin",vec2(0,0));call(rect,"set_offsetMax",vec2(0,0));
          const graphic=uiAdd(strip,"UnityEngine.UI.Image"),t=(i+.5)/32;
          call(graphic,"set_color",rgba(0,0,0,Math.min(1,Math.min(t,1-t)*3)*.8));call(graphic,"set_raycastTarget",false);
        }
        const badgeLabel=uiNew("RebornPluginVersion",call(badge,"get_transform"));uiStretch(uiRect(badgeLabel));
        badgeText = uiSystemText(badgeLabel, "", 26);
        try{call(badgeText,badgeText.class.type.name==="TMPro.TextMeshProUGUI"?"set_richText":"set_supportRichText",true);}catch(_){}
        call(badgeText,"set_alignment",uiEnum(badgeText.class.type.name==="TMPro.TextMeshProUGUI"?"TMPro.TextAlignmentOptions":"UnityEngine.TextAnchor",badgeText.class.type.name==="TMPro.TextMeshProUGUI"?"Center":"MiddleCenter"));
        call(badgeText, "set_color", rgba(1, 1, 1, 1));
        // DontDestroyOnLoad only applies to root objects.
        if (!nested) ucls("UnityEngine.Object").method("DontDestroyOnLoad").overload("UnityEngine.Object").invoke(go);
        call(panel, "SetActive", false);
        // No GraphicRaycaster, event handlers or buttons: all taps pass through.
      } catch (error) {
        if ((error as any)?.noticeCanvasUnavailable) disabled = true;
        discard();
        throw error;
      }
    }
    return {
      show(kind, revision, onShown) {
        message = { kind, revision, onShown, duration: kind === "restart" ? 10000 : 6000 };
        shownAt = 0;
      },
      tick() {
        if (disabled) return;
        if (message && shownAt && Date.now() - shownAt >= message.duration) {
          try { if (panel) call(panel, "SetActive", false); } catch (_) { discard(); }
          message = null;
        }
        try {
          const versionScreen=loadingVersionState();
          ensure(versionScreen.visible || Boolean(message));
          // No host yet: nothing was built; the message stays queued (report 25:
          // this tick went on with a null Canvas and never got past it).
          if (!root) return;
          const screen = chatScreen();
          // A nested Canvas takes the host's scale; only a root one sets it.
          const scale = nested ? Math.max(0.1, Number(call(call(canvas, "get_rootCanvas"), "get_scaleFactor")) || canvasScale)
            : Math.max(0.1, Math.min(screen.width / 1280, screen.height / 720));
          if (nested) canvasScale = scale;
          else if (Math.abs(scale - canvasScale) >= 0.01) {
            noticeCanvasProperty(canvas, "set_scaleFactor", scale);
            canvasScale = scale;
          }
          const width = Math.min(1000, screen.width / scale - 32);
          let top = 16;
          try {
            const safe = ucls("UnityEngine.Screen").method("get_safeArea", 0).invoke();
            top += Math.max(0, screen.height - Number(call(safe, "get_yMax"))) / scale;
          } catch (_) {}
          const badgeAnchor=locateSplashVersion();
          uiPlace(badge,badgeAnchor.x,badgeAnchor.y,0.5,1,0,0,Math.min(620,Math.max(240,width)),72);
          call(badge,"SetActive",versionScreen.visible);
          // The status file keeps only the last state; the log keeps each change.
          if (shownVersion !== versionScreen.visible) {
            shownVersion = versionScreen.visible;
            log(`loading version: ${versionScreen.visible ? "shown" : "hidden"} (scene "${versionScreen.scene}")`);
          }
          const caption = portVersionCaption();
          call(badgeText, "set_text", Il2Cpp.string(caption.replace("\nAndroid", "\n<size=20>Android")+"</size>"));
          const signature=caption+":"+versionScreen.visible+":"+versionScreen.scene;
          if (signature !== reportedCaption) {
            reportedCaption = signature;
            try { writeTextFile(`${persistentPath()}/tesl-reborn-ui-status.json`, JSON.stringify({ version: caption, visible: versionScreen.visible, scene:versionScreen.scene, at: new Date().toISOString() })); } catch (_) {}
          }
          if (!message) { lastError = ""; return; }
          uiPlace(panel, 0.5, 1, 0.5, 1, 0, -top, Math.max(240, width), 92);
          call(label, "set_text", Il2Cpp.string(updateNoticeText(message.kind, message.revision, resourceLanguage())));
          call(panel, "SetActive", true);
          if (!shownAt) shownAt = Date.now();
          else if (message.onShown) { const acknowledge = message.onShown; message.onShown = null; acknowledge(); }
          lastError = "";
        } catch (error) {
          const detail = String(error);
          if (detail !== lastError) {
            log(`update notice: ${detail}`); lastError = detail;
            try { writeTextFile(`${persistentPath()}/tesl-reborn-ui-status.json`, JSON.stringify({ error: detail.slice(0,300), at: new Date().toISOString() })); } catch (_) {}
          }
        }
      }
    };
  }

  function installUpdateNotices(updater) {
    installStartupVersionTracking();
    const banner = createUpdateBanner();
    const noticeFile = `${persistentPath()}/tesl-reborn-update-notice.json`;
    const read = path => { try { return JSON.parse(readTextFile(path) || "null"); } catch (_) { return null; } };
    const notices = createUpdateNotices(updater, {
      readNotice: () => read(noticeFile),
      readStatus: () => read(`${persistentPath()}/tesl-reborn-update-status.json`),
      writeNotice: value => {
        try { if (writeTextFile(noticeFile + ".part", JSON.stringify(value))) atomicRename(noticeFile + ".part", noticeFile); } catch (_) {}
      },
      emit: (kind, revision, onShown) => banner.show(kind, revision, onShown)
    });
    let nextPoll = 0, queued = false;
    Interceptor.attach(cls(img, "SparkleServices.ServicesManager").method("Update", 0).virtualAddress, {
      onLeave() {
        if (queued || Date.now() < nextPoll) return;
        queued = true; nextPoll = Date.now() + 250;
        schedule(0, () => {
          queued = false;
          try { notices.poll(); banner.tick(); } catch (error) { log(`update notice poll: ${error}`); }
        });
      }
    });
    // Public HTTPS requests need no account token. Never wait for this check
    // before starting login, loading resources or entering a match.
    schedule(1000, () => {
      const prelaunch=read(`${persistentPath()}/tesl-reborn-prelaunch-status.json`);
      const age=Date.now()-Number(prelaunch?.checkedAt);
      if(Number.isFinite(age) && age>=0 && age<60000) {log("updater: prelaunch gate handled this start");return;}
      notices.check((url, callback) => httpGet(url, false, callback, true));
    });
  }
  // END android-ui: update-notices

  // BEGIN android-ui: resource-diagnostics
  function rememberShopSnapshot(previous, report) {
    if(!(report.shopImages||[]).some(item=>!/MainMenuLandingWin|Left_Store_BTN/i.test(item.path)))return previous;
    return {at:report.at,images:report.shopImages,events:report.events.filter(item=>/shop|store|pack|bundle|image|texture|sprite/i.test(item.path))};
  }
  // One snapshot per process, a minute after the hook starts (login and the
  // main menu, before a match). A periodic snapshot walked every UI image in
  // the scene on the main thread: 250-490ms every 5s, battles included
  // (report 20), and the last line before a 'setjmp cookie mismatch' abort.
  section("bounded startup resource diagnostics", () => {
    let taken = false, lastShop=null;
    Interceptor.attach(cls(img, "SparkleServices.ServicesManager").method("Update", 0).virtualAddress, {
      onLeave() {
        if (taken || Date.now() - resourceTraceStarted < 60000) return;
        taken = true;
        schedule(0, () => {
          const report:any = {at:new Date().toISOString(),language:resourceLanguage(),
            patch:globalThis.TeslRebornUpdater?.current()?.revision,elapsedMs:Date.now()-resourceTraceStarted,
            events:resourceTrace.slice(),bundles:[]};
          try {
            const manager = cls(img,"AssetBundles.AssetBundleManager");
            for (const field of manager.fields.filter(f=>f.isStatic && /load|bundle|error/i.test(f.name) && /Dictionary/.test(f.type.name))) {
              const item:any = {name:field.name,type:field.type.name};
              try {
                const dictionary = field.value;
                item.count = Number(call(dictionary,"get_Count"));
                const iterator = call(call(dictionary,"get_Keys"),"GetEnumerator");
                item.keys=[];
                try { while(item.keys.length<12 && call(iterator,"MoveNext")) {
                  const key = call(iterator,"get_Current");
                  if(typeof key?.content === "string") item.keys.push(key.content.replace(/[?#].*$/,"").slice(0,160));
                }} finally { try { call(iterator,"Dispose"); } catch(_){} }
              } catch(error) { item.error=String(error).slice(0,120); }
              report.bundles.push(item);
            }
          } catch(error) { report.error=String(error).slice(0,160); }
          // A connected account can still show an empty main menu. Capture
          // component activity, not player text or a speculative scene reset.
          try {
            report.menu=[];
            const find=ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type");
            const owners=img.classes.filter(c=>/^(?:MainMenu|MainMenuNavManager|MainMenuNavComponent|SettingsWin)$/.test(c.name)
              && Array.from(c.hierarchy()).some(base=>base.type.name==="UnityEngine.Component"));
            for(const owner of owners) {
              const values=find.invoke(owner.type.object);
              for(let i=0;i<Math.min(values.length,16) && report.menu.length<32;i++) {
                const component=values.get(i),go=call(component,"get_gameObject"),root=call(go,"get_transform");
                const item:any={type:owner.type.name,name:String(call(go,"get_name")?.content||"").slice(0,120),
                  active:Boolean(call(go,"get_activeInHierarchy")),children:Number(call(root,"get_childCount")),nodes:[]};
                for(let j=0;j<Math.min(item.children,12);j++) {
                  const child=call(call(root,"GetChild",j),"get_gameObject");
                  item.nodes.push({name:String(call(child,"get_name")?.content||"").slice(0,120),active:Boolean(call(child,"get_activeInHierarchy"))});
                }
                report.menu.push(item);
              }
            }
          } catch(error) {report.menuError=String(error).slice(0,160);}
          try {
            report.shopImages=[];
            const images=ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type").invoke(ucls("UnityEngine.UI.Image").type.object);
            for(let i=0;i<images.length && report.shopImages.length<40;i++) {
              const image=images.get(i),go=call(image,"get_gameObject");
              if(!call(go,"get_activeInHierarchy")) continue;
              let node=call(go,"get_transform"),path="";
              for(let depth=0;depth<10 && !isNull(node);depth++,node=call(node,"get_parent")) path=String(call(node,"get_name")?.content||"")+"/"+path;
              if(!/shop|store|packbundle|product/i.test(path)) continue;
              const item:any={path:path.slice(-400)};
              try {const sprite=call(image,"get_sprite");item.sprite=isNull(sprite)?null:String(call(sprite,"get_name")?.content||"");}catch(_){}
              try {const material=call(image,"get_material");item.material=isNull(material)?null:String(call(material,"get_name")?.content||"");
                if(!isNull(material))item.shader=String(call(call(material,"get_shader"),"get_name")?.content||"");}catch(_){}
              report.shopImages.push(item);
            }
          }catch(error){report.shopError=String(error).slice(0,160);}
          try {
            const images=ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type").invoke(ucls("UnityEngine.UI.RawImage").type.object);
            for(let i=0;i<images.length && report.shopImages.length<64;i++) {
              const image=images.get(i),go=call(image,"get_gameObject");if(!call(go,"get_activeInHierarchy"))continue;
              let node=call(go,"get_transform"),path="";
              for(let depth=0;depth<10 && !isNull(node);depth++,node=call(node,"get_parent"))path=String(call(node,"get_name")?.content||"")+"/"+path;
              if(!/shop|store|packbundle|product/i.test(path))continue;
              const item:any={path:path.slice(-400),type:"RawImage"},texture=call(image,"get_texture");
              item.texture=isNull(texture)?null:String(call(texture,"get_name")?.content||"");
              if(!isNull(texture)){item.width=Number(call(texture,"get_width"));item.height=Number(call(texture,"get_height"));}
              report.shopImages.push(item);
            }
          }catch(error){report.shopRawError=String(error).slice(0,160);}
          // Preserve the last actual shop snapshot when navigating to Game Data
          // to share a report; the main-menu Store shortcut is not a shop view.
          lastShop=rememberShopSnapshot(lastShop,report);
          report.lastShop=lastShop;
          writeTextFile(`${persistentPath()}/tesl-reborn-resource-status.json`,JSON.stringify(report));
        }, "resource diagnostics snapshot");
      }
    });
  });
  // END android-ui: resource-diagnostics

  // BEGIN android-ui: display-diagnostics
  function redundantSettingsResolution(values, current, inSettings) {
    return inSettings && values.length>=3 && values[0]===current.width && values[1]===current.height
      && typeof values[2]==="boolean"
      && (values.length===3 || values.length===4 && values[3]===0);
  }
  function createDisplayTrace(write) {
    let events=[],last="";
    return (kind,values)=>{
      const key=kind+JSON.stringify(values);if(kind==="sample" && key===last)return;
      last=key;events.push({at:Date.now(),kind,...values});if(events.length>60)events.shift();
      write({schema:1,patch:globalThis.TeslRebornUpdater?.current()?.revision,events:events.slice()});
    };
  }
  section("Settings display diagnostics",()=>{
    let watchUntil=0,root=null;
    let pendingReport=null,flushQueued=false,lastFlush=0,lastDimensions="";
    function flushDisplay() {
      flushQueued=false;if(!pendingReport)return;
      writeTextFile(`${persistentPath()}/tesl-reborn-display-status.json`,JSON.stringify(pendingReport));
      pendingReport=null;lastFlush=Date.now();
    }
    const trace=createDisplayTrace(value=>{
      // Keep every changed frame in memory, but batch disk writes so tracing
      // does not add a synchronous write to every frame of a close animation.
      pendingReport=value;
      if(Date.now()-lastFlush>=100)flushDisplay();
      else if(!flushQueued){flushQueued=true;schedule(100,flushDisplay,"display flush");}
      const event=value.events[value.events.length-1],dimensions=event.width+"x"+event.height;
      if(event.kind!=="sample" || dimensions!==lastDimensions)log(`settings display: ${JSON.stringify(event)}`);
      lastDimensions=dimensions;
    });
    function capture() {
      const screen=chatScreen(),value:any={width:screen.width,height:screen.height};
      if(root)try {
        const go=root.target,transform=call(go,"get_transform");value.active=Boolean(call(go,"get_activeInHierarchy"));
        const scale=call(transform,"get_localScale");value.localScale=["x","y","z"].map(k=>Number(scale.field(k).value));
        const world=call(transform,"get_lossyScale");value.worldScale=["x","y","z"].map(k=>Number(world.field(k).value));
        value.parents=[];
        for(let node=call(transform,"get_parent"),depth=0;depth<4 && !isNull(node);depth++,node=call(node,"get_parent")) {
          const scale=call(node,"get_localScale");
          value.parents.push({name:String(call(node,"get_name")?.content||"").slice(0,80),scale:["x","y","z"].map(k=>Number(scale.field(k).value))});
        }
        const rect=call(transform,"get_rect");value.rect=[Number(rect.field("m_Width").value),Number(rect.field("m_Height").value)];
        const canvas=go.method("GetComponentInParent").overload("System.Type").invoke(ucls("UnityEngine.Canvas").type.object);
        if(!isNull(canvas))value.canvasScale=Number(call(canvas,"get_scaleFactor"));
      }catch(_){}
      trace("sample",value);
    }
    const seen=new Set();
    for(const method of ucls("UnityEngine.Screen").methods.filter(m=>m.name==="SetResolution" && m.isStatic && m.parameterCount>=2)) {
      const key=method.virtualAddress.toString();if(method.virtualAddress.isNull()||seen.has(key))continue;seen.add(key);
      // The bridge accounts for the legacy static instance slot. Raw args[0]
      // was that null slot, not the requested width on this Unity player.
      if(![3,4].includes(method.parameterCount) || method.parameters[2].type.name!=="System.Boolean")continue;
      method.implementation=function(...values) {
        const settings=Boolean(root) && Date.now()<watchUntil || resourceSettingsOpen();
        let skip=false;
        try {const screen=chatScreen();skip=redundantSettingsResolution(values,{
          width:screen.width,height:screen.height,fullscreen:null
        },settings);}catch(_){}
        watchUntil=Date.now()+2000;
        trace(skip?"SetResolution-skipped":"SetResolution",{width:values[0],height:values[1],fullscreen:values[2],
          refreshRate:values.length===4?values[3]:null,signature:method.parameters.map(p=>p.type.name).join(",")});
        if(skip)return;
        return method.invoke(...values);
      };
    }
    Interceptor.attach(cls(img,"SparkleServices.ServicesManager").method("Update",0).virtualAddress,{onLeave(){
      try {
        const now=Date.now();
        if(resourceSettingsOpen() && Number(ucls("UnityEngine.Input").method("get_touchCount",0).invoke())>0) {
          watchUntil=now+2000;
          if(!root)root=resourceSettingsWindow.target.ref(false);
        }
        if(now<watchUntil)capture();
        else if(root){root.free();root=null;}
      }catch(_){}
    }});
    log(`settings display: observing ${seen.size} resolution methods; per-frame samples after Settings touch`);
  });
  // END android-ui: display-diagnostics

  // BEGIN android-ui: unity-error-log
  let unityLogCallbackRef = null;
  section("persistent Unity errors", () => {
    const application = ucls("UnityEngine.Application");
    const subscribe = application.tryMethod("add_logMessageReceivedThreaded", 1);
    if (subscribe && !subscribe.virtualAddress.isNull()) {
      const delegate = Il2Cpp.delegate(subscribe.parameters[0].type.class, (message, stack, value) => {
        const kind = enumVal(value);
        if ([0,1,2,4].includes(kind)) log(`Unity ${kind}: ${message?.content || ""}\n${stack?.content || ""}`);
      });
      unityLogCallbackRef = delegate.ref(false);
      subscribe.invoke(delegate);
      return;
    }
    const callback = application.tryMethod("CallLogCallback", 4);
    if (!callback || !callback.isStatic || callback.virtualAddress.isNull()) return;
    Interceptor.attach(callback.virtualAddress, { onEnter(args) {
      const kind = args[2].toInt32();
      if (![0,1,2,4].includes(kind)) return;
      try {
        const message = args[0].isNull() ? "" : new Il2Cpp.String(args[0]).content || "";
        const stack = args[1].isNull() ? "" : new Il2Cpp.String(args[1]).content || "";
        log(`Unity ${kind}: ${message}\n${stack}`);
      } catch (_) {}
    }});
  });
  // END android-ui: unity-error-log

  // BEGIN android-ui: channel-migration
  // The test channel moved from the Solomag fork to a branch of the main
  // repository. Phones keep the feed the launcher wrote on first start
  // (UpdateConfig only fills an empty one), so a new APK cannot move them;
  // this OTA, still published to the fork, rewrites the old fork feed once.
  // Applies from the next start; the current session finishes on the old one.
  const LEGACY_TEST_FEED = "https://raw.githubusercontent.com/Solomag/tesl-reborn-android/android-ui-and-update-loader/updates/test/manifest.json";
  const MAIN_TEST_FEED = "https://raw.githubusercontent.com/ssorgatem/tesl-reborn-android/android-ui-and-update-loader/updates/test/manifest.json";
  function migrateUpdateChannel(io) {
    let config;
    try { config = JSON.parse(io.read() || "null"); } catch (_) { return "unreadable"; }
    if (!config || typeof config !== "object" || config.feedUrl !== LEGACY_TEST_FEED) return "unchanged";
    config.feedUrl = MAIN_TEST_FEED;
    return io.write(JSON.stringify(config)) ? "migrated" : "write-failed";
  }
  // END android-ui: channel-migration

  section("Reborn Android updater and diagnostics", () => {
    try {
      const path = `${persistentPath()}/tesl-reborn-updater.json`;
      const result = migrateUpdateChannel({
        read: () => readTextFile(path),
        write: text => writeTextFile(path + ".part", text) && atomicRename(path + ".part", path)
      });
      if (result !== "unchanged") log(`updater: channel migration ${result}${result === "migrated" ? " to the main repository test branch" : ""}`);
    } catch (error) { log(`updater: channel migration failed: ${error}`); }
    const uriClass = ucls("System.Uri");
    log(`HTTP URI assembly: ${uriClass.image.name}`);
    log("Android feature hooks are active; server data and UI results are checked separately");
    const updater = globalThis.TeslRebornUpdater;
    if (updater) {
      updater.ready();
      try { installUpdateNotices(updater); }
      catch (error) {
        log(`update notices unavailable: ${error}`);
        schedule(1000, () => updater.check((url, cb) => httpGet(url, false, cb, true)));
      }
    }
  });

  log("setup finished");
});
