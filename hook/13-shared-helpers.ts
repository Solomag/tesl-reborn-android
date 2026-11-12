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

  // Risky changes run only where tesl-reborn-experiments.json switches them on
  // ({"name": true}); the file is put on a test phone by hand, nobody else has it.
  let experiments: any = null;
  function experiment(name: string): boolean {
    if (experiments === null) {
      experiments = {};
      try { experiments = JSON.parse(readTextFile(`${persistentPath()}/tesl-reborn-experiments.json`) || "{}") || {}; } catch (_) {}
      const on = Object.keys(experiments).filter(key => experiments[key] === true);
      if (on.length) log(`experiments on: ${on.join(", ")}`);
    }
    return experiments[name] === true;
  }
  // On for everyone after report 108; {"safeInvoke": false} in the
  // experiments file turns it off on a phone.
  try { experiment("safeInvoke"); if (experiments.safeInvoke !== false) installSafeInvoke(); } catch (error) { log(`safe invoke unavailable: ${error}`); }

  // Reports 97-106: "setjmp cookie mismatch" aborts. Every managed call
  // the hook makes went straight to the method's code through a Frida
  // NativeFunction; when the game failed inside it (a destroyed object, a
  // null) the signal was caught by Frida's setjmp/longjmp guard, which
  // aborts the process when the jump crosses Unity's own handlers. Calls now
  // go through il2cpp_runtime_invoke, IL2CPP's own entry, which catches the
  // game's exception and hands it back: the hook gets a JS error its
  // try/catch handles. Value-type receivers, by-ref and unusual arguments keep
  // the direct call. An experiment first ("safeInvoke").
  function installSafeInvoke() {
    const exports = Il2Cpp.module;
    const runtimeInvoke = new NativeFunction(exports.getExportByName("il2cpp_runtime_invoke"), "pointer",
      ["pointer", "pointer", "pointer", "pointer"], { exceptions: "propagate" } as any);
    const unbox = new NativeFunction(exports.getExportByName("il2cpp_object_unbox"), "pointer", ["pointer"]);
    const proto: any = (Il2Cpp as any).Method.prototype, direct = proto.invokeRaw;
    const VOID = (Il2Cpp as any).Type.Enum.VOID;
    let calls = 0, caught = 0, fallbacks = 0;
    proto.invokeRaw = function (instance, ...parameters) {
      let args, keep = [];
      try {
        const params = this.parameters;
        if (params.length !== parameters.length || this.class.isValueType) { fallbacks++; return direct.call(this, instance, ...parameters); }
        args = Memory.alloc(Math.max(1, params.length) * Process.pointerSize);
        for (let i = 0; i < params.length; i++) {
          const type = params[i].type, value = parameters[i];
          if (type.isByReference) { fallbacks++; return direct.call(this, instance, ...parameters); }
          let slot;
          if (type.class.isValueType) {
            const size = Math.max(8, type.class.valueTypeSize);
            slot = Memory.alloc(size); keep.push(slot);
            if (value instanceof (Il2Cpp as any).ValueType) Memory.copy(slot, value.handle, type.class.valueTypeSize);
            else if (type.class.isEnum && (typeof value === "number" || typeof value === "boolean")) slot.writeS32(Number(value));
            else if (typeof value === "number" || typeof value === "boolean" || value instanceof Int64 || value instanceof UInt64 || value instanceof NativePointer) (Il2Cpp as any).write(slot, typeof value === "boolean" ? value : value, type);
            else { fallbacks++; return direct.call(this, instance, ...parameters); }
          } else slot = value?.handle ?? (value instanceof NativePointer ? value : NULL);
          args.add(i * Process.pointerSize).writePointer(slot);
        }
      } catch (_) { fallbacks++; return direct.call(this, instance, ...parameters); }
      calls++;
      const exception = Memory.alloc(Process.pointerSize);
      exception.writePointer(NULL);
      const self = instance?.handle ?? (instance instanceof NativePointer ? instance : NULL);
      const result = runtimeInvoke(this.handle, self, args, exception);
      const thrown = exception.readPointer();
      if (!thrown.isNull()) {
        caught++;
        let kind = "exception";
        try { kind = new Il2Cpp.Object(thrown).class.name; } catch (_) {}
        throw new Error(`${kind} in ${this.class.name}.${this.name} (caught by IL2CPP)`);
      }
      const type = this.returnType;
      if (type.enumValue === VOID) return undefined;
      if (type.class.isValueType) return result.isNull() ? undefined : (Il2Cpp as any).read(unbox(result), type);
      return (Il2Cpp as any).fromFridaValue(result, type);
    };
    setInterval(() => { if (caught) log(`safe invoke: ${caught} game exceptions caught in ${calls} calls (${fallbacks} direct)`); caught = 0; }, 60000);
    log("safe invoke: managed calls go through il2cpp_runtime_invoke");
  }

  function readTextFile(path: string): string {
    try {
      const file = Il2Cpp.corlib.class("System.IO.File");
      if (!Boolean((file.method("Exists") as any).invoke(Il2Cpp.string(path)))) return "";
      return String((file.method("ReadAllText") as any).invoke(Il2Cpp.string(path))?.content ?? "");
    } catch (e) { return ""; }
  }

  function deleteFile(path: string): boolean {
    try {
      (Il2Cpp.corlib.class("System.IO.File").method("Delete") as any).invoke(Il2Cpp.string(path));
      return true;
    } catch (e) { return false; }
  }

  // Written beside and renamed over: the setup code (Java) reads several of
  // these files while the game writes them, and a half-written one read as
  // broken JSON silently switched its logic off. A ".part" path is the
  // caller's own staging file and is written directly.
  function writeTextFile(path: string, text: string): boolean {
    const write = (target: string) => (Il2Cpp.corlib.class("System.IO.File").method("WriteAllText") as any)
      .invoke(Il2Cpp.string(target), Il2Cpp.string(text));
    try {
      if (path.endsWith(".part")) { write(path); return true; }
      write(path + ".tmp");
      if (atomicRename(path + ".tmp", path)) return true;
      write(path);
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
  // A destroyed Unity object keeps a non-null handle, so isNull passes it,
  // and calling into it can abort inside native code ("abort was called",
  // then SIGABRT: report 32, match history). Unity's own null check compares
  // it with null without calling into it.
  let unityEquality = null;
  function unityAlive(o: any): boolean {
    if (isNull(o)) return false;
    try {
      if (!unityEquality) unityEquality = ucls("UnityEngine.Object").method("op_Equality");
      return !unityEquality.invoke(o, NULL);
    } catch (_) { return false; }
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

  // A GET of a file (the plugin archive): its bytes, or null. Same stack as
  // httpGet; the copy out of the managed array is one native read.
  function httpGetBytes(url, cb) {
    schedule(0, () => {
      try {
        const uri = ucls("System.Uri").alloc();
        uri.method(".ctor").overload("System.String").invoke(Il2Cpp.string(url));
        const del = Il2Cpp.delegate(cls(img, "BestHTTP.OnRequestFinishedDelegate"), (req, resp) => {
          try {
            if (isNull(resp)) { log(`GET ${url} failed: no response`); cb(-1, null); return; }
            const status = Number(call(resp, "get_StatusCode"));
            const data = call(resp, "get_Data");
            const bytes = status === 200 && !isNull(data) && data.length > 0 ? data.elements.handle.readByteArray(data.length) : null;
            log(`GET ${url} completed: HTTP ${status}, ${bytes ? bytes.byteLength : 0} bytes`);
            cb(status, bytes);
          } catch (e) { log(`GET ${url} callback failed: ${e}`); cb(-1, null); }
        });
        const req = cls(img, "BestHTTP.HTTPRequest").alloc();
        req.method(".ctor").overload("System.Uri", "BestHTTP.OnRequestFinishedDelegate").invoke(uri, del);
        req.method("Send").invoke();
        log(`GET ${url} queued`);
      } catch (e) { log(`GET ${url} setup failed: ${e}`); cb(-1, null); }
    });
  }

    section("rewards refresh", () => {
    const pubSub = cls(img, "SparkleServices.PubSub");
    const createPush = pubSub.method("CreatePushNotification");
    const gameNetwork = cls(img, "SPTESL.GameNetworkManager");

    hookAttach(cls(img, "EndGameState").method("OnEnable").virtualAddress, {
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

    hookAttach(cls(img, "SoloArena").method("SoloArenaEndSequence").virtualAddress, {
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

