  // 5) Asset bundles. On desktop the game treats bundles as local files; on mobile it downloads them from a CDN that
  //    no longer exists. Two decisions matter:
  //    a) AssetCatalog.PlatformDownloadsBundles(): when true the game fetches versions.json from the dead CDN, and when
  //       that fails it shows the "Error {0} - Please check your internet..." popup. Make it false, like desktop.
  //    b) The same check inside LoadAssetBundleInternal decides whether the platform manifest (shipped in the OBB as
  //       assets/android) is read locally or downloaded. Force "local" for that call only.
  section("bundles: desktop behaviour", () => {
    // These run 350-700 times a second while cards load; in JS each was a
    // native -> JS crossing. Now native: AssetCatalog's answer is patched to
    // "return false", and PlatformUtils' answer is replaced in a CModule
    // listener while LoadAssetBundleInternal runs (a native depth counter).
    const load = byName("AssetBundles.AssetBundleManager", "LoadAssetBundleInternal").virtualAddress;
    const platform = byName("PlatformUtils", "PlatformDownloadsBundles").virtualAddress;
    const catalog = byName("AssetCatalog", "PlatformDownloadsBundles").virtualAddress;
    const depth = Memory.alloc(4);
    try {
      const cm = new CModule(`
#include <gum/guminterceptor.h>
extern int depth;
void load_enter (GumInvocationContext * ic) { depth++; }
void load_leave (GumInvocationContext * ic) { if (depth > 0) depth--; }
void platform_leave (GumInvocationContext * ic) { if (depth > 0) gum_invocation_context_replace_return_value (ic, (gpointer) 0); }
`, { depth });
      Interceptor.attach(load, { onEnter: cm.load_enter, onLeave: cm.load_leave } as any);
      Interceptor.attach(platform, { onLeave: cm.platform_leave } as any);
      (globalThis as any).__teslBundlesKeep = cm;
      log("PlatformUtils.PlatformDownloadsBundles -> false while loading bundles (manifest from OBB, native)");
    } catch (error) {
      let inLoad = false;
      hookAttach(load, { onEnter() { inLoad = true; }, onLeave() { inLoad = false; } });
      hookAttach(platform, { onLeave(ret) { if (inLoad) ret.replace(ptr(0)); } });
      log(`PlatformUtils.PlatformDownloadsBundles -> false while loading bundles (JS: ${error})`);
    }
    // mov w0, #0; ret
    Memory.patchCode(catalog, 8, code => { code.writeU32(0x52800000); code.add(4).writeU32(0xd65f03c0); });
    log("AssetCatalog.PlatformDownloadsBundles -> false (no CDN download, patched)");
    // Where do the streaming assets (the OBB) come from?
    try {
      let seenLocal = 0;
      const mgr = cls(img, "AssetBundles.AssetBundleManager");
      hookAttach(mgr.method("SetSourceAssetBundleURL").virtualAddress, {
        onEnter(args) { log(`AssetBundleManager.SetSourceAssetBundleURL("${rawStr(args[1])}")`); },
      });
      const local = cls(img, "AssetBundles.AssetBundleLoadFromLocalOperation");
      hookAttach(local.method(".ctor", 1).virtualAddress, {
        onEnter(args) { if (seenLocal++ < 4) log(`AssetBundleLoadFromLocalOperation("${rawStr(args[1])}")`); },
      });
    } catch (e) { log(`obb trace failed: ${e}`); }
  });

  // 5b) AssetBundleManager.Initialize() fills its bundle storage-mode table (streaming vs downloadable) from
  //     AssetCatalog._remoteBundleVersionInfo, which is normally downloaded versions.json. With the CDN skipped it is
  //     empty, every bundle then defaults to "local" and downloadable ones (e.g. the cached de_de filemanifests) are
  //     opened from the OBB and fail, so loading stalls. Fill it from the restored local versions.json instead.
  section("storage modes from local versions.json", () => {
    const catalog = cls(img, "AssetCatalog");
    const mgr = cls(img, "AssetBundles.AssetBundleManager");
    const init = mgr.methods.find(x => x.name === "Initialize");
    if (!init) throw new Error("AssetBundleManager.Initialize not found");
    const className = (o: any): string => {
      try { return isNull(o) ? "(null)" : (o as Il2Cpp.Object).class.name; } catch (_) { return "(?)"; }
    };
    hookAttach(init.virtualAddress, {
      onEnter(args) {
        try {
          // Initialize(string manifestBundleName, BundleVersionInfo versionInfo) fills the
          // bundle storage mode table from that version info. It is normally the versions.json
          // downloaded from the CDN, which is gone, so the table stays empty and every bundle
          // is treated as a local one. Fill it from the versions.json in the app's data folder.
          let versionInfo: Il2Cpp.Object | null = null;
          for (const arg of [args[0], args[1], args[2]]) {
            if (className(arg) === "BundleVersionInfo") { versionInfo = new Il2Cpp.Object(arg); break; }
          }
          if (!versionInfo) {
            const remote = catalog.field<Il2Cpp.Object>("_remoteBundleVersionInfo").value;
            if (className(remote) === "BundleVersionInfo") versionInfo = remote;
          }
          if (!versionInfo) {
            log(`storage modes: no version info found (args: ${className(args[0])}, ${className(args[1])})`);
            return;
          }
          const count = () => Number(call(versionInfo!.field<Il2Cpp.Object>("_entries").value, "get_Count"));
          const before = count();
          if (before === 0) {
            const path = String((catalog.method("GetVersionJsonPath") as any).invoke()?.content ?? "");
            log(`storage modes: loading ${path}`);
            call(versionInfo, "Load", Il2Cpp.string(path));
            // On Android the unity file system rejects the JSON (result = FAILED, 0 parsed)
            // even though the file is perfectly readable. Retry by feeding the exact JSON
            // through the IL2CPP LoadFromMemory, which deserializes without going through
            // the PlatformAllowsBundleManifest gate.
            if (count() === 0) {
              try {
                const fileClass = Il2Cpp.corlib.class("System.IO.File");
                const exists = (fileClass.method("Exists") as any).invoke(Il2Cpp.string(path));
                if (Boolean(exists)) {
                  const text = String((fileClass.method("ReadAllText") as any).invoke(Il2Cpp.string(path))?.content ?? "");
                  if (text.length > 0) {
                    (versionInfo.method("LoadFromMemory") as any).invoke(Il2Cpp.string(text));
                    log(`storage modes: LoadFromMemory added ${count()} entries (path failed)`);
                  }
                }
              } catch (e) { log(`storage modes: recovery failed: ${e}`); }
            }
          }
          log(`AssetBundleManager.Initialize: version info entries ${before} -> ${count()}`);
        } catch (e) { log(`storage mode fill error: ${e}`); }
      },
    });
  });

  section("versions.json load", () => {
    const m = cls(img, "BundleVersionInfo").methods.find(x => x.name === "Load");
    if (!m) throw new Error("BundleVersionInfo.Load not found");
    let path = "";
    hookAttach(m.virtualAddress, {
      onEnter(args) { path = rawStr(args[1]); },    // instance: args[0] = this, args[1] = path
      onLeave(ret) { log(`BundleVersionInfo.Load("${path}") -> ${ret.toInt32() & 0xff ? "ok" : "FAILED"}`); },
    });
  });

  // 6) Unity deletes cached bundles that were not used for `expirationDelay` seconds (the game sets 45 days),
  //    and the game itself removes the cached bundles that its version info does not know about. The bundles
  //    that were restored into the cache have to survive both, so the expiration is set to the maximum and
  //    the removal of cached versions is ignored.
  section("cache never expires", () => {
    const core = Il2Cpp.domain.assembly("UnityEngine.CoreModule").image;
    const cache = core.class("UnityEngine.Cache");
    const caching = core.class("UnityEngine.Caching");
    // The property setter is inlined by the IL2CPP compiler, so the internal
    // method that does the work is hooked instead. Its native signature has
    // three slots: the handle is in x1, the new delay in x2. Unity refuses a
    // delay above 12960000 seconds.
    const MAX_DELAY = 12960000;
    const setDelay = cache.method("Cache_SetExpirationDelay", 2);
    hookAttach(setDelay.virtualAddress, {
      onEnter(args) {
        const delay = args[2].toInt32();
        if (delay < MAX_DELAY) {
          log(`Cache.expirationDelay ${delay} -> ${MAX_DELAY}`);
          args[2] = ptr(MAX_DELAY);
        }
      },
    });
    // The game removes the cached versions that are not in its version info.
    let cleared = 0;
    // Replaced, not attached: an attached hook only changed the result while
    // Unity still removed the bundle. (No 2026 log shows the game calling it.)
    caching.method("ClearCachedVersion", 2).implementation = function () {
      if (cleared++ < 5) log("Caching.ClearCachedVersion -> ignored");
      return true;
    };
  });

