  section("stats and deck statistics", () => {
    // Stats.OnResponse: the statistics arrived, ask for the extended data.
    hookAttach(cls(img, "SparkleServices.Stats").method("OnResponse").virtualAddress, {
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
    hookAttach(cls(img, "SparkleServices.Inventory").method("OnResponse").virtualAddress, {
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
      hookAttach(method.virtualAddress, {
        onLeave() { schedule(1000, () => refreshDeckStats(true), "deck stats refresh"); },
      });
    }

    // GetResponseStatus is shared by every service (generic sharing), so the
    // return value is only changed for the statistics service: while the
    // extended data is still loading the match history keeps waiting.
    const getResponseStatus = cls(img, "SparkleServices.Stats").method("GetResponseStatus");
    if (getResponseStatus) {
      hookAttach(getResponseStatus.virtualAddress, {
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
    hookAttach(deckTile.method("SetData", 2).virtualAddress, {
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
      hookAttach(destroy.virtualAddress, {
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

