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
    if (historyPopup && unityAlive(historyPopup.go.target)) call(historyPopup.go.target, "SetActive", false);
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
      // The list rebuilds its rows when match history reloads (report 32):
      // every object below is checked before it is called.
      if (!record || !unityAlive(record.row.target) || !Boolean(call(call(record.row.target, "get_gameObject"), "get_activeInHierarchy"))) {
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
      if (!record.hits.length || !unityAlive(record.hits[0].rect.target)) { historyHidePopup(); return; }
      const canvas = historyCanvas(record.hits[0].rect.target), camera = call(canvas, "get_worldCamera");
      if (!historyUsingNative && unityAlive(historyPopup.rect.target) && chatContains(historyPopup.rect.target, point, camera)) return;
      for (const target of historyTargets.values()) for (const hit of target.hits) {
        if (!unityAlive(hit.go.target) || !unityAlive(hit.rect.target)) continue;
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
      hookAttach(method.virtualAddress, {
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
    hookAttach(update.virtualAddress, { onLeave() { historyPoll(); } });
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
    hookAttach(execute.virtualAddress, {
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
    hookAttach(show.virtualAddress, {
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


