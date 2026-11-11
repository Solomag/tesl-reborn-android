  // The original port fetched matchEntryData without ever displaying it.
  // Gather actual mobile class/layout metadata before writing a history UI
  // patch; do not invent desktop field names or match rows by list position.
  // Exact classes identified in the previous device log; no Google Play or
  // in-match action-history probes. Log field TYPES only, never field values.
  // BEGIN android-ui: ui-common
function uiComponent(go, type) {
    return go.method("GetComponent").overload("System.Type").invoke(ucls(type).type.object);
  }
  function uiAdd(go, type) {
    return go.method("AddComponent").overload("System.Type").invoke(ucls(type).type.object);
  }
  function uiNew(name, parent) {
    const go = newWith(ucls("UnityEngine.GameObject"), Il2Cpp.string(name),
      Il2Cpp.array(Il2Cpp.corlib.class("System.Type"), [ucls("UnityEngine.RectTransform").type.object]));
    const root=go.ref(false);
    try {
    call(go, "set_layer", Number(call(call(parent, "get_gameObject"), "get_layer")));
    call(go, "get_transform").method("SetParent").overload("UnityEngine.Transform", "System.Boolean").invoke(parent, false);
    return go;
    } finally {root.free();}
  }
  function uiRect(go) { return uiComponent(go, "UnityEngine.RectTransform"); }
  function uiPlace(go, ax, ay, px, py, x, y, width, height) {
    const rect = uiRect(go);
    call(rect, "set_anchorMin", vec2(ax, ay)); call(rect, "set_anchorMax", vec2(ax, ay));
    call(rect, "set_pivot", vec2(px, py)); call(rect, "set_anchoredPosition", vec2(x, y));
    call(rect, "set_sizeDelta", vec2(width, height));
    return rect;
  }
  function uiStretch(rect) {
    call(rect, "set_anchorMin", vec2(0, 0)); call(rect, "set_anchorMax", vec2(1, 1));
    call(rect, "set_offsetMin", vec2(0, 0)); call(rect, "set_offsetMax", vec2(0, 0));
  }
  function uiXY(value) { return { x: Number(value.field("x").value), y: Number(value.field("y").value) }; }
  function uiEnum(type, field) { const c = ucls(type); return enumBox(c, enumVal(c.field(field).value)); }
  function uiList(type) {
    const klass = Il2Cpp.corlib.class("System.Collections.Generic.List`1").inflate(type);
    const list = klass.alloc(); list.method(".ctor").overload().invoke(); return list;
  }
  function uiPlain(text) { return String(text).replace(/</g, "‹").replace(/>/g, "›"); }
  function uiLogTree(root, prefix) {
    const queue = [{ node: root, path: "", depth: 0 }];
    let visited = 0, line = "";
    while (queue.length && visited++ < 140) {
      const item = queue.shift();
      const path = `${item.path}/${String(call(item.node, "get_name")?.content || "")}`;
      if (line.length + path.length > 700) { log(`${prefix}: ${line}`); line = ""; }
      line += `${path} | `;
      if (item.depth >= 6) continue;
      for (let i = 0, count = Math.min(80, Number(call(item.node, "get_childCount"))); i < count; i++)
        queue.push({ node: call(item.node, "GetChild", i), path, depth: item.depth + 1 });
    }
    if (line) log(`${prefix}: ${line}`);
  }
  let uiFontHandle = null;
  function uiFont() {
    if (uiFontHandle) return uiFontHandle.target;
    const objects = ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type")
      .invoke(ucls("TMPro.TextMeshProUGUI").type.object);
    const root=objects.object.ref(false);
    try {
    let fallback = null;
    for (let i = 0; i < objects.length; i++) {
      const font = call(objects.get(i), "get_font");
      if (isNull(font)) continue;
      fallback = fallback || font;
      try { if (/Merriweather/i.test(String(call(font, "get_name")?.content))) { fallback = font; break; } } catch (_) {}
    }
    if (!fallback) fallback = ucls("TMPro.TMP_FontAsset").method("get_defaultFontAsset").invoke();
    if (isNull(fallback)) throw Error("No loaded TMP font");
    uiFontHandle = fallback.ref(false); return fallback;
    } finally {root.free();}
  }
  function uiText(go, text, size = 20) {
    const label = uiAdd(go, "TMPro.TextMeshProUGUI"),root=label.ref(false);
    try {
    call(label, "set_font", uiFont()); call(label, "set_fontSize", size);
    call(label, "set_enableAutoSizing", false); call(label, "set_raycastTarget", false);
    call(label, "set_alignment", uiEnum("TMPro.TextAlignmentOptions", "Center"));
    call(label, "set_color", rgba(1, 1, 1, 1)); call(label, "set_text", Il2Cpp.string(text)); return label;
    } finally {root.free();}
  }
  function uiButton(go, graphic, action) {
    const button = uiAdd(go, "UnityEngine.UI.Button");
    call(button, "set_targetGraphic", graphic);
    const callback = Il2Cpp.delegate(ucls("UnityEngine.Events.UnityAction"), () => {
      try { action(); } catch (error) { log(`UI button failed: ${error}`); }
    });
    call(call(button, "get_onClick"), "AddListener", callback); return button;
  }
  function uiLabeledButton(name, parent, text, x, y, width, action) {
    const go = uiNew(name, parent); uiPlace(go, 1, 1, 1, 1, x, y, width, 28);
    const bg = uiAdd(go, "UnityEngine.UI.Image"); call(bg, "set_color", rgba(0.12, 0.12, 0.12, 0.96));
    const labelGO = uiNew("Label", call(go, "get_transform")); uiStretch(uiRect(labelGO)); uiText(labelGO, text, 18);
    uiButton(go, bg, action); return go;
  }
