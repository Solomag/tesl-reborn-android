  // BEGIN android-ui: settings-diagnostics
  section("settings and language diagnostics", () => {
    let lastPoll = 0, lastRequest = "";
    function collect(request) {
      const report: any = { schema: 1, label: request.label, requestId: request.id,
        at: new Date().toISOString(), buttons: [], classes: [], localizationFiles: [] };
      try {
        const choice = JSON.parse(readTextFile(`${persistentPath()}/tesl-reborn-language.json`) || "null");
        report.choice = choice && { language: choice.language, system: choice.system, overlay: choice.overlay };
      } catch (_) {}
      try {
        const status = JSON.parse(readTextFile(`${persistentPath()}/tesl-reborn-update-status.json`) || "null");
        report.core = status?.current && { revision: status.current.revision, version: status.current.version };
      } catch (_) {}
      try {
        const owner = cls(img, "LocalizationManager");
        const nativeType=owner.method("SetLanguage",2).parameters[0].type;
        report.languageType={name:nativeType.name,isEnum:nativeType.class.isEnum,fields:nativeType.class.fields.map(f=>({name:f.name,type:f.type.name,static:f.isStatic,value:nativeType.class.isEnum&&f.isStatic?enumVal(f.value):undefined}))};
        report.localizationMethods = owner.methods.filter(m => /language|locale|updateobjects/i.test(m.name))
          .slice(0,40).map(m => ({ name:m.name, parameters:m.parameters.map(p => p.type.name), returns:m.returnType.name }));
        const manager = owner.method("get_Instance",0).invoke();
        if (!isNull(manager)) report.managerLanguage = String(call(manager,"get_CurrentLanguageCode")?.content || "");
      } catch (error) { report.managerError = String(error).slice(0,300); }
      for (const code of ["en_us", "ru_ru"]) {
        try {
          const text = readTextFile(`${persistentPath()}/tesl-localization-${code}.json`);
          const values = Object.values(JSON.parse(text || "{}"));
          report.localizationFiles.push({ language:code, entries:values.length,
            cyrillicValues:values.filter(value => /[а-яё]/i.test(String(value))).length });
        } catch (_) { report.localizationFiles.push({language:code,error:"unreadable"}); }
      }
      for (const owner of img.classes.filter(c => /settings|options|language/i.test(c.name)).slice(0,80)) {
        report.classes.push({ name:owner.name, methods:owner.methods.filter(m => /language|locale|select|click|show|settings/i.test(m.name))
          .slice(0,40).map(m => ({ name:m.name, parameters:m.parameters.map(p => p.type.name), returns:m.returnType.name })) });
      }
      try {
        const buttons = ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type")
          .invoke(ucls("UnityEngine.UI.Button").type.object);
        for (let i=0; i<buttons.length && report.buttons.length<160; i++) {
          const button = buttons.get(i), go = call(button,"get_gameObject");
          if (!Boolean(call(go,"get_activeInHierarchy"))) continue;
          let node = call(button,"get_transform"); const path = [];
          for (let depth=0; depth<14 && !isNull(node); depth++,node=call(node,"get_parent"))
            path.unshift(String(call(node,"get_name")?.content || "").slice(0,120));
          const entry: any = { path:path.join("/"), callbacks:[] };
          try {
            const event=call(button,"get_onClick"), count=Number(call(event,"GetPersistentEventCount"));
            for (let j=0;j<Math.min(count,12);j++) {
              const target=call(event,"GetPersistentTarget",j);
              entry.callbacks.push({method:String(call(event,"GetPersistentMethodName",j)?.content||""),class:isNull(target)?null:target.class.name});
            }
          } catch (_) {}
          report.buttons.push(entry);
        }
      } catch (error) { report.uiError = String(error).slice(0,300); }
      writeTextFile(`${persistentPath()}/tesl-reborn-settings-report-${request.label}.json`, JSON.stringify(report,null,2));
    }
    hookAttach(cls(img,"SparkleServices.ServicesManager").method("Update",0).virtualAddress, {onLeave() {
      if (Date.now()-lastPoll<1000) return; lastPoll=Date.now();
      try {
        const request=JSON.parse(readTextFile(`${persistentPath()}/tesl-reborn-inspect-request.json`)||"null");
        if (!request || typeof request.id!=="string" || request.id.length>80 || request.id===lastRequest ||
            !/^(gear|settings|english|russian)$/.test(request.label)) return;
        lastRequest=request.id;
        schedule(0,()=>{try{collect(request);}catch(error){log(`settings diagnostic failed: ${error}`);}});
      } catch (_) {}
    }});
  });
  // END android-ui: settings-diagnostics

  // Sound settings came back to the defaults on every start: the sliders
  // and toggles change SettingsManager in memory only, and SaveSettings runs
  // from the desktop window's apply step, which the mobile window lacks. A
  // second after the last change the settings are saved and flushed.
  section("sound settings saved", () => {
    const manager = cls(img, "SettingsManager"), prefs = ucls("UnityEngine.PlayerPrefs");
    let pending = 0;
    // The mobile window (SettingsWin) calls its own Handle...OnValueChanged
    // listeners; the SettingsManager setters they call are inlined there, so
    // hooks on the setters never ran (mute music was lost on a restart). The
    // listeners are invoked through delegates and are hooked as well.
    const saveSoon = (name) => {
      const ticket = ++pending;
      schedule(1000, () => {
        if (ticket !== pending) return;
        try {
          const live = manager.method("get_Instance", 0).invoke() as Il2Cpp.Object;
          if (!live || live.isNull()) return;
          live.method("SaveSettings").invoke(); prefs.method("Save").invoke();
          log(`sound settings: saved after ${name}`);
        } catch (error) { log(`sound settings: save failed: ${error}`); }
      }, "sound settings save");
    };
    const window = cls(img, "SettingsWin");
    for (const name of ["HandleMasterVolumeOnValueChanged", "HandleMuteMasterVolumeOnValueChanged", "HandleMusicOnValueChanged",
      "HandleMuteMusicOnValueChanged", "HandlePlaySoundOnValueChanged", "HandleAutoMuteOpponentEmotesOnValueChanged", "HandleShowSubtitlesOnValueChanged"]) {
      const method = window.tryMethod(name, 1);
      if (!method || method.virtualAddress.isNull()) { log(`sound settings: ${name} not found`); continue; }
      hookAttach(method.virtualAddress, { onEnter() { saveSoon(name); } });
    }
    for (const name of ["SetMasterVolume", "SetIsMasterVolumeMuted", "SetMusicVolume", "SetIsMusicMuted", "SetIsPlaySoundInBackground", "SetAutoMuteOpponentEmotes", "SetShowSubtitles"]) {
      const method = manager.tryMethod(name, 1);
      if (!method) { log(`sound settings: ${name} not found`); continue; }
      hookAttach(method.virtualAddress, {
        onEnter(args) {
          const self = new Il2Cpp.Object(args[0]).ref(false), ticket = ++pending;
          schedule(1000, () => {
            if (ticket !== pending) return;
            try {
              const live = self.target; if (!live || live.isNull()) return;
              live.method("SaveSettings").invoke(); prefs.method("Save").invoke();
              log(`sound settings: saved after ${name}`);
            } catch (error) { log(`sound settings: save failed: ${error}`); }
          }, "sound settings save");
        }
      });
    }
  });

