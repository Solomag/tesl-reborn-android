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
const PROGRESS_BYTES = 256 * 1024 * 1024;   // payload copy: one progress line per this many bytes

let androidLogWrite: NativeFunction<number, [number, NativePointer, NativePointer]> | null = null;
try {
  androidLogWrite = new NativeFunction(
    (Process as any).getModuleByName("liblog.so").getExportByName("__android_log_write"),
    "int", ["int", "pointer", "pointer"]);
} catch (e) { console.log(`${TAG} no liblog: ${e}`); }
const tagPtr = Memory.allocUtf8String("tesl-hook");
const log = (m: string, prio = 4) => {      // prio: android log priority, 4 = info, 6 = error
  console.log(`${TAG} ${m}`);
  try { androidLogWrite?.(prio, tagPtr, Memory.allocUtf8String(m.length > 900 ? m.slice(0, 900) + "..." : m)); } catch (_) {}
};
// Masks secrets in logged JSON bodies (a quoted string is non-quote-non-backslash characters or backslash pairs) and header dumps.
const SECRET_JSON = /("(?:password|encryptedAppTicket|token|sessionToken)"\s*:\s*")(?:[^"\\]|\\.)*"/g;
const SECRET_HEADER = /((?:authorization|token|sessiontoken)\s*:\s*)[^\r\n]*/gi;
const maskSecrets = (t: string): string => t.replace(SECRET_JSON, '$1***"').replace(SECRET_HEADER, "$1***");
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

// A managed enum field reads back as a value type; dig the number out of it.
function enumVal(v: any): number {
  if (v == null) return -1;
  if (typeof v === "number") return v;
  try { return Number((v as any).field("value__").value); } catch (_) { return -1; }
}

// Calls a managed delegate whose single parameter is a 32-bit value (e.g. Action<ResultCode>), through Invoke so static and multicast delegates work too.
function invokeDelegateInt(del: Il2Cpp.Object, value: number) {
  new Il2Cpp.Object(del.handle).method("Invoke").invoke(value);
}

function nested(image: Il2Cpp.Image, outer: string, inner: string): Il2Cpp.Class {
  const c = image.classes.find(k => k.name === inner && k.declaringClass?.name === outer);
  if (!c) throw new Error(`class ${outer}/${inner} not found`);
  return c;
}