// END android-ui: ui-common


  // BEGIN android-ui: localized-language-state
  section("native localized language state", () => {
    const localization = cls(img, "LocalizationManager"), set = localization.method("SetLanguage", 2);
    const type = set.parameters[0].type;
    let pending = false, nextCheck = 0, attempts = 0, lastChoice = "", lastError = "";
    const resolved = new Map();
    function codeOf(name) {
      const raw = String(name || "").toLowerCase().replace(/[^a-zа-яё]/g, "")
        .replace(/^(localizedlanguage|language|locale)/, "");
      const aliases = {en_us:["en","enus","engb","english","englishus","englishuk","englishunitedstates"],
        de_de:["de","dede","german","deutsch"],es_es:["es","eses","spanish","spanishspain"],
        es_mx:["esmx","spanishmexico","mexicanspanish","spanishlatinamerica","latinamericanspanish"],
        fr_fr:["fr","frfr","french","français"],it_it:["it","itit","italian","italiano"],
        pl_pl:["pl","plpl","polish","polski"],pt_br:["pt","ptbr","portuguese","portuguesebrazil","brazilianportuguese"],
        ru_ru:["ru","ruru","russian","russianru","русский"],tr_tr:["tr","trtr","turkish","türkçe"]};
      return Object.keys(aliases).find(code => aliases[code].includes(raw)) || languageLabel(name);
    }
    function objectCode(object) {
      if (isNull(object)) return;
      for (const field of object.class.fields.filter(f => !f.isStatic && f.type.name === "System.String" && /code|name|language/i.test(f.name))) {
        const code = codeOf(object.field(field.name).value?.content); if (code) return code;
      }
    }
    function resolve(code, manager = null) {
      if (resolved.has(code)) return resolved.get(code);
      if (type.class.isEnum) {
        const field = type.class.fields.find(f => f.isStatic && codeOf(f.name) === code);
        if (!field) return null;
        const value = field.value, numeric = enumVal(value);
        if (numeric < 0) return null;
        const entry={raw:ptr(numeric),managed:value,name:field.name};resolved.set(code,entry);return entry;
      }
      // Use only real language objects owned by the game, never construct a
      // guessed LocalizedLanguage or assume that its index is a locale ID.
      if (type.class.isValueType) return null;
      const candidates = [];
      for (const field of type.class.fields.filter(f => f.isStatic && f.type.name === type.name)) candidates.push(field.value);
      if (manager) for (const field of manager.class.fields.filter(f => !f.isStatic && f.type.name.includes(type.name))) {
        const value = manager.field(field.name).value;
        if (isNull(value)) continue;
        if (field.type.name === type.name) candidates.push(value);
        else if (field.type.name.endsWith("[]")) {
          for (let i=0;i<Math.min(value.length,32);i++) candidates.push(value.get(i));
        } else {
          try { for (let i=0,n=Math.min(32,Number(call(value,"get_Count")));i<n;i++) candidates.push(call(value,"get_Item",i)); } catch (_) {}
        }
      }
      const object = candidates.find(value => objectCode(value) === code);
      if (!object) return null;
      const retained=object.ref(false), entry={raw:retained.target.handle,managed:retained.target,name:code,retained};
      resolved.set(code,entry);return entry;
    }
    function pin(method) {
      if (!method || method.virtualAddress.isNull()) return;
      hookAttach(method.virtualAddress, {onEnter(args) {
        try {
          const selected=resourceLanguage(), value=selected && resolve(selected, method === set && !set.isStatic ? new Il2Cpp.Object(args[0]) : null);
          if (value) args[method.isStatic?0:1]=value.raw;
        } catch (error) { log(`language state: ${method.name} argument: ${error}`); }
      }});
    }
    pin(set);
    // SettingsManager is a second state source, separate from the text table.
    // Its getter also drives the language dropdown during window initialization.
    let settings = null;
    try {
      settings = cls(img,"SettingsManager");
      const setter = settings.tryMethod("SetCurrentLanguage",1); if (setter) pin(setter);
    } catch (_) {}
    for (const [owner,name] of [[localization,"GetSystemDefaultLanguage"],[settings,"GetCurrentLanguage"]]) {
      try {
        const method=owner?.tryMethod(name,0);
        if (!method || method.returnType.name!==type.name || method.virtualAddress.isNull()) continue;
        hookAttach(method.virtualAddress,{onLeave(result) {
          try { const value=resolve(resourceLanguage()); if(value) result.replace(value.raw); } catch (_) {}
        }});
      } catch (_) {}
    }
    function check() {
      if (pending || Date.now()<nextCheck) return;
      nextCheck=Date.now()+1500;
      const selected=resourceLanguage(); if (!selected) return;
      if (selected!==lastChoice) {lastChoice=selected; attempts=0;}
      try {
        const manager=localization.method("get_Instance",0).invoke(); if(isNull(manager)) return;
        const actual=String(call(manager,"get_CurrentLanguageCode")?.content||"");
        if (codeOf(actual)===selected) return;
        const value=resolve(selected,manager); if(!value) {
          const error=`Cannot resolve ${type.name} for ${selected}`;
          if(error!==lastError){lastError=error;log(`language state: ${error}`);} return;
        }
        if (attempts>=3) return;
        pending=true;attempts++;
        const retained=manager.ref(false);
        schedule(0,()=>{
          const previous=globalThis.__teslLanguageSyncing;
          globalThis.__teslLanguageSyncing=true;
          try {
            // Replay initialization using the game's real language value. The
            // native selection coroutine (which can log out) is never called.
            retained.target.method("SetLanguage",2).invoke(value.managed,false);
            restoreLocalization(retained.target,selected);
            retained.target.method("UpdateObjects",0).invoke();
            if(settings) try {
              const current=settings.method("get_Instance",0).invoke();
              if(!isNull(current)) current.method("SetCurrentLanguage",1).invoke(value.managed);
            } catch (_) {}
            const after=String(call(retained.target,"get_CurrentLanguageCode")?.content||"");
            writeTextFile(`${persistentPath()}/tesl-reborn-language-state.json`,JSON.stringify({revision:32,selected,before:actual,after,type:type.name,value:value.name,attempt:attempts}));
            log(`language state: ${actual} -> ${after}; selected ${selected}, ${value.name}`);
          } catch(error) {log(`language state: initialization failed: ${error}`);}
          finally {globalThis.__teslLanguageSyncing=previous;pending=false;retained.free();}
        });
      } catch(error) {log(`language state: ${error}`);}
    }
    hookAttach(cls(img,"SparkleServices.ServicesManager").method("Update",0).virtualAddress,{onLeave:check});
    // Observe a SetLanguage call made before the hook was installed by checking
    // live manager state as well as intercepting future calls.
    schedule(0,check);
  });
  // END android-ui: localized-language-state

  // BEGIN android-ui: native-ui-sprites
  // Loaded sprites are kept: the next window that asks for the same path gets
  // it in the same frame instead of popping in after an asset load.
  const nativeUiSprites=new Map();
  // image may be null: the sprite is then only loaded into the cache, so the
  // first window that needs it does not wait for the asset (preloading).
  function loadNativeUiSprite(path,image,onLoaded=()=>{}) {
    const cached=nativeUiSprites.get(path);
    if(cached)try{if(!isNull(cached.target)){if(image){call(image,"set_sprite",cached.target);call(image,"set_color",rgba(1,1,1,1));}onLoaded();return;}}catch(_){}
    const retained=image?image.ref(false):null,started=Date.now();let operation=null;
    function release(){if(operation){operation.free();operation=null;}if(retained)retained.free();}
    function poll(){try {
      if(!operation){const catalog=cls(img,"AssetCatalog").method("get_Instance",0).invoke();
        const value=catalog.method("LoadAssetFromPathAsync").overload("System.String","System.Type","System.String")
          .invoke(Il2Cpp.string(path),ucls("UnityEngine.Sprite").type.object,Il2Cpp.string("png"));
        if(isNull(value)){release();return;}operation=value.ref(false);
      }
      if(call(operation.target,"IsDone")){
        const sprite=operation.target.method("GetAsset",0).inflate(ucls("UnityEngine.Sprite")).invoke();
        if(!isNull(sprite)){if(!nativeUiSprites.has(path))nativeUiSprites.set(path,sprite.ref(false));
          if(retained){call(retained.target,"set_sprite",sprite);call(retained.target,"set_color",rgba(1,1,1,1));}onLoaded();}
        release();return;
      }
      if(Date.now()-started>20000){release();return;}
      schedule(50,poll);
    }catch(error){log(`native UI sprite: ${path}: ${error}`);release();}}
    schedule(0,poll);
  }
  // END android-ui: native-ui-sprites

