  // BEGIN android-ui: rdt-channel
  // Reborn Deck Tracker (RDT) is a separate module, released from its own
  // repository (Solomag/RDT-Android). The port only fetches, checks and runs
  // it; the contract is E:\RDT-Android\docs\loader-contract.md.
  const RDT = {
    manifestUrl: "https://raw.githubusercontent.com/Solomag/RDT-Android/main/release/manifest.json",
    // The public half of the RDT release key (tools/keygen.mjs in
    // RDT-Android); the private half is the RDT_SIGNING_KEY Actions secret.
    publicKey: "8e8414717e295a6fdafbe517c40cbea6d2b1fc73ed0bd910927e8edfa7d74700",
    marker: "// RDT-ANDROID-MODULE v1",
    maxBytes: 4 * 1024 * 1024,
  };
  function rdtHex(text) {
    if (typeof text !== "string" || text.length % 2 || /[^0-9a-f]/i.test(text)) return null;
    const bytes = new Uint8Array(text.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(text.substr(i * 2, 2), 16);
    return bytes;
  }
  function rdtUtf8(text) {
    const bytes = [];
    for (const ch of String(text)) {
      const c = ch.codePointAt(0);
      if (c < 0x80) bytes.push(c);
      else if (c < 0x800) bytes.push(0xc0 | c >> 6, 0x80 | c & 63);
      else if (c < 0x10000) bytes.push(0xe0 | c >> 12, 0x80 | c >> 6 & 63, 0x80 | c & 63);
      else bytes.push(0xf0 | c >> 18, 0x80 | c >> 12 & 63, 0x80 | c >> 6 & 63, 0x80 | c & 63);
    }
    return new Uint8Array(bytes);
  }
  // The manifest, in the contract's order: signature, no downgrade, core
  // version. Returns why it is refused, or "" when it may be downloaded.
  function rdtCheckManifest(manifest, publicKey, cachedRevision, coreRevision, verify) {
    if (!manifest || typeof manifest !== "object") return "manifest is not an object";
    const { revision, minCore, bytes, sha256, sig, url } = manifest;
    if (!Number.isSafeInteger(revision) || revision < 1) return "bad revision";
    if (typeof sha256 !== "string" || !/^[0-9a-f]{64}$/.test(sha256)) return "bad sha256";
    const key = rdtHex(publicKey), signature = rdtHex(sig);
    if (!key || key.length !== 32) return "no release key";
    if (!signature || signature.length !== 64) return "bad signature";
    let valid = false;
    try { valid = verify(rdtUtf8(`${sha256}:${revision}`), signature, key); } catch (_) {}
    if (!valid) return "signature does not match";
    if (revision < cachedRevision) return `revision ${revision} is older than the cached ${cachedRevision}`;
    if (!Number.isSafeInteger(minCore) || minCore > coreRevision) return `needs core ${minCore}, this is ${coreRevision}`;
    if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > RDT.maxBytes) return "bad size";
    if (typeof url !== "string" || !url.startsWith("https://")) return "url is not HTTPS";
    return "";
  }
  // The downloaded payload against the signed manifest.
  function rdtCheckPayload(data, manifest, sha256) {
    if (!data || data.byteLength !== manifest.bytes) return `size ${data ? data.byteLength : 0} instead of ${manifest.bytes}`;
    if (sha256(data) !== manifest.sha256) return "sha256 does not match";
    const head = new Uint8Array(data, 0, Math.min(data.byteLength, RDT.marker.length));
    if (String.fromCharCode(...head) !== RDT.marker) return "not an RDT module";
    return "";
  }
