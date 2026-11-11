  section("news from tesl-reborn", () => {
    const widget = cls(img, "MenuNewsWidget");
    // The game's own coroutine is neutralised: it would show the
    // "news unavailable" panel, because its feed is dead.
    const iterator = img.classes.find(c => c.name === "<LoadNews>c__Iterator0" && c.declaringClass?.name === "MenuNewsWidget");
    if (iterator) {
      const moveNext = iterator.methods.find(m => m.name === "MoveNext");
      if (moveNext) {
        hookAttach(moveNext.virtualAddress, {
          onLeave(retval) { retval.replace(ptr(0)); },     // finish the coroutine at once
        });
      }
    } else log("news: the game's news coroutine was not found");

    hookAttach(widget.method("OnEnable").virtualAddress, {
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
    hookAttach(moveNext.virtualAddress, {
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

  // The game's TMP is the static-atlas 1.x version and its fonts have no
  // Chinese glyphs: the text came out empty. tools/prepare_cjk_font.py builds
  // an SDF atlas of the characters of the translation; it becomes a global
  // TMP fallback font, the way the emoji atlas becomes a sprite asset.
  let cjkFont: any = null, cjkFontTries = 0;
  function installCjkFont(): void {
    if (cjkFont || cjkFontTries >= 30) return;
    const path = `${persistentPath()}/tesl-reborn-fonts`;
    const tableText = readTextFile(`${path}/cjk.json`);
    if (!tableText) return;
    // The localization arrives before TMP has loaded any font; the material
    // of the first loaded one is the template, so wait for it.
    const fontClass = ucls("TMPro.TMP_FontAsset");
    let source: Il2Cpp.Object | null = fontClass.method("get_defaultFontAsset").invoke() as Il2Cpp.Object;
    if (isNull(source)) {
      const loaded = ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type").invoke(fontClass.type.object) as any;
      source = loaded.length ? loaded.get(0) : null;
    }
    if (isNull(source)) { if (cjkFontTries++ === 0) log("cjk font: waiting for a TMP font"); schedule(1000, installCjkFont, "cjk font"); return; }
    cjkFontTries = 30;
    try {
      const table = JSON.parse(tableText);
      const texture = ucls("UnityEngine.Texture2D").alloc(), handles = [texture.ref(false)];
      texture.method(".ctor").overload("System.Int32", "System.Int32", "UnityEngine.TextureFormat", "System.Boolean")
        .invoke(2, 2, enumBox(ucls("UnityEngine.TextureFormat"), 4), false);
      const loadAtlas = () => Boolean(ucls("UnityEngine.ImageConversion").method("LoadImage").overload("UnityEngine.Texture2D", "System.Byte[]")
        .invoke(texture, Il2Cpp.corlib.class("System.IO.File").method("ReadAllBytes", 1).invoke(Il2Cpp.string(`${path}/cjk.png`))));
      if (!loadAtlas()) throw Error("PNG decoding failed");
      const material = ucls("UnityEngine.Material").alloc();
      handles.push(material.ref(false));
      material.method(".ctor").overload("UnityEngine.Material").invoke((source as Il2Cpp.Object).field<Il2Cpp.Object>("material").value);
      call(material, "set_name", Il2Cpp.string("Noto Sans SC Material"));
      call(material, "set_mainTexture", texture);
      const face = table.face;
      for (const [name, value] of [["_TextureWidth", face.AtlasWidth], ["_TextureHeight", face.AtlasHeight], ["_GradientScale", face.Padding + 1]])
        material.method("SetFloat").overload("System.String", "System.Single").invoke(Il2Cpp.string(name as string), value as number);
      const asset = ucls("UnityEngine.ScriptableObject").method("CreateInstance").overload("System.Type").invoke(fontClass.type.object) as Il2Cpp.Object;
      handles.push(asset.ref(false));
      call(asset, "set_name", Il2Cpp.string("Noto Sans SC"));
      const info = newWith(ucls("TMPro.FaceInfo"));
      for (const [key, value] of Object.entries(face)) info.field(key).value = key === "Name" ? Il2Cpp.string(String(value)) : value as any;
      const glyphClass = ucls("TMPro.TMP_Glyph"), glyphs = Il2Cpp.array(glyphClass, table.glyphs.length);
      table.glyphs.forEach((item, i) => {
        const glyph = newWith(glyphClass);
        for (const [key, value] of Object.entries(item)) glyph.field(key).value = value as any;
        glyphs.set(i, glyph);
      });
      call(asset, "AddFaceInfo", info);
      call(asset, "AddGlyphInfo", glyphs);
      // ReadFontDefinition walks the kerning pairs; an asset made in code has none.
      asset.field("m_kerningInfo").value = newWith(ucls("TMPro.KerningTable"));
      // Chinese reports: the template's font weights sent bold CJK text (card
      // keywords) to RubikUnityBold, which has no CJK glyphs: its 3D sub mesh
      // got no material and TextMeshPro.GenerateTextMesh threw, stopping the
      // battle. Without weights TMP draws bold with this font itself.
      try { asset.field("fallbackFontAssets").value = uiList(fontClass); } catch (_) {}
      asset.field("atlas").value = texture;
      asset.field("material").value = material;
      try { asset.field("fontAssetType").value = enumBox(ucls("TMPro.TMP_FontAsset/FontAssetTypes"), 1) as any; } catch (_) {}
      call(asset, "ReadFontDefinition");
      const fallbacks = ucls("TMPro.TMP_Settings").method("get_fallbackFontAssets").invoke() as Il2Cpp.Object;
      if (isNull(fallbacks)) throw Error("TMP settings have no fallback list");
      call(fallbacks, "Add", asset);
      // Chinese report: a glyph missing from a card's font and every fallback
      // made TMP look in TMP_Settings' default font, null in this game; the
      // NullReferenceException ended BoardConductor's coroutine and the battle
      // stopped. The CJK font is that default when there is none.
      try {
        const settings = ucls("TMPro.TMP_Settings").method("get_instance").invoke() as Il2Cpp.Object;
        if (!isNull(settings) && isNull(settings.field<Il2Cpp.Object>("m_defaultFontAsset").value)) {
          settings.field("m_defaultFontAsset").value = asset;
          log("cjk font: also the TMP default font (there was none)");
        }
      } catch (error) { log(`cjk font: default font: ${error}`); }
      // Chinese reports: 3D card text refreshed after a mulligan threw in
      // TextMeshPro.GenerateTextMesh. TMP 1.x makes a per-text copy of the
      // fallback material and destroys it by reference count; with the preset
      // match off, CJK glyphs use this font's own material and nothing is
      // copied or destroyed.
      try {
        const settings = ucls("TMPro.TMP_Settings").method("get_instance").invoke() as Il2Cpp.Object;
        if (!isNull(settings)) { settings.field("m_matchMaterialPreset").value = false; log("cjk font: fallback material presets off"); }
      } catch (error) { log(`cjk font: material presets: ${error}`); }
      cjkFont = { asset, handles };
      (globalThis.__teslOnResume ??= []).push(() => log(`cjk font: atlas ${loadAtlas() ? "reloaded" : "reload failed"} after resume`));
      log(`cjk font: ${table.glyphs.length} glyphs added as a TMP fallback`);
    } catch (error) { log(`cjk font: ${error}`); }
  }

  // Store offers arrive from the server as finished English text, never as
  // keys. A text set to exactly an English dictionary value is replaced by
  // the Chinese value of the same key.
  let serverTextHooked = false;
  function translateServerText(chinese: Record<string, string>): void {
    if (serverTextHooked) return;
    serverTextHooked = true;
    try {
      const english = JSON.parse(readTextFile(`${persistentPath()}/tesl-localization-en_us.json`) || "{}");
      const byEnglish = new Map<string, string>();
      for (const key of Object.keys(english)) {
        const from = String(english[key]).trim(), to = chinese[key];
        // One word can be a player's name (Centurion, Victor): only texts of
        // several words, like store offers, are taken.
        if (/\s/.test(from) && /[A-Za-z]{3}/.test(from) && to && /[　-鿿]/.test(to) && !byEnglish.has(from)) byEnglish.set(from, to);
      }
      const pinned = new Map<string, any>();
      const method = ucls("TMPro.TMP_Text").method("set_text", 1);
      Interceptor.attach(method.virtualAddress, {
        onEnter(args) {
          if (args[1].isNull()) return;
          const text = new Il2Cpp.String(args[1]).content;
          if (!text || text.indexOf(" ") < 0) return;
          const to = byEnglish.get(text.trim());
          if (!to) return;
          let handle = pinned.get(to);
          if (!handle) { handle = new Il2Cpp.Object(Il2Cpp.string(to).handle).ref(true); pinned.set(to, handle); }
          args[1] = handle.target.handle;
        }
      });
      log(`localization: ${byEnglish.size} server texts translatable`);
    } catch (error) { log(`localization: server text: ${error}`); }
  }

  // Puts the strings that were recovered from the cached text bundle into the
  // game's localization dictionary, so the user interface shows the text
  // instead of the raw keys.
  function restoreLocalization(manager: Il2Cpp.Object, code: string): number {
    try {
      let text = "";
      // The file is named after the language ("en"), but the game also uses
      // the full language name ("en_US") for the text bundles.
      const selected = resourceLanguage() || code, overlay = textOverlay();
      const regional = selected.includes("_") ? selected.slice(0, 2) + "_" + selected.slice(3).toUpperCase() : selected;
      for (const name of overlay ? [overlay] : [selected, regional, shortLanguage(selected)]) {
        text = readTextFile(`${persistentPath()}/tesl-localization-${name}.json`);
        if (text) break;
      }
      if (!text) return 0;
      const json = JSON.parse(text);
      const keys = Object.keys(json);
      if (keys.length === 0) return 0;
      if (overlay) installCjkFont();
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
        const fixes = overlay ? {} : TRANSLATIONS[selected] || TRANSLATIONS[shortLanguage(selected)] || {};
        for (const key of Object.keys(fixes))
          (retained.target.method("set_Item") as any).invoke(Il2Cpp.string(key), Il2Cpp.string(fixes[key]));
        manager.field<any>("_localizedData").value = retained.target;
        if (overlay) translateServerText(json);
        // Menus, Audio, errors and loading tips come from a second, built-in
        // table that the text bundles never replace.
        if (overlay) try {
          const extra = JSON.parse(readTextFile(`${persistentPath()}/tesl-localization-zh_cn-login.json`) || "{}");
          const login = manager.field<any>("_loginLocalizedData").value;
          if (!isNull(login)) for (const key of Object.keys(extra))
            (login.method("set_Item") as any).invoke(Il2Cpp.string(key), Il2Cpp.string(String(extra[key])));
        } catch (error) { log(`localization: login table: ${error}`); }
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

  // A text-only language (Simplified Chinese) runs the game, its resources and
  // the server in English; only the dictionary and the font are swapped.
  function textOverlay(): string {
    try {
      const choice = JSON.parse(readTextFile(`${persistentPath()}/tesl-reborn-language.json`) || "null");
      if (choice && choice.overlay === "zh_cn" && choice.language === "en_us") return "zh_cn";
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

  // Reports 97 and 102: Settings opened after a battle aborted the game
  // (setjmp cookie mismatch). The window kept from before the battle was
  // destroyed with its scene; a call on a destroyed object throws inside
  // Unity, and that exception crossing a hook aborts the process, try/catch
  // or not. The kept window is checked with Unity's own null test first.
  function liveSettingsWindow(): any {
    let destroyed = false;
    if (resourceSettingsWindow) try { destroyed = Boolean(ucls("UnityEngine.Object").method("op_Equality").invoke(resourceSettingsWindow.target, NULL)); } catch (_) {}
    if (destroyed) { resourceSettingsWindow.free(); resourceSettingsWindow = null; }
    return resourceSettingsWindow;
  }
  function resourceSettingsOpen(): boolean {
    try { return liveSettingsWindow() != null && Boolean(call(resourceSettingsWindow.target, "get_activeInHierarchy")); }
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
      ru_ru:["русский","русскийязык","russian"],tr_tr:["türkçe","turkish","турецкий"],
      zh_cn:["简体中文","中文","simplifiedchinese","chinese","китайский"] };
    return Object.keys(native).find(code => native[code].includes(label));
  }

