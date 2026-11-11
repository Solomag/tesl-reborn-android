  // BEGIN android-ui: native-language-dropdown
  section("native Settings language selection", () => {
    const owner=img.classes.find(c=>c.name==="LanguageSelectDropdown");
    const handler=owner?.tryMethod("HandleLanguageOnValueChanged",1);
    if(!handler || handler.virtualAddress.isNull()) return;
    let selecting=0, selectionHooks=0;
    for(const name of ["UnityEngine.UI.Dropdown","TMPro.TMP_Dropdown"]) try {
      const method=ucls(name).tryMethod("OnSelectItem",1);if(!method || method.virtualAddress.isNull()) continue;
      hookAttach(method.virtualAddress,{onEnter(){selecting++;},onLeave(){selecting=Math.max(0,selecting-1);}});
      selectionHooks++;
    } catch(_) {}
    if(!selectionHooks) return;
    handler.implementation=function(index) {
      if(!selecting) return handler.invokeRaw(this.handle,index);
      try {
        let dropdown=this;
        try {call(dropdown,"get_options");} catch(_) {
          const field=this.class.fields.find(f=>!f.isStatic && /^(UnityEngine.UI.Dropdown|TMPro.TMP_Dropdown)$/.test(f.type.name));
          dropdown=field ? this.field(field.name).value : null;
        }
        if(isNull(dropdown)) throw Error("Language dropdown instance unavailable");
        const options=call(dropdown,"get_options"),count=Number(call(options,"get_Count"));
        if(index<0 || index>=count || count>32) return;
        const label=String(call(call(options,"get_Item",index),"get_text")?.content||"");
        const code=languageLabel(label);
        if(!code) throw Error("Unknown language label " + JSON.stringify(label.slice(0,120)));
        if(code===(textOverlay()||resourceLanguage())) return;
        log(`native language dropdown: selected ${code}`);
        schedule(0,()=>ucls("UnityEngine.Application").method("OpenURL",1).invoke(Il2Cpp.string(languageSetupUri("language="+code+"&apply=1"))));
      } catch(error) {
        log(`native language dropdown: ${error}`);
        schedule(0,()=>ucls("UnityEngine.Application").method("OpenURL",1).invoke(Il2Cpp.string(languageSetupUri("chooseLanguage=1"))));
      }
    };
    globalThis.__teslNativeLanguageCallback=true;
  });
  // END android-ui: native-language-dropdown

  // BEGIN android-ui: settings-data
  const closingSettings = new Set();
  function settingsWindowKey(self) { return (self.class?.type.name === "UnityEngine.GameObject" ? self : call(self,"get_gameObject")).handle.toString(); }
  function settingsClosing(self, reason) {
    const key = settingsWindowKey(self);
    if (closingSettings.size > 128) closingSettings.clear();
    closingSettings.add(key);
    // Cancel restores the game's saved UI state. Do not recreate our child
    // while that restoration or the close animation is still running.
    const root = call(self,"get_transform"), child = call(root,"Find",Il2Cpp.string("RebornGameData"));
    // Let the native dialog hide its own hierarchy. No SetActive during Cancel:
    // changing a child here can trigger an unnecessary layout rebuild.
    if (resourceSettingsWindow && resourceSettingsWindow.target.handle.toString() === key) {
      resourceSettingsWindow.free(); resourceSettingsWindow = null;
    }
    log(`settings UI: ${reason}; custom control suspended`);
  }
  function settingsButtonPressed(button) {
    try {
      let node=call(button,"get_transform"),names=[];
      const buttonName=String(call(node,"get_name")?.content||"");
      try {
        const event=call(button,"get_onClick");
        const countMethod=event.tryMethod("GetPersistentEventCount",0);
        const nameMethod=event.tryMethod("GetPersistentMethodName",1);
        if(countMethod && nameMethod) {
          const count=Math.min(32,Number(countMethod.invoke()));
          for(let i=0;i<count;i++)names.push(String(nameMethod.invoke(i)?.content||""));
        } else {
          // Unity can strip the public introspection methods. Read only fields
          // whose actual runtime metadata identifies the persistent call list.
          const fields=Array.from(event.class.hierarchy()).flatMap(c=>c.fields);
          const groupField=fields.find(f=>!f.isStatic && /PersistentCallGroup$/.test(f.type.name));
          const group=groupField && event.field(groupField.name).value;
          if(!isNull(group)) {
            const listField=group.class.fields.find(f=>!f.isStatic && /List.*PersistentCall/.test(f.type.name));
            const list=listField && group.field(listField.name).value;
            if(!isNull(list))for(let i=0,count=Math.min(32,Number(call(list,"get_Count")));i<count;i++) {
              const entry=call(list,"get_Item",i),field=entry.class.fields.find(f=>!f.isStatic && /methodname/i.test(f.name) && f.type.name==="System.String");
              if(field)names.push(String(entry.field(field.name).value?.content||""));
            }
          }
        }
      }catch(_) { /* Button name and ancestor path still work without event metadata. */ }
      for(let depth=0;depth<10 && !isNull(node);depth++,node=call(node,"get_parent")) {
        const name=String(call(node,"get_name")?.content||"");
        if(!/^SettingsWin[_ -]?Mobile(?:\(Clone\))?$/i.test(name) && !/^SettingsWin(?:\(Clone\))?$/i.test(name)) continue;
        const action=[buttonName,...names].join(" ");
        log(`settings button: ${action.slice(0,240)}`);
        if(/cancel|close|back|negative|dismiss|\bok\b|confirm|accept/i.test(action)) settingsClosing(call(node,"get_gameObject"),action);
        return;
      }
    }catch(error){log(`settings button trace: ${error}`);}
  }
  const gameDataLabels = {en_us:"Game data",de_de:"Spieldaten",es_es:"Datos del juego",es_mx:"Datos del juego",fr_fr:"Données du jeu",it_it:"Dati di gioco",pl_pl:"Dane gry",pt_br:"Dados do jogo",ru_ru:"Данные игры",tr_tr:"Oyun verileri",zh_cn:"游戏数据"};
  // LocalizationManager.GetText answers the Video tab's key with "Game data",
  // natively: it runs for every localized text. The key (UTF-16) and the
  // managed answer are set from JS once the key is known (saved per phone).
  section("settings: Video tab text", () => {
    const getText = cls(img, "LocalizationManager").method("GetText", 1);
    const state = Memory.alloc(8 + 8 + 2 * 64); // answer ptr @0, key length @8, key chars @16
    const cm = new CModule(`
#include <gum/guminterceptor.h>
typedef unsigned short u16;
typedef struct { void * answer; int length; int pad; u16 chars[64]; } State;
extern State state;
void onEnter (GumInvocationContext * ic) {
  void * key = gum_invocation_context_get_nth_argument (ic, 1);
  int match = 0;
  if (key && state.answer && state.length > 0 && *(int *) ((char *) key + 0x10) == state.length) {
    u16 * chars = (u16 *) ((char *) key + 0x14);
    match = 1;
    for (int i = 0; i < state.length; i++) if (chars[i] != state.chars[i]) { match = 0; break; }
  }
  GUM_IC_GET_INVOCATION_DATA (ic, int)[0] = match;
}
void onLeave (GumInvocationContext * ic) {
  if (GUM_IC_GET_INVOCATION_DATA (ic, int)[0]) gum_invocation_context_replace_return_value (ic, state.answer);
}
`, { state });
    let answer = null;
    const file = `${persistentPath()}/tesl-reborn-ui-keys.json`;
    const use = (key) => {
      if (!key || key.length > 64) return;
      // Report 109: Il2Cpp.String has no ref(); the string is pinned as an
      // object (a GC handle keeps it alive for the native answer).
      if (!answer) answer = new Il2Cpp.Object(Il2Cpp.string(gameDataLabels[textOverlay()||resourceLanguage()] || "Game data").handle).ref(true);
      state.writePointer(answer.target.handle); state.add(8).writeS32(key.length);
      for (let i = 0; i < key.length; i++) state.add(16 + i * 2).writeU16(key.charCodeAt(i));
    };
    // The tab's key (report 111 learned settings.video; the localization
    // file's settings.Video.tab is another text), so the very first window
    // already reads Game data; a key
    // learned on a phone (saved) still wins if the game ever changes it.
    let known = "settings.video";
    try { known = JSON.parse(readTextFile(file) || "{}")?.videoTab || known; } catch (_) {}
    if (known) use(known);
    globalThis.__teslVideoTabKey = (key) => {
      if (key === known) return;
      known = key; use(key);
      try { writeTextFile(file, JSON.stringify({ videoTab: key })); } catch (_) {}
      log(`settings data: Video tab key ${key} answered with Game data`);
    };
    Interceptor.attach(getText.virtualAddress, cm as any);
    (globalThis as any).__teslVideoTabKeep = cm;
    log(`settings data: Video tab text override ${known ? "for " + known : "waits for the key"}`);
  });
  // The quality choice was removed after report 90, but hiding the Video tab
  // (153) lost the separate Game data button after battles (reports 94-97).
  // The Video tab itself becomes Game data: the window keeps its own four-tab
  // layout, the quality dropdown is hidden, and selecting that tab opens the
  // Reborn data screen (HandleOnTabSelected below).
  let videoKeyReported = false;
  function videoTabAsGameData(self) {
    let video = null, dropdown = null;
    try { video = self.field("_videoButton").value; dropdown = self.field("_qualityDropdown").value; } catch (_) { return false; }
    if (!unityAlive(video)) return false;
    if (!Boolean(call(video, "get_activeSelf"))) call(video, "SetActive", true);
    const text = Il2Cpp.string(gameDataLabels[textOverlay()||resourceLanguage()] || "Game data");
    for (const type of ["TMPro.TextMeshProUGUI", "UnityEngine.UI.Text"]) {
      try {
        const labels = video.method("GetComponentsInChildren").overload("System.Type", "System.Boolean").invoke(ucls(type).type.object, true);
        for (let i = 0; i < labels.length; i++) {
          const label = labels.get(i);

          call(label, "set_text", text);
        }
      } catch (_) {}
    }
    if (unityAlive(dropdown)) { const go = call(dropdown, "get_gameObject"); if (Boolean(call(go, "get_activeSelf"))) call(go, "SetActive", false); }
    // Report 102: the label read "Video" until another tab was picked; a
    // localization component sets it from a key. Report 108: none was found
    // on the text object itself, so every Localize* component under the tab
    // is searched. Its key is answered with "Game data" by
    // LocalizationManager.GetText (above), so later windows draw it at once.
    try {
      const found = [];
      for (const name of ["LocalizeTextMeshProUGUI", "LocalizeTextMeshPro", "LocalizeTextUGUI"]) {
        const klass = img.classes.find(c => c.name === name);
        if (!klass) continue;
        const parts = video.method("GetComponentsInChildren").overload("System.Type", "System.Boolean").invoke(klass.type.object, true);
        for (let j = 0; j < parts.length; j++) {
          const key = String(parts.get(j).field("_key").value?.content || "");
          found.push(`${name}:${key || "-"}`);
          if (key) globalThis.__teslVideoTabKey?.(key);
        }
      }
      if (!found.length && !videoKeyReported) { videoKeyReported = true; log("settings data: no localization component under the Video tab"); }
    } catch (error) { if (!videoKeyReported) { videoKeyReported = true; log(`settings data: Video tab key unreadable: ${error}`); } }
    // Report 104: the window opens on Audio but its TabGroup leaves the first
    // toggle (Video, hidden on mobile until now) lit. The toggle of the tab
    // actually shown is switched on; the group turns the others off.
    try {
      const active = enumVal(self.field("_activeTabIndex").value);
      const toggles = self.field("_tabNavigation").value.field("_toggles").value;
      if (active > 0 && active < toggles.length) {
        const toggle = toggles.get(active);
        if (unityAlive(toggle) && !Boolean(call(toggle, "get_isOn"))) call(toggle, "set_isOn", true);
      }
    } catch (_) {}
    // A separate button from an earlier patch goes.
    const old = findGameDataButton(call(self, "get_transform"));
    if (!isNull(old)) { const go = call(old, "get_gameObject"); call(go, "set_name", Il2Cpp.string("RebornGameDataOld")); call(go, "SetActive", false); ucls("UnityEngine.Object").method("Destroy").overload("UnityEngine.Object").invoke(go); }
    return true;
  }
  function installSettingsDataButton(self) {
    if (!fileExists(`${persistentPath()}/tesl-reborn-setup.json`)) return;
    if (closingSettings.has(settingsWindowKey(self))) return;
    const root = call(self, "get_transform");
    const rootName = String(call(root, "get_name")?.content || "");
    const typeName = String(self.class?.name || "");
    const compactName=rootName.replace(/\(Clone\)$/i,"").replace(/[_ -]/g,"");
    // Captured device prefabs: OptionsWinMobile is the gear shortcut menu;
    // SettingsWin_Mobile inside PopupWinTemplate is the actual settings dialog.
    if (typeName==="OptionsWin" || /^OptionsWin(?:Mobile)?$/i.test(compactName)) {
      const old=findGameDataButton(root);
      if(!isNull(old)) ucls("UnityEngine.Object").method("Destroy").overload("UnityEngine.Object").invoke(call(old,"get_gameObject"));
      return;
    }
    if(typeName!=="SettingsWin" && !/^SettingsWin(?:Mobile)?$/i.test(compactName)) return;
    const window = call(root, "get_gameObject");
    if ((typeof liveSettingsWindow === "function" ? liveSettingsWindow() : resourceSettingsWindow) && !resourceSettingsWindow.target.handle.equals(window.handle)) {
      try {
        const previous = call(resourceSettingsWindow.target, "get_transform");
        if (Boolean(call(resourceSettingsWindow.target, "get_activeInHierarchy")) && Boolean(call(previous, "IsChildOf", root))) return;
        if (Boolean(call(root, "IsChildOf", previous))) {
          const old = findGameDataButton(previous);
          if (!isNull(old)) ucls("UnityEngine.Object").method("Destroy").overload("UnityEngine.Object").invoke(call(old, "get_gameObject"));
        }
      } catch (_) {}
    }
    if (!isNull(window) && (!resourceSettingsWindow || !resourceSettingsWindow.target.handle.equals(window.handle))) {
      if (resourceSettingsWindow) resourceSettingsWindow.free();
      resourceSettingsWindow = window.ref(false);
    }
    try { if (videoTabAsGameData(self)) return; } catch (error) { log(`settings data: video tab: ${error}`); }
    const existing = findGameDataButton(root);
    if (!isNull(existing)) { const go=call(existing,"get_gameObject"); if(!call(go,"get_activeSelf"))call(go,"SetActive",true); return; }
    const labels = gameDataLabels;
    const button = uiLabeledButton("RebornGameData", root, labels[textOverlay()||resourceLanguage()] || "Game data", -70, -64, 180, () => {
      ucls("UnityEngine.Application").method("OpenURL", 1).invoke(Il2Cpp.string("teslreborn://resources"));
    });
    // Fit in the free right margin beside the native tabs, not over Preferences.
    uiPlace(button,1,1,1,1,-18,-74,180,48);
    const layout = uiAdd(button, "UnityEngine.UI.LayoutElement");
    call(layout, "set_ignoreLayout", true);
    try { styleAsSettingsTab(self, button, layout); }
    catch (error) { log(`settings button: kept the plain Game data button: ${error}`); }
  }
  // The plain grey button looked foreign next to Audio and Preferences. It
  // becomes a third tab: the first tab's frame sprite, font, size and anchors,
  // in the tab row. TabGroup keeps its tabs in _toggles, and this Button is
  // not a Toggle, so tab switching is untouched. Report 31: styled but left
  // small in the corner - each step is now logged, so a report names the one
  // that fails. A row laid out by a HorizontalLayoutGroup centres the three
  // tabs itself; otherwise the button goes one tab step past the last tab and
  // the row moves back half a step, so the three stay centred as the two were.
  function styleAsSettingsTab(self, button, layout) {
    let step = "tab group";
    try {
      const group = self.field("_tabNavigation").value;
      if (isNull(group)) throw Error("no _tabNavigation");
      const toggles = group.field("_toggles").value;
      if (isNull(toggles) || !toggles.length) throw Error("no settings tabs");
      const first = toggles.get(0), last = toggles.get(toggles.length - 1);
      const firstNode = call(call(first, "get_gameObject"), "get_transform"), lastNode = call(call(last, "get_gameObject"), "get_transform");
      const row = call(lastNode, "get_parent");
      if (isNull(row)) throw Error("settings tab has no row");
      step = "frame";
      const art = call(first, "get_targetGraphic"), image = uiComponent(button, "UnityEngine.UI.Image");
      if (!isNull(art) && art.class.type.name === "UnityEngine.UI.Image" && !isNull(image)) {
        call(image, "set_sprite", call(art, "get_sprite"));
        call(image, "set_type", call(art, "get_type"));
        call(image, "set_color", call(art, "get_color"));
      }
      step = "label";
      const tmp = ucls("TMPro.TextMeshProUGUI").type.object;
      // GameObject.GetComponentInChildren(Type) is stripped in this player
      // (report 31); GetComponentsInChildren(Type, bool) is kept.
      const firstIn = go => { const all = go.method("GetComponentsInChildren").overload("System.Type", "System.Boolean").invoke(tmp, true); return all.length ? all.get(0) : null; };
      const tabLabel = firstIn(call(first, "get_gameObject"));
      const label = firstIn(button);
      if (!isNull(tabLabel) && !isNull(label)) {
        call(label, "set_font", call(tabLabel, "get_font"));
        call(label, "set_color", call(tabLabel, "get_color"));
        // Auto-sizing setters may be stripped as well: copy what exists.
        const copy = name => { const get = tabLabel.tryMethod("get_" + name, 0), set = label.tryMethod("set_" + name, 1); if (get && set) set.invoke(get.invoke()); };
        for (const name of ["enableAutoSizing", "fontSizeMin", "fontSizeMax", "fontSize"]) copy(name);
      }
      step = "size";
      const bounds = call(lastNode, "get_rect");
      const width = Number(bounds.field("m_Width").value), height = Number(bounds.field("m_Height").value);
      const vec = value => ({ x: Number(value.field("x").value), y: Number(value.field("y").value) });
      step = "row";
      const node = call(button, "get_transform");
      node.method("SetParent").overload("UnityEngine.Transform", "System.Boolean").invoke(row, false);
      call(node, "SetAsLastSibling");
      call(node, "set_localScale", call(lastNode, "get_localScale"));
      for (const name of ["anchorMin", "anchorMax", "pivot"]) call(node, "set_" + name, call(lastNode, "get_" + name));
      call(node, "set_sizeDelta", call(lastNode, "get_sizeDelta"));
      call(layout, "set_preferredWidth", width); call(layout, "set_preferredHeight", height);
      const flow = uiComponent(call(row, "get_gameObject"), "UnityEngine.UI.HorizontalLayoutGroup");
      if (!isNull(flow)) {
        call(layout, "set_ignoreLayout", false);
        log(`settings button: third tab in the row layout (${Math.round(width)}x${Math.round(height)})`);
        return;
      }
      step = "position";
      const a = vec(call(firstNode, "get_anchoredPosition")), b = vec(call(lastNode, "get_anchoredPosition"));
      const gap = toggles.length > 1 ? (b.x - a.x) / (toggles.length - 1) : width + 16;
      call(node, "set_anchoredPosition", vec2(b.x + gap, b.y));
      const rowPos = vec(call(row, "get_anchoredPosition"));
      call(row, "set_anchoredPosition", vec2(rowPos.x - gap / 2, rowPos.y));
      log(`settings button: third tab at step ${Math.round(gap)} (${Math.round(width)}x${Math.round(height)}), row centred`);
    } catch (error) { throw Error(`${step}: ${error}`); }
  }
  // Report 40: once the Video tab is shown there are four tabs, and Game
  // data, placed for three, sat on Preferences. Lay it out from what is
  // visible now: one tab step past the last visible tab, and the row moved so
  // the visible tabs are centred on the window. Repeating it changes nothing.
  function layoutGameDataTab(self) {
    const group = self.field("_tabNavigation").value;
    const button = findGameDataButton(call(self, "get_transform"));
    if (isNull(group) || isNull(button)) return null;
    // Report 94: after a battle the button was there but hidden. With the
    // Video tab hidden again (patch 153) the window's own tab setup switched
    // it off; it is shown again here.
    const buttonObject = call(button, "get_gameObject");
    if (!Boolean(call(buttonObject, "get_activeSelf"))) { call(buttonObject, "SetActive", true); log("settings data: Game data tab shown again"); }
    const toggles = group.field("_toggles").value, shown = [];
    for (let i = 0; i < toggles.length; i++) {
      const node = call(call(toggles.get(i), "get_gameObject"), "get_transform");
      if (call(call(node, "get_gameObject"), "get_activeInHierarchy")) shown.push(node);
    }
    if (shown.length < 2) return null;
    // Report 95: after a battle the menu's window had only Audio and
    // Preferences while a Game data button was still found and active: it
    // was not in this window's tab row. A button outside the row, or hidden
    // by its parents, is dropped so the caller installs a new one.
    const tabRow = call(shown[0], "get_parent");
    const buttonParent = call(button, "get_parent");
    // Only a row laid out by a HorizontalLayoutGroup takes the button in;
    // otherwise it is the window's own child.
    const rowLaidOut = !isNull(uiComponent(call(tabRow, "get_gameObject"), "UnityEngine.UI.HorizontalLayoutGroup"));
    const inRow = !rowLaidOut || !isNull(buttonParent) && call(buttonParent, "GetInstanceID") === call(tabRow, "GetInstanceID");
    if (!inRow || !Boolean(call(buttonObject, "get_activeInHierarchy"))) {
      log(`settings data: Game data tab ${inRow ? "hidden by its parents" : "outside the tab row"}; installed again`);
      call(buttonObject, "set_name", Il2Cpp.string("RebornGameDataOld"));
      call(buttonObject, "SetActive", false);
      ucls("UnityEngine.Object").method("Destroy").overload("UnityEngine.Object").invoke(buttonObject);
      return null;
    }
    // Report 44: opened in battle, the tabs had no size yet when the button
    // was styled (0x0), so it stayed too small and Preferences ran into it.
    // Take the size again from a visible tab now.
    const size = call(shown[0], "get_rect"), width = Number(size.field("m_Width").value), height = Number(size.field("m_Height").value);
    if (width > 0 && height > 0) {
      const layout = uiComponent(call(button, "get_gameObject"), "UnityEngine.UI.LayoutElement");
      if (!isNull(layout)) { call(layout, "set_preferredWidth", width); call(layout, "set_preferredHeight", height); }
      call(button, "set_sizeDelta", call(shown[0], "get_sizeDelta"));
    }
    // Live report: inside a HorizontalLayoutGroup the row placed the button
    // itself, and moving the row on each open drifted it (step 2.944 ->
    // 3.244). The group lays the tabs out; leave positions to it.
    const flowRow = call(shown[0], "get_parent");
    if (!isNull(uiComponent(call(flowRow, "get_gameObject"), "UnityEngine.UI.HorizontalLayoutGroup"))) {
      ucls("UnityEngine.UI.LayoutRebuilder").method("MarkLayoutForRebuild", 1).invoke(flowRow);
      return `${shown.length + 1} tabs in the row layout`;
    }
    const at = node => { const p = call(node, "get_position"); return { x: Number(p.field("x").value), y: Number(p.field("y").value), z: Number(p.field("z").value) }; };
    const first = at(shown[0]), last = at(shown[shown.length - 1]);
    const gap = (last.x - first.x) / (shown.length - 1);
    call(button, "set_position", unityStruct("UnityEngine.Vector3", { x: last.x + gap, y: last.y, z: last.z }));
    const row = call(shown[0], "get_parent"), centre = at(call(self, "get_transform")).x;
    const shift = centre - (first.x + last.x + gap) / 2, rowAt = at(row);
    if (Math.abs(shift) > 0.001) call(row, "set_position", unityStruct("UnityEngine.Vector3", { x: rowAt.x + shift, y: rowAt.y, z: rowAt.z }));
    return `${shown.length + 1} tabs, step ${gap.toFixed(3)}`;
  }
  // Direct child of the window, or inside the tab row once styled.
  function findGameDataButton(root) {
    const direct = call(root, "Find", Il2Cpp.string("RebornGameData"));
    if (!isNull(direct)) return direct;
    const buttons = call(root, "get_gameObject").method("GetComponentsInChildren").overload("System.Type", "System.Boolean")
      .invoke(ucls("UnityEngine.UI.Button").type.object, true);
    for (let i = 0; i < buttons.length; i++) {
      const node = call(buttons.get(i), "get_transform");
      if (String(call(node, "get_name")?.content || "") === "RebornGameData") return node;
    }
    return null;
  }
  section("settings game data", () => {
    const classes = img.classes.filter(c => /^(?:Game)?(?:Options|Settings)(?:Win|Window|Panel|Dialog)$/.test(c.name))
      .filter(c => Array.from(c.hierarchy()).some(base => base.type.name === "UnityEngine.Component"));
    let hooks = 0;
    for (const owner of classes) for (const method of owner.methods.filter(m =>
        ["Show", "OnEnable", "Awake", "Start"].includes(m.name) && !m.isStatic && !m.virtualAddress.isNull())) {
      hookAttach(method.virtualAddress, {
        onEnter(args) {
          this.self = args[0];
          if (method.name === "Show" || method.name === "OnEnable") {
            try { closingSettings.delete(settingsWindowKey(new Il2Cpp.Object(this.self))); } catch (_) {}
          }
        },
        onLeave() {
          const retained = new Il2Cpp.Object(this.self).ref(false);
          schedule(0, () => { try { installSettingsDataButton(retained.target); } catch (e) { log(`settings data: ${e}`); } finally { retained.free(); } });
        }
      }); hooks++;
    }
    const closeAddresses = new Set();
    for (const owner of classes) for (const method of owner.methods.filter(m =>
        /^(?:(?:On|Handle)?(?:Cancel|Close|Hide)(?:Button)?(?:Click|Clicked|Pressed)?|OnDisable|OnDestroy)$/i.test(m.name)
        && !m.isStatic && !m.virtualAddress.isNull())) {
      const key=method.virtualAddress.toString(); if(closeAddresses.has(key)) continue; closeAddresses.add(key);
      hookAttach(method.virtualAddress, {onEnter(args) {
        try { settingsClosing(new Il2Cpp.Object(args[0]), owner.name+"."+method.name); }
        catch(error) { log(`settings UI close trace: ${error}`); }
      }});
    }
    // Query the settings component directly where possible. The fallback walks
    // ancestors of active UI buttons, rather than thousands of scene objects.
    // Report 50: FindObjectsOfTypeAll here took about 25 ms once a second, a
    // hitch every second (the hook's costliest work). OnEnable of the window
    // classes already installs the button, so poll only without those hooks.
    let last = 0;
    const update = cls(img, "SparkleServices.ServicesManager").method("Update", 0);
    if (!hooks) hookAttach(update.virtualAddress, { onLeave() {
      if (Date.now()-last < 1000) return; last = Date.now();
      try {
        const find = ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type");
        if (classes.length) {
          for (const owner of classes) {
            const windows = find.invoke(owner.type.object);
            for (let i=0; i<windows.length; i++) {
              const window = windows.get(i);
              if (Boolean(call(call(window,"get_gameObject"),"get_activeInHierarchy"))) installSettingsDataButton(window);
            }
          }
          return;
        }
        const objects = find.invoke(ucls("UnityEngine.UI.Button").type.object), visited = new Set();
        for (let i=0; i<objects.length; i++) {
          const go=call(objects.get(i),"get_gameObject"); if (!Boolean(call(go,"get_activeInHierarchy"))) continue;
          let node=call(go,"get_transform");
          for (let depth=0; depth<8 && !isNull(node); depth++, node=call(node,"get_parent")) {
            const key=node.handle.toString(); if (visited.has(key)) break; visited.add(key);
            if (!/^(?:OptionsWinMobile|SettingsWin_Mobile|SettingsWin|OptionsWin)$/i.test(String(call(node,"get_name")?.content || "").replace(/\(Clone\)$/i, "").trim())) continue;
            const root=call(node,"get_gameObject"), rect=uiRect(root), bounds=call(rect,"get_rect");
            if (Number(bounds.field("m_Width").value)<300 || Number(bounds.field("m_Height").value)<200) continue;
            installSettingsDataButton(root);
          }
        }
      } catch (_) {}
    }});
    log(`settings game data: ${hooks} window hooks, ${closeAddresses.size} close hooks and prefab fallback`);
  });
  // END android-ui: settings-data

