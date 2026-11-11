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
  log(`attached, Unity ${Il2Cpp.unityVersion}, Android patch ${globalThis.TeslRebornUpdater?.current()?.revision ?? "embedded"}, ${verboseLogs ? "detailed" : "basic"} logs`);
  // Report 9: the same hook code ran 4-13 times slower on a Pixel 8 Pro than
  // on a Pixel 6 Pro. Record what could explain it: the Frida build and its
  // JavaScript runtime, and memory tagging (MTE), which the Pixel 8 has.
  try {
    let mte = "unknown";
    try {
      const prctl = new NativeFunction(Process.getModuleByName("libc.so").getExportByName("prctl"), "int", ["int", "ulong", "ulong", "ulong", "ulong"]);
      const flags = prctl(56 /* PR_GET_TAGGED_ADDR_CTRL */, 0, 0, 0, 0) as number;
      mte = flags < 0 ? "unsupported" : (flags & 2) ? "sync" : (flags & 4) ? "async" : "off";
    } catch (_) {}
    log(`runtime: Frida ${Frida.version}, ${Script.runtime}, MTE ${mte}, page ${Process.pageSize}`);
  } catch (error) { log(`runtime: ${error}`); }
  // Report 127: since 31.10 the service answers bnetSteamLogin with SteamAuthFailed
  // (13) instead of BNETAuthUnknownAccount (17), and the game stops on that error.
  // Nothing is sent any more: 17 from here leads to the device id and username and
  // password login of the Battle.net client, and a session needs no native link.
  // Looked up on first use, so a failure here cannot stop the whole setup.
  let authResultClass: Il2Cpp.Class | null = null;
  const authResult = { new: () => (authResultClass ??= nested(img, "AuthBase", "AuthResult")).new() };
  // The first read of every type (later sections filter img.classes) is
  // timed here, so a start that stops in it shows where.
  section("type list", () => {
    log("type list: reading");
    const at = Date.now(), count = img.classes.length;
    log(`type list: ${count} types in ${Date.now() - at} ms`);
  });
  const BNET_AUTH_UNKNOWN_ACCOUNT = 17;
  function finishAuth(cb: Il2Cpp.Object, code: number) {
    const result = authResult.new();
    const field = result.field<any>("resultCode");
    const boxed = field.type.class.alloc(); boxed.field("value__").value = code;
    field.value = boxed.unbox();
    cb.method("Invoke").invoke(result);
  }

  section("auth hooks (BNETPlatformAuthInstance)", () => {
    const bnet = cls(img, "SparkleServices.BNETPlatformAuthInstance");
    bnet.method("SignIn").implementation = function (_request, cb) {
      log("Bypassing BNET SignIn");
      invokeDelegateInt(cb as Il2Cpp.Object, 0);
    };
    bnet.method("DoNsoAuth").implementation = function (_createAnon, request, cb) {
      log("Bypassing NSO Auth");
      finishAuth(cb as Il2Cpp.Object, BNET_AUTH_UNKNOWN_ACCOUNT);
    };
    bnet.method("DoNsoToSessionLink").implementation = function (sessionAuth, language, _dev, settings, endpoint, cb) {
      log("Bypassing NSO To Session Link");
      finishAuth(cb as Il2Cpp.Object, 0);
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
      log("Google Play DoAuth -> username and password login");
      finishAuth(cb as Il2Cpp.Object, BNET_AUTH_UNKNOWN_ACCOUNT);
    };
    gp.method("LinkToSession").implementation = function (sessionAuth, language, _dev, settings, endpoint, cb) {
      log("Google Play LinkToSession -> skipped");
      finishAuth(cb as Il2Cpp.Object, 0);
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
    if (send && !send.virtualAddress.isNull()) hookAttach(send.virtualAddress, {
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
  // The request is kept with them: an auto login and a retry by hand may
  // overlap, and each answer must save its own request's credentials.
  let pendingLogin: { username: string; password: string; request: string } | null = null;
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
      if (body && body.username) pendingLogin = { username: String(body.username), password: String(body.password ?? ""), request: String(req?.handle ?? "") };
    } catch (e) { log("could not read login credentials from request body"); }
  }

  // 2) Config redirect: FetchConfig.StartProcess(localConfigUrl, configUrl, attemptLocalConnect, callback)
  section("config redirect", () => {
    hookAttach(cls(img, "SparkleServices.FetchConfig").method("StartProcess").virtualAddress, {
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
    hookAttach(cls(img, "BestHTTP.HTTPManager").method("get_IsCachingDisabled").virtualAddress, {
      onLeave(ret) { ret.replace(ptr(0)); },
    });
  });
  section("http header", () => {
    let seen = 0;
    const m = cls(img, "BestHTTP.HTTPRequest").method("EnumerateHeaders", 2);   // (callback, callBeforeSendCallback); the 1-arg overload is an 8-byte stub
    hookAttach(m.virtualAddress, {
      onEnter(args) {
        try {
          const req = new Il2Cpp.Object(args[0]);
          let hasVersion = false;
          try { hasVersion = Boolean(call(req, "HasHeader", Il2Cpp.string("X-TeslRebornPlugin-Version"))); } catch (_) {}
          if (!hasVersion) req.method("AddHeader").invoke(Il2Cpp.string("X-TeslRebornPlugin-Version"), Il2Cpp.string(PLUGIN_VERSION));
          const uri = pinRequestLanguage(req);
          captureLogin(req, uri);
          rewriteAuthBody(req, uri);
          if (verboseLogs && seen++ < 60) log(`-> ${diagnosticUri(uri)} body: ${bodyOf(req)}`);
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
    // Report 50: login gave HTTP 500 after another account used the phone,
    // and the status alone did not say why. For a failed account call keep
    // what the server answered; log() masks secrets, names are masked here.
    if (status >= 400 && /\/api\/account\//.test(uri)) {
      try {
        const text = String(call(response, "get_DataAsText")?.content ?? "")
          .replace(/("(?:username|userName|email|accountName|displayName|name)"\s*:\s*")(?:[^"\\]|\\[\s\S])*"/gi, '$1[omitted]"')
          .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]");
        log(`account error body (${diagnosticUri(uri).split("/").pop()}): ${text ? text.slice(0, 600) : "(empty)"}`);
      } catch (error) { log(`account error body unreadable: ${error}`); }
    }
    if (typeof recordResourceEvent === "function") recordResourceEvent("http-" + state, diagnosticUri(uri), status);
    if (pendingLogin && uri.indexOf("bnetUsernameAndPasswordLogin") >= 0 && pendingLogin.request === String(req?.handle ?? "")) {
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
    hookAttach(cls(img, "BestHTTP.HTTPRequest").method("CallCallback").virtualAddress, {
      onEnter(args) {
        try { reportHttpResult(new Il2Cpp.Object(args[0]), verboseLogs && seen++ < 80); }
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
    hookAttach(byName("ErrorHandler", "OnError", 4).virtualAddress, {
      onEnter(args) { log(`ErrorHandler.OnError code=${args[1].toInt32()} endpoint=${strOf(args[2])}`); },
    });
  });
  section("error tracing: websocket transport", () => {
    const wt = "BestHTTP.SocketIO.Transports.WebSocketTransport";
    hookAttach(byName(wt, "OnOpen").virtualAddress, { onEnter() { log("ws transport: open"); } });
    hookAttach(byName(wt, "OnError").virtualAddress, { onEnter(args) { log(`ws transport: ERROR ${msgOf(args[2])}`); } });
    hookAttach(byName(wt, "OnClosed").virtualAddress, {
      onEnter(args) { log(`ws transport: closed code=${args[2].toInt32() & 0xffff} msg=${strOf(args[3])}`); },
    });
  });
  section("error tracing: socket.io manager", () => {
    const sm = "BestHTTP.SocketIO.SocketManager";
    hookAttach(byName(sm, "OnTransportConnected").virtualAddress, { onEnter() { log("socket.io: transport connected"); } });
    hookAttach(byName(sm, "OnTransportError").virtualAddress, { onEnter(args) { log(`socket.io: transport error ${strOf(args[2])}`); } });
    hookAttach(byName(sm, "EmitError").virtualAddress, { onEnter(args) { log(`socket.io: EmitError code=${args[1].toInt32()} msg=${strOf(args[2])}`); } });
  });

  const rawStr = (q: NativePointer): string => {
    try {
      if (q.isNull()) return "(null)";
      const n = q.add(0x10).readS32();
      return n >= 0 && n < 512 ? (q.add(0x14).readUtf16String(n) ?? "") : `(bad length ${n})`;
    } catch (_) { return "(unreadable)"; }
  };
