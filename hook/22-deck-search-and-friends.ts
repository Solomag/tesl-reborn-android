  // BEGIN android-ui: deck-search
  function uiRetryGate(now,limit=3) {
    let first=null,next=0,failures=0;
    return {allow(){if(first===null){first=now();return false;}return failures<limit && now()-first>=500 && now()>=next;},
      fail(){failures++;next=now()+Math.min(5000,1000*failures);},success(){failures=0;next=0;},count(){return failures;}};
  }
  function deckSearchText(go,text,size) {
    // Same text/input family as the PC Reborn DeckSearchField. The legacy
    // InputField clips its own generated text and needs no TMP RectMask2D.
    const label=uiAdd(go,"UnityEngine.UI.Text"),root=label.ref(false);
    try {
    const font=ucls("UnityEngine.Resources").method("GetBuiltinResource").overload("System.Type","System.String")
      .invoke(ucls("UnityEngine.Font").type.object,Il2Cpp.string("Arial.ttf"));
    if(isNull(font))throw Error("Deck search font unavailable");
    call(label,"set_font",font);call(label,"set_fontSize",size);call(label,"set_resizeTextForBestFit",false);
    call(label,"set_alignment",uiEnum("UnityEngine.TextAnchor","MiddleLeft"));call(label,"set_supportRichText",false);
    call(label,"set_color",rgba(1,1,1,1));call(label,"set_raycastTarget",false);call(label,"set_text",Il2Cpp.string(text));
    return label;
    }finally{root.free();}
  }
  function deckSearchInput(go,label,image) {
    const input=uiAdd(go,"UnityEngine.UI.InputField"),root=input.ref(false);
    try {call(input,"set_textComponent",label);call(input,"set_targetGraphic",image);
    call(input,"set_lineType",enumBox(input.method("set_lineType",1).parameters[0].type.class,0));
    call(input,"set_characterLimit",100);return input;
    }finally{root.free();}
  }
  // The search text used Unity's built-in Arial in white and looked like the
  // phone's own font next to the game UI. The game's own InputFields (the
  // login form keeps them loaded) give the font, style and colours of their
  // text and placeholder; without one, Arial stays.
  function styleLikeGameInput(ours,label,hint) {
    const values=ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type")
      .invoke(ucls("UnityEngine.UI.InputField").type.object);
    // Report 85: the first field with a font was sometimes a bare
    // "GameObject" with white text; the deck name field is the model.
    const order=[];
    for(let i=0;i<values.length;i++){
      const game=values.get(i);let name="";
      try{name=String(call(call(game,"get_gameObject"),"get_name")?.content||"");}catch(_){}
      order.push({game,rank:/DeckName/i.test(name)?0:/^Input/i.test(name)?1:2});
    }
    order.sort((a,b)=>a.rank-b.rank);
    for(const {game} of order) {
      if(!unityAlive(game)||game.handle.equals(ours.handle))continue;
      const text=call(game,"get_textComponent");
      if(!unityAlive(text)||isNull(call(text,"get_font")))continue;
      call(label,"set_font",call(text,"get_font"));call(label,"set_fontStyle",call(text,"get_fontStyle"));
      call(label,"set_color",call(text,"get_color"));
      const placeholder=call(game,"get_placeholder");
      if(hint&&unityAlive(placeholder)&&placeholder.class.type.name==="UnityEngine.UI.Text"){
        call(hint,"set_font",call(placeholder,"get_font"));call(hint,"set_fontStyle",call(placeholder,"get_fontStyle"));
        call(hint,"set_color",call(placeholder,"get_color"));
      }else if(hint)call(hint,"set_font",call(text,"get_font"));
      // The frame too: the deck name field's dark, gold-edged background.
      try{const theirs=call(game,"get_targetGraphic"),mine=call(ours,"get_targetGraphic");
        if(unityAlive(theirs)&&unityAlive(mine)&&theirs.class.type.name==="UnityEngine.UI.Image"&&!isNull(call(theirs,"get_sprite"))){
          call(mine,"set_sprite",call(theirs,"get_sprite"));call(mine,"set_type",call(theirs,"get_type"));call(mine,"set_color",call(theirs,"get_color"));
        }}catch(_){}
      // The keyboard as well: the login form's fields set in their prefab
      // whether Android shows its own text box over the keyboard; the deck
      // search showed it (requested after report 123).
      let keyboard="";
      for(const name of ["shouldHideMobileInput","keyboardType","inputType","contentType"]){
        try{const value=call(game,`get_${name}`);call(ours,`set_${name}`,value);keyboard+=` ${name}=${typeof value==="boolean"?value:enumVal(value)}`;}catch(_){}
      }
      return String(call(call(game,"get_gameObject"),"get_name")?.content||"InputField")+keyboard;
    }
    return null;
  }
  function deckSearchMatches(name,query) {
    const normalize=value=>String(value||"").normalize("NFKC").toLocaleLowerCase().replace(/<[^>]*>/g,"").trim();
    return normalize(name).includes(normalize(query));
  }
  let deckSearchStyleLogged=false;
  section("mobile deck picker search",()=>{
    const picker=cls(img,"DeckPickerWin"),tile=cls(img,"DeckTile"),records=new Map(),retries=new Map();
    const find=ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type");
    let next=0;
    function cleanup(record) {
      for(const ref of record.hidden.values()){try{call(ref.target,"SetActive",true);}catch(_){}ref.free();}
      try {call(record.grid.target,"set_offsetMax",vec2(record.offset.x,record.offset.y));ucls("UnityEngine.Object").method("Destroy").overload("UnityEngine.Object").invoke(record.bar.target);}catch(_){}
      for(const name of ["self","input","bar","grid"])record[name].free();
    }
    function install(self) {
      const roots=[];let bar=null,gridRect=null,offset=null,committed=false,phase="root";
      const hold=value=>{if(!isNull(value))roots.push(value.ref(false));return value;};
      const create=(...args)=>hold(uiNew(...args));
      try {
      hold(self);
      const go=hold(call(self,"get_gameObject")),parent=hold(call(go,"get_transform")),grid=hold(self.field("_grid").value);
      if(isNull(grid))throw Error("Deck grid not initialized");
      gridRect=hold(call(grid,"get_transform"));
      try {const scroll=grid.method("GetComponentInParent").overload("System.Type").invoke(ucls("UnityEngine.UI.ScrollRect").type.object);
        if(!isNull(scroll)){const viewport=call(scroll,"get_viewport");if(!isNull(viewport))gridRect=hold(viewport);}}catch(_){}
      const old=call(gridRect,"get_offsetMax");offset={x:Number(old.field("x").value),y:Number(old.field("y").value)};
      const stale=call(parent,"Find",Il2Cpp.string("RebornDeckSearch"));
      if(!isNull(stale))ucls("UnityEngine.Object").method("Destroy").overload("UnityEngine.Object").invoke(call(stale,"get_gameObject"));
      phase="create bar";bar=create("RebornDeckSearch",parent);call(bar,"SetActive",false);uiPlace(bar,.5,1,.5,1,0,-6,760,68);
      // Dark until the game field's own frame is copied (styleLikeGameInput):
      // the white "input-frame" sprite looked like an Android text box.
      const image=hold(uiAdd(bar,"UnityEngine.UI.Image"));call(image,"set_color",rgba(.08,.08,.08,.96));
      const viewport=create("TextViewport",call(bar,"get_transform"));uiStretch(uiRect(viewport));
      call(uiRect(viewport),"set_offsetMin",vec2(18,6));call(uiRect(viewport),"set_offsetMax",vec2(-96,-6));
      const textGO=create("Text",call(viewport,"get_transform"));uiStretch(uiRect(textGO));
      phase="text/input";const label=hold(deckSearchText(textGO,"",32)),input=hold(deckSearchInput(bar,label,image));
      const placeholderGO=create("Placeholder",call(viewport,"get_transform"));uiStretch(uiRect(placeholderGO));
      const labels={en_us:"Search decks…",ru_ru:"Поиск колод…",de_de:"Decks suchen…",es_es:"Buscar mazos…",es_mx:"Buscar mazos…",fr_fr:"Rechercher un deck…",it_it:"Cerca mazzi…",pl_pl:"Szukaj talii…",pt_br:"Buscar decks…",tr_tr:"Deste ara…",zh_cn:"搜索牌组…"};
      phase="placeholder";const hint=hold(deckSearchText(placeholderGO,labels[textOverlay()||resourceLanguage()]||labels.en_us,30));call(hint,"set_color",rgba(.65,.65,.65,1));call(input,"set_placeholder",hint);
      phase="game font";try{const source=styleLikeGameInput(input,label,hint);if(source&&!deckSearchStyleLogged){deckSearchStyleLogged=true;log(`deck search: text styled like the game's ${source}`);}}
      catch(error){log(`deck search: kept the built-in font: ${error}`);}
      phase="clear button";const clear=uiLabeledButton("Clear",call(bar,"get_transform"),"X",-8,-8,100,()=>{call(input,"set_text",Il2Cpp.string(""));});{const r=uiRect(clear);call(r,"set_anchorMin",vec2(1,0));call(r,"set_anchorMax",vec2(1,1));call(r,"set_pivot",vec2(1,.5));call(r,"set_anchoredPosition",vec2(-6,0));call(r,"set_sizeDelta",vec2(52,-12));}
      const clearText=call(call(clear,"get_transform"),"Find",Il2Cpp.string("Label"));
      if(!isNull(clearText)){const t=uiComponent(call(clearText,"get_gameObject"),"TMPro.TextMeshProUGUI");call(t,"set_fontSize",28);try{call(t,"set_alignment",uiEnum("TMPro.TextAlignmentOptions","Center"));}catch(_){}
        // 198: stretched over the button the X still drew in its top-left
        // corner. A glyph-sized box in the middle puts it there either way.
        uiPlace(call(clearText,"get_gameObject"),.5,.5,.5,.5,0,0,24,30);}
      // The "X" sits on a button framed like the search field itself: the
      // close-x-icon sprite came out as a white square (194), a bare X looked
      // unfinished (195).
      {const back=uiComponent(clear,"UnityEngine.UI.Image"),frame=call(image,"get_sprite");
        if(!isNull(frame)){call(back,"set_sprite",frame);call(back,"set_type",call(image,"get_type"));}
        call(back,"set_color",call(image,"get_color"));}
      if(!isNull(clearText))call(uiComponent(call(clearText,"get_gameObject"),"TMPro.TextMeshProUGUI"),"set_color",rgba(.85,.75,.55,1));
      // Shrink the scroll viewport, not its layout-driven content grid.
      call(gridRect,"set_offsetMax",vec2(offset.x,offset.y-82));
      call(bar,"SetActive",true);
      const record={self:self.ref(false),input:input.ref(false),bar:bar.ref(false),grid:gridRect.ref(false),offset,hidden:new Map()};
      committed=true;return record;
      }catch(error){throw Error(`${phase}: ${error}`);}
      finally {
        if(!committed){if(offset&&gridRect)try{call(gridRect,"set_offsetMax",vec2(offset.x,offset.y));}catch(_){}
          if(bar)try{ucls("UnityEngine.Object").method("Destroy").overload("UnityEngine.Object").invoke(bar);}catch(_){}
        }
        for(const root of roots.reverse())root.free();
      }
    }
    // One open picker: install the bar once, then filter its tiles. The walk
    // over every tile costs 100-130 ms on the main thread (report 29), so it
    // runs only when there is something to change: a query, hidden tiles to
    // bring back, or a tile set that changed under an unchanged query.
    function scanPicker(self,go,immediate) {
      const key=self.handle.toString();
      let record=records.get(key);
      if(!record){let gate=retries.get(key);if(!gate){gate=uiRetryGate(()=>Date.now());retries.set(key,gate);}
        if(!immediate&&!gate.allow())return key;
        try{record=install(self);records.set(key,record);gate.success();log(`deck search: installed${immediate?" with the deck list":""}`);}
        catch(error){gate.fail();log(`deck search: initialization attempt ${gate.count()}/3: ${error}`);return key;}
      }
      const query=String(call(record.input.target,"get_text")?.content||"");
      if(!query&&!record.hidden.size){record.lastQuery="";return key;}
      // Unchanged text and no refill (UpdateUi sets lastCount -1): nothing to do.
      if(query===record.lastQuery&&record.lastCount>=0)return key;
      const tiles=go.method("GetComponentsInChildren").overload("System.Type","System.Boolean").invoke(tile.type.object,true),tilesRoot=tiles.object.ref(false);
      try{
      if(query===record.lastQuery&&tiles.length===record.lastCount)return key;
      for(let j=0;j<tiles.length;j++) {
        const item=tiles.get(j),child=call(item,"get_gameObject"),id=child.handle.toString();
        if(!call(child,"get_activeSelf") && !record.hidden.has(id))continue;
        const name=String(call(item.field("DeckNameText").value,"get_text")?.content||"");
        const show=deckSearchMatches(name,query),hidden=record.hidden.get(id);
        if(!show&&!hidden){record.hidden.set(id,child.ref(false));call(child,"SetActive",false);}
        else if(show&&hidden){call(child,"SetActive",true);hidden.free();record.hidden.delete(id);}
      }
      record.lastQuery=query;record.lastCount=tiles.length;
      }finally{tilesRoot.free();}
      return key;
    }
    // The game fills the grid in UpdateUi: install right then, with the list,
    // instead of up to 750 ms later through the polling gate below.
    const updateUi=picker.tryMethod("UpdateUi",0);
    if(updateUi&&!updateUi.virtualAddress.isNull())hookAttach(updateUi.virtualAddress,{onEnter(args){this.self=args[0];},onLeave(){
      const ref=new Il2Cpp.Object(this.self).ref(false);
      schedule(0,()=>{try{const go=call(ref.target,"get_gameObject");if(call(go,"get_activeInHierarchy")){const record=records.get(ref.target.handle.toString());if(record)record.lastCount=-1;scanPicker(ref.target,go,true);}}
        catch(error){log(`deck search: ${error}`);}finally{ref.free();}},"deck search install");
    }});
    // The first open of the deck list also waited for the frame and clear
    // icon (report 30). Load them into the cache once the menu has settled.
    const preloadAt=Date.now()+15000;let preloaded=false;let fullScanAt=0;
    hookAttach(cls(img,"SparkleServices.ServicesManager").method("Update",0).virtualAddress,{onLeave(){
      if(!preloaded&&Date.now()>=preloadAt){preloaded=true;
        for(const path of ["AppBase/UI/Sprites/Core/UtilityAssets/input-frame","AppBase/UI/Sprites/Core/UtilityAssets/close-x-icon"])
          schedule(0,()=>loadNativeUiSprite(path,null),"deck search sprite preload");}
      if(Date.now()<next)return;next=Date.now()+250;
      // simpleperf on 141: these scans of every DeckPickerWin were most of
      // the 6% left in FindObjectsOfType; there is no deck picker in battle.
      if(globalThis.__teslInBattle)return;
      // Report 124: the full search for pickers every 250 ms was up to
      // 0.8 s per 15 s with the deck list open. An open picker is checked
      // directly, without the search.
      // A known picker that closed falls through to the full scan (cleanup).
      // Report 121 (196): a closed picker kept in records sent every tick to
      // the full search again (0.7 s per 15 s). New pickers install through
      // UpdateUi, so the full search (cleanup, and a fallback install) runs at
      // most every 3 s; on the Pixel it was 0.3 s per 15 s in the menus.
      const known=[...records.values()];
      const open=known.filter(r=>{try{return unityAlive(r.self.target)&&Boolean(call(call(r.self.target,"get_gameObject"),"get_activeInHierarchy"));}catch(_){return false;}});
      if((known.length&&open.length===known.length)||Date.now()<fullScanAt){
        if(open.length)schedule(0,()=>{for(const r of open){try{scanPicker(r.self.target,call(r.self.target,"get_gameObject"),false);}catch(_){}}},"deck search scan");
        return;
      }
      fullScanAt=Date.now()+3000;
      schedule(0,()=>{
        const live=new Set();let scanned=false;
        try {
          const values=find.invoke(picker.type.object),arrayRoot=values.object.ref(false);
          try{
          for(let i=0;i<values.length;i++) {
            const self=values.get(i),go=call(self,"get_gameObject");if(!call(go,"get_activeInHierarchy"))continue;
            live.add(scanPicker(self,go,false));
          }scanned=true;}finally{arrayRoot.free();}
        }catch(error){log(`deck search: ${error}`);}
        // A failed scan does not mean that an open window was closed.
        if(scanned){for(const [key,record] of records)if(!live.has(key)){cleanup(record);records.delete(key);}
          for(const key of retries.keys())if(!live.has(key))retries.delete(key);}
      },"deck search scan");
    }});
  });
  // END android-ui: deck-search

  // BEGIN android-ui: matching-friends
  // The search window is a modal over the main menu, and the game leaves the
  // friends button alone while matching (its click path never checks the
  // queue). The button is only out of reach under the modal. Earlier versions
  // moved the button and FriendsWin into the search window and back; the
  // menu kept serving other objects, so the restored button no longer worked
  // (report 22), and the restore reached menu objects the battle scene was
  // destroying (reports 20, 21). Nothing is moved now: while the search is
  // shown, the button and the friends window get a Canvas that sorts above
  // the search window and a GraphicRaycaster, and when it ends both go back
  // to the values they had. Hierarchy, layout and button state are untouched.
  section("friends while matchmaking",()=>{
    const seeking=cls(img,"MatchSeekingWin"),records=new Map();
    const find=ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type");
    const unityObject=ucls("UnityEngine.Object");
    // Unity's own null check: a destroyed object compares equal to null
    // without throwing, so nothing is called on it.
    const alive=value=>!isNull(value)&&!unityObject.method("op_Equality").invoke(value,NULL);
    const firstLive=(type,pick)=>{
      const values=find.invoke(type);
      for(let i=0;i<values.length;i++){const value=pick(values.get(i));if(alive(value)&&call(call(value,"get_gameObject"),"get_activeInHierarchy"))return value;}
      return null;
    };
    // The objects the game itself uses: the controller's current overlay view
    // (mobile or desktop) and MainMenu._friendsWin.
    const gameFriendsButton=()=>firstLive(cls(img,"MainMenuOverlayController").type.object,c=>{const view=call(c,"get__overlayView");return alive(view)?view.field("_friendsBtn").value:null;});
    const gameFriendsWindow=()=>firstLive(cls(img,"SPTESL.MainMenu").type.object,m=>m.field("_friendsWin").value);
    // The values a component had before we first raised it. A lower that was
    // skipped (the object was being destroyed) must not make our own sorting
    // look like the original next time.
    const originals=new Map();
    const original=(component,read)=>{const key=component.handle.toString();if(!originals.has(key))originals.set(key,read());return originals.get(key);};
    function raise(go,order,layer) {
      const canvasType=ucls("UnityEngine.Canvas").type.object,rayType=ucls("UnityEngine.UI.GraphicRaycaster").type.object;
      let canvas=go.method("GetComponent").overload("System.Type").invoke(canvasType),saved;
      if(alive(canvas))saved=original(canvas,()=>({override:Boolean(call(canvas,"get_overrideSorting")),order:Number(call(canvas,"get_sortingOrder")),layer:Number(call(canvas,"get_sortingLayerID"))}));
      else{canvas=uiAdd(go,"UnityEngine.Canvas");saved=original(canvas,()=>({override:false,order:0,layer:0}));}
      let ray=go.method("GetComponent").overload("System.Type").invoke(rayType),rayEnabled;
      if(alive(ray))rayEnabled=original(ray,()=>Boolean(call(ray,"get_enabled")));
      // A nested Canvas takes its graphics away from the parent canvas's
      // raycaster, so the raycaster we add has to stay on after the search,
      // or the button and the friends panel stop receiving taps (report 23).
      else{ray=uiAdd(go,"UnityEngine.UI.GraphicRaycaster");rayEnabled=original(ray,()=>true);}
      const item={go:go.ref(false),canvas:canvas.ref(false),ray:ray.ref(false),...saved,rayEnabled};
      call(canvas,"set_overrideSorting",true);call(canvas,"set_sortingLayerID",layer);call(canvas,"set_sortingOrder",order);
      call(ray,"set_enabled",true);
      return item;
    }
    function lower(item) {
      // A Canvas or GraphicRaycaster we added stays: removing a Canvas its
      // raycaster depends on is refused by Unity. The Canvas stops overriding
      // the sorting; the raycaster stays on to serve the nested Canvas.
      try{
        if(alive(item.canvas.target)){call(item.canvas.target,"set_sortingLayerID",item.layer);call(item.canvas.target,"set_sortingOrder",item.order);call(item.canvas.target,"set_overrideSorting",item.override);}
        if(alive(item.ray.target))call(item.ray.target,"set_enabled",item.rayEnabled);
      }finally{item.go.free();item.canvas.free();item.ray.free();}
    }
    function restore(record,source) {
      log(`matching friends: lowered (${source}; ${record.items.length} item${record.items.length===1?"":"s"})`);
      for(const item of record.items)try{lower(item);}catch(error){log(`matching friends: lower (${source}) failed: ${error}`);}
      record.window.free();
    }
    const show=seeking.method("Show");
    hookAttach(show.virtualAddress,{onEnter(args){this.self=args[0];},onLeave(){
      const ref=new Il2Cpp.Object(this.self).ref(false);schedule(0,()=>{let record=null,key="";try{
        const go=call(ref.target,"get_gameObject");key=go.handle.toString();
        if(!call(go,"get_activeInHierarchy"))return;
        if(records.has(key)){const stale=records.get(key);records.delete(key);restore(stale,"search reopened");}
        const window=ref.target.method("GetComponentInParent").overload("System.Type").invoke(ucls("UnityEngine.Canvas").type.object);
        if(!alive(window))throw Error("search window has no Canvas");
        const root=call(window,"get_rootCanvas");
        const order=Math.max(Number(call(window,"get_sortingOrder")),alive(root)?Number(call(root,"get_sortingOrder")):0)+10,layer=Number(call(window,"get_sortingLayerID"));
        const button=gameFriendsButton();if(!button)throw Error("the menu's _friendsBtn is unavailable");
        record={items:[],window:ref.target.ref(false)};
        record.items.push(raise(call(button,"get_gameObject"),order,layer));
        // The friends panel opens above the button's own layer.
        const friends=gameFriendsWindow();
        if(friends)record.items.push(raise(call(friends,"get_gameObject"),order+1,layer));
        records.set(key,record);armWatch();
        log(`matching friends: raised above the search window (order ${order}${friends?"":", no friends window"})`);
      }catch(error){if(record){records.delete(key);restore(record,"show failure rollback");}log(`matching friends: ${error}`);}finally{ref.free();}},"matching friends show");
    }});
    const closed=[],absent=[];
    for(const name of ["OnDisable","OnDestroy","HandleOnCancelSearch"]) {
      const method=seeking.tryMethod(name,0);if(!method||method.virtualAddress.isNull()){absent.push(name);continue;}
      closed.push(name);
      hookAttach(method.virtualAddress,{onEnter(args){try{
        const key=call(new Il2Cpp.Object(args[0]),"get_gameObject").handle.toString(),record=records.get(key);
        if(record){records.delete(key);schedule(0,()=>restore(record,name),"matching friends restore");}
      }catch(error){log(`matching friends restore: ${error}`);}}});
    }
    log(`matching friends: close hooks ${closed.join(", ")}${absent.length?` (missing ${absent.join(", ")})`:""}`);
    // A close path none of the hooks see still ends with an inactive window.
    let watching=false;
    const armWatch=()=>{if(records.size&&!watching){watching=true;schedule(1000,watch,"matching friends watchdog");}};
    const watch=()=>{
      watching=false;
      for(const [key,record] of records){
        let live=false;try{live=alive(record.window.target)&&call(call(record.window.target,"get_gameObject"),"get_activeInHierarchy");}catch(_){}
        if(live)continue;
        records.delete(key);restore(record,"watchdog");
      }
      armWatch();
    };
  });
  // END android-ui: matching-friends


