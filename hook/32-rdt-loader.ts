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
  // RDT's own settings (keys "rdt.*") live in <private files>/rdt/settings.json.
  // One copy in memory, shared by teslPort.settings and the Settings rows, so
  // a switch flipped in Settings is seen by the module at its next read.
  let rdtSettingsCache = null;
  const rdtSettingsFile = () => `${privateDir()}/rdt/settings.json`;
  function rdtSettings() {
    if (!rdtSettingsCache) {
      try { rdtSettingsCache = JSON.parse(readTextFile(rdtSettingsFile()) || "{}") || {}; } catch (_) { rdtSettingsCache = {}; }
    }
    return rdtSettingsCache;
  }
  function rdtSettingSet(key, value) {
    if (!String(key).startsWith("rdt.")) throw Error("RDT settings keys start with rdt.");
    rdtSettings()[key] = value;
    makeDirectory(`${privateDir()}/rdt`);
    writeTextFile(rdtSettingsFile(), JSON.stringify(rdtSettings()));
  }
  section("rdt module loader", () => {
    const optionFile = `${persistentPath()}/tesl-reborn-rdt.json`;
    let enabled = false;
    try { enabled = JSON.parse(readTextFile(optionFile) || "{}")?.enabled === true; } catch (_) {}
    if (!enabled) return;
    const dir = `${privateDir()}/rdt`, cacheFile = `${dir}/rdt.js`, stateFile = `${dir}/state.json`;
    makeDirectory(dir);
    const readJson = path => { try { return JSON.parse(readTextFile(path) || "{}") || {}; } catch (_) { return {}; } };
    const coreRevision = Number(globalThis.TeslRebornUpdater?.current()?.revision) || 0;
    let ran = false;

    globalThis.teslPort = {
      version: `${APK_LEVEL}.${coreRevision}`,
      core: coreRevision,
      log: message => log(`rdt: ${message}`),
      dataDir: dir,
      settings: { get: key => rdtSettings()[key], set: rdtSettingSet },
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
  const RDT_COUNT_LABELS = {
    en_us: "Deck tracker: count left only", ru_ru: "Трекер: только остаток карт", de_de: "Tracker: nur verbleibende Karten",
    es_es: "Rastreador: solo cartas restantes", es_mx: "Rastreador: solo cartas restantes", fr_fr: "Suivi : cartes restantes seulement",
    it_it: "Tracker: solo carte rimaste", pl_pl: "Tracker: tylko pozostałe karty", pt_br: "Rastreador: só cartas restantes",
    tr_tr: "Takipçi: yalnızca kalan kartlar", zh_cn: "追踪器：仅显示剩余数量",
  };
  function rdtCountLabel() { return RDT_COUNT_LABELS[textOverlay() || resourceLanguage()] || RDT_COUNT_LABELS.en_us; }
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
    // A copy of `row` placed at `index` in `container`: its own label, its own
    // switch, none of the original's listeners or localization.
    function addRow(row, container, index, name, initial, label, changed) {
      const copy = ucls("UnityEngine.Object").method("Instantiate").overload("UnityEngine.Object", "UnityEngine.Transform", "System.Boolean")
        .invoke(call(row, "get_gameObject"), container, false);
      call(copy, "set_name", Il2Cpp.string(name));
      const copyTransform = call(copy, "get_transform");
      call(copyTransform, "SetSiblingIndex", index);
      // Localization components would put "Double Tap to End Turn" back.
      const behaviours = copy.method("GetComponentsInChildren").overload("System.Type", "System.Boolean").invoke(ucls("UnityEngine.MonoBehaviour").type.object, true);
      for (let i = 0; i < behaviours.length; i++) {
        const behaviour = behaviours.get(i);
        if (/^Locali[sz]e/.test(behaviour.class.name)) call(behaviour, "set_enabled", false);
      }
      const labels = copy.method("GetComponentsInChildren").overload("System.Type", "System.Boolean").invoke(ucls("TMPro.TMP_Text").type.object, true);
      let text = null, longest = -1;
      for (let i = 0; i < labels.length; i++) {
        const value = String(call(labels.get(i), "get_text")?.content || "");
        if (value.length > longest) { longest = value.length; text = labels.get(i); }
      }
      const toggles = copy.method("GetComponentsInChildren").overload("System.Type", "System.Boolean").invoke(toggleClass.type.object, true);
      if (!toggles.length) throw Error("copied row has no toggle");
      const toggle = toggles.get(0);
      // A fresh event: the copy must not keep the double-tap setting's listeners.
      const eventClass = toggleClass.nestedClasses.find(c => c.name === "ToggleEvent");
      const fresh = eventClass.alloc(); fresh.method(".ctor", 0).invoke();
      toggle.field("onValueChanged").value = fresh;
      let state = initial;
      call(toggle, "set_isOn", state);
      const show = () => { if (text) call(text, "set_text", Il2Cpp.string(label(state))); };
      show();
      const onValue = value => {
        if (value === state) return;
        state = value;
        changed(value);
        show();
      };
      const keepToggle = toggle.ref(false);
      try {
        const action = ucls("UnityEngine.Events.UnityAction`1").inflate(Il2Cpp.corlib.class("System.Boolean"));
        call(fresh, "AddListener", Il2Cpp.delegate(action, value => { try { onValue(Boolean(value)); } catch (error) { log(`rdt: toggle failed: ${error}`); } }));
      } catch (error) {
        // No generic delegate: read the switch while the window lives.
        log(`rdt: toggle listener unavailable (${error}); polling`);
        const poll = () => {
          if (!unityAlive(keepToggle.target)) { keepToggle.free(); return; }
          onValue(Boolean(call(keepToggle.target, "get_isOn")));
          schedule(300, poll, "rdt toggle");
        };
        schedule(300, poll, "rdt toggle");
      }
      return copyTransform;
    }
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
      const at = Number(call(row, "GetSiblingIndex"));
      const enabled = readEnabled();
      const tracker = addRow(row, container, at + 1, "RebornRdtRow", enabled, value => rdtLabel(value, running), value => {
        writeTextFile(optionFile, JSON.stringify({ enabled: value }));
        log(`rdt: tracker ${value ? "on" : "off"} from Settings (applies on restart)`);
      });
      const countLeftOnly = rdtSettings()["rdt.countLeftOnly"] === true;
      addRow(row, container, at + 2, "RebornRdtCountRow", countLeftOnly, () => rdtCountLabel(), value => {
        rdtSettingSet("rdt.countLeftOnly", value);
        log(`rdt: count ${value ? "left only" : "left / total"} from Settings`);
      });
      // The Preferences panel has a fixed height (672: two 120 headers and
      // the game's rows of 80); the two rows added make it 48 too tall. The
      // section headers, mostly empty space, give up what is missing.
      try {
        const heightOf = node => Number(call(uiRect(call(node, "get_gameObject")), "get_rect").field("m_Height").value);
        const headers = [];
        let total = 0;
        for (let i = 0, n = Number(call(container, "get_childCount")); i < n; i++) {
          const child = call(container, "GetChild", i);
          if (!Boolean(call(call(child, "get_gameObject"), "get_activeSelf"))) continue;
          total += heightOf(child);
          if (/^Header/.test(String(call(child, "get_name")?.content))) headers.push(child);
        }
        const over = total - heightOf(container);
        if (over > 0 && headers.length) {
          const cut = Math.ceil(over / headers.length);
          for (const header of headers) {
            const go = call(header, "get_gameObject"), height = Math.max(40, heightOf(header) - cut);
            let element = go.method("GetComponent").overload("System.Type").invoke(ucls("UnityEngine.UI.LayoutElement").type.object);
            if (isNull(element)) element = uiAdd(go, "UnityEngine.UI.LayoutElement");
            call(element, "set_minHeight", height); call(element, "set_preferredHeight", height);
            const rect = uiRect(go), size = call(rect, "get_sizeDelta");
            call(rect, "set_sizeDelta", vec2(Number(size.field("x").value), height));
          }
          ucls("UnityEngine.UI.LayoutRebuilder").method("ForceRebuildLayoutImmediate", 1).invoke(uiRect(call(container, "get_gameObject")));
          if (!reported) log(`rdt: Settings headers shortened by ${cut} to fit ${over} more`);
        }
      } catch (error) { log(`rdt: Settings fit failed: ${error}`); }
      if (!reported) {
        reported = true;
        log(`rdt: Settings rows added (tracker ${enabled ? "on" : "off"}, count ${countLeftOnly ? "left only" : "left / total"})`);
        try {
          const height = node => Number(call(uiRect(call(node, "get_gameObject")), "get_rect").field("m_Height").value).toFixed(0);
          const layout = container.method("GetComponent").overload("System.Type").invoke(ucls("UnityEngine.UI.VerticalLayoutGroup").type.object);
          const rows = [];
          for (let i = 0, n = Number(call(container, "get_childCount")); i < n; i++) {
            const child = call(container, "GetChild", i);
            rows.push(`${call(child, "get_name")?.content}:${height(child)}${Boolean(call(call(child, "get_gameObject"), "get_activeSelf")) ? "" : "(off)"}`);
          }
          const chain = [];
          for (let node = container, depth = 0; !isNull(node) && depth < 5; node = call(node, "get_parent"), depth++) {
            const scroll = node.method("GetComponent").overload("System.Type").invoke(ucls("UnityEngine.UI.ScrollRect").type.object);
            chain.push(`${call(node, "get_name")?.content}:${height(node)}${isNull(scroll) ? "" : "(scroll)"}`);
          }
          log(`rdt: Settings layout spacing ${call(layout, "get_spacing")}, rows ${rows.join(" ")}; parents ${chain.join(" < ")}`);
        } catch (error) { log(`rdt: Settings layout unreadable: ${error}`); }
      }
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