function channelFrom(settings: Il2Cpp.Object | null): string {
  try {
    if (settings && !settings.handle.isNull()) {
      const names = settings.field<Il2Cpp.Array<Il2Cpp.String>>("_channelNames").value;
      const idx = enumVal(settings.field<any>("_channel").value);
      if (idx < 0) throw new Error("the channel field is unreadable");
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
    return maskSecrets(t);
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

function section(name: string, fn: () => void, critical = false) {
  try { fn(); log(`OK   ${name}`); }
  catch (e) {
    if (critical) log(`FAIL ${name}: ${e} - login will not work without this section`, 6);
    else log(`FAIL ${name}: ${e}`);
  }
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
  new Il2Cpp.Object(del.handle).method("Invoke").invoke(value);
}

const CREATE_ACCOUNT = false;            // the plugin sends false; flip to true if the server says "account not found"

Il2Cpp.perform(() => {
  const img = Il2Cpp.domain.assembly("Assembly-CSharp").image;
  log(`attached, Unity ${Il2Cpp.unityVersion}, hook build plugin-parity-7`);
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
    body.field<Il2Cpp.String>("language").value = language;
    body.field<Il2Cpp.String>("steamId").value = Il2Cpp.string("");
    body.field<Il2Cpp.String>("encryptedAppTicket").value = Il2Cpp.string(fakeTicket());
    postLogin.invoke(body, endpoint, Il2Cpp.string("bnetSteamLogin"), NULL, cb);
  }
  function sendLink(sessionAuth: Il2Cpp.Object, language: Il2Cpp.String, settings: Il2Cpp.Object | null, endpoint: Il2Cpp.String, cb: Il2Cpp.Object) {
    const body = linkReq.new();
    fillBase(body, channelFrom(settings));
    body.field<Il2Cpp.String>("loginPlatform").value = Il2Cpp.string(LOGIN_PLATFORM);
    body.field<Il2Cpp.String>("bnetKeyPlatform").value = Il2Cpp.string(LOGIN_PLATFORM);
    body.field<Il2Cpp.String>("language").value = language;
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
  }, true);

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
  }, true);

  // 1c) Make every auth request look like the Windows client. The server expects a Windows PC client; Android
  //     values such as componentType "android" are the prime suspects for its HTTP 500 on username/password login.
  //     The body is rewritten by the hook in the "http header" section below, which runs on the HTTP worker
  //     thread right before the request is written to the socket. It has to be done there and not in
  //     HTTPRequest.Send(): a request that the game creates from within our own callback (the auto login)
  //     would escape the Send() interceptor completely, because Frida cannot run a nested interceptor
  //     callback while our callback is still on the stack.
  const overrides = loadOverrides();
  const byteClass = Il2Cpp.corlib.class("System.Byte");

  // Rewrites the JSON body of an auth request so that the service sees a Windows client.
  function rewriteAuthBody(req: Il2Cpp.Object, uri: string): void {
    try {
      if (uri.indexOf("/api/account/") < 0) return;
      const raw = call(req, "get_RawData");
      if (!raw || raw.handle.isNull()) { log(`normalizer: ${uri.split("/").pop()} has no body`); return; }
      const len = Number(raw.length);
      let bin = "";
      for (let i = 0; i < len; i++) bin += String.fromCharCode(Number(raw.get(i)));
      const obj = JSON.parse(decodeURIComponent(escape(bin)));
      if (typeof obj !== "object" || obj === null || !("componentType" in obj)) {
        log(`normalizer: ${uri.split("/").pop()} has no componentType`);
        return;
      }
      const changed: string[] = [];
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
      const out = unescape(encodeURIComponent(JSON.stringify(obj)));
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
      let text = "";
      for (let i = 0; i < length; i++) text += String.fromCharCode(Number(raw.get(i)));
      const body = JSON.parse(decodeURIComponent(escape(text)));
      if (body && body.username) pendingLogin = { username: String(body.username), password: String(body.password ?? "") };
    } catch (e) { log(`could not read the login: ${e}`); }
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
  let dumpingHeaders = false;             // set by the "http trace" section around DumpHeaders, which calls EnumerateHeaders itself
  section("http header", () => {
    let seen = 0;
    const m = cls(img, "BestHTTP.HTTPRequest").method("EnumerateHeaders", 2);   // (callback, callBeforeSendCallback); the 1-arg overload is an 8-byte stub
    Interceptor.attach(m.virtualAddress, {
      onEnter(args) {
        if (dumpingHeaders) return;
        try {
          const req = new Il2Cpp.Object(args[0]);
          let has = false;
          try { has = Boolean(call(req, "HasHeader", Il2Cpp.string("X-TeslRebornPlugin-Version"))); } catch (_) {}
          if (!has) req.method("AddHeader").invoke(Il2Cpp.string("X-TeslRebornPlugin-Version"), Il2Cpp.string(PLUGIN_VERSION));
          const uri = String(call(req, "get_Uri"));
          captureLogin(req, uri);
          rewriteAuthBody(req, uri);
          if (seen++ < 60) log(`-> ${uri} body: ${bodyOf(req)}`);
        } catch (e) { log(`header hook error: ${e}`); }
      },
    });
  });
  // trace results via CallCallback (runs when a request completes; the state setter is inlined, so it can't be hooked)
  section("http trace", () => {
    let seen = 0;
    Interceptor.attach(cls(img, "BestHTTP.HTTPRequest").method("CallCallback").virtualAddress, {
      onEnter(args) {
        const verbose = seen++ <= 80;       // the log limiter; the login handling below always runs
        if (!verbose && !pendingLogin) return;
        try {
          const req = new Il2Cpp.Object(args[0]);
          const uri = String(call(req, "get_Uri"));
          const state = String(call(req, "get_State"));
          const resp = call(req, "get_Response");
          let info = "no response";
          let status = 0;
          let text = "";
          if (resp && !resp.handle.isNull()) {
            const code = Number(call(resp, "get_StatusCode"));
            status = code;
            try { text = String(call(resp, "get_DataAsText")?.content ?? ""); } catch (_) {}
            info = `status ${code} body: ${maskSecrets(text).replace(/\s+/g, " ").slice(0, 300)}`;
          } else {
            try { info = `exception: ${call(req, "get_Exception")}`; } catch (_) {}
          }
          if (verbose) {
            let sent = "";
            dumpingHeaders = true;
            try { sent = ` sent-headers: ${maskSecrets(String(call(req, "DumpHeaders"))).replace(/\s+/g, " ").slice(0, 300)}`; } catch (_) {}
            finally { dumpingHeaders = false; }
            log(`<- ${state} ${uri} ${info}${sent}`);
          }
          // The credentials are only stored once the service accepted them (HTTP 200 with resultCode 0, or no
          // resultCode and a session token; the failures are 200 with resultCode 15 or 17), and they are dropped
          // again when the service rejects them.
          if (pendingLogin && uri.indexOf("bnetUsernameAndPasswordLogin") >= 0) {
            let resultCode: number | null = null;
            let hasToken = false;
            try {
              const json = JSON.parse(text);
              if (typeof json?.resultCode === "number") resultCode = json.resultCode;
              hasToken = typeof json?.data?.token === "string" && json.data.token.length > 0;
            } catch (_) {}
            if (status === 200 && (resultCode === 0 || (resultCode === null && hasToken))) {
              writeSavedLogin(pendingLogin.username, pendingLogin.password);
              loginRejected = false;
            } else if (status === 200 && resultCode !== null) {
              clearSavedLogin();
              loginRejected = true;
              log(`the service rejected the login (resultCode ${resultCode}), the saved credentials are dropped`);
            } else if (status === 0) {
              log("the login request got no response, the saved credentials are unchanged");
            } else {
              log(`the login answer is not understood (HTTP ${status}), the saved credentials are unchanged`);
            }
            pendingLogin = null;
          }
        } catch (e) { log(`trace error: ${e}`); }
      },
    });
  });

  // 4) Error tracing: the in-game error dialog, and the pubsub websocket / socket.io layer
  const strOf = (p: NativePointer) => { try { return p.isNull() ? "" : String(new Il2Cpp.String(p).content ?? ""); } catch (_) { return "?"; } };
  const msgOf = (p: NativePointer) => { try { return p.isNull() ? "" : String(call(new Il2Cpp.Object(p), "get_Message")); } catch (_) { return "?"; } };
  const byName = (full: string, suffix: string, minParams = 0) => {
    const k = cls(img, full);
    const m = k.methods.find(x => x.name.endsWith(suffix) && !/^(add|remove|set|get)_/.test(x.name) && x.parameterCount >= minParams);   // not an event or property accessor
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
          // The raw arguments are not scanned: a static method passes a MethodInfo* as the last one, which is no object.
          let versionInfo: Il2Cpp.Object | null = null;
          const remote = catalog.field<Il2Cpp.Object>("_remoteBundleVersionInfo").value;
          if (className(remote) === "BundleVersionInfo") versionInfo = remote;
          if (!versionInfo) {
            log("storage modes: no version info found in AssetCatalog._remoteBundleVersionInfo");
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
  //   * StatsPatch - match history with deck names and win/loss, from the
  //     server's /fetchExtendedData endpoint (fetched only; the GetResponseStatusPatch
  //     wait is dropped until a UI that shows the data is ported).
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
    const o = klass.alloc();
    (o.method(".ctor", args.length) as any).invoke(...args);
    return o;
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
  function enumBox(enumClass: Il2Cpp.Class, n: number): Il2Cpp.ValueType {
    const boxed = enumClass.alloc();
    boxed.field<number>("value__").value = n;
    return boxed.unbox();
  }

  // Unity's Vector2 and Color are value types: a setter takes one boxed struct, not separate numbers.
  function vec2(x: number, y: number): Il2Cpp.ValueType {
    const boxed = ucls("UnityEngine.Vector2").alloc();
    boxed.field<number>("x").value = x;
    boxed.field<number>("y").value = y;
    return boxed.unbox();
  }

  function color(r: number, g: number, b: number, a: number): Il2Cpp.ValueType {
    const boxed = ucls("UnityEngine.Color").alloc();
    boxed.field<number>("r").value = r;
    boxed.field<number>("g").value = g;
    boxed.field<number>("b").value = b;
    boxed.field<number>("a").value = a;
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
  function httpGet(url: string, withAuth: boolean, cb: (status: number, body: string) => void) {
    // -1 is the failure sentinel; the reason goes to the log and into the body.
    const done = (status: number, body: string) => {
      if (status === -1) log(`http GET ${url} failed: ${body}`);
      cb(status, body);
    };
    try {
      // System.Uri lives in System.dll, not mscorlib.dll, in this Unity profile.
      const uriClass = Il2Cpp.corlib.tryClass("System.Uri") ?? Il2Cpp.domain.assembly("System").image.class("System.Uri");
      const uri = newWith(uriClass, Il2Cpp.string(url));
      const del = Il2Cpp.delegate(cls(img, "BestHTTP.OnRequestFinishedDelegate"), (req: any, resp: any) => {
        try {
          if (isNull(resp)) {
            let why = "no response";
            try { why += `, state ${call(req, "get_State")}, exception ${call(req, "get_Exception")}`; } catch (_) {}
            done(-1, why);
            return;
          }
          const status = Number(call(resp, "get_StatusCode"));
          let body = "";
          try { body = String(call(resp, "get_DataAsText")?.content ?? ""); } catch (_) {}
          cb(status, body);
        } catch (e) { done(-1, String(e)); }
      });
      // The plugin's constructor (Uri, HTTPMethods, OnRequestFinishedDelegate) with HTTPMethods.Get; the first
      // 2-parameter constructor is only the fallback, as other overloads share its parameter count.
      const requestClass = cls(img, "BestHTTP.HTTPRequest");
      const req = requestClass.alloc();
      const ctor = requestClass.methods.find(m => m.name === ".ctor" && m.parameterCount === 3
        && /HTTPMethods$/.test(String(m.parameters[1]?.type?.name)));
      let built = false;
      if (ctor) {
        try { (ctor.bind(req) as any).invoke(uri, 0, del); built = true; }
        catch (e) { log(`http GET: the 3-parameter constructor failed (${e}), using the 2-parameter one`); }
      }
      if (!built) (req.method(".ctor", 2) as any).invoke(uri, del);
      (req.method("AddHeader") as any).invoke(Il2Cpp.string("Accept"), Il2Cpp.string("application/json"));
      if (withAuth) {
        const token = authToken();
        if (token) (req.method("AddHeader") as any).invoke(Il2Cpp.string("Authorization"), Il2Cpp.string("Bearer " + token));
        else log(`http GET ${url}: no auth token yet, sent without Authorization`);
      }
      (req.method("Send") as any).invoke();
    } catch (e) { done(-1, String(e)); }
  }

  // ---------------------------------------------------------------------
  // EndGameStatePatch / SoloArenaPatch: refresh the rewards after a match.
  // The reborn server never sends the "matchrewards"/"rewards" push notices
  // the original client waited for, so the client asks for them itself.
  // ---------------------------------------------------------------------
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
  let matchEntryData: any[] = [];       // fetched for the match history; nothing reads it yet, and the stats screen does not wait for it

  // Deferred work has to run on the Unity main thread, so it is queued here
  // and executed by the services manager's update loop. The work itself is
  // handed to Unity's synchronisation context: calling managed code straight
  // from inside a hook would nest the interceptor callbacks, and Frida cannot
  // run those (the request would then not be rewritten).
  const pending: { at: number; fn: () => void }[] = [];
  function schedule(delayMs: number, fn: () => void) {
    pending.push({ at: Date.now() + delayMs, fn });
  }
  function runPending() {
    const now = Date.now();
    for (let i = pending.length - 1; i >= 0; i--) {
      if (pending[i].at > now) continue;
      const task = pending.splice(i, 1)[0];
      try {
        Il2Cpp.mainThread.schedule(() => {
          try { task.fn(); } catch (e) { log(`scheduled task failed: ${e}`); }
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
      if (status !== 200) { log(`fetchExtendedData -> HTTP ${status}`); return; }
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
        log(`match history: ${matchEntryData.length} entries`);
      } catch (e) { log(`fetchExtendedData parse error: ${e}`); }
    });
  }

  section("stats and deck statistics", () => {
    // Stats.OnResponse: the statistics arrived, ask for the extended data.
    Interceptor.attach(cls(img, "SparkleServices.Stats").method("OnResponse").virtualAddress, {
      onEnter(args) {
        try {
          const response = new Il2Cpp.Object(args[1]);
          if (enumVal(response.field<any>("resultCode").value) !== 0) return;
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
        onLeave() { schedule(1000, () => refreshDeckStats(true)); },
      });
    }
  });

  // ---------------------------------------------------------------------
  // DeckTileAwakePatch: show the win/loss ratio on every deck tile.
  // ---------------------------------------------------------------------
  const deckTiles = new Set<string>();

  function refreshDeckTileLabels() {
    for (const key of Array.from(deckTiles)) {
      try {
        const tile = new Il2Cpp.Object(ptr(key));
        if (tile.class.name !== "DeckTile") { deckTiles.delete(key); continue; }
        updateDeckTileLabel(tile);
      } catch (_) { deckTiles.delete(key); }
    }
  }

  function updateDeckTileLabel(tile: Il2Cpp.Object) {
    try {
      const transform = call(tile, "get_transform");
      if (isNull(transform)) return;
      const container = call(transform, "Find", Il2Cpp.string("WinLossRatioContainer"));
      if (isNull(container)) return;
      const labelTransform = call(container, "Find", Il2Cpp.string("WinLossRatioLabel"));
      if (isNull(labelTransform)) return;
      const label = (labelTransform as any).method("GetComponent")
        .overload("System.Type").invoke(ucls("UnityEngine.UI.Text").type.object) as Il2Cpp.Object;
      if (isNull(label)) return;
      const stats = deckStats.get(Number(call(tile, "GetDeckId")));
      const text = stats ? `${stats.wins}/${stats.losses} (${winRate(stats.wins, stats.losses)}%)` : "";
      (label.method("set_text") as any).invoke(Il2Cpp.string(text));
      if (stats) {
        // The plate has no layout group, so it is sized from the text, as the desktop plugin does.
        const containerRect = (container as any).method("GetComponent")
          .overload("System.Type").invoke(ucls("UnityEngine.RectTransform").type.object) as Il2Cpp.Object;
        const width = Number(call(label, "get_preferredWidth")) + 10;
        const height = Number(call(label, "get_preferredHeight")) + 5;
        if (!isNull(containerRect)) (containerRect.method("set_sizeDelta") as any).invoke(vec2(width, height));
      }
      const labelObject = call(labelTransform, "get_gameObject");
      if (!isNull(labelObject)) (labelObject.method("SetActive") as any).invoke(stats != null);
    } catch (e) { log(`deck tile label failed: ${e}`); }
  }

  let labelSizeLogged = false;

  function createDeckTileLabel(tile: Il2Cpp.Object) {
    try {
      const nameText = tile.field<Il2Cpp.Object>("DeckNameText").value;
      if (isNull(nameText)) return;
      // The container hangs off the tile root: SetData looks it up there with Transform.Find, which only sees direct children.
      const parent = call(tile, "get_transform");
      if (isNull(parent)) return;

      const gameObject = ucls("UnityEngine.GameObject");
      const rectType = ucls("UnityEngine.RectTransform");
      // A game object with a RectTransform, so it can be laid out.
      const container = newWith(gameObject, Il2Cpp.string("WinLossRatioContainer"),
        Il2Cpp.array(Il2Cpp.corlib.class("System.Type"), [rectType.type.object]));
      const containerTransform = call(container, "get_transform");
      (containerTransform.method("SetParent", 2) as any).invoke(parent, false);
      const containerRect = (container as any).method("GetComponent")
        .overload("System.Type").invoke(rectType.type.object) as Il2Cpp.Object;
      if (!isNull(containerRect)) {
        (containerRect.method("set_anchorMin") as any).invoke(vec2(1, 0));
        (containerRect.method("set_anchorMax") as any).invoke(vec2(1, 0));
        (containerRect.method("set_pivot") as any).invoke(vec2(1, 0));
        (containerRect.method("set_anchoredPosition") as any).invoke(vec2(-3, 2));
      }
      // A black plate behind the numbers.
      const background = newWith(gameObject, Il2Cpp.string("Background"),
        Il2Cpp.array(Il2Cpp.corlib.class("System.Type"), [rectType.type.object]));
      const backgroundTransform = call(background, "get_transform");
      (backgroundTransform.method("SetParent", 2) as any).invoke(containerTransform, false);
      const backgroundImage = (background as any).method("GetComponent")
        .overload("System.Type").invoke(ucls("UnityEngine.UI.Image").type.object) as Il2Cpp.Object;
      const backgroundRect = (background as any).method("GetComponent")
        .overload("System.Type").invoke(rectType.type.object) as Il2Cpp.Object;
      if (!isNull(backgroundRect)) {
        (backgroundRect.method("set_anchorMin") as any).invoke(vec2(0, 0));
        (backgroundRect.method("set_anchorMax") as any).invoke(vec2(1, 1));
        (backgroundRect.method("set_sizeDelta") as any).invoke(vec2(0, 0));
        (backgroundRect.method("set_anchoredPosition") as any).invoke(vec2(0, 0));
      }
      if (!isNull(backgroundImage)) {
        (backgroundImage.method("set_color") as any).invoke(color(0, 0, 0, 0.7));
        (backgroundImage.method("set_raycastTarget") as any).invoke(false);
      }
      // The label itself is a copy of the deck name text, so it uses the
      // same font and style as the rest of the tile.
      // Object.Instantiate(Object, Transform, bool): the (Object, Vector3, Quaternion) overload has the same parameter count.
      const objectClass = ucls("UnityEngine.Object");
      const instantiate = objectClass.methods.find(m => m.name === "Instantiate" && !m.isGeneric && m.parameterCount === 3
        && /Transform$/.test(String(m.parameters[1]?.type?.name))) ?? objectClass.method("Instantiate", 3);
      const label = (instantiate as any).invoke(nameText, containerTransform, false) as Il2Cpp.Object;
      if (isNull(label)) return;
      (label.method("set_name") as any).invoke(Il2Cpp.string("WinLossRatioLabel"));
      (label.method("set_alignment") as any).invoke(5);            // MiddleRight
      // The desktop plugin uses 16, which is tiny on a phone canvas: scale up from the name text the label was cloned from.
      const nameSize = Number(call(label, "get_fontSize"));
      const labelSize = Math.max(16, Math.round(nameSize * 1.3));
      if (!labelSizeLogged) { labelSizeLogged = true; log(`deck tile label font size ${nameSize} -> ${labelSize}`); }
      (label.method("set_fontSize") as any).invoke(labelSize);
      (label.method("set_horizontalOverflow") as any).invoke(1);   // Wrap
      (label.method("set_verticalOverflow") as any).invoke(1);     // Truncate
      (label.method("set_raycastTarget") as any).invoke(false);
      const labelRect = call(label, "get_rectTransform");   // Graphic.rectTransform
      if (!isNull(labelRect)) {
        (labelRect.method("set_anchorMin") as any).invoke(vec2(0, 0));
        (labelRect.method("set_anchorMax") as any).invoke(vec2(1, 1));
        (labelRect.method("set_pivot") as any).invoke(vec2(0.5, 0.5));
        (labelRect.method("set_anchoredPosition") as any).invoke(vec2(0, 0));
        (labelRect.method("set_sizeDelta") as any).invoke(vec2(0, 0));
        (labelRect.method("set_offsetMin") as any).invoke(vec2(5, 2.5));
        (labelRect.method("set_offsetMax") as any).invoke(vec2(-5, -2.5));
      }
      const labelObject = call(label, "get_gameObject");
      if (!isNull(labelObject)) (labelObject.method("SetActive") as any).invoke(false);
    } catch (e) { log(`deck tile label creation failed: ${e}`); }
  }

  section("deck tile win/loss label", () => {
    const deckTile = cls(img, "DeckTile");
    // SetData fills the tile, so the label has to exist afterwards.
    Interceptor.attach(deckTile.method("SetData", 2).virtualAddress, {
      onEnter(args) {
        try {
          this.tile = args[0];
          const tile = new Il2Cpp.Object(args[0]);
          deckTiles.add(tile.handle.toString());
          const transform = call(tile, "get_transform");
          if (isNull(transform)) return;
          const container = call(transform, "Find", Il2Cpp.string("WinLossRatioContainer"));
          if (isNull(container)) createDeckTileLabel(tile);
        } catch (e) { log(`deck tile setdata failed: ${e}`); }
      },
      onLeave() {
        try {
          if (!this.tile) return;
          updateDeckTileLabel(new Il2Cpp.Object(this.tile));
        } catch (_) {}
      },
    });
    // Remember the tile so the label can be refreshed when the stats arrive.
    Interceptor.attach(deckTile.method("Awake").virtualAddress, {
      onEnter(args) { this.tile = args[0]; },
      onLeave() { try { deckTiles.add(this.tile.toString()); } catch (_) {} },
    });
    // A closed deck screen destroys its tiles; a stored pointer to one must not be dereferenced later.
    for (const name of ["OnDisable", "OnDestroy"]) {
      const gone = deckTile.methods.find(x => x.name === name && x.parameterCount === 0);
      if (gone) Interceptor.attach(gone.virtualAddress, { onEnter(args) { deckTiles.delete(args[0].toString()); } });
      else log(`deck tiles: DeckTile.${name} not found, stored tile pointers are not cleared by it`);
    }
  });

  // ---------------------------------------------------------------------
  // NewsPatch: the game's own news feed (legends.bethesda.net) is dead,
  // tesl-reborn.com serves its own news.json instead.
  // ---------------------------------------------------------------------
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
      for (const name of [code, code === "en" ? "en_US" : code]) {
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
      for (const key of keys) {
        (dictionary.method("set_Item") as any).invoke(Il2Cpp.string(key), Il2Cpp.string(String(json[key])));
      }
      manager.field<any>("_localizedData").value = dictionary;
      return keys.length;
    } catch (e) { log(`could not restore the localization: ${e}`); return 0; }
  }

  // ---------------------------------------------------------------------
  // LocalizationManagerPatch: the plugin ships translation fixes for the
  // strings the original client got wrong.
  // ---------------------------------------------------------------------
  section("translation fixes", () => {
    const localization = cls(img, "LocalizationManager");
    let lastLanguage = "";
    let lastApplied = "";
    // Trace the localization load: the English text lives in the appbase/en_us
    // bundle, and if that one is not resolved the whole UI shows raw keys.
    Interceptor.attach(localization.method("SetLanguage", 2).virtualAddress, {
      onEnter(args) { log(`LocalizationManager.SetLanguage called`); },
    });
    Interceptor.attach(localization.method("UpdateObjects").virtualAddress, {
      onEnter(args) {
        try {
          const manager = new Il2Cpp.Object(args[0]);
          const code = String(call(manager, "get_CurrentLanguageCode")?.content ?? "en");
          let data = manager.field<Il2Cpp.Object>("_localizedData").value;
          let entries = countOf(data);
          if (entries === 0) {
            // The game's own text bundle could not be loaded (it is a
            // downloadable bundle and the CDN is gone), so the strings that
            // were recovered from the cached bundle are used instead.
            const restored = restoreLocalization(manager, code);
            if (restored > 0) log(`localization: restored ${restored} strings from ${code}`);
            // The restore replaced the dictionary, so it has to be read again.
            data = manager.field<Il2Cpp.Object>("_localizedData").value;
            entries = countOf(data);
          }
          const fixes = TRANSLATIONS[code];
          if (lastLanguage !== code) {
            lastLanguage = code;
            log(`localization: language ${code}, ${entries} strings${fixes ? "" : ", no fixes for it"}`);
          }
          if (!fixes) return;
          if (isNull(data)) return;
          // Once per language and dictionary: a restore above replaces the dictionary, which needs the fixes again.
          const appliedFor = `${code}:${data.handle}`;
          if (appliedFor === lastApplied) return;
          lastApplied = appliedFor;
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
    ok = false;                       // false when the archive could not be read (already logged)

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
        this.ok = true;
      } catch (e) {
        log(`payload: the apk cannot be read: ${e}`);
        this.close();
      }
    }

    close() {
      try { this.file?.close(); } catch (_) {}
      this.file = null;
    }

    find(name: string): any { return this.entries.get(name) ?? null; }

    list(): string[] { return [...this.entries.keys()]; }

    read(entry: any, from: number, length: number): ArrayBuffer {
      this.file.seek(this.dataOffset(entry) + from);
      return this.file.readBytes(length);
    }

    // Writes to <target>.part and renames when complete, so a killed copy never leaves a truncated file under the final name.
    copy(entry: any, target: string) {
      if (entry.method !== 0) throw new Error(`entry for ${target} is not stored (method ${entry.method})`);
      const part = `${target}.part`;
      const out = new File(part, "wb");
      try {
        let done = 0;
        let reported = 0;
        while (done < entry.size) {
          const n = Math.min(4 * 1024 * 1024, entry.size - done);
          out.write(this.read(entry, done, n));
          done += n;
          if (done - reported >= PROGRESS_BYTES && done < entry.size) {
            reported = done;
            log(`payload: ${target.split("/").pop()} ${Math.floor(done / 1048576)} of ${Math.floor(entry.size / 1048576)} MB`);
          }
        }
        out.close();
      } catch (e) {
        try { out.close(); } catch (_) {}
        throw e;
      }
      moveFile(part, target);
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
    try {
    if (!zip.ok) return;             // the read failure is logged by ZipReader, it is not "no payload"
    const obb = zip.find("assets/tesl-payload/obb.bin");
    const cache = zip.find("assets/tesl-payload/cache.bin");
    const perFileEntries = zip.list().filter(e => e.startsWith("assets/tesl-payload/UnityCache/Shared/"));
    if (!obb && !cache && !perFileEntries.length) { log("payload: the apk carries no payload"); return; }

    if (obb) {
      const target = obbPath();
      // A file of another size is a truncated copy (or a different build) and is written again.
      const have = target ? fileLength(target) : -1;
      if (target && have !== obb.size) {
        log(`payload: writing the streaming assets to ${target}${have >= 0 ? ` (found ${have} of ${obb.size} bytes)` : ""}`);
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
        let failed = 0;
        let bytes = 0;
        let reported = 0;
        for (const name of perEntry) {
          const rel = name.substring(prefix.length);
          const path = `${tgt}/${rel}`;
          const e = zip.find(name);
          if (fileLength(path) === e.size) continue;
          try {
            makeDirectory(path.substring(0, path.lastIndexOf("/")));
            zip.copy(e, path);
            written++;
            bytes += e.size;
            if (bytes - reported >= PROGRESS_BYTES) {
              reported = bytes;
              log(`payload: ${written} cache files written, ${Math.floor(bytes / 1048576)} MB`);
            }
          } catch (err) { failed++; log(`payload: cache file ${rel} failed: ${err}`); }
        }
        log(`payload: ${written} of ${perEntry.length} cache files written (per-file)${failed ? `, ${failed} failed` : ""}`);
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

  function fileExists(path: string): boolean {
    try {
      return Boolean((Il2Cpp.corlib.class("System.IO.File").method("Exists") as any)
        .invoke(Il2Cpp.string(path)));
    } catch (_) { return false; }
  }

  // The size of a file in bytes, -1 when it does not exist.
  function fileLength(path: string): number {
    try {
      const f = new File(path, "rb");
      try { f.seek(0, File.SEEK_END); return f.tell(); } finally { f.close(); }
    } catch (_) { return -1; }
  }

  // Replaces `to` by `from` (File.Move refuses an existing target).
  function moveFile(from: string, to: string) {
    const file = Il2Cpp.corlib.class("System.IO.File");
    (file.method("Delete") as any).invoke(Il2Cpp.string(to));
    (file.method("Move", 2) as any).invoke(Il2Cpp.string(from), Il2Cpp.string(to));
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
  // directory and used on the next start. They are dropped again when the
  // server does not accept them any more.
  // ---------------------------------------------------------------------
  // Plain text on shared storage: on Android 10 and below other apps with storage permission can read it.
  const LOGIN_FILE = "tesl-login.json";
  let autoLoginTried = false;           // the last login screen was answered from the saved file; the next one is shown to the user
  let loginRejected = false;            // the service answered a login with a failure code since the last success

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
    if (writeTextFile(path, JSON.stringify({ username, password }))) {
      log(`remembered the login of ${username}`);
    }
  }

  function clearSavedLogin() {
    try {
      (Il2Cpp.corlib.class("System.IO.File").method("Delete") as any)
        .invoke(Il2Cpp.string(`${persistentPath()}/${LOGIN_FILE}`));
    } catch (_) {}
  }

  section("auto login", () => {
    const credentials = cls(img, "SparkleServices.UsernameAndPassword");

    // Hands the remembered credentials to the login callback instead of
    // showing the login window.
    const useRemembered = (callback: any, saved: { username: string; password: string }) => {
      autoLoginTried = true;
      log(`auto login as ${saved.username}`);
      schedule(250, () => {
        try {
          const value = credentials.alloc();
          value.field<Il2Cpp.String>("username").value = Il2Cpp.string(saved.username);
          value.field<Il2Cpp.String>("password").value = Il2Cpp.string(saved.password);
          (new Il2Cpp.Object(callback as any)).method("Invoke").invoke(value.unbox() as any);
        } catch (e) { log(`auto login failed: ${e}`); }
      });
    };

    // The login screen of the mobile client.
    const mobile = cls(img, "LoginHandler").method("OnLogin", 3);
    const mobileOriginal = new NativeFunction(mobile.virtualAddress, "void",
      ["pointer", "pointer", "pointer", "pointer"]);
    mobile.implementation = function (title, description, callback) {
      try {
        const saved = autoLoginTried ? null : readSavedLogin();
        if (!saved) {
          if (autoLoginTried) {
            // Either the server did not accept the remembered credentials (the file is already dropped), or the
            // login screen came back after a good auto login (logout, expired session): the valid file stays.
            autoLoginTried = false;
            log(loginRejected ? "auto login was rejected, showing the login window" : "login window requested after an auto login, showing it");
            loginRejected = false;
          }
          mobileOriginal(this.handle, title as any, description as any, callback as any);
          return;
        }
        useRemembered(callback, saved);
      } catch (e) {
        log(`auto login error: ${e}`);
        mobileOriginal(this.handle, title as any, description as any, callback as any);
      }
    };

    // The login screen of the desktop client (a fallback for the other builds).
    const fallback = cls(img, "SparkleServices.DefaultLoginHandler").method("LoginHandler", 3);
    const fallbackOriginal = new NativeFunction(fallback.virtualAddress, "void",
      ["pointer", "pointer", "pointer"]);
    fallback.implementation = function (title, description, callback) {
      try {
        const saved = autoLoginTried ? null : readSavedLogin();
        if (!saved) {
          if (autoLoginTried) {
            autoLoginTried = false;
            log(loginRejected ? "auto login was rejected, showing the login window" : "login window requested after an auto login, showing it");
            loginRejected = false;
          }
          fallbackOriginal(title as any, description as any, callback as any);
          return;
        }
        useRemembered(callback, saved);
      } catch (e) {
        log(`auto login error: ${e}`);
        fallbackOriginal(title as any, description as any, callback as any);
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
  section("player profile titles (legendary filter)", () => {
    const ppt = cls(img, "PlayerProfileTitles");
    Interceptor.attach(ppt.method("Awake").virtualAddress, {
      onEnter(args) {
        try {
          const self = new Il2Cpp.Object(args[0]);
          const t = call(self, "get_transform");
          if (isNull(t)) return;
          const found = call(t, "Find", Il2Cpp.string("Layout_Filters/Widget_Filters_Rarity/KEEP_HIDDEN_Item_Filter_Legendary"));
          if (isNull(found)) return;
          const go = call(found, "get_gameObject");
          if (!isNull(go)) (go.method("SetActive") as any).invoke(true);
          log("PlayerProfileTitles: revealed the legendary rarity filter");
        } catch (e) { log(`player profile titles awake failed: ${e}`); }
      },
    });
  });

  section("player profile title item (legendary colour)", () => {
    const ppti = cls(img, "PlayerProfileTitleItem");
    Interceptor.attach(ppti.method("UpdateUi").virtualAddress, {
      onEnter(args) { this.self = args[0]; },
      onLeave() {
        try {
          const self = new Il2Cpp.Object(this.self);
          const titleData = self.field<Il2Cpp.Object>("_titleData").value;
          if (isNull(titleData)) return;
          const rarity = enumVal(titleData.field<any>("Rarity").value);
          if (rarity !== RARITY_LEGENDARY) return;
          const bg = self.field<Il2Cpp.Object>("BackgroundImage").value;
          if (isNull(bg)) return;
          const uiRes = (ucls("UIResourceManager").method("get_Instance") as any).invoke();
          if (!isNull(uiRes)) {
            const sprite = (uiRes.method("GetTitleBannerSprite") as any).invoke(enumBox(cls(img, "SPTESL.CardRarity"), RARITY_LEGENDARY));
            if (!isNull(sprite)) (bg.method("set_overrideSprite") as any).invoke(sprite);
          }
          (bg.method("set_color") as any).invoke(1, 0.75, 0, 1);
          log("PlayerProfileTitleItem: coloured a legendary title");
        } catch (e) { log(`player profile title item update failed: ${e}`); }
      },
    });
  });

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
            (commonBanner.method("set_color") as any).invoke(1, 0.75, 0, 1);
          }
        } catch (e) { log(`player info panel update failed: ${e}`); }
      },
    });
  });

  // Trace the asset lookups of the localization data: the English text lives
  // in the "appbase/en_us" bundle, and when that lookup fails the whole user
  // interface shows the raw localization keys instead of the text.
  section("localization asset trace", () => {
    const catalog = cls(img, "AssetCatalog");
    let logged = 0;
    for (const m of catalog.methods.filter(x => x.name === "LoadAssetFromPathAsync")) {
      Interceptor.attach(m.virtualAddress, {
        onEnter(args) { if (logged < 40) this.path = rawStr(args[1]); },
        onLeave(ret) {
          if (logged >= 40) return;
          const path = this.path ?? "";
          if (path.toLowerCase().indexOf("localization") < 0 && !ret.isNull()) return;
          logged++;
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
  section("bundle hash report", () => {
    const mgr = cls(img, "AssetBundles.AssetBundleManager");
    const catalog = cls(img, "AssetCatalog");
    let reported = false;               // the report is written once per process
    Interceptor.attach(catalog.method("SetCacheExpiration").virtualAddress, {
      onEnter() {
        if (reported) return;
        try {
          const target = `${persistentPath()}/tesl-bundle-hashes.txt`;
          const manifest = mgr.field<Il2Cpp.Object>("m_AssetBundleManifest").value;
          if (isNull(manifest)) { log("bundle hashes: the manifest is not loaded yet"); return; }
          reported = true;
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
          log(`bundle hashes: wrote ${lines.length} entries to ${target}`);
        } catch (e) { log(`bundle hash report failed: ${e}`); }
      },
    });
  });

  log("setup finished");
});