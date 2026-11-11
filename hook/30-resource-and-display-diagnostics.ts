  // BEGIN android-ui: resource-diagnostics
  function rememberShopSnapshot(previous, report) {
    if(!(report.shopImages||[]).some(item=>!/MainMenuLandingWin|Left_Store_BTN/i.test(item.path)))return previous;
    return {at:report.at,images:report.shopImages,events:report.events.filter(item=>/shop|store|pack|bundle|image|texture|sprite/i.test(item.path))};
  }
  // One snapshot per process, a minute after the hook starts (login and the
  // main menu, before a match). A periodic snapshot walked every UI image in
  // the scene on the main thread: 250-490ms every 5s, battles included
  // (report 20), and the last line before a 'setjmp cookie mismatch' abort.
  section("bounded startup resource diagnostics", () => {
    let taken = false, lastShop=null;
    hookAttach(cls(img, "SparkleServices.ServicesManager").method("Update", 0).virtualAddress, {
      onLeave() {
        if (taken || Date.now() - resourceTraceStarted < 60000) return;
        taken = true;
        // Report 13: the whole snapshot held the main thread for 430 ms. It
        // needs Unity, so it stays there, one part per frame.
        const report:any = {at:new Date().toISOString(),language:resourceLanguage(),
            patch:globalThis.TeslRebornUpdater?.current()?.revision,elapsedMs:Date.now()-resourceTraceStarted,
            events:resourceTrace.slice(),bundles:[]};
        // Report 14: one part still took 866 ms. The shop scans asked for every
        // loaded image, prefabs and hidden ones included, and then skipped the
        // inactive ones: ask Unity for the active ones only.
        const snapshotActive = (type) => {
          const active = ucls("UnityEngine.Object").tryMethod("FindObjectsOfType", 1);
          return (active || ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type")).invoke(type);
        };
        const steps=[];
        steps.push(() => {
          try {
            const manager = cls(img,"AssetBundles.AssetBundleManager");
            for (const field of manager.fields.filter(f=>f.isStatic && /load|bundle|error/i.test(f.name) && /Dictionary/.test(f.type.name))) {
              const item:any = {name:field.name,type:field.type.name};
              try {
                const dictionary = field.value;
                item.count = Number(call(dictionary,"get_Count"));
                const iterator = call(call(dictionary,"get_Keys"),"GetEnumerator");
                item.keys=[];
                try { while(item.keys.length<12 && call(iterator,"MoveNext")) {
                  const key = call(iterator,"get_Current");
                  if(typeof key?.content === "string") item.keys.push(key.content.replace(/[?#].*$/,"").slice(0,160));
                }} finally { try { call(iterator,"Dispose"); } catch(_){} }
              } catch(error) { item.error=String(error).slice(0,120); }
              report.bundles.push(item);
            }
          } catch(error) { report.error=String(error).slice(0,160); }
        });
        steps.push(() => {
          // A connected account can still show an empty main menu. Capture
          // component activity, not player text or a speculative scene reset.
          try {
            report.menu=[];
            const find=ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type");
            const owners=img.classes.filter(c=>/^(?:MainMenu|MainMenuNavManager|MainMenuNavComponent|SettingsWin)$/.test(c.name)
              && Array.from(c.hierarchy()).some(base=>base.type.name==="UnityEngine.Component"));
            for(const owner of owners) {
              const values=find.invoke(owner.type.object);
              for(let i=0;i<Math.min(values.length,16) && report.menu.length<32;i++) {
                const component=values.get(i),go=call(component,"get_gameObject"),root=call(go,"get_transform");
                const item:any={type:owner.type.name,name:String(call(go,"get_name")?.content||"").slice(0,120),
                  active:Boolean(call(go,"get_activeInHierarchy")),children:Number(call(root,"get_childCount")),nodes:[]};
                for(let j=0;j<Math.min(item.children,12);j++) {
                  const child=call(call(root,"GetChild",j),"get_gameObject");
                  item.nodes.push({name:String(call(child,"get_name")?.content||"").slice(0,120),active:Boolean(call(child,"get_activeInHierarchy"))});
                }
                report.menu.push(item);
              }
            }
          } catch(error) {report.menuError=String(error).slice(0,160);}
        });
        // OTA 199 on the Pixel: the walk over every active Image for shop
        // paths held the main thread 986 ms with the deck list open. The
        // shop images were checked long ago; the scans are gone.
        report.shopImages=[];
        steps.push(() => {
          // Preserve the last actual shop snapshot when navigating to Game Data
          // to share a report; the main-menu Store shortcut is not a shop view.
          lastShop=rememberShopSnapshot(lastShop,report);
          report.lastShop=lastShop;
          writeTextFile(`${persistentPath()}/tesl-reborn-resource-status.json`,JSON.stringify(report));
        });
        // Each part is timed, so a slow one is named in the log.
        let part = 0;
        const next = () => {
          const step = steps.shift(); if (!step) return;
          const index = ++part;
          schedule(0, () => {
            const started = Date.now();
            try { step(); } finally {
              const took = Date.now() - started;
              if (took >= 50) log(`resource diagnostics snapshot: part ${index} took ${took}ms`);
              next();
            }
          }, `resource diagnostics snapshot ${index}`);
        };
        next();
      }
    });
  });
  // END android-ui: resource-diagnostics

  // BEGIN android-ui: display-diagnostics
  function redundantSettingsResolution(values, current, inSettings) {
    return inSettings && values.length>=3 && values[0]===current.width && values[1]===current.height
      && typeof values[2]==="boolean"
      && (values.length===3 || values.length===4 && values[3]===0);
  }
  function createDisplayTrace(write) {
    let events=[],last="";
    return (kind,values)=>{
      const key=kind+JSON.stringify(values);if(kind==="sample" && key===last)return;
      last=key;events.push({at:Date.now(),kind,...values});if(events.length>60)events.shift();
      write({schema:1,patch:globalThis.TeslRebornUpdater?.current()?.revision,events:events.slice()});
    };
  }
  // Report 135: in Russian the arena rules before a match (MatchIntroModal)
  // grew taller than a 20:9 screen and pushed the confirm button off it.
  // The popup is scaled down until everything in it fits.
  section("match intro modal fits the screen", () => {
    const rectType = ucls("UnityEngine.RectTransform");
    const fit = (popup) => {
      const root = call(popup, "get_transform"), go = call(popup, "get_gameObject");
      if (!call(go, "get_activeInHierarchy")) return;
      // Measured in the root canvas, whose rect is the screen: this Unity
      // has no RectTransformUtility.WorldToScreenPoint(Camera, Vector3).
      const canvas = go.method("GetComponentInParent").overload("System.Type").invoke(ucls("UnityEngine.Canvas").type.object);
      if (!canvas || isNull(canvas)) return;
      const canvasRect = call(call(canvas, "get_rootCanvas"), "get_transform"), canvasArea = call(canvasRect, "get_rect");
      const screenH = Number(canvasArea.field("m_Height").value), canvasLow = Number(canvasArea.field("m_YMin").value);
      if (!(screenH > 0)) return;
      const toY = (rect, x, y) => {
        const world = rect.method("TransformPoint").overload("UnityEngine.Vector3").invoke(unityStruct("UnityEngine.Vector3", { x, y, z: 0 }));
        return Number(canvasRect.method("InverseTransformPoint").overload("UnityEngine.Vector3").invoke(world).field("y").value) - canvasLow;
      };
      const rects = go.method("GetComponentsInChildren").overload("System.Type", "System.Boolean").invoke(rectType.type.object, false);
      // Scrolled lists are taller than their view on purpose; only the view counts.
      const contents = [];
      try {
        const scrolls = go.method("GetComponentsInChildren").overload("System.Type", "System.Boolean").invoke(ucls("UnityEngine.UI.ScrollRect").type.object, false);
        for (let i = 0; i < scrolls.length; i++) { const content = call(scrolls.get(i), "get_content"); if (!isNull(content)) contents.push(content); }
      } catch (_) {}
      let low = Infinity, high = -Infinity;
      for (let i = 0; i < rects.length; i++) {
        const rect = rects.get(i);
        if (contents.some(content => call(rect, "IsChildOf", content))) continue;
        const area = call(rect, "get_rect");
        const x = Number(area.field("m_XMin").value), y = Number(area.field("m_YMin").value);
        const a = toY(rect, x, y), b = toY(rect, x, y + Number(area.field("m_Height").value));
        const bottom = Math.min(a, b), top = Math.max(a, b);
        if (top - bottom >= screenH * 0.97) continue; // dimmed backdrop
        low = Math.min(low, bottom); high = Math.max(high, top);
      }
      if (!Number.isFinite(low)) return;
      const scale = call(root, "get_localScale"), current = Number(scale.field("y").value) || 1;
      const over = Math.max(0, -low, high - screenH), height = high - low;
      if (over < 2) return true;
      const factor = Math.max(0.6, Math.min(1, screenH * 0.95 / height));
      const next = current * factor;
      call(root, "set_localScale", unityStruct("UnityEngine.Vector3", { x: next, y: next, z: Number(scale.field("z").value) || 1 }));
      log(`popup fit: ${call(go, "get_name")} ${Math.round(height)} units on a ${Math.round(screenH)} unit screen, scale ${current.toFixed(2)} -> ${next.toFixed(2)}`);
      return true;
    };
    // Report 136: three passes per popup (six for the arena rules, which also
    // go through UIPopupWindow.Show) cost 50-100 ms at a battle start. One
    // pass once the layout is built; another only while the popup is not
    // ready yet (inactive, no canvas, nothing measured) or a pass failed.
    const pending = new Set();
    const later = (popup) => {
      const key = popup.handle.toString();
      if (pending.has(key)) return;
      pending.add(key);
      const attempt = (step) => schedule([400, 1200, 2500][step], () => {
        let done = false;
        try { done = !unityAlive(popup) || fit(popup) === true; } catch (error) { log(`popup fit failed: ${error}`); }
        if (!done && step < 2) attempt(step + 1); else pending.delete(key);
      }, "popup fit");
      attempt(0);
    };
    const klass = cls(img, "MatchIntroModalController");
    let hooks = 0;
    for (const name of ["Show", "ShowRulesOnly"]) {
      const method = klass.tryMethod(name, 3);
      if (!method || method.virtualAddress.isNull()) continue;
      hookAttach(method.virtualAddress, {
        onEnter(args) { this.popup = args[1]; },
        onLeave() {
          const popup = new Il2Cpp.Object(this.popup);
          if (isNull(popup)) return;
          later(popup);
        }
      });
      hooks++;
    }
    // Every other game popup goes through UIPopupWindow.Show; the same check
    // keeps any of them that outgrows the screen inside it.
    const show = cls(img, "UIPopupWindow").tryMethod("Show", 6);
    if (show && !show.virtualAddress.isNull()) {
      hookAttach(show.virtualAddress, { onEnter(args) { this.popup = args[0]; },
        onLeave() { const popup = new Il2Cpp.Object(this.popup); if (!isNull(popup)) later(popup); } });
      hooks++;
    }
    if (!hooks) throw Error("MatchIntroModalController.Show not found");
  });
  section("Settings display diagnostics",()=>{
    let watchUntil=0,root=null,nextCapture=0,nextSettingsCheck=0;
    let pendingReport=null,flushQueued=false,lastFlush=0,lastDimensions="";
    function flushDisplay() {
      flushQueued=false;if(!pendingReport)return;
      writeTextFile(`${persistentPath()}/tesl-reborn-display-status.json`,JSON.stringify(pendingReport));
      pendingReport=null;lastFlush=Date.now();
    }
    const trace=createDisplayTrace(value=>{
      // Keep every changed frame in memory, but batch disk writes so tracing
      // does not add a synchronous write to every frame of a close animation.
      pendingReport=value;
      if(Date.now()-lastFlush>=100)flushDisplay();
      else if(!flushQueued){flushQueued=true;schedule(100,flushDisplay,"display flush");}
      const event=value.events[value.events.length-1],dimensions=event.width+"x"+event.height;
      if(event.kind!=="sample" || dimensions!==lastDimensions)log(`settings display: ${JSON.stringify(event)}`);
      lastDimensions=dimensions;
    });
    function capture() {
      const screen=chatScreen(),value:any={width:screen.width,height:screen.height};
      if(root)try {
        const go=root.target,transform=call(go,"get_transform");value.active=Boolean(call(go,"get_activeInHierarchy"));
        const scale=call(transform,"get_localScale");value.localScale=["x","y","z"].map(k=>Number(scale.field(k).value));
        const world=call(transform,"get_lossyScale");value.worldScale=["x","y","z"].map(k=>Number(world.field(k).value));
        value.parents=[];
        for(let node=call(transform,"get_parent"),depth=0;depth<4 && !isNull(node);depth++,node=call(node,"get_parent")) {
          const scale=call(node,"get_localScale");
          value.parents.push({name:String(call(node,"get_name")?.content||"").slice(0,80),scale:["x","y","z"].map(k=>Number(scale.field(k).value))});
        }
        const rect=call(transform,"get_rect");value.rect=[Number(rect.field("m_Width").value),Number(rect.field("m_Height").value)];
        const canvas=go.method("GetComponentInParent").overload("System.Type").invoke(ucls("UnityEngine.Canvas").type.object);
        if(!isNull(canvas))value.canvasScale=Number(call(canvas,"get_scaleFactor"));
      }catch(_){}
      trace("sample",value);
    }
    const seen=new Set();
    for(const method of ucls("UnityEngine.Screen").methods.filter(m=>m.name==="SetResolution" && m.isStatic && m.parameterCount>=2)) {
      const key=method.virtualAddress.toString();if(method.virtualAddress.isNull()||seen.has(key))continue;seen.add(key);
      // The bridge accounts for the legacy static instance slot. Raw args[0]
      // was that null slot, not the requested width on this Unity player.
      if(![3,4].includes(method.parameterCount) || method.parameters[2].type.name!=="System.Boolean")continue;
      method.implementation=function(...values) {
        const settings=Boolean(root) && Date.now()<watchUntil || resourceSettingsOpen();
        // Report 92: closing Settings in a battle re-applied the same size with
        // fullscreen false (the settings watch had expired), and afterwards
        // the battle buttons took no touches. A request for the size already
        // in force changes nothing but the fullscreen flag: always skipped.
        const sameSize=true;
        let skip=false;
        try {const screen=chatScreen(),size=settings&&globalThis.__teslScaledSize?.(values[0],values[1]);
          skip=redundantSettingsResolution(size?[size.width,size.height,...values.slice(2)]:values,{
          width:screen.width,height:screen.height,fullscreen:null
        },settings||sameSize);}catch(_){}
        watchUntil=Date.now()+2000;
        trace(skip?"SetResolution-skipped":"SetResolution",{width:values[0],height:values[1],fullscreen:values[2],
          refreshRate:values.length===4?values[3]:null,signature:method.parameters.map(p=>p.type.name).join(",")});
        if(skip)return;
        return method.invoke(...values);
      };
    }
    hookAttach(cls(img,"SparkleServices.ServicesManager").method("Update",0).virtualAddress,{onLeave(){
      try {
        const now=Date.now();
        // Report 71: once Settings had been open this check cost 28-32 ms/s
        // for the rest of the battle; a touch is looked for four times a second.
        if(now<watchUntil || now>=nextSettingsCheck)nextSettingsCheck=now+250;else return;
        if(resourceSettingsOpen() && Number(ucls("UnityEngine.Input").method("get_touchCount",0).invoke())>0) {
          watchUntil=now+2000;
          if(!root&&(typeof liveSettingsWindow==="function"?liveSettingsWindow():resourceSettingsWindow))root=resourceSettingsWindow.target.ref(false);
        }
        // Report 25: every frame cost 46-76 ms/s; four samples a second keep the trace.
        if(now<watchUntil){if(now>=nextCapture){nextCapture=now+250;capture();}}
        else if(root){root.free();root=null;}
      }catch(_){}
    }});
    log(`settings display: observing ${seen.size} resolution methods; per-frame samples after Settings touch`);
  });
  // END android-ui: display-diagnostics

