  // ---------------------------------------------------------------------
  // CreditsLoaderPatch: the TESL Reborn team in the credits screen.
  // ---------------------------------------------------------------------
  section("tesl reborn credits", () => {
    const credits = cls(img, "CreditsLoader");
    const lineData = cls(img, "CreditsWin").nested("LineDisplayData");
    hookAttach(credits.method("LoadCreditsForDisplay").virtualAddress, {
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
    hookAttach(cls(img, "UIResourceManager").method("GetTitleBannerSprite").virtualAddress, {
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
      hookAttach(method.virtualAddress, {
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
  // The render guard only runs while a legendary row is tracked.
  let armTitleGuard: (on: boolean) => void = () => {};
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
      armTitleGuard(true);
      const transform = call(image, "get_transform");
      log(`titles UI: list tint target=${String(call(transform, "get_name")?.content || "?")}`);
      uiLogTree(call(self, "get_transform"), "titles UI list paths");
    }
  }
  function maintainTitleListColours() {
    for (const [key, record] of legendaryTitleRows) {
      try {
        const row = record.row.target, image = record.image.target;
        if (!unityAlive(row) || !unityAlive(image)) {
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
    armTitleGuard(legendaryTitleRows.size > 0);
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
      hookAttach(method.virtualAddress, {
        onEnter(args) { this.self = args[0]; },
        onLeave() { try { titleListColour(new Il2Cpp.Object(this.self)); }
          catch (error) { log(`titles UI: list tint failed: ${error}`); } }
      });
    }
    // Use a render callback when present, otherwise the existing main-thread scheduler.
    const render = ucls("UnityEngine.Canvas").tryMethod("SendWillRenderCanvases", 0);
    if (render && !render.virtualAddress.isNull()) {
      armTitleGuard = gatedHook(render.virtualAddress, "enter", maintainTitleListColours);
      armTitleGuard(legendaryTitleRows.size > 0);
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
    // Report 106 (Pixel 8 Pro): aborted (setjmp cookie mismatch) a second
    // into a battle, when this panel updates. A dozen managed calls ran inside
    // the hook, where an exception aborts the game; the work now runs on the
    // next frame from the scheduler, on a panel checked to be alive.
    hookAttach(pip.method("UpdateUi").virtualAddress, {
      onEnter(args) { this.self = args[0]; },
      onLeave() {
        const retained = new Il2Cpp.Object(this.self).ref(false);
        schedule(0, () => { try { if (unityAlive(retained.target)) titleBanner(retained.target); } finally { retained.free(); } }, "legendary title banner");
      },
    });
    function titleBanner(panel) {
        try {
          const self = panel;
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
    }
  });

