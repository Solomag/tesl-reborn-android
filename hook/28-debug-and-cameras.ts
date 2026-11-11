  // BEGIN android-ui: confirmed-debug-marker
  section("hide confirmed debug test marker", () => {
    const path=`${persistentPath()}/tesl-reborn-debug-marker.json`;
    const latch=`${persistentPath()}/tesl-reborn-debug-marker-confirmed32.json`;
    let applied=false;try{applied=JSON.parse(readTextFile(latch)||"{}").applied===true;}catch(_){}
    if(applied) return;
    let config:any={};try{config=JSON.parse(readTextFile(path)||"{}");}catch(_){}
    if(writeTextFile(path,JSON.stringify({...config,enabled:false}))) writeTextFile(latch,JSON.stringify({applied:true}));
  });
  // END android-ui: confirmed-debug-marker
  // BEGIN android-ui: global-shortcuts
  section("mobile global debug shortcut", () => {
    try {
      const setup = JSON.parse(readTextFile(`${persistentPath()}/tesl-reborn-setup.json`) || "null");
      if (setup?.debugInput === "android-key-events") { log("mobile debug: Android keyboard gesture backend"); return; }
    } catch (_) {}
    let taps = [], startFrame = -1, keyDownFrame = -1, lastFrame = -1, began = null, lastError = "";
    const input = ucls("UnityEngine.Input"), time = ucls("UnityEngine.Time");
    const frame = () => Number(time.method("get_frameCount", 0).invoke());
    function diagnostic(status, detail = "") {
      log(`mobile debug: ${status}${detail ? ": " + detail : ""}`);
      try { writeTextFile(`${persistentPath()}/tesl-reborn-debug-status.json`, JSON.stringify({ status, detail, at: new Date().toISOString() })); } catch (_) {}
    }
    const attached = new Set();
    function attachKey(address, name, stringKey = false) {
      if (!address || address.isNull?.() || attached.has(address.toString())) return;
      try { hookAttach(address, {
        onEnter(args) { this.key = stringKey ? rawStr(args[0]).toLowerCase() : args[0]?.toInt32(); },
        onLeave(result) {
          if (startFrame < 0) return;
          const current = frame();
          if (current > startFrame + 5) { startFrame = -1; return; }
          if (current < startFrame ||
              keyDownFrame >= 0 && current !== keyDownFrame) return;
          const any = /anyKey/.test(name), down = /Down/.test(name);
          const d = stringKey ? this.key === "d" : this.key === 100;
          const ctrl = stringKey ? ["left ctrl", "right ctrl", "left control", "right control"].includes(this.key) : [305, 306].includes(this.key);
          if (!any && !d && !ctrl) return;
          // Latch on the first actual D query, regardless of script execution
          // order. anyKey guards and both public overloads receive the chord.
          if (d && down && keyDownFrame < 0) {
            keyDownFrame = current;
            diagnostic("ctrl-d-forwarded", name);
          }
          if (any || d || ctrl && !down) result.replace(ptr(1));
        }
      }); attached.add(address.toString()); }
      catch (error) { log(`mobile debug: cannot hook ${name}: ${error}`); }
    }
    for (const method of input.methods.filter(m => /^(GetKey(?:Down)?(?:Int|String)?|get_anyKey(?:Down)?)$/.test(m.name))) {
      const stringKey = method.parameters[0]?.type.name === "System.String";
      try { attachKey(method.virtualAddress, method.name, stringKey); }
      catch (error) { log(`mobile debug: input method unavailable ${method.name}: ${error}`); }
    }
    // IL2CPP can inline the public wrappers. Hook the resolved Unity input
    // functions as well, so native game callers reach the same event.
    try {
      const resolve = new NativeFunction(Il2Cpp.module.getExportByName("il2cpp_resolve_icall"), "pointer", ["pointer"]);
      for (const name of ["GetKeyInt", "GetKeyDownInt", "GetKeyString", "GetKeyDownString", "get_anyKey", "get_anyKeyDown"]) {
        const signature = name.endsWith("Int") ? "UnityEngine.KeyCode" : name.endsWith("String") ? "System.String" : "";
        for (const suffix of ["", `(${signature})`]) {
          const address = resolve(Memory.allocUtf8String(`UnityEngine.Input::${name}${suffix}`));
          attachKey(address, name, name.endsWith("String"));
        }
      }
    } catch (error) { log(`mobile debug: native input resolution unavailable: ${error}`); }
    const update = cls(img, "SparkleServices.ServicesManager").method("Update", 0);
    hookAttach(update.virtualAddress, {
      // Called by the frame bus only while the screen is touched (and the frame after).
      touchOnly: true,
      onEnter() {
        try {
          const current = frame(); if (current === lastFrame) return; lastFrame = current;
          const count = Number(input.method("get_touchCount", 0).invoke());
          if (count !== 1) { began = null; if (count > 1) taps = []; return; }
          const touch = input.method("GetTouch", 1).invoke(0), phase = enumVal(touch.method("get_phase", 0).invoke());
          const point = uiXY(touch.method("get_position", 0).invoke()), screen = chatScreen();
          const size = Math.max(64, Math.min(160, Math.min(screen.width, screen.height) * .10));
          const inside = point.x >= 0 && point.x <= size && point.y >= screen.height - size && point.y <= screen.height;
          if (phase === 0) { began = inside ? { x: point.x, y: point.y, at: Date.now() } : null; return; }
          if (phase === 4) { began = null; taps = []; return; }
          if (phase !== 3) return;
          const now = Date.now();
          if (!inside || !began || now - began.at > 400 || Math.hypot(point.x-began.x, point.y-began.y) > size * .35) {
            began = null; taps = []; return;
          }
          began = null; taps = taps.filter(at => now-at < 1100); taps.push(now);
          if (taps.length >= 3) {
            taps = []; startFrame = current + 1; keyDownFrame = -1;
            diagnostic("gesture-detected");
          }
        } catch (error) {
          const message = String(error);
          if (message !== lastError) { lastError = message; diagnostic("input-error", message); }
        }
      }
    });
    diagnostic("ready", `${attached.size} input hooks; original Ctrl+D permissions preserved`);
  });
  // END android-ui: global-shortcuts

  // Battle camera layers, for the reports. Switching Camera_Drag and
  // Camera_Targeting off outside drags and aiming (cameraSkip, 181-189) saved
  // little and cost the targeting arrows and a flicker of the mulligan cards
  // (report 122); both cameras stay as the game leaves them.
  section("battle cameras", () => {
    const toLayer = (name) => { try { return Number(ucls("UnityEngine.LayerMask").method("NameToLayer", 1).invoke(Il2Cpp.string(name))); } catch (_) { return -1; } };
    schedule(3000, () => {
      let name18 = "?";
      try { name18 = String(ucls("UnityEngine.LayerMask").method("LayerToName", 1).invoke(18)?.content ?? "?"); } catch (_) {}
      log(`cameras: layers MatchDragging=${toLayer("MatchDragging")} RuneWaveInput=${toLayer("RuneWaveInput")} Orthographic=${toLayer("Orthographic")} 3DUI=${toLayer("3DUI")} UI=${toLayer("UI")}; layer 18 (Camera_Targeting) is "${name18}"`);
    }, "camera layer names");
  });

  // The game's debug window (DebugRuntime, opened by the corner gesture) is
  // IMGUI: Unity hands a touch on it to the uGUI below as well, so buttons
  // under the window fired (report after 178). While its main window is open
  // the game's EventSystem is switched off, and back on when it closes.
  section("debug window blocks the UI below", () => {
    const owner = img.classes.find(c => c.name === "DebugRuntime");
    if (!owner) throw Error("DebugRuntime not found");
    let runtime = null, searched = false, blocked = null;
    const services = cls(img, "SparkleServices.ServicesManager");
    for (const method of owner.methods.filter(m => ["Awake", "Start"].includes(m.name) && !m.isStatic && !m.virtualAddress.isNull())) {
      hookAttach(method.virtualAddress, { onEnter(args) { this.self = args[0]; }, onLeave() {
        try { if (runtime) runtime.free(); runtime = new Il2Cpp.Object(this.self).ref(false); } catch (_) {}
      } });
    }
    const eventSystem = () => ucls("UnityEngine.EventSystems.EventSystem").method("get_current").invoke();
    const release = () => {
      if (!blocked) return;
      try { if (unityAlive(blocked.target)) call(blocked.target, "set_enabled", true); } catch (_) {}
      blocked.free(); blocked = null;
      log("debug window: game UI input back on");
    };
    hookAttach(cls(img, "SparkleServices.ServicesManager").method("Update", 0).virtualAddress, { onLeave() {
      try {
        if (!runtime && !searched) {
          searched = true;
          const found = ucls("UnityEngine.Object").method("FindObjectOfType").overload("System.Type").invoke(owner.type.object);
          if (!isNull(found)) runtime = found.ref(false);
        }
        let open = false;
        if (runtime && unityAlive(runtime.target)) {
          const behaviour = runtime.target;
          open = Boolean(call(behaviour, "get_isActiveAndEnabled")) && Boolean(behaviour.field("_displayState").value.field("mainWindow").value);
          // Hidden by the game's own toggle: nothing is drawn, nothing to block.
          if (open) try { if (Boolean(call(services.method("get_Instance").invoke(), "get_HideDebugUi"))) open = false; } catch (_) {}
        }
        if (open && !blocked) {
          const current = eventSystem();
          if (unityAlive(current) && Boolean(call(current, "get_enabled"))) {
            call(current, "set_enabled", false); blocked = current.ref(false);
            log("debug window: game UI input off while it is open");
          }
        } else if (!open) release();
      } catch (_) { release(); }
    } });
  });
// END android-ui: chat-window


