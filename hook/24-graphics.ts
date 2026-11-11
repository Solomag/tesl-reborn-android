  // BEGIN android-ui: graphics
  // Frame rate: InitializationState sets Application.targetFrameRate to 60 at
  // start. Game Data can choose 30 (weak or hot phones) or 90/120 (fast
  // displays) in tesl-reborn-graphics.json; the game's own call is given that
  // value, and vSync, which would cap the rate at the display's, is turned off.
  // Game data has sliders: any whole rate from 20 to 240 FPS.
  function graphicsFrameRate(text) {
    try {
      const value = JSON.parse(text || "null")?.frameRate;
      return Number.isInteger(value) && value >= 20 && value <= 240 ? value : null;
    } catch (_) { return null; }
  }
  // Saved quality: VeryLow 0 .. High 3; Auto (4) and anything else keep the
  // game's own pick for the device.
  function graphicsQuality(text) {
    try {
      const value = JSON.parse(text || "null")?.quality;
      return Number.isInteger(value) && value >= 0 && value <= 3 ? value : null;
    } catch (_) { return null; }
  }
  // Render resolution in percent of the screen; 100 (or nothing) keeps it.
  function graphicsRenderScale(text) {
    try {
      const value = JSON.parse(text || "null")?.renderScale;
      return Number.isInteger(value) && value >= 30 && value < 100 ? value : null;
    } catch (_) { return null; }
  }
  // The width and height to draw at: the largest size asked for so far is
  // the screen; smaller requests (the game re-applying the scaled size) are
  // left alone, so the scale never compounds.
  function scaledResolution(state, width, height, percent) {
    if (width * height > state.width * state.height) { state.width = width; state.height = height; }
    const target = { width: Math.round(state.width * percent / 100), height: Math.round(state.height * percent / 100) };
    return width > target.width ? target : { width, height };
  }
  section("graphics: render resolution", () => {
    // Removed after report 90: the battle is limited by the CPU, and of the
    // graphics settings only MSAA cost frames. A saved scale is ignored.
    if (graphicsRenderScale(readTextFile(`${persistentPath()}/tesl-reborn-graphics.json`)))
      log("graphics: saved render resolution ignored (setting removed)");
    const percent = 0;
    if (!percent) return;
    // Report from a Pixel 8 Pro: the game draws at the full 2841x1344 with 4x
    // antialiasing and drops to 5-12 FPS in matches. Unity scales the picture
    // and touches to the screen itself; every resolution request goes
    // through this engine function, so it is the one place to lower it.
    const resolve = new NativeFunction(Il2Cpp.module.getExportByName("il2cpp_resolve_icall"), "pointer", ["pointer"]);
    const name = "UnityEngine.Screen::SetResolution(System.Int32,System.Int32,System.Boolean,System.Int32)";
    const at = resolve(Memory.allocUtf8String(name));
    if (at.isNull()) { log("graphics: render resolution unavailable (no engine SetResolution)"); return; }
    const state = { width: 0, height: 0 };
    // Settings asks for the full screen on every open (SettingsController);
    // already drawn at the scaled size, that request changes nothing.
    globalThis.__teslScaledSize = (width, height) => scaledResolution(state, width, height, percent);
    hookAttach(at, {
      onEnter(args) {
        const width = args[0].toInt32(), height = args[1].toInt32();
        const size = scaledResolution(state, width, height, percent);
        if (size.width === width) return;
        args[0] = ptr(size.width); args[1] = ptr(size.height);
        log(`graphics: render resolution ${width}x${height} -> ${size.width}x${size.height} (${percent}%)`);
        // Report 25: a new surface comes back with vSync on (menu at 97 FPS).
        schedule(300, () => globalThis.__teslApplyRate?.("after resolution"), "graphics rate after resolution");
      }
    });
    // The game set its resolution before the hook ran: apply the scale now.
    const setResolution = new NativeFunction(at, "void", ["int", "int", "bool", "int"]);
    schedule(0, () => {
      try {
        const screen = ucls("UnityEngine.Screen");
        const width = Number(screen.method("get_width", 0).invoke()), height = Number(screen.method("get_height", 0).invoke());
        const fullscreen = Boolean(screen.method("get_fullScreen", 0).invoke());
        setResolution(width, height, fullscreen ? 1 : 0, 0);
      } catch (error) { log(`graphics: render resolution failed: ${error}`); }
    }, "graphics render resolution");
  });
  section("graphics: frame rate and quality", () => {
    const file = `${persistentPath()}/tesl-reborn-graphics.json`;
    // Report 110: the Pixel 8 Pro had 120 chosen (the display ran at 120 Hz)
    // and a battle cap of 30 learned on the old, slow patches. Once per phone
    // the chosen frame rate goes back to the default; it can be set again.
    try {
      const saved = JSON.parse(readTextFile(file) || "{}") || {};
      if (saved.frameRateReset !== 173) {
        const had = saved.frameRate;
        delete saved.frameRate; saved.frameRateReset = 173;
        writeTextFile(file, JSON.stringify(saved));
        if (had !== undefined) log(`graphics: chosen frame rate ${had} reset to the default (once, patch 173)`);
      }
    } catch (_) {}
    const rate = graphicsFrameRate(readTextFile(file));
    globalThis.__teslTargetRate = rate || 60;
    // Without an expert choice: the highest quality, with MSAA off (below).
    // The quality choice was removed with the render resolution (report 90):
    // always the highest level, MSAA off.
    let chosenQuality = 3;
    let allowMsaa = false;
    try { allowMsaa = JSON.parse(readTextFile(file) || "{}")?.msaa === true; } catch (_) {}
    // Report 38: Unity ignores targetFrameRate while vSync is on, and every
    // quality level turns it on. The managed setter is stripped; the engine
    // function behind it is still there.
    const resolve = new NativeFunction(Il2Cpp.module.getExportByName("il2cpp_resolve_icall"), "pointer", ["pointer"]);
    const icall = (names, ret, args) => {
      for (const name of names) { const at = resolve(Memory.allocUtf8String(name)); if (!at.isNull()) return new NativeFunction(at, ret, args); }
      return null;
    };
    const setVSync = icall(["UnityEngine.QualitySettings::set_vSyncCount(System.Int32)", "UnityEngine.QualitySettings::set_vSyncCount"], "void", ["int"]);
    globalThis.__teslSetAntiAliasing = icall(["UnityEngine.QualitySettings::set_antiAliasing(System.Int32)", "UnityEngine.QualitySettings::set_antiAliasing"], "void", ["int"]);
    const getVSync = icall(["UnityEngine.QualitySettings::get_vSyncCount()", "UnityEngine.QualitySettings::get_vSyncCount"], "int", []);
    // Report 40: the managed setter reads its value from another register
    // than the one the hook replaced, so the game's 60 always won. The
    // engine function takes it as its first argument.
    const engineSetRate = icall(["UnityEngine.Application::set_targetFrameRate(System.Int32)"], "void", ["int"]);
    const getRate = icall(["UnityEngine.Application::get_targetFrameRate()", "UnityEngine.Application::get_targetFrameRate"], "int", []);
    // Report 69: the build strips setters the game never calls
    // (antiAliasing, fixedDeltaTime) together with their engine functions;
    // the getters stay. A getter calls the manager accessor and loads a
    // field: both are read from its code and the field is written directly,
    // only when it holds what the getter returns.
    const getterFields = {};
    function getterField(names) {
      const key = names[0];
      if (key in getterFields) return getterFields[key];
      let found = null; const trace = [];
      try {
        let at = null;
        for (const name of names) { const p = resolve(Memory.allocUtf8String(name)); if (!p.isNull()) { at = p; break; } }
        if (!at) throw Error("getter not found");
        const start = at; let owner = null;
        for (let i = 0; i < 24 && !found; i++) {
          const ins: any = Instruction.parse(at);
          trace.push(`${ins.mnemonic} ${ins.opStr}`);
          if (ins.mnemonic === "ret") break;
          if (!owner && ins.mnemonic === "b") { at = ptr(ins.opStr.replace("#", "")); continue; }
          if (!owner && ins.mnemonic === "bl") owner = ptr(ins.opStr.replace("#", ""));
          else if (owner && /^ldr/.test(ins.mnemonic)) {
            const m = ins.opStr.match(/^([ws])0, \[x0(?:, #(0x[0-9a-f]+|\d+))?\]$/);
            if (m) {
              const kind = m[1] === "s" ? "float" : "int";
              found = { owner: new NativeFunction(owner, "pointer", []), offset: Number(m[2] || 0), kind, read: new NativeFunction(start, kind, []) };
            }
          }
          at = ins.next;
        }
        if (!found) throw Error("no field load");
      } catch (error) { log(`engine: ${key} field unknown: ${error}; ${trace.join("; ")}`); }
      return getterFields[key] = found;
    }
    function writeField(names, value) {
      const field = getterField(names);
      if (!field) return false;
      const owner = field.owner();
      if (owner.isNull()) return false;
      const at = owner.add(field.offset), now = field.read();
      const held = field.kind === "float" ? at.readFloat() : at.readS32();
      if (Math.abs(held - now) > 1e-6) { log(`engine: ${names[0]} field +${field.offset} holds ${held}, getter ${now}; not written`); getterFields[names[0]] = null; return false; }
      if (field.kind === "float") at.writeFloat(value); else at.writeS32(value);
      return field.read();
    }
    const antiAliasingNames = ["UnityEngine.QualitySettings::get_antiAliasing()", "UnityEngine.QualitySettings::get_antiAliasing"];
    const fixedStepNames = ["UnityEngine.Time::get_fixedDeltaTime()", "UnityEngine.Time::get_fixedDeltaTime"];
    // The rate in force: the chosen one, or the heat cap while it lasts.
    const currentRate = () => { const cap = globalThis.__teslRateCap; return cap ? Math.min(rate || 60, cap) : rate; };
    function applyRate(why) {
      // Without a chosen rate the game's own 60 is restored after a heat cap.
      const effective = currentRate() || (["cap lifted", "resumed", "after resolution", "drift"].includes(why) ? 60 : 0);
      if (!effective) return;
      // Report 90: of the graphics settings only MSAA ever cost frames; it is
      // turned off whenever the rate is applied (start, quality change,
      // resolution change), unless chosen in the graphics file.
      if (!allowMsaa) try { const samples = antiAliasingOff(); if (samples) log(`graphics: antiAliasing ${samples}x -> off (${why})`); } catch (_) {}
      try {
        if (setVSync) setVSync(0);
        if (engineSetRate) engineSetRate(effective); else setRate.invoke(effective);
        log(`graphics: frame rate ${effective} (${why}): target ${getRate ? getRate() : "?"}, vSync ${getVSync ? getVSync() : "?"}`);
      } catch (error) { log(`graphics: frame rate failed: ${error}`); }
    }
    // Automatic frame rate (reports 11-19). A hot phone halves its clocks
    // and swings 60 -> 22; a CPH2723 set to 90 never passed 36 and then sat
    // at 25. Every 15 s the measured rate is compared with the rate in force:
    // 30 s below 3/4 of it (or of the best reached) turns MSAA off first,
    // then steps the rate down. 3 minutes near the rate steps it back up, to
    // the chosen one at most. What was learned is kept per phone, so the next
    // start begins at a rate the phone holds instead of overheating first.
    // Battle and menu are learned apart (the drops are in battle): a battle
    // is an active BoardInputController, checked with each 15 s sample.
    const autoFile = `${persistentPath()}/tesl-reborn-graphics-auto.json`;
    // Steps of 5 FPS (requested after report 90: 60 -> 40 was a 20 FPS jump
    // for a phone that held 50), plus the display rates above 60.
    const ceiling = rate || 60;
    const ladder = [120, 90, 75];
    for (let step = 60; step >= 30; step -= 5) ladder.push(step);
    let auto: any = {};
    try { auto = JSON.parse(readTextFile(autoFile) || "{}") || {}; } catch (_) {}
    // Report 27: learned at full resolution, the battle stayed at 30 after
    // the render scale went to 75%. Another scale starts learning again.
    const renderScale = graphicsRenderScale(readTextFile(file)) || 100;
    if (auto.at && (auto.renderScale || 100) !== renderScale) {
      log(`graphics: render scale ${auto.renderScale || 100}% -> ${renderScale}%, learned frame rates reset`);
      auto = { msaaOff: auto.msaaOff };
    }
    // Report 74: rates learned before patch 131 include our own object scan,
    // which grew through each battle; they are learned again once.
    // 173: learned again once more; caps learned before the safe calls, the
    // frame bus and MSAA off were too low (report 110: 30 on a Pixel 8 Pro).
    const learning = 173;
    if (auto.at && auto.learning !== learning) {
      log(`graphics: learned frame rates from before patch ${learning} reset`);
      auto = { msaaOff: auto.msaaOff, relearn: true };
    }
    // Reports 113-114 (Pixel 8 Pro): battles ran at 27-33 FPS under caps of
    // 30-35 the governor had learned again within minutes. On phones whose
    // fastest clock belongs to one core (Tensor G3) the automatic caps are
    // off for now: the rate stays at the chosen one (60 by default), to see
    // what the phone reaches unthrottled.
    let oneFastest = false;
    try {
      const max = [];
      for (let cpu = 0; cpu < 16; cpu++) {
        try { max.push(Number(String((File as any).readAllText(`/sys/devices/system/cpu/cpu${cpu}/cpufreq/cpuinfo_max_freq`)).trim()) || 0); } catch (_) {}
      }
      const top = Math.max(...max);
      oneFastest = top > 0 && max.filter(f => f === top).length === 1;
    } catch (_) {}
    if (oneFastest) log("graphics: automatic frame rate caps off (one fastest core)");
    // Every start begins at the chosen rate (requested after report 123): a
    // cap learned on a hot phone held a cooled one at 50 for minutes. The
    // governor still steps down within 30 s when the phone cannot keep up.
    const modes = {
      menu: { cap: 0, low: 0, steady: 0, best: 0 },
      battle: { cap: 0, low: 0, steady: 0, best: 0 },
    };
    let msaaOff = auto.msaaOff === true, mode = "menu", boardType = null;
    globalThis.__teslRateCap = modes.menu.cap;
    if (modes.menu.cap || modes.battle.cap || msaaOff) {
      log(`graphics: auto frame rate menu ${modes.menu.cap || ceiling}, battle ${modes.battle.cap || ceiling} of ${ceiling} (learned ${auto.at || "earlier"})${msaaOff ? ", antiAliasing off" : ""}`);
      // A chosen rate is applied at start below; the game's own 60 is not.
      if (!rate && modes.menu.cap) schedule(0, () => applyRate("auto start"), "graphics auto rate");
    }
    const saveAuto = () => {
      try {
        writeTextFile(autoFile, JSON.stringify({ menu: { rate: modes.menu.cap || ceiling }, battle: { rate: modes.battle.cap || ceiling },
          msaaOff, renderScale, learning, at: new Date().toISOString() }));
      } catch (_) {}
    };
    // Report 79: the reset was not saved until a rate changed, so it ran on every start.
    if (auto.relearn) saveAuto();
    function antiAliasingOff() {
      const quality = ucls("UnityEngine.QualitySettings"), samples = Number(quality.method("get_antiAliasing", 0).invoke());
      if (samples <= 0) return 0;
      // Report 19: the managed setter is stripped on some builds; the
      // engine function behind it stays (as for vSync).
      const managed = quality.tryMethod("set_antiAliasing", 1);
      if (managed) managed.invoke(0);
      else if (globalThis.__teslSetAntiAliasing) globalThis.__teslSetAntiAliasing(0);
      else if (!levelAntiAliasingOff(quality)) throw Error("no antiAliasing setter");
      return samples;
    }
    // Report 72: the getter reads the current level's entry, not a field of
    // the manager: levels[current].antiAliasing, i.e.
    //   bl manager; ldrsw x8, [x0, #cur]; ldr x9, [x0, #levels];
    //   mov w10, #stride; madd x8, x8, x10, x9; ldr w0, [x8, #field]
    // The entry is written and the level set again so Unity applies it.
    function levelAntiAliasingOff(quality) {
      let at = null;
      for (const name of antiAliasingNames) { const p = resolve(Memory.allocUtf8String(name)); if (!p.isNull()) { at = p; break; } }
      if (!at) return false;
      const code = [];
      for (let i = 0; i < 16; i++) { const ins: any = Instruction.parse(at); code.push(`${ins.mnemonic} ${ins.opStr}`); if (ins.mnemonic === "ret") break; at = ins.next; }
      const text = code.join("; ");
      const num = (re) => { const m = text.match(re); return m ? Number(m[1]) : null; };
      const owner = (text.match(/bl #(0x[0-9a-f]+)/) || [])[1];
      const current = num(/ldrsw x8, \[x0, #(0x[0-9a-f]+|\d+)\]/), levels = num(/ldr x9, \[x0, #(0x[0-9a-f]+|\d+)\]/);
      const stride = num(/mov w10, #(0x[0-9a-f]+|\d+)/), field = num(/ldr w0, \[x8, #(0x[0-9a-f]+|\d+)\]/);
      if (!owner || [current, levels, stride, field].includes(null)) { log(`engine: antiAliasing layout unknown: ${text}`); return false; }
      const manager = new NativeFunction(ptr(owner), "pointer", [])();
      const index = manager.add(current).readS32(), entry = manager.add(levels).readPointer().add(index * stride + field);
      const before = Number(quality.method("get_antiAliasing", 0).invoke());
      if (entry.readS32() !== before) { log(`engine: antiAliasing entry holds ${entry.readS32()}, getter ${before}; not written`); return false; }
      entry.writeS32(0);
      try { quality.method("SetQualityLevel", 2).invoke(index, true); } catch (error) { log(`engine: quality reapply failed: ${error}`); }
      // A level turns vSync back on, which overrides the frame rate.
      try { if (setVSync) setVSync(0); } catch (_) {}
      const after = Number(quality.method("get_antiAliasing", 0).invoke());
      log(`engine: level ${index} antiAliasing ${before} -> ${after} (entry)`);
      return after === 0;
    }
    // Report (1)(2): CPH2723 held 25 FPS in battle at any quality, cool, with
    // the process allowed cores 0-5 only. The cpu: line is written from
    // another thread; say where the game's own (main) thread runs, each minute.
    let mainCpu = null, mainSamples = 0, mainReported = "", mainWidened = false;
    function mainThreadReport() {
      if (mainSamples++ % 4) return;
      try {
        if (mainCpu === null) mainCpu = new NativeFunction(Process.getModuleByName("libc.so").getExportByName("sched_getcpu"), "int", []);
        let allowed = "?";
        try { allowed = (String((File as any).readAllText("/proc/thread-self/status")).match(/Cpus_allowed_list:\s*(\S+)/) || [])[1] || "?"; } catch (_) {}
        // Report 100 (Pixel 8 Pro): Unity pinned the main thread to its one
        // big core (allowed 8); hot, that core fell to 1.16 GHz and battles to
        // 10-17 FPS with no core to move to. A single allowed core is widened
        // to every core of at least 80% of the fastest one's maximum clock.
        if (/^\d+$/.test(allowed) && !mainWidened) {
          mainWidened = true;
          try {
            const max = [];
            for (let cpu = 0; cpu < 16; cpu++) {
              try { max[cpu] = Number(String((File as any).readAllText(`/sys/devices/system/cpu/cpu${cpu}/cpufreq/cpuinfo_max_freq`)).trim()) || 0; } catch (_) { max[cpu] = 0; }
            }
            const top = Math.max(...max), cores = max.map((f, cpu) => f >= top * 0.8 ? cpu : -1).filter(cpu => cpu >= 0);
            if (cores.length > 1) {
              const mask = Memory.alloc(128);
              for (const cpu of cores) mask.add(cpu >> 3).writeU8(mask.add(cpu >> 3).readU8() | (1 << (cpu & 7)));
              const setAffinity = new NativeFunction(Process.getModuleByName("libc.so").getExportByName("sched_setaffinity"), "int", ["int", "size_t", "pointer"]);
              const result = setAffinity(0, 128, mask);
              log(`graphics: main thread allowed ${allowed} -> ${cores.join(",")} (${result === 0 ? "set" : "refused " + result})`);
              try { allowed = (String((File as any).readAllText("/proc/thread-self/status")).match(/Cpus_allowed_list:\s*(\S+)/) || [])[1] || allowed; } catch (_) {}
            }
          } catch (error) { log(`graphics: main thread affinity unchanged: ${error}`); }
        }
        const line = `main thread on ${mainCpu()}, allowed ${allowed}`;
        if (line !== mainReported || mainSamples % 20 === 1) { mainReported = line; log(`graphics: ${mode}, ${line}`); }
      } catch (error) { if (mainReported !== "failed") { mainReported = "failed"; log(`graphics: main thread cpu unavailable: ${error}`); } }
    }
    function inBattle() {
      // The battle watcher (BoardInputController.Awake .. destroyed) knows
      // without a scan of every object.
      if (typeof globalThis.__teslInBattle === "boolean") return globalThis.__teslInBattle;
      if (boardType === null) boardType = img.classes.find(c => c.name === "BoardInputController")?.type.object || false;
      if (!boardType) return false;
      const found = ucls("UnityEngine.Object").method("FindObjectOfType").overload("System.Type").invoke(boardType);
      return !isNull(found);
    }
    // MSAA off unless chosen (tesl-reborn-graphics.json "msaa": true). The
    // quality levels turn it on and CPH2723 has no antiAliasing setter at all
    // (report 19); each camera's allowMSAA overrides the level. Cameras come
    // and go with scenes, so this runs with every 15 s sample.
    let msaaCameras = null, msaaReported = "";
    function camerasWithoutMsaa() {
      if (allowMsaa) return;
      let state;
      try {
        const camera = ucls("UnityEngine.Camera");
        if (msaaCameras === null) {
          const get = camera.tryMethod("get_allowMSAA", 0), set = camera.tryMethod("set_allowMSAA", 1);
          msaaCameras = get && set ? { get, set, all: camera.method("get_allCameras", 0) } : false;
        }
        if (!msaaCameras) state = "camera allowMSAA unavailable";
        else {
          const cameras = msaaCameras.all.invoke();
          let changed = 0;
          for (let i = 0; i < cameras.length; i++) {
            const item = cameras.get(i);
            if (Boolean(msaaCameras.get.bind(item).invoke())) { msaaCameras.set.bind(item).invoke(false); changed++; }
          }
          state = changed ? `MSAA off on ${changed} of ${cameras.length} cameras` : "";
        }
      } catch (error) { state = `camera MSAA failed: ${error}`; }
      if (state && state !== msaaReported) { msaaReported = state; log(`graphics: ${state}`); }
    }
    // Battle render snapshot (report 22: battle held 27-29 FPS with the CPU
    // at half clock, so the GPU is the limit). Cameras, post-processing models,
    // quality settings, lights and particle counts are logged once a battle,
    // so the costly parts can be optimised from what a phone actually draws.
    function renderSnapshot() {
      const show = value => {
        if (value === undefined) return "?";
        if (typeof value === "number" || typeof value === "boolean") return String(value);
        if (isNull(value)) return "null";
        try { if (value.class?.isEnum) return String(enumVal(value)); } catch (_) {}
        return String(value.content ?? value);
      };
      const read = (target, name) => { try { const m = target.tryMethod(name, 0); return m ? show(m.invoke()) : "-"; } catch (_) { return "!"; } };
      const quality = ucls("UnityEngine.QualitySettings");
      const settings = ["GetQualityLevel", "get_shadows", "get_shadowResolution", "get_shadowDistance", "get_shadowCascades",
        "get_pixelLightCount", "get_antiAliasing", "get_anisotropicFiltering", "get_softParticles", "get_lodBias",
        "get_masterTextureLimit", "get_realtimeReflectionProbes", "get_billboardsFaceCameraPosition"]
        .map(name => `${name.replace(/^get_/, "")}=${read(quality, name)}`).join(" ");
      log(`render: quality ${settings}`);
      const screen = ucls("UnityEngine.Screen");
      log(`render: screen ${read(screen, "get_width")}x${read(screen, "get_height")}`);
      const ppClass = img.classes.find(c => c.name === "PostProcessingBehaviour");
      const models = ["fog", "antialiasing", "ambientOcclusion", "screenSpaceReflection", "depthOfField", "motionBlur",
        "eyeAdaptation", "bloom", "colorGrading", "userLut", "chromaticAberration", "grain", "vignette", "dithering"];
      const cameras = ucls("UnityEngine.Camera").method("get_allCameras", 0).invoke();
      for (let i = 0; i < cameras.length; i++) {
        const camera = cameras.get(i), go = call(camera, "get_gameObject");
        const target = camera.method("get_targetTexture", 0).invoke();
        let line = `render: camera "${call(go, "get_name").content}" depth=${read(camera, "get_depth")} clear=${read(camera, "get_clearFlags")}` +
          ` mask=${read(camera, "get_cullingMask")} path=${read(camera, "get_actualRenderingPath")} hdr=${read(camera, "get_allowHDR")}` +
          ` px=${read(camera, "get_pixelWidth")}x${read(camera, "get_pixelHeight")} target=${isNull(target) ? "screen" : `${read(target, "get_width")}x${read(target, "get_height")}`}`;
        if (ppClass) {
          const behaviour = go.method("GetComponent").overload("System.Type").invoke(ppClass.type.object);
          if (!isNull(behaviour)) {
            const profile = behaviour.field("profile").value;
            const on = isNull(profile) ? [] : models.filter(name => { try { return Boolean(call(profile.field(name).value, "get_enabled")); } catch (_) { return false; } });
            line += ` post=${read(behaviour, "get_enabled")} [${on.join(",")}]`;
          }
        }
        log(line);
      }
      const count = (type, test = null) => {
        try {
          const all = ucls("UnityEngine.Object").method("FindObjectsOfType").overload("System.Type").invoke(ucls(type).type.object);
          if (!test) return all.length;
          let n = 0; for (let i = 0; i < all.length; i++) if (test(all.get(i))) n++; return n;
        } catch (_) { return "?"; }
      };
      log(`render: lights ${count("UnityEngine.Light")} (shadowed ${count("UnityEngine.Light", l => enumVal(call(l, "get_shadows")) !== 0)}),` +
        ` particle systems ${count("UnityEngine.ParticleSystem")}, mesh renderers ${count("UnityEngine.MeshRenderer")},` +
        ` skinned ${count("UnityEngine.SkinnedMeshRenderer")}, projectors ${count("UnityEngine.Projector")}`);
      // Cameras: Camera_Targeting draws layer 18 and Camera_Drag layer 19
      // (set by prefabs, never by name in the code). Active renderers per
      // camera layer, and how many of them were drawn last frame, say
      // whether those two cameras cull and render an empty layer most of the
      // time.
      try {
        const all = ucls("UnityEngine.Object").method("FindObjectsOfType").overload("System.Type").invoke(ucls("UnityEngine.Renderer").type.object);
        const layers = new Map();
        for (let i = 0; i < all.length; i++) {
          const renderer = all.get(i), go = call(renderer, "get_gameObject");
          if (!Boolean(call(renderer, "get_enabled")) || !Boolean(call(go, "get_activeInHierarchy"))) continue;
          const layer = Number(call(go, "get_layer"));
          // Renderer.isVisible is stripped from this build (report after 182).
          layers.set(layer, (layers.get(layer) || 0) + 1);
        }
        const row = Array.from(layers.entries()).sort((a, b) => a[0] - b[0]).map(([layer, n]) => `${layer}:${n}`).join(" ");
        log(`render: active renderers by layer ${row}; Camera_Targeting=18 Camera_Drag=19 Camera_Ortho=16 UI=5`);
      } catch (error) { log(`render: layer count failed: ${error}`); }
      // Report 25: 294 particle systems in a battle. How many run and draw?
      log(`render: particles playing ${count("UnityEngine.ParticleSystem", p => Boolean(call(p, "get_isPlaying")))},` +
        ` alive ${count("UnityEngine.ParticleSystem", p => Number(call(p, "get_particleCount")) > 0)},` +
        ` visible renderers ${count("UnityEngine.ParticleSystemRenderer", r => Boolean(call(r, "get_isVisible")))}`);
    }
    // Live session: in battle UnityMain sat at 93% of a core while the GPU
    // idled at 15-36%, so the frame is bound by game code on the main
    // thread. Once a battle, 10 s in, every game Update/LateUpdate/
    // FixedUpdate and the UI and text rebuilds are timed natively for 45 s;
    // the most expensive are logged and the hooks removed again.
    let profiled = false;
    function profileMainThread() {
      if (profiled) return;
      profiled = true;
      let step = "methods";
      try { profileSteps(name => { step = name; }); }
      catch (error) { log(`profile: failed at ${step}: ${error}`); }
    }
    // Report 28: "TypeError: not a function" without a place; each step is named now.
    function profileSteps(at) {
      const batch = fn => {
        const begin = (Interceptor as any).beginTransaction, end = (Interceptor as any).endTransaction;
        if (typeof begin !== "function" || typeof end !== "function") return fn();
        begin.call(Interceptor);
        try { return fn(); } finally { end.call(Interceptor); }
      };
      const targets = [];
      const seen = new Set();
      const add = (method, label) => {
        if (!method || method.isStatic || method.virtualAddress.isNull()) return;
        const key = method.virtualAddress.toString();
        if (seen.has(key)) return;
        seen.add(key); targets.push({ at: method.virtualAddress, label });
      };
      for (const klass of img.classes) {
        if (klass.name === "ServicesManager") continue; // the frame limiter waits in it
        try {
          for (const method of klass.methods)
            if (method.parameterCount === 0 && ["Update", "LateUpdate", "FixedUpdate"].includes(method.name))
              add(method, `${klass.name}.${method.name}`);
        } catch (_) { /* A class whose methods cannot be listed is left out. */ }
      }
      at("engine methods");
      // Report 29: CardVisualElementData.Update ran 8745 times a second. How
      // often is UI marked dirty (each one costs a native mesh/canvas rebuild)?
      for (const [type, name] of [["UnityEngine.UI.CanvasUpdateRegistry", "PerformUpdate"], ["TMPro.TMP_UpdateManager", "DoRebuilds"],
          ["UnityEngine.Canvas", "SendWillRenderCanvases"], ["UnityEngine.UI.Graphic", "SetVerticesDirty"],
          ["UnityEngine.UI.Graphic", "SetMaterialDirty"], ["UnityEngine.UI.Graphic", "SetLayoutDirty"],
          ["TMPro.TMP_Text", "SetVerticesDirty"], ["TMPro.TextMeshPro", "SetVerticesDirty"], ["TMPro.TextMeshProUGUI", "SetVerticesDirty"],
          ["TMPro.TextMeshPro", "Rebuild"], ["TMPro.TextMeshProUGUI", "Rebuild"], ["UnityEngine.UI.Graphic", "Rebuild"]]) {
        try { const k = ucls(type); add(k.methods.find(m => m.name === name && m.parameterCount <= 1), `${k.name}.${name}`); } catch (_) {}
      }
      at("native timer");
      const count = targets.length;
      const totals = Memory.alloc(count * 8), calls = Memory.alloc(count * 4);
      const cm = new CModule(`
        #include <gum/guminterceptor.h>
        struct ts { long sec; long nsec; };
        extern int clock_gettime(int, struct ts *);
        extern long long totals[];
        extern int calls[];
        static long long now(void) { struct ts t; clock_gettime(1, &t); return t.sec * 1000000000LL + t.nsec; }
        void onEnter(GumInvocationContext *ic) { *GUM_IC_GET_INVOCATION_DATA(ic, long long) = now(); }
        void onLeave(GumInvocationContext *ic) {
          int i = GPOINTER_TO_INT(gum_invocation_context_get_listener_function_data(ic));
          totals[i] += now() - *GUM_IC_GET_INVOCATION_DATA(ic, long long);
          calls[i]++;
        }`, { clock_gettime: Process.getModuleByName("libc.so").getExportByName("clock_gettime"), totals, calls });
      at("attach");
      const listeners = [];
      let attachError = null;
      batch(() => targets.forEach((target, i) => {
        try { listeners.push(Interceptor.attach(target.at, { onEnter: cm.onEnter, onLeave: cm.onLeave } as any, ptr(i))); }
        catch (error) { attachError = attachError || error; }
      }));
      if (!listeners.length) throw Error(`no method could be timed: ${attachError}`);
      const started = Date.now();
      log(`profile: timing ${listeners.length} of ${count} main-thread methods for 45 s`);
      schedule(45000, () => {
        batch(() => { for (const listener of listeners) listener.detach(); });
        const seconds = (Date.now() - started) / 1000;
        const rows = targets.map((target, i) => ({ label: target.label, ms: totals.add(i * 8).readS64().toNumber() / 1e6 / seconds,
          calls: calls.add(i * 4).readS32() / seconds })).filter(row => row.ms > 0.05).sort((a, b) => b.ms - a.ms);
        let sum = 0; for (const row of rows) sum += row.ms;
        log(`profile: ${sum.toFixed(0)} ms/s in timed methods (nested calls counted in each)`);
        for (const row of rows.slice(0, 25)) log(`profile: ${row.ms.toFixed(1)} ms/s ${Math.round(row.calls)}/s ${row.label}`);
        profileKeep = cm;
      }, "main thread profile");
    }
    let profileKeep = null;
    // Report 29: the game's own scripts were ~4% of the main thread; the
    // rest is engine work the scripts ask for. Two cuts that change nothing
    // on screen: physics at 30 steps a second instead of 50 (the battle has
    // no physics play; Card3D.FixedUpdate only tracks a drag speed and
    // GameNetworkManager.FixedUpdate pumps the network), and animators that
    // stop evaluating while none of their renderers is visible.
    const setFixedStep = icall(["UnityEngine.Time::set_fixedDeltaTime(System.Single)", "UnityEngine.Time::set_fixedDeltaTime"], "void", ["float"]);
    const getFixedStep = icall(["UnityEngine.Time::get_fixedDeltaTime()", "UnityEngine.Time::get_fixedDeltaTime"], "float", []);
    const animatorMode = icall(["UnityEngine.Animator::get_cullingMode()", "UnityEngine.Animator::get_cullingMode"], "int", ["pointer"]);
    const setAnimatorMode = icall(["UnityEngine.Animator::set_cullingMode(UnityEngine.AnimatorCullingMode)", "UnityEngine.Animator::set_cullingMode"], "void", ["pointer", "int"]);
    let animatorType = null, engineCutsReported = "";
    // Off on patch 150: with off-screen culling the battle camera rig (no
    // renderers of its own) stopped moving and the Guard wall effects, which
    // animate in from invisible, never appeared. The animatorCulling
    // experiment for skinned characters only (151-192) made animations stutter
    // (report 123) and is gone.
    function engineCuts() {
      const notes = [];
      try {
        if (setFixedStep && getFixedStep) {
          const step = getFixedStep();
          if (step < 1 / 30 - 0.0005) { setFixedStep(1 / 30); notes.push(`physics step ${(step * 1000).toFixed(1)} -> 33.3 ms`); }
        } else {
          const field = getterField(fixedStepNames), step = field ? field.read() : 0;
          if (field && step < 1 / 30 - 0.0005) {
            const now = writeField(fixedStepNames, 1 / 30);
            notes.push(now === false ? "physics step not set" : `physics step ${(step * 1000).toFixed(1)} -> ${(now * 1000).toFixed(1)} ms (field)`);
          }
        }
      } catch (error) { notes.push(`physics step failed: ${error}`); }
      try {
        if (animatorMode && setAnimatorMode) {
          if (!animatorType) animatorType = ucls("UnityEngine.Animator").type.object;
          const all = ucls("UnityEngine.Object").method("FindObjectsOfType").overload("System.Type").invoke(animatorType);
          let changed = 0;
          for (let i = 0; i < all.length; i++) {
            const item = all.get(i);
            // 0 AlwaysAnimate -> 1 CullUpdateTransforms: state machines and
            // events keep running, only off-screen bone/transform writes stop.
            if (animatorMode(item.handle) === 0) { setAnimatorMode(item.handle, 1); changed++; }
          }
          if (changed) notes.push(`${changed} of ${all.length} animators cull off-screen updates`);
        } else notes.push("animator culling stripped");
      } catch (error) { notes.push(`animator culling failed: ${error}`); }
      const line = notes.join(", ");
      if (line && line !== engineCutsReported) { engineCutsReported = line; log(`engine: ${line}`); }
    }
    schedule(5000, engineCuts, "engine cuts");
    // simpleperf with Unity's symbols matched into this libunity: PhysX
    // stepping was 12.5% of the main thread plus most of the 16% spent
    // waiting for jobs, and 20% of the workers. The game drives no bodies
    // (CardMomentum keeps its own velocity) and has no trigger or collision
    // callbacks; it only raycasts, and raycasts need the colliders where the
    // transforms are. Each step only syncs the transforms now. The offsets
    // are for this build of libunity, checked by their first bytes.
    try {
      const unity = Process.getModuleByName("libunity.so");
      const simulate = unity.base.add(0x28a6e0), sync = unity.base.add(0x28b1f4);
      const same = (at, hex) => Array.from(new Uint8Array(at.readByteArray(16))).map(b => b.toString(16).padStart(2, "0")).join("") === hex;
      if (same(simulate, "e923b96dfc6f01a9fa6702a9f85f03a9") && same(sync, "fa67bba9f85f01a9f65702a9f44f03a9")) {
        // Report 77: a JS replacement crashed the menu ("setjmp checksum
        // mismatch") when an exception crossed it, and the menu has real
        // bodies. In battle only, the first instruction becomes a tail
        // branch to SyncTransforms (same first argument); no JS frame.
        const original = simulate.readU32();
        const branch = (0x14000000 | ((sync.sub(simulate).toInt32() >> 2) & 0x3ffffff)) >>> 0;
        let skipping = false;
        globalThis.__teslPhysicsInBattle = (battle) => {
          if (battle === skipping) return;
          Memory.patchCode(simulate, 4, code => { code.writeU32(battle ? branch : original); });
          skipping = battle;
          log(`engine: physics ${battle ? "syncs transforms only (battle)" : "steps normally"}`);
        };
        // The battle is a live BoardInputController: on from its Awake, off
        // as soon as Unity has destroyed it (its native pointer is cleared),
        // checked twice a second so the rewards screen gets real physics.
        // Report 80: a battle hung on patch 136 while taking the opponent's
        // prophecy, the known server stall (the card was in hand after the
        // reconnect; an own prophecy in the same battle went fine). Kept on
        // in the test channel to rule it out.
        // Report 98 (Pixel 8 Pro) and Sergey's report 85: the game aborted
        // about a second after the skip switched on at a battle start. It is
        // an experiment now (tesl-reborn-experiments.json "physicsSkip").
        const physicsSkip = experiment("physicsSkip");
        const board = img.classes.find(c => c.name === "BoardInputController");
        if (board) {
          let live = null, timer = null;
          hookAttach(board.method("Awake", 0).virtualAddress, { onEnter(args) {
            try {
              if (live) live.free();
              live = new Il2Cpp.Object(args[0]).ref(false);
              globalThis.__teslInBattle = true;
              // Reports 83-84: attaching the camera probe (CModule listeners on
              // Camera::CustomCull/CustomRender) froze the main thread both from
              // this hook and 5 s later from the JS thread. It is not started.
              if (physicsSkip) globalThis.__teslPhysicsInBattle(true);
              if (!timer) timer = setInterval(() => {
                let gone = true;
                try { gone = !live || live.target.field("m_CachedPtr").value.isNull(); } catch (_) {}
                if (!gone) return;
                clearInterval(timer); timer = null;
                if (live) { live.free(); live = null; }
                globalThis.__teslInBattle = false;
                if (physicsSkip) globalThis.__teslPhysicsInBattle(false);
              }, 500);
            } catch (error) { log(`engine: battle physics switch failed: ${error}`); }
          } });
        }
      } else log("engine: physics stepping kept (another libunity build)");
    } catch (error) { log(`engine: physics replace failed: ${error}`); }
    // simpleperf on 141: JobQueue::ScheduleGroup -> Semaphore::Signal was
    // 36% of the main thread, nearly all of it in the kernel: every job group
    // wakes min(jobs, workers) sleeping workers, up to seven futex wakes on an
    // eight-core phone, hundreds of groups a frame. At most two are woken
    // now; the awake workers and the main thread (which runs jobs while it
    // waits for a group) take the rest. The count is loaded by
    // "ldr w8, [x20, #0x20]" before "csel w1, w24, w8, lo"; that load becomes
    // "mov w8, #2". Checked by its bytes for this libunity build.
    try {
      const unity = Process.getModuleByName("libunity.so"), at = unity.base.add(0x41f58c);
      const bytes = Array.from(new Uint8Array(at.readByteArray(16))).map(b => b.toString(16).padStart(2, "0")).join("");
      // Report 113 (Pixel 8 Pro, Tensor G3: one prime, four mid, four
      // little cores): the workers ran at 140-190% on mid cores at 0.9 GHz.
      // Phones with a single fastest core keep the engine's own wake count.
      let fastest = 0, cores = 0;
      try {
        const max = [];
        for (let cpu = 0; cpu < 16; cpu++) {
          try { max.push(Number(String((File as any).readAllText(`/sys/devices/system/cpu/cpu${cpu}/cpufreq/cpuinfo_max_freq`)).trim()) || 0); } catch (_) {}
        }
        const top = Math.max(...max); cores = max.filter(f => f > 0).length; fastest = max.filter(f => f === top).length;
      } catch (_) {}
      // Report from the Pixel 8 Pro's simpleperf: with the engine's own wake
      // count Semaphore::Signal was 32% of Unity's main thread (eight
      // workers). The cap applies on every phone again.
      if (bytes === "882240b980c200911f01186b0131981a") {
        Memory.patchCode(at, 4, code => { code.writeU32(0x52800048); });
        log("engine: job groups wake at most 2 workers");
      } else log("engine: job wake count kept (another libunity build)");
    } catch (error) { log(`engine: job wake patch failed: ${error}`); }
    // Five cameras cull the whole scene and render every frame in battle,
    // and their job groups are most of the worker wakes. Per camera: time in
    // Camera::CustomCull and Camera::CustomRender, measured natively, logged
    // every 15 s during the first minute of each battle.
    try {
      const unity = Process.getModuleByName("libunity.so");
      const cull = unity.base.add(0x1fae78), render = unity.base.add(0x1fe9dc);
      const hex = (at) => Array.from(new Uint8Array(at.readByteArray(8))).map(b => b.toString(16).padStart(2, "0")).join("");
      if (hex(cull) === "fc6fbba9f85f01a9" && hex(render) === "e923b96dfc6f01a9") {
        // 8 slots of { ptr camera, u64 cullUs, u64 renderUs, u32 culls, u32 renders }
        const table = Memory.alloc(8 * 32), libc = Process.getModuleByName("libc.so");
        const source = `
#include <gum/guminterceptor.h>
typedef struct { long s; long ns; } ts_t;
typedef struct { void * camera; unsigned long long cull_us; unsigned long long render_us; unsigned culls; unsigned renders; } Slot;
extern Slot table[8];
extern int clock_gettime (int clock, ts_t * t);
static unsigned long long now_us (void) { ts_t t; clock_gettime (1, &t); return (unsigned long long) t.s * 1000000ULL + t.ns / 1000; }
static Slot * slot (void * camera) {
  for (int i = 0; i < 8; i++) { if (table[i].camera == camera) return &table[i]; if (!table[i].camera) { table[i].camera = camera; return &table[i]; } }
  return 0;
}
static void * cull_camera, * render_camera; static unsigned long long cull_start, render_start;
void cull_enter (GumInvocationContext * ic) { cull_camera = gum_invocation_context_get_nth_argument (ic, 0); cull_start = now_us (); }
void cull_leave (GumInvocationContext * ic) { Slot * s = slot (cull_camera); if (s) { s->cull_us += now_us () - cull_start; s->culls++; } }
void render_enter (GumInvocationContext * ic) { render_camera = gum_invocation_context_get_nth_argument (ic, 0); render_start = now_us (); }
void render_leave (GumInvocationContext * ic) { Slot * s = slot (render_camera); if (s) { s->render_us += now_us () - render_start; s->renders++; } }
`;
        const cm = new CModule(source, { table, clock_gettime: libc.getExportByName("clock_gettime") });
        let listeners = [];
        const names = () => {
          const map = new Map();
          try {
            const all = ucls("UnityEngine.Camera").method("get_allCameras", 0).invoke();
            for (let i = 0; i < all.length; i++) { const camera = all.get(i); map.set(camera.field("m_CachedPtr").value.toString(), String(call(call(camera, "get_gameObject"), "get_name")?.content || "?")); }
          } catch (_) {}
          return map;
        };
        let reports = 0, since = 0, timer = null;
        const report = () => {
          const seconds = (Date.now() - since) / 1000, map = names(), rows = [];
          for (let i = 0; i < 8; i++) {
            const at = table.add(i * 32), camera = at.readPointer();
            if (camera.isNull()) continue;
            const cullMs = at.add(8).readU64().toNumber() / 1000 / seconds, renderMs = at.add(16).readU64().toNumber() / 1000 / seconds;
            rows.push(`${map.get(camera.toString()) || camera} cull ${cullMs.toFixed(1)} render ${renderMs.toFixed(1)} ms/s (${Math.round(at.add(24).readU32() / seconds)}/s)`);
          }
          log(`cameras: ${rows.join("; ")}`);
          table.writeByteArray(new Array(8 * 32).fill(0)); since = Date.now();
          if (++reports >= 4) { clearInterval(timer); timer = null; for (const l of listeners) l.detach(); listeners = []; }
        };
        globalThis.__teslCameraProbe = () => {
          if (timer) return;
          reports = 0; table.writeByteArray(new Array(8 * 32).fill(0)); since = Date.now();
          listeners = [
            Interceptor.attach(cull, { onEnter: cm.cull_enter, onLeave: cm.cull_leave } as any),
            Interceptor.attach(render, { onEnter: cm.render_enter, onLeave: cm.render_leave } as any),
          ];
          timer = setInterval(() => { try { report(); } catch (error) { log(`cameras: ${error}`); } }, 15000);
        };
        globalThis.__teslCameraProbeKeep = cm;
      }
    } catch (error) { log(`cameras: probe unavailable: ${error}`); }
    schedule(3000, camerasWithoutMsaa, "graphics camera msaa");
    let resumeQuiet = 0;
    globalThis.__teslGovernor = (measured, loading) => {
      camerasWithoutMsaa();
      try { engineCuts(); } catch (_) {}
      if (loading) return;
      // Report 135: the samples around a pause read 1-4 FPS and dropped the
      // battle rate to 30; a resume is not the phone being slow.
      if (Date.now() < resumeQuiet) { for (const m in modes) modes[m].low = 0; return; }
      mainThreadReport();
      let next = mode;
      try { next = inBattle() ? "battle" : "menu"; } catch (_) {}
      if (next !== mode) {
        // The first sample after a switch still mixes both.
        mode = next; const state = modes[mode];
        state.low = 0; state.steady = 0;
        globalThis.__teslRateCap = state.cap;
        log(`graphics: ${mode}, frame rate ${state.cap || ceiling}`);
        if (mode === "battle" && verboseLogs) for (const at of [8000, 60000, 120000]) schedule(at, () => { try { if (inBattle()) renderSnapshot(); } catch (error) { log(`render: snapshot failed: ${error}`); } }, "graphics render snapshot");
        // Reports 85 and 101: games crashed 3-30 s after this attached its 175
        // listeners at a battle start, as attaching the camera probe froze one.
        // Its numbers are in; it runs only as an experiment now.
        if (mode === "battle" && experiment("mainThreadProfile")) schedule(10000, () => { try { profileMainThread(); } catch (error) { log(`profile: failed: ${error}`); } }, "main thread profile start");
        applyRate(state.cap ? `${mode} rate` : "cap lifted");
        return;
      }
      const state = modes[mode];
      // Report 25: something reset vSync again (97 FPS at a 60 cap); put the rate back.
      if (measured > (currentRate() || 60) * 1.2) { applyRate("drift"); return; }
      if (oneFastest) return;
      // A quality change turns MSAA back on; a phone that needed it off keeps it off.
      if (msaaOff) {
        try { const samples = antiAliasingOff(); if (samples) log(`graphics: antiAliasing ${samples}x -> off (remembered)`); } catch (_) {}
      }
      const effective = currentRate() || 60;
      state.best = Math.max(state.best, Math.min(measured, effective));
      const reference = Math.min(effective, state.best);
      if (measured < reference * 0.75) { state.low++; state.steady = 0; }
      // Report 27: 24-28 at a cap of 30 reset the count on every dip and the
      // rate never went back up; a dip now only takes two samples off.
      else { state.low = 0; state.steady = measured >= effective * 0.8 ? state.steady + 1 : Math.max(0, state.steady - 2); }
      if (state.low >= 2) {
        state.low = 0;
        if (!msaaOff) {
          try {
            const samples = antiAliasingOff();
            msaaOff = true; saveAuto();
            if (samples) { log(`graphics: antiAliasing ${samples}x -> off (${mode} fps ${measured} of ${reference} for 30 s)`); return; }
          } catch (error) { log(`graphics: antiAliasing drop failed: ${error}`); }
        }
        // A cap above the measured rate changes nothing: CPH2723 went
        // 120 -> 90 -> 60 -> 40 -> 30 at a steady 25. Go straight to the
        // highest step near what the phone actually reaches.
        // The step nearest below what the phone reaches (a cap above it changes
        // nothing), at least one step down.
        const lower = ladder.find(step => step < effective && step <= Math.max(30, measured + 2));
        if (!lower) return;
        state.cap = globalThis.__teslRateCap = lower; saveAuto();
        log(`graphics: auto ${mode} frame rate ${effective} -> ${lower} (fps ${measured} of ${reference} for 30 s)`);
        applyRate("auto down");
      } else if (state.steady >= 8 && state.cap) {
        state.steady = 0;
        const higher = ladder.filter(step => step > effective && step <= ceiling).pop();
        if (!higher) return;
        state.cap = globalThis.__teslRateCap = higher >= ceiling ? 0 : higher; saveAuto();
        log(`graphics: auto ${mode} frame rate ${effective} -> ${higher} (held ${measured} for 2 min)`);
        applyRate(state.cap ? "auto up" : "cap lifted");
      }
    };
    globalThis.__teslApplyRate = applyRate;
    (globalThis.__teslOnResume ??= []).push(() => { resumeQuiet = Date.now() + 35000; applyRate("resumed"); });
    const application = ucls("UnityEngine.Application"), quality = ucls("UnityEngine.QualitySettings");
    const setRate = application.method("set_targetFrameRate", 1);
    // Report 133: without a chosen rate the game's own setter was left
    // alone, and a battle intro ran at 110-120 FPS on a 120 Hz screen with
    // the limit at 60. The game may ask for less, never for more (or -1).
    const engineAt = resolve(Memory.allocUtf8String("UnityEngine.Application::set_targetFrameRate(System.Int32)"));
    const gameRates = new Set<number>();
    if (!engineAt.isNull()) hookAttach(engineAt, { onEnter(args) {
      const asked = args[0].toInt32(), limit = currentRate() || ceiling;
      // Report 14: with a chosen rate it is always used, so the heat cap holds.
      const next = rate ? currentRate() : asked > 0 && asked < limit ? asked : limit;
      if (asked !== next && !gameRates.has(asked)) { gameRates.add(asked); log(`graphics: game asked for frame rate ${asked}, kept ${next}`); }
      args[0] = ptr(next);
    } });
    if (rate) {
      schedule(0, () => applyRate("start"), "graphics frame rate");
      log(`graphics: engine frame rate setter ${engineSetRate ? "found" : "missing"}, vSync setter ${setVSync ? "found" : "missing"}`);
      // Report 41: with the target at 30 and vSync off the game still went
      // back to 55-58 FPS within half a minute. Below the display rate the
      // hook now paces frames itself: the main thread waits out the rest of
      // each frame before the game's update runs.
    }
    // The limiter is always installed: the heat cap (report 14) needs it as
    // well, and Unity alone does not hold a rate below the display's.
    {
      // Report 27: after a new surface Unity ignored the menu's 60 on a
      // 120 Hz screen (96-111 FPS), so 60 is paced here as well. The wait
      // runs in the frame bus; the rate is handed to it four times a second.
      const pace = () => { const limit = currentRate() || 60; frameBus.setFrameUs(limit >= 120 ? 0 : 1e6 / limit); };
      pace(); setInterval(pace, 250);
      if (rate && rate < 60) log(`graphics: frame limiter at ${rate} FPS`);
    }
    // Quality: SettingsWin.UpdateUi hides resolution and windowed mode on
    // mobile but only fills the quality dropdown. Show it if the mobile
    // window has one and keeps it hidden; say what was found either way.
    // Report 38: on phones SettingsManager.SetQuality only logs, and the
    // quality comes from ScalabilityUtils' pick for the device. The choice is
    // saved, given as that pick, and applied at once; a quality level also
    // turns vSync back on, so the frame rate is applied again after it.
    const manager = cls(img, "SettingsManager");
    const recommended = cls(img, "ScalabilityUtils").tryMethod("GetRecommendedVideoQualitySettings", 0);
    if (recommended) hookAttach(recommended.virtualAddress, {
      onLeave(result) { if (chosenQuality !== null) result.replace(ptr(chosenQuality)); }
    });
    const updateQuality = manager.tryMethod("UpdateUnityQuality", 1);
    if (updateQuality) hookAttach(updateQuality.virtualAddress, {
      onLeave() { schedule(0, () => applyRate("after quality"), "graphics rate after quality"); }
    });
    const setQuality = manager.tryMethod("SetQuality", 1);
    if (setQuality) hookAttach(setQuality.virtualAddress, {
      onEnter(args) {
        const self = new Il2Cpp.Object(args[0]).ref(false); let value = args[1].toInt32();
        schedule(0, () => {
          try {
            // The choice is not kept (setting removed after report 90): the
            // highest level is applied whatever was picked.
            chosenQuality = 3; value = 3;
            let saved = {};
            try { saved = JSON.parse(readTextFile(file) || "{}") || {}; } catch (_) {}
            if (chosenQuality === null) delete saved.quality; else saved.quality = chosenQuality;
            writeTextFile(file, JSON.stringify(saved));
            self.target.method("UpdateUnityQuality", 1).invoke(value);
          } catch (error) { log(`graphics: quality apply failed: ${error}`); }
          finally { self.free(); }
        }, "graphics quality choice");
      }
    });
    const updateUi = cls(img, "SettingsWin").tryMethod("UpdateUi", 0);
    if (!updateUi || updateUi.virtualAddress.isNull()) return;
    let reported = "";
    // The game asks to keep the display settings after a quality change; say
    // what Unity applied so a test can compare levels.
    const onTab = cls(img, "SettingsWin").tryMethod("HandleOnTabSelected", 1);
    if (onTab && !onTab.virtualAddress.isNull()) hookAttach(onTab.virtualAddress, {
      onEnter(args) {
        if (args[1].toInt32() !== 0) return;
        // Stay on the tab that was showing (Audio when none was).
        let current = 1;
        try { current = enumVal(new Il2Cpp.Object(args[0]).field("_activeTabIndex").value) || 1; } catch (_) {}
        args[1] = ptr(current);
        schedule(0, () => { try { ucls("UnityEngine.Application").method("OpenURL", 1).invoke(Il2Cpp.string("teslreborn://resources")); } catch (error) { log(`settings data: open failed: ${error}`); } }, "game data tab");
      }
    });
    const onQuality = cls(img, "SettingsWin").tryMethod("HandleQualityOnValueChanged", 1);
    if (onQuality && !onQuality.virtualAddress.isNull()) hookAttach(onQuality.virtualAddress, {
      onLeave() {
        schedule(0, () => {
          const read = (name) => { try { return String(quality.method(name, 0).invoke()); } catch (_) { return "?"; } };
          log(`graphics: quality level ${read("GetQualityLevel")}, antiAliasing ${read("get_antiAliasing")}, textureLimit ${read("get_masterTextureLimit")}`);
        }, "graphics quality applied");
      }
    });
    hookAttach(updateUi.virtualAddress, {
      onEnter(args) { this.self = args[0]; },
      onLeave() {
        const window = new Il2Cpp.Object(this.self).ref(false);
        schedule(0, () => {
          try {
            const dropdown = window.target.field("_qualityDropdown").value;
            let state, tabs = "";
            if (!unityAlive(dropdown)) state = "no quality dropdown in this window";
            else {
              try { tabs = videoTabAsGameData(window.target) ? "video tab is Game data" : "no video tab"; }
              catch (error) { tabs = `video tab: ${error}`; }
              state = `quality dropdown hidden, ${tabs}`;
            }
            if (state !== reported) { reported = state; log(`graphics: ${state}`); }
            // Reports 94-96: after a battle the menu's Settings had no Game data
            // tab and nothing above noticed. Each open says what is there.
            try {
              const root = call(window.target, "get_transform"), button = findGameDataButton(root);
              const name = node => String(call(node, "get_name")?.content || "?");
              // On phones the Video tab is Game data; no separate button is added.
              let where = tabs === "video tab is Game data" ? "in the Video tab" : "none";
              if (!isNull(button)) {
                const go = call(button, "get_gameObject"), parent = call(button, "get_parent");
                const p = call(button, "get_position"), sd = call(button, "get_sizeDelta");
                where = `parent ${isNull(parent) ? "-" : name(parent)}, active ${call(go, "get_activeSelf")}/${call(go, "get_activeInHierarchy")}, at ${Number(p.field("x").value).toFixed(2)},${Number(p.field("y").value).toFixed(2)}, size ${Number(sd.field("x").value).toFixed(0)}x${Number(sd.field("y").value).toFixed(0)}`;
              }
              log(`settings data: window ${call(window.target, "GetInstanceID")} (${name(root)}), Game data ${where}`);
            } catch (error) { log(`settings data: check failed: ${error}`); }
          } catch (error) { log(`graphics: quality check failed: ${error}`); }
          finally { window.free(); }
        }, "graphics quality");
      }
    });
  });
  // END android-ui: graphics

