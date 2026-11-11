  // BEGIN android-ui: unity-error-log
  let unityLogCallbackRef = null;
  section("persistent Unity errors", () => {
    const application = ucls("UnityEngine.Application");
    // Matching.UpdateRejoin throws on every frame while the game shows "logged
    // in on another device": a repeat is counted, not logged again, for a minute.
    let lastError = "", lastLoggedAt = 0, repeats = 0;
    const logUnity = (kind, message, stack) => {
      const key = `${kind}\n${message}\n${stack}`, now = Date.now();
      if (key === lastError && now - lastLoggedAt < 60000) { repeats++; return; }
      if (repeats) log(`Unity: the previous message repeated ${repeats} more times`);
      lastError = key; lastLoggedAt = now; repeats = 0;
      log(`Unity ${kind}: ${message}\n${stack}`);
    };
    const subscribe = application.tryMethod("add_logMessageReceivedThreaded", 1);
    if (subscribe && !subscribe.virtualAddress.isNull()) {
      const delegate = Il2Cpp.delegate(subscribe.parameters[0].type.class, (message, stack, value) => {
        const kind = enumVal(value);
        if ([0,1,2,4].includes(kind)) logUnity(kind, message?.content || "", stack?.content || "");
      });
      unityLogCallbackRef = delegate.ref(false);
      subscribe.invoke(delegate);
      return;
    }
    const callback = application.tryMethod("CallLogCallback", 4);
    if (!callback || !callback.isStatic || callback.virtualAddress.isNull()) return;
    hookAttach(callback.virtualAddress, { onEnter(args) {
      const kind = args[2].toInt32();
      if (![0,1,2,4].includes(kind)) return;
      try {
        const message = args[0].isNull() ? "" : new Il2Cpp.String(args[0]).content || "";
        const stack = args[1].isNull() ? "" : new Il2Cpp.String(args[1]).content || "";
        logUnity(kind, message, stack);
      } catch (_) {}
    }});
  });
  // END android-ui: unity-error-log

  // BEGIN android-ui: channel-migration
  // The test channel moved from the Solomag fork to a branch of the main
  // repository. Phones keep the feed the launcher wrote on first start
  // (UpdateConfig only fills an empty one), so a new APK cannot move them;
  // this OTA, still published to the fork, rewrites the old fork feed once.
  // Applies from the next start; the current session finishes on the old one.
  const LEGACY_TEST_FEED = "https://raw.githubusercontent.com/Solomag/tesl-reborn-android/android-ui-and-update-loader/updates/test/manifest.json";
  const MAIN_TEST_FEED = "https://raw.githubusercontent.com/ssorgatem/tesl-reborn-android/android-ui-and-update-loader/updates/test/manifest.json";
  function migrateUpdateChannel(io) {
    let config;
    try { config = JSON.parse(io.read() || "null"); } catch (_) { return "unreadable"; }
    if (!config || typeof config !== "object" || config.feedUrl !== LEGACY_TEST_FEED) return "unchanged";
    config.feedUrl = MAIN_TEST_FEED;
    return io.write(JSON.stringify(config)) ? "migrated" : "write-failed";
  }
  // END android-ui: channel-migration

  section("Reborn Android updater and diagnostics", () => {
    try {
      const path = `${persistentPath()}/tesl-reborn-updater.json`;
      const result = migrateUpdateChannel({
        read: () => readTextFile(path),
        write: text => writeTextFile(path + ".part", text) && atomicRename(path + ".part", path)
      });
      if (result !== "unchanged") log(`updater: channel migration ${result}${result === "migrated" ? " to the main repository test branch" : ""}`);
    } catch (error) { log(`updater: channel migration failed: ${error}`); }
    const uriClass = ucls("System.Uri");
    log(`HTTP URI assembly: ${uriClass.image.name}`);
    log("Android feature hooks are active; server data and UI results are checked separately");
    const updater = globalThis.TeslRebornUpdater;
    if (updater) {
      // A new patch is kept only after the game has drawn frames for 15 s
      // without a gap: one that sets up but then stops the game (login, the
      // first scene) never reaches ready(), and the loader goes back to the
      // previous one after three such starts. A pause (the phone locked)
      // starts the count again.
      // Without any frame report at all after a minute the frame hook itself
      // is what failed, not the game: the patch is accepted then.
      let healthySince = 0;
      const watchStarted = Date.now();
      const healthWatch = setInterval(() => {
        const lastFrame = Number(globalThis.__teslLastFrameAt || 0), now = Date.now();
        if (!lastFrame && now - watchStarted > 60000) {
          clearInterval(healthWatch);
          log("updater: no frame reports; patch accepted without the frame check");
          try { updater.ready(); } catch (error) { log(`updater: ready failed: ${error}`); }
          return;
        }
        if (!lastFrame || now - lastFrame > 3000) { healthySince = 0; return; }
        if (!healthySince) healthySince = now;
        if (now - healthySince < 15000) return;
        clearInterval(healthWatch);
        try { updater.ready(); } catch (error) { log(`updater: ready failed: ${error}`); }
      }, 1000);
      try { installUpdateNotices(updater); }
      catch (error) {
        log(`update notices unavailable: ${error}`);
        schedule(1000, () => updater.check((url, cb) => httpGet(url, false, cb, true)));
      }
    }
  });

  log("setup finished");