// END android-ui: rdt-channel

  // BEGIN android-ui: rdt-loader
  // Off unless tesl-reborn-rdt.json says {"enabled": true}; off means
  // nothing is downloaded or run. A change applies on the next start.
  section("rdt module loader", () => {
    const optionFile = `${persistentPath()}/tesl-reborn-rdt.json`;
    let enabled = false;
    try { enabled = JSON.parse(readTextFile(optionFile) || "{}")?.enabled === true; } catch (_) {}
    if (!enabled) return;
    const dir = `${privateDir()}/rdt`, cacheFile = `${dir}/rdt.js`, stateFile = `${dir}/state.json`, settingsFile = `${dir}/settings.json`;
    makeDirectory(dir);
    const readJson = path => { try { return JSON.parse(readTextFile(path) || "{}") || {}; } catch (_) { return {}; } };
    const coreRevision = Number(globalThis.TeslRebornUpdater?.current()?.revision) || 0;
    let ran = false;

    const settings = readJson(settingsFile);
    globalThis.teslPort = {
      version: `${APK_LEVEL}.${coreRevision}`,
      core: coreRevision,
      log: message => log(`rdt: ${message}`),
      dataDir: dir,
      settings: {
        get: key => settings[key],
        set: (key, value) => {
          if (!String(key).startsWith("rdt.")) throw Error("RDT settings keys start with rdt.");
          settings[key] = value;
          writeTextFile(settingsFile, JSON.stringify(settings));
        },
      },
      // Runs fn on the Unity main thread, on a later frame.
      frameGate: (name, fn) => schedule(0, () => { try { fn(); } catch (error) { log(`rdt: ${name} failed: ${error}`); } }, `rdt ${name}`),
      httpGetBytes: url => new Promise((resolve, reject) =>
        httpGetBytes(url, (status, bytes) => bytes ? resolve(new Uint8Array(bytes)) : reject(Error(`HTTP ${status}`)))),
      hookAttach, cls, ucls, call, img,
      ui: { uiNew, uiAdd, uiRect, uiPlace, uiStretch, uiText, uiButton, uiLabeledButton },
    };

    function run(code, origin) {
      if (ran) return;
      ran = true;
      // The module's hooks are timed under their own name in the cost report.
      const outer = currentSection;
      currentSection = "rdt module";
      try {
        Script.evaluate("/rdt/rdt.js", code);
        log(`rdt: module started (${origin})`);
      } catch (error) { log(`rdt: module failed (${origin}): ${error?.stack || error}`); }
      finally { currentSection = outer; }
    }

    // Development: an rdt.js in the update inbox runs instead of the
    // channel copy, unsigned, only where local updates are allowed.
    const updater = readJson(`${persistentPath()}/tesl-reborn-updater.json`);
    const inbox = `${persistentPath()}/tesl-reborn-inbox/rdt.js`;
    if (updater.allowLocalUpdates === true) {
      const code = readTextFile(inbox);
      if (code) {
        if (code.startsWith(RDT.marker)) run(code, "inbox"); else log("rdt: inbox rdt.js has no module marker");
      }
    }
    const state = readJson(stateFile);
    const cached = readTextFile(cacheFile);
    if (!ran && cached && state.sha256 && Checksum.compute("sha256", cached) === state.sha256) run(cached, `cached revision ${state.revision}`);
    else if (!ran && cached) log("rdt: cached module does not match its record; not run");

    // Once per start: a newer release is saved for the next one (or run
    // now when nothing has run yet).
    if (!RDT.publicKey) { log("rdt: no release key pinned yet; channel skipped"); return; }
    httpGet(RDT.manifestUrl, false, (status, body) => {
      if (status !== 200) { log(`rdt: manifest HTTP ${status}`); return; }
      setTimeout(() => {
        let manifest = null;
        try { manifest = JSON.parse(body); } catch (_) {}
        const cachedRevision = cached && state.sha256 ? Number(state.revision) || 0 : 0;
        const refused = rdtCheckManifest(manifest, RDT.publicKey, cachedRevision, coreRevision, tweetnaclVerify);
        if (refused) { log(`rdt: manifest refused: ${refused}`); return; }
        if (manifest.revision === cachedRevision && manifest.sha256 === state.sha256) { log(`rdt: revision ${cachedRevision} is current`); return; }
        httpGetBytes(manifest.url, (code, bytes) => {
          if (!bytes) { log(`rdt: download HTTP ${code}`); return; }
          setTimeout(() => {
            const problem = rdtCheckPayload(bytes, manifest, data => Checksum.compute("sha256", data));
            if (problem) { log(`rdt: payload refused: ${problem}`); return; }
            const part = `${cacheFile}.part`, out = new File(part, "wb");
            try { out.write(bytes); out.flush(); } finally { out.close(); }
            if (!atomicRename(part, cacheFile)) { log("rdt: could not save the module"); return; }
            writeTextFile(stateFile, JSON.stringify({ revision: manifest.revision, sha256: manifest.sha256, at: new Date().toISOString() }));
            log(`rdt: revision ${manifest.revision} saved`);
            if (!ran) schedule(0, () => run(readTextFile(cacheFile), `revision ${manifest.revision}`), "rdt start");
          }, 0);
        });
      }, 0);
    });
  });
