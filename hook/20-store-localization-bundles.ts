  // BEGIN android-ui: store-images
  function rebornStoreImagePath(value) {
    return typeof value==="string" && /^AppBase\/UI\/Textures\/Store\/img_-?\d+_2$/.test(value);
  }
  section("Reborn store image loading",()=>{
    const owner=cls(img,"StoreImageUtils");
    const iterator=img.classes.find(c=>c.declaringClass?.name===owner.name && /LoadStoreImageCoroutine/.test(c.name)
      && c.fields.some(f=>f.name==="imageUrl") && c.fields.some(f=>f.name==="callback"));
    if(!iterator)throw Error("Store image coroutine metadata unavailable");
    const state=iterator.fields.find(f=>f.name==="$PC"),current=iterator.fields.find(f=>f.name==="$current");
    const operation=iterator.fields.find(f=>/operation/i.test(f.name) && /AssetBundleLoadAssetOperation$/.test(f.type.name));
    const sprite=ucls("UnityEngine.Sprite"),catalog=cls(img,"AssetCatalog");
    const load=catalog.method("LoadAssetFromPathAsync").overload("System.String","System.Type","System.String");
    const move=iterator.method("MoveNext",0);
    if(!state || !current || !operation || move.virtualAddress.isNull())throw Error("Store image coroutine fields unavailable");
    function report(kind,path) {recordResourceEvent(kind,path);log(`store image: ${kind} ${path}`);}
    const jobs=new Map();
    function finish(job) {
      if(jobs.get(job.key)!==job)return;
      jobs.delete(job.key);
      try {const self=job.ref.target;self.field(state.name).value=-1;self.field(current.name).value=ptr(0);self.field(operation.name).value=ptr(0);}catch(_){}
      job.ref.free();
    }
    function poll(job) {
      if(jobs.get(job.key)!==job)return;
      try {
        const self=job.ref.target;
        if(!job.started) {
          job.started=true;report("store-request",job.path);
          // Start outside the MoveNext interceptor. Nested Frida callbacks are
          // suppressed: starting here lets the Android bundle-path hooks run.
          const result=catalog.method("get_Instance",0).invoke().method(load.name)
            .overload("System.String","System.Type","System.String").invoke(Il2Cpp.string(job.path),sprite.type.object,Il2Cpp.string("png"));
          if(isNull(result)){report("store-missing",job.path);finish(job);return;}
          self.field(operation.name).value=result;
        }
        const op=self.field(operation.name).value;
        if(call(op,"IsDone")) {
          const asset=op.method("GetAsset",0).inflate(sprite).invoke();
          // Terminal before callback, including callbacks that dispose/re-enter.
          self.field(state.name).value=-1;
          if(isNull(asset))report("store-missing",job.path);
          else {report("store-loaded",job.path);const callback=self.field("callback").value;
            if(!isNull(callback))invokeDelegatePtr(callback,asset.handle);}
          finish(job);return;
        }
        if(Date.now()>job.deadline){report("store-timeout",job.path);finish(job);return;}
        schedule(50,()=>poll(job),"store image poll");
      }catch(error){report("store-error",job.path);log(`store image failure: ${error}`);finish(job);}
    }
    // Intercept the factory itself: Unity may dispatch IEnumerator.MoveNext
    // through a cached interface thunk rather than the replaced method body.
    const factory=owner.methods.find(m=>m.name==="LoadStoreImageCoroutine" && m.isStatic && m.parameterCount===4);
    if(!factory || factory.virtualAddress.isNull())throw Error("Store image factory unavailable");
    hookAttach(factory.virtualAddress,{onLeave(ret){
      if(ret.isNull())return;
      try {
        const self=new Il2Cpp.Object(ret),path=String(self.field("imageUrl").value?.content||"");
        if(!rebornStoreImagePath(path))return;
        // Return a valid, completed IEnumerator. Our independently rooted job
        // owns asset delivery; Unity disposing the empty iterator must not cancel it.
        self.field(state.name).value=-1;self.field(current.name).value=ptr(0);
        if(jobs.size>=64){report("store-busy",path);return;}
        const key=self.handle.toString();if(jobs.has(key))return;
        const job={key,ref:self.ref(false),path,deadline:Date.now()+20000,started:false};
        jobs.set(key,job);report("store-queued",path);schedule(0,()=>poll(job),"store image poll");
      }catch(error){log(`store image factory failure: ${error}`);}
    }});
    log(`store image: direct Sprite/png loading via ${iterator.name}`);
  });
  // END android-ui: store-images

  // Trace the asset lookups of the localization data: the English text lives
  // in the "appbase/en_us" bundle, and when that lookup fails the whole user
  // interface shows the raw localization keys instead of the text.
  section("localization asset trace", () => {
    const catalog = cls(img, "AssetCatalog");
    let lastEnterPath = "", lastLoggedPath = "", lastLoggedAt = 0;
    for (const m of catalog.methods.filter(x => x.name === "LoadAssetFromPathAsync")) {
      hookAttach(m.virtualAddress, {
        onEnter(args) {
          this.path = rawStr(args[1]);
          // The overloads call each other, so one lookup enters both hooks
          // back to back with the same path: count the pair once for the
          // stall probe.
          if (this.path !== lastEnterPath) {
            lastEnterPath = this.path;
            const probe = (globalThis as any).__teslRebornStallProbe;
            if (probe) probe.loads++;
          }
          // Only the localization assets depend on the selected language, and
          // this hook runs for every asset load: reading the preference file
          // for the rest of them is pure disk traffic on the loading path.
          const selected = /\/Localization\/(?:Text|Audio)\//i.test(this.path) ? resourceLanguage() : "";
          const next = localizedAssetPath(this.path, selected);
          if (next !== this.path) {
            this.replacement = Il2Cpp.string(next).object.ref(false);
            args[1] = this.replacement.target.handle; this.path = next;
          }
          recordResourceEvent("asset-request", this.path);
        },
        onLeave(ret) {
          if (this.replacement) this.replacement.free();
          recordResourceEvent(ret.isNull() ? "asset-null" : "asset-operation", this.path);
          const path = this.path ?? "";
          if ((!verboseLogs || path.toLowerCase().indexOf("localization") < 0) && !ret.isNull()) return;
          // The twin hook reports the same lookup a moment later: collapsing
          // the repeat keeps the port log readable without losing a failure.
          if (path === lastLoggedPath && Date.now() - lastLoggedAt < 100) return;
          lastLoggedPath = path; lastLoggedAt = Date.now();
          log(`LoadAssetFromPathAsync("${path}") -> ${ret.isNull() ? "NULL (not in the asset map)" : "ok"}`);
        },
      });
    }
  });

  // The OBB's asset bundle manifest and the versions.json of the restored
  // cache can disagree about the hash of a bundle. Unity looks the cache up by
  // that hash, so a mismatch means the bundle is downloaded again (and the CDN
  // is gone). Write the manifest's hashes to a file so the cache folders can
  // be renamed to match.
  // BEGIN android-ui: bundle-hashes
  section("bundle hash report", () => {
    // About 0.7 s of main thread time on a OnePlus 7 Pro at every start.
    if (!verboseLogs) return;
    const mgr = cls(img, "AssetBundles.AssetBundleManager");
    const catalog = cls(img, "AssetCatalog");
    const target = "/sdcard/Android/data/com.bethsoft.theelderscrollslegends/files/tesl-bundle-hashes.txt";
    // SetCacheExpiration is reachable from the normal asset path, and hashing
    // every entry of the manifest costs one round of managed calls per bundle
    // (seconds of main thread time). The report is a one-off diagnostic: it is
    // written once, and only retried while the manifest is still missing.
    let written = false, attempts = 0, last = 0;
    hookAttach(catalog.method("SetCacheExpiration").virtualAddress, {
      onEnter() {
        const now = Date.now();
        if (written || attempts >= 3 || (attempts > 0 && now - last < 60000)) return;
        last = now; attempts++;
        const started = now;
        try {
          const manifest = mgr.field<Il2Cpp.Object>("m_AssetBundleManifest").value;
          if (isNull(manifest)) { log("bundle hashes: the manifest is not loaded yet"); return; }
          const names = manifest.method("GetAllAssetBundles").invoke() as Il2Cpp.Array<Il2Cpp.String>;
          const lines: string[] = [];
          for (let i = 0; i < names.length; i++) {
            const name = names.get(i)?.content ?? "";
            const hash = manifest.method("GetAssetBundleHash").invoke(Il2Cpp.string(name));
            const hex = String((hash as any)?.method("ToString").invoke()?.content ?? "");
            lines.push(`${name} ${hex}`);
          }
          (Il2Cpp.corlib.class("System.IO.File").method("WriteAllText") as any)
            .invoke(Il2Cpp.string(target), Il2Cpp.string(lines.join("\n")));
          written = true;
          log(`bundle hashes: wrote ${lines.length} entries to ${target} in ${Date.now() - started}ms`);
        } catch (e) { log(`bundle hash report failed: ${e}`); }
      },
    });
  });
  // END android-ui: bundle-hashes

