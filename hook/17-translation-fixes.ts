  section("translation fixes", () => {
    const localization = cls(img, "LocalizationManager");
    let lastLanguage = "", lastRestored = "", lastRestoredDictionary = "", lastFixed = "", loaded = false, switching = false, languageInputDepth = 0, recentInputAt = 0, recentExplicitInputAt = 0, switchingAt = 0;
    let inputMethods = null;
    // Every frame only the touch count is read (one call instead of three plus
    // lookups, ~10 ms/s on the Pixel 8 Pro); the mouse is checked on demand.
    function noteLanguageInput(full = true) {
      try {
        if (!inputMethods) {
          const input = ucls("UnityEngine.Input");
          inputMethods = { touches: input.method("get_touchCount", 0), down: input.method("GetMouseButtonDown", 1), up: input.method("GetMouseButtonUp", 1) };
        }
        if (Number(inputMethods.touches.invoke()) > 0 ||
            full && (inputMethods.down.invoke(0) || inputMethods.up.invoke(0))) {
          recentExplicitInputAt = Date.now();
          if (resourceSettingsOpen()) recentInputAt = recentExplicitInputAt;
        }
      } catch (_) {}
    }
    // Settings may save a preference and load its language asynchronously, after
    // the UI callback has returned. Remember actual input, not just stack depth.
    try {
      hookAttach(cls(img, "SparkleServices.ServicesManager").method("Update", 0).virtualAddress, {
        touchOnly: true, onEnter() { noteLanguageInput(false); }
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
        hookAttach(method.virtualAddress, {
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
    // The game's own list has no Chinese. It is added as one more entry, and
    // is the selected one while it is the text; choosing it goes through
    // Game data like any other language.
    for (const name of ["UnityEngine.UI.Dropdown", "TMPro.TMP_Dropdown"]) {
      try {
        const method = ucls(name).tryMethod("RefreshShownValue", 0);
        if (!method || method.virtualAddress.isNull()) continue;
        Interceptor.attach(method.virtualAddress, {
          onEnter(args) {
            try {
              const self = new Il2Cpp.Object(args[0]), options = call(self, "get_options"), count = Number(call(options, "get_Count"));
              if (count < 2 || count > 16) return;
              let recognized = 0, chinese = -1;
              for (let i=0; i<count; i++) {
                const code = languageLabel(String(call(call(options, "get_Item", i), "get_text")?.content || ""));
                if (code) recognized++;
                if (code === "zh_cn") chinese = i;
              }
              if (recognized < 2) return;
              if (chinese >= 0) return;
              // Only when the entry is added: afterwards the player's choice stands.
              // The CJK font is loaded only for Chinese; other languages get a Latin name.
              const option = call(options, "get_Item", 0).class.alloc();
              option.method(".ctor").overload("System.String").invoke(Il2Cpp.string(textOverlay() ? "简体中文" : "Simplified Chinese"));
              call(options, "Add", option);
              if (textOverlay()) self.field("m_Value").value = count;
            } catch (_) {}
          }
        });
      } catch (error) { log(`resources: ${name} Chinese entry: ${error}`); }
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
      hookAttach(method.virtualAddress, {
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
        hookAttach(method.virtualAddress, {
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
                if (labels.filter(Boolean).length >= 2 && labels[selectedIndex]) requestLanguage(labels[selectedIndex], textOverlay() || resourceLanguage());
              } catch (error) { log(`resources: language dropdown: ${error}`); }
              finally { retained.free(); }
            });
          }
        });
      } catch (_) {}
    }
    const setLanguage = localization.method("SetLanguage", 2);
    hookAttach(setLanguage.virtualAddress, {
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
      hookAttach(method.virtualAddress, {
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
      hookAttach(method.virtualAddress, {
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
    if (systemLanguage) hookAttach(systemLanguage.virtualAddress, {
      onLeave(result) {
        const choice = resourceLanguage(); if (!choice) return;
        const names = choice === "es_mx" ? ["spanish"] : languageNames[choice];
        const field = systemLanguage.returnType.class.fields.find(f => f.isStatic && names.includes(f.name.toLowerCase()));
        if (field) result.replace(ptr(enumVal(field.value)));
      }
    });
    hookAttach(localization.method("UpdateObjects").virtualAddress, {
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