// END android-ui: rdt-loader

  // BEGIN android-ui: rdt-toggle
  // "Deck tracker" in the game's own Settings window: a copy of the
  // "double tap to end turn" row, so it looks and navigates like the game's
  // switches. It only writes tesl-reborn-rdt.json; the loader reads it at
  // start, so the label asks for a restart while the choice differs from
  // what is running.
  const RDT_LABELS = {
    en_us: ["Deck tracker (RDT)", "Deck tracker: restart the game"],
    ru_ru: ["Трекер колоды (RDT)", "Трекер колоды: перезапустите игру"],
    de_de: ["Deck-Tracker (RDT)", "Deck-Tracker: Spiel neu starten"],
    es_es: ["Rastreador de mazo (RDT)", "Rastreador: reinicia el juego"],
    es_mx: ["Rastreador de mazo (RDT)", "Rastreador: reinicia el juego"],
    fr_fr: ["Suivi du deck (RDT)", "Suivi du deck : relancez le jeu"],
    it_it: ["Tracker del mazzo (RDT)", "Tracker: riavvia il gioco"],
    pl_pl: ["Tracker talii (RDT)", "Tracker talii: uruchom grę ponownie"],
    pt_br: ["Rastreador de baralho (RDT)", "Rastreador: reinicie o jogo"],
    tr_tr: ["Deste takipçisi (RDT)", "Deste takipçisi: oyunu yeniden başlatın"],
    zh_cn: ["卡组追踪器 (RDT)", "卡组追踪器：请重启游戏"],
  };
  function rdtLabel(enabled, running) {
    const texts = RDT_LABELS[textOverlay() || resourceLanguage()] || RDT_LABELS.en_us;
    return enabled === running ? texts[0] : texts[1];
  }
  section("rdt settings toggle", () => {
    const optionFile = `${persistentPath()}/tesl-reborn-rdt.json`;
    const readEnabled = () => { try { return JSON.parse(readTextFile(optionFile) || "{}")?.enabled === true; } catch (_) { return false; } };
    const running = readEnabled();
    const settingsWin = cls(img, "SettingsWin");
    const enable = settingsWin.tryMethod("OnEnable", 0);
    if (!enable || enable.virtualAddress.isNull()) throw Error("SettingsWin.OnEnable not found");
    const toggleClass = ucls("UnityEngine.UI.Toggle");
    let reported = false;
    function install(self) {
      const source = self.field("_doubleTapConfirmToggle").value;
      if (!unityAlive(source)) throw Error("no double-tap toggle");
      // The row is the toggle's ancestor whose parent lays rows out.
      let row = call(source, "get_transform"), container = call(row, "get_parent");
      for (let depth = 0; depth < 4 && !isNull(container); depth++) {
        const layout = container.method("GetComponent").overload("System.Type").invoke(ucls("UnityEngine.UI.VerticalLayoutGroup").type.object);
        if (!isNull(layout)) break;
        row = container; container = call(row, "get_parent");
      }
      if (isNull(container)) throw Error("no row container above the toggle");
      for (let i = 0, n = Number(call(container, "get_childCount")); i < n; i++)
        if (String(call(call(container, "GetChild", i), "get_name")?.content) === "RebornRdtRow") return;
      const copy = ucls("UnityEngine.Object").method("Instantiate").overload("UnityEngine.Object", "UnityEngine.Transform", "System.Boolean")
        .invoke(call(row, "get_gameObject"), container, false);
      call(copy, "set_name", Il2Cpp.string("RebornRdtRow"));
      const copyTransform = call(copy, "get_transform");
      call(copyTransform, "SetSiblingIndex", Number(call(row, "GetSiblingIndex")) + 1);
      // Localization components would put "Allow spectators" back.
      const behaviours = copy.method("GetComponentsInChildren").overload("System.Type", "System.Boolean").invoke(ucls("UnityEngine.MonoBehaviour").type.object, true);
      for (let i = 0; i < behaviours.length; i++) {
        const behaviour = behaviours.get(i);
        if (/^Locali[sz]e/.test(behaviour.class.name)) call(behaviour, "set_enabled", false);
      }
      const labels = copy.method("GetComponentsInChildren").overload("System.Type", "System.Boolean").invoke(ucls("TMPro.TMP_Text").type.object, true);
      let label = null, longest = -1;
      for (let i = 0; i < labels.length; i++) {
        const text = String(call(labels.get(i), "get_text")?.content || "");
        if (text.length > longest) { longest = text.length; label = labels.get(i); }
      }
      const toggles = copy.method("GetComponentsInChildren").overload("System.Type", "System.Boolean").invoke(toggleClass.type.object, true);
      if (!toggles.length) throw Error("copied row has no toggle");
      const toggle = toggles.get(0);
      // A fresh event: the copy must not keep the double-tap setting's listeners.
      const eventClass = toggleClass.nestedClasses.find(c => c.name === "ToggleEvent");
      const fresh = eventClass.alloc(); fresh.method(".ctor", 0).invoke();
      toggle.field("onValueChanged").value = fresh;
      let enabled = readEnabled();
      call(toggle, "set_isOn", enabled);
      const show = () => { if (label) call(label, "set_text", Il2Cpp.string(rdtLabel(enabled, running))); };
      show();
      const keepToggle = toggle.ref(false);
      const changed = value => {
        if (value === enabled) return;
        enabled = value;
        writeTextFile(optionFile, JSON.stringify({ enabled }));
        log(`rdt: tracker ${enabled ? "on" : "off"} from Settings (applies on restart)`);
        show();
      };
      try {
        const action = ucls("UnityEngine.Events.UnityAction`1").inflate(Il2Cpp.corlib.class("System.Boolean"));
        call(fresh, "AddListener", Il2Cpp.delegate(action, value => { try { changed(Boolean(value)); } catch (error) { log(`rdt: toggle failed: ${error}`); } }));
      } catch (error) {
        // No generic delegate: read the switch while the window lives.
        log(`rdt: toggle listener unavailable (${error}); polling`);
        const poll = () => {
          if (!unityAlive(keepToggle.target)) { keepToggle.free(); return; }
          changed(Boolean(call(keepToggle.target, "get_isOn")));
          schedule(300, poll, "rdt toggle");
        };
        schedule(300, poll, "rdt toggle");
      }
      if (!reported) { reported = true; log(`rdt: Settings toggle added (${enabled ? "on" : "off"})`); uiLogTree(copyTransform, "rdt toggle row"); }
    }
    hookAttach(enable.virtualAddress, {
      onEnter(args) { this.self = args[0]; },
      onLeave() {
        const retained = new Il2Cpp.Object(this.self).ref(false);
        schedule(0, () => { try { install(retained.target); } catch (error) { log(`rdt: Settings toggle failed: ${error}`); } finally { retained.free(); } }, "rdt settings toggle");
      }
    });
  });
// END android-ui: rdt-toggle
