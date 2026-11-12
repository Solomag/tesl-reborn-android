  // BEGIN android-ui: update-notices
  // The APK level these patches expect (ApkLevel.LEVEL in the setup code).
  const APK_LEVEL = 2;
  // What players see as the version: the APK level, then the patch
  // (v2.287). Internally the updater compares only the revision.
  const patchVersion = (revision: number) => `v${APK_LEVEL}.${revision}`;
  // What this patch brings, one line per language, shown with "update
  // applied". Rewrite it with every patch (CHANGELOG.md has the full list).
  const PATCH_NOTES = {
    en: "New: chat emojis arrive by themselves when the APK lacks them; future Reborn emoji updates need no new APK.",
    ru: "Новое: эмодзи в чате скачиваются сами, если их нет в APK; новые эмодзи Reborn больше не потребуют нового APK.",
    de: "Neu: Chat-Emojis werden selbst geladen, wenn sie in der APK fehlen; neue Reborn-Emojis brauchen keine neue APK mehr.",
    es: "Novedades: los emojis del chat se descargan solos si faltan en el APK; los nuevos emojis de Reborn ya no necesitarán un APK nuevo.",
    fr: "Nouveau : les emojis du chat se téléchargent seuls s’ils manquent dans l’APK ; les nouveaux emojis Reborn ne demanderont plus de nouvel APK.",
    it: "Novità: le emoji della chat si scaricano da sole se mancano nell’APK; le nuove emoji di Reborn non richiederanno un nuovo APK.",
    pl: "Nowe: emoji czatu pobierają się same, jeśli brakuje ich w APK; nowe emoji Reborn nie będą wymagać nowego APK.",
    pt: "Novo: os emojis do chat são baixados sozinhos se faltarem no APK; novos emojis do Reborn não vão exigir um APK novo.",
    tr: "Yeni: APK’da yoksa sohbet emojileri kendiliğinden indirilir; yeni Reborn emojileri artık yeni APK gerektirmez.",
    zh: "新内容：APK 中缺少聊天表情时会自动下载；以后 Reborn 的新表情无需新的 APK。"
  };
  function createUpdateNotices(updater, io) {
    let downloadStarted = false, lastStatus = "";
    const saved = io.readNotice() || {}, current = updater.current();
    const previous = io.readStatus()?.previous;
    // OTA 36 recorded an attempted notification before its UI was drawn.
    // Only the new acknowledgement field proves it was actually displayed.
    const priorRevision = Number(saved.shownRevision || previous?.revision || 0);
    if (Number.isSafeInteger(current?.revision) && current.revision > priorRevision) {
      if (priorRevision > 0) io.emit("applied", current.revision, () => io.writeNotice({ shownRevision: current.revision }));
      else io.writeNotice({ shownRevision: current.revision });
    }
    function poll() {
      const status = updater.status();
      if (status === lastStatus) return;
      lastStatus = status;
      if (status === "restart-required") {
        downloadStarted = false;
        io.emit("restart", 0);
      } else if (status === "update-error" && downloadStarted) {
        downloadStarted = false;
        io.emit("error", 0);
      }
    }
    return {
      poll,
      check(get) {
        let requests = 0;
        try {
          updater.check((url, callback) => {
            // The stable API 1 loader fetches the manifest first, then the
            // validated payload. This also works in already installed APKs.
            if (++requests === 2) {
              downloadStarted = true;
              io.emit("downloading", 0);
            }
            get(url, (status, body) => { callback(status, body); poll(); });
          });
        } finally { poll(); }
      }
    };
  }

  function updateNoticeText(kind, revision, language) {
    const messages = {
      en: {
        restartTitle: 'Reborn update downloaded',
        restartBody: 'The update is verified. Restart the game now to apply it?',
        restartNow: 'Restart',
        restartLater: 'Later',
        restartAsk: 'A Reborn update is downloaded and verified. Restart the game now to apply it?',
        apk: 'A new TESL Reborn APK is available. Build “APK only” in the Builder and install it over this one; your game data stays.',
        downloading: "Downloading a Reborn update. You can keep playing.",
        restart: "Reborn update downloaded and verified. Restart the game when convenient to apply it.",
        applied: `Reborn update ${patchVersion(revision)} applied.`,
        error: "Reborn update could not be downloaded or verified. You can keep playing; it will retry on the next launch."
      },
      ru: {
        restartTitle: 'Обновление Reborn скачано',
        restartBody: 'Обновление проверено. Перезапустить игру сейчас, чтобы применить его?',
        restartNow: 'Перезапустить',
        restartLater: 'Позже',
        restartAsk: 'Обновление Reborn скачано и проверено. Перезапустить игру сейчас, чтобы применить его?',
        apk: 'Вышел новый APK TESL Reborn. Соберите в Builder «Только APK» и установите поверх этого; игровые данные сохранятся.',
        downloading: "Скачивается обновление Reborn. Можно продолжать играть.",
        restart: "Обновление Reborn скачано и проверено. Перезапустите игру, когда будет удобно, чтобы применить его.",
        applied: `Обновление Reborn ${patchVersion(revision)} применено.`,
        error: "Не удалось скачать или проверить обновление Reborn. Можно играть дальше; повторим при следующем запуске."
      },
      de: {
        restartTitle: 'Reborn-Update heruntergeladen',
        restartBody: 'Das Update ist geprüft. Spiel jetzt neu starten, um es anzuwenden?',
        restartNow: 'Neu starten',
        restartLater: 'Später',
        restartAsk: 'Ein Reborn-Update ist heruntergeladen und geprüft. Spiel jetzt neu starten, um es anzuwenden?',
        apk: 'Eine neue TESL-Reborn-APK ist verfügbar. Erstelle im Builder „Nur APK“ und installiere sie über diese; deine Spieldaten bleiben.',
        downloading: "Ein Reborn-Update wird heruntergeladen. Du kannst weiterspielen.",
        restart: "Reborn-Update heruntergeladen und geprüft. Starte das Spiel neu, wenn es dir passt, um es anzuwenden.",
        applied: `Reborn-Update ${patchVersion(revision)} angewendet.`,
        error: "Reborn-Update konnte nicht geladen oder geprüft werden. Du kannst weiterspielen; neuer Versuch beim nächsten Start."
      },
      es: {
        restartTitle: 'Actualización de Reborn descargada',
        restartBody: 'La actualización está verificada. ¿Reiniciar el juego ahora para aplicarla?',
        restartNow: 'Reiniciar',
        restartLater: 'Más tarde',
        restartAsk: 'Una actualización de Reborn está descargada y verificada. ¿Reiniciar el juego ahora para aplicarla?',
        apk: 'Hay un APK nuevo de TESL Reborn. Crea «Solo APK» en el Builder e instálalo encima de este; tus datos del juego se conservan.',
        downloading: "Descargando una actualización de Reborn. Puedes seguir jugando.",
        restart: "Actualización de Reborn descargada y verificada. Reinicia el juego cuando quieras para aplicarla.",
        applied: `Actualización ${patchVersion(revision)} de Reborn aplicada.`,
        error: "No se pudo descargar o verificar la actualización de Reborn. Puedes seguir jugando; se reintentará al iniciar."
      },
      fr: {
        restartTitle: 'Mise à jour Reborn téléchargée',
        restartBody: 'La mise à jour est vérifiée. Redémarrer le jeu maintenant pour l’appliquer ?',
        restartNow: 'Redémarrer',
        restartLater: 'Plus tard',
        restartAsk: 'Une mise à jour Reborn est téléchargée et vérifiée. Redémarrer le jeu maintenant pour l’appliquer ?',
        apk: 'Un nouvel APK TESL Reborn est disponible. Créez « APK seul » dans le Builder et installez-le par-dessus ; vos données de jeu restent.',
        downloading: "Téléchargement d’une mise à jour Reborn. Vous pouvez continuer à jouer.",
        restart: "Mise à jour Reborn téléchargée et vérifiée. Redémarrez le jeu quand vous le souhaitez pour l’appliquer.",
        applied: `Mise à jour Reborn ${patchVersion(revision)} appliquée.`,
        error: "Impossible de télécharger ou vérifier la mise à jour Reborn. Vous pouvez jouer ; nouvel essai au prochain lancement."
      },
      it: {
        restartTitle: 'Aggiornamento Reborn scaricato',
        restartBody: 'L’aggiornamento è verificato. Riavviare il gioco ora per applicarlo?',
        restartNow: 'Riavvia',
        restartLater: 'Più tardi',
        restartAsk: 'Un aggiornamento Reborn è scaricato e verificato. Riavviare il gioco ora per applicarlo?',
        apk: 'È disponibile un nuovo APK di TESL Reborn. Crea «Solo APK» nel Builder e installalo sopra questo; i dati di gioco restano.',
        downloading: "Download di un aggiornamento Reborn. Puoi continuare a giocare.",
        restart: "Aggiornamento Reborn scaricato e verificato. Riavvia il gioco quando vuoi per applicarlo.",
        applied: `Aggiornamento Reborn ${patchVersion(revision)} applicato.`,
        error: "Impossibile scaricare o verificare l’aggiornamento Reborn. Puoi giocare; nuovo tentativo al prossimo avvio."
      },
      pl: {
        restartTitle: 'Pobrano aktualizację Reborn',
        restartBody: 'Aktualizacja jest zweryfikowana. Uruchomić grę ponownie teraz, aby ją zastosować?',
        restartNow: 'Uruchom ponownie',
        restartLater: 'Później',
        restartAsk: 'Aktualizacja Reborn jest pobrana i zweryfikowana. Uruchomić grę ponownie teraz, aby ją zastosować?',
        apk: 'Dostępny jest nowy APK TESL Reborn. Zbuduj „Tylko APK” w Builderze i zainstaluj go na tym; dane gry zostaną.',
        downloading: "Pobieranie aktualizacji Reborn. Możesz grać dalej.",
        restart: "Aktualizacja Reborn pobrana i zweryfikowana. Uruchom grę ponownie w dogodnym momencie, aby ją zastosować.",
        applied: `Aktualizacja Reborn ${patchVersion(revision)} zastosowana.`,
        error: "Nie udało się pobrać lub sprawdzić aktualizacji Reborn. Możesz grać dalej; ponowimy próbę przy następnym uruchomieniu."
      },
      pt: {
        restartTitle: 'Atualização do Reborn baixada',
        restartBody: 'A atualização foi verificada. Reiniciar o jogo agora para aplicá-la?',
        restartNow: 'Reiniciar',
        restartLater: 'Depois',
        restartAsk: 'Uma atualização do Reborn foi baixada e verificada. Reiniciar o jogo agora para aplicá-la?',
        apk: 'Há um novo APK do TESL Reborn. Gere “Somente APK” no Builder e instale por cima deste; seus dados do jogo continuam.',
        downloading: "Baixando uma atualização do Reborn. Você pode continuar jogando.",
        restart: "Atualização do Reborn baixada e verificada. Reinicie o jogo quando quiser para aplicá-la.",
        applied: `Atualização ${patchVersion(revision)} do Reborn aplicada.`,
        error: "Não foi possível baixar ou verificar a atualização do Reborn. Você pode jogar; nova tentativa na próxima inicialização."
      },
      tr: {
        restartTitle: 'Reborn güncellemesi indirildi',
        restartBody: 'Güncelleme doğrulandı. Uygulamak için oyun şimdi yeniden başlatılsın mı?',
        restartNow: 'Yeniden başlat',
        restartLater: 'Sonra',
        restartAsk: 'Reborn güncellemesi indirildi ve doğrulandı. Uygulamak için oyun şimdi yeniden başlatılsın mı?',
        apk: "Yeni bir TESL Reborn APK'sı var. Builder'da “Yalnızca APK” oluşturup bunun üzerine kurun; oyun verileriniz korunur.",
        downloading: "Reborn güncellemesi indiriliyor. Oynamaya devam edebilirsiniz.",
        restart: "Reborn güncellemesi indirildi ve doğrulandı. Uygulamak için uygun olduğunuzda oyunu yeniden başlatın.",
        applied: `Reborn ${patchVersion(revision)} güncellemesi uygulandı.`,
        error: "Reborn güncellemesi indirilemedi veya doğrulanamadı. Oynamaya devam edebilirsiniz; sonraki açılışta yeniden denenecek."
      }
    };
    (messages as any).zh = { ...messages.en, restartTitle: 'Reborn 更新已下载', restartBody: '更新已验证。现在重启游戏以应用更新吗？', restartNow: '重启', restartLater: '稍后', restartAsk: 'Reborn 更新已下载并验证。现在重启游戏以应用更新吗？', apk: 'TESL Reborn 有新的 APK。请在构建器中构建“仅 APK”，并覆盖安装；游戏数据会保留。' };
    const text = (messages[String(language).slice(0, 2)] || messages.en)[kind] || "";
    if (kind !== "applied") return text;
    const notes = PATCH_NOTES[String(language).slice(0, 2)] || PATCH_NOTES.en;
    return notes ? `${text} ${notes}` : text;
  }

  let cachedPortCaption = "";
  let splashVersionAnchor={x:.5,y:.34},splashAnchorReady=false;
  function locateSplashVersion() {
    if(splashAnchorReady)return splashVersionAnchor;
    try {
      const type=cls(img,"SplashWin"),values=ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type").invoke(type.type.object);
      for(let i=0;i<values.length;i++) {
        const self=values.get(i);if(!call(call(self,"get_gameObject"),"get_activeInHierarchy"))continue;
        const logo=self.field("_logoImage").value,rect=call(logo,"get_rectTransform"),bounds=call(rect,"get_rect");
        const point=unityStruct("UnityEngine.Vector3",{x:Number(bounds.field("m_XMin").value)+Number(bounds.field("m_Width").value)/2,
          y:Number(bounds.field("m_YMin").value)-12,z:0});
        const world=call(rect,"TransformPoint",point),canvas=call(logo,"get_canvas");
        let camera=null;try{camera=call(canvas,"get_worldCamera");}catch(_){}
        const screen=ucls("UnityEngine.RectTransformUtility").method("WorldToScreenPoint",2).invoke(camera,world),size=chatScreen();
        const x=Number(screen.field("x").value)/size.width,y=Number(screen.field("y").value)/size.height;
        if(x>.1&&x<.9&&y>.1&&y<.9){splashVersionAnchor={x,y:Math.max(.34,y)};splashAnchorReady=true;log("loading version: anchored below native SplashWin logo");}
        break;
      }
    }catch(_){}
    return splashVersionAnchor;
  }
  // The login form (LoginWin) can sit where the badge goes below the logo:
  // its login button was covered by the version. While the form is open, the
  // badge goes under its lowest control - the login and forgot buttons - in
  // screen fractions like the splash anchor; null when no form is shown.
  let loginAnchorCheck = 0, loginAnchor = null, loginAnchorLogged = false;
  // Report 33: the screen-space version of this never ran - TransformPoint
  // has a (Vector3) and an (x, y, z) overload, the bridge took the other one
  // and the error was swallowed. The badge and the form share CanvasRoot, so
  // world Y alone places it: bottom edges from position, rect and lossy scale,
  // as a fraction of the badge's own full-screen frame. No overloads involved.
  let loginAnchorError = "";
  function worldBottom(node) {
    const rect = call(node, "get_rect"), scale = Number(call(node, "get_lossyScale").field("y").value);
    return Number(call(node, "get_position").field("y").value) + Number(rect.field("m_YMin").value) * scale;
  }
  function locateLoginVersion(frame) {
    if (Date.now() < loginAnchorCheck) return loginAnchor;
    loginAnchorCheck = Date.now() + 500;
    loginAnchor = null;
    try {
      const values = ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type").invoke(cls(img, "LoginWin").type.object);
      for (let i = 0; i < values.length; i++) {
        const self = values.get(i);
        if (!unityAlive(self) || !call(call(self, "get_gameObject"), "get_activeInHierarchy")) continue;
        let low = Infinity;
        for (const name of ["_loginBtn", "_unameForgotBtn", "_pwdForgotBtn"]) {
          const button = self.field(name).value;
          if (!unityAlive(button) || !call(call(button, "get_gameObject"), "get_activeInHierarchy")) continue;
          low = Math.min(low, worldBottom(call(button, "get_transform")));
        }
        if (!Number.isFinite(low)) continue;
        const frameRect = call(frame, "get_rect"), frameScale = Number(call(frame, "get_lossyScale").field("y").value);
        const height = Number(frameRect.field("m_Height").value) * frameScale;
        if (!(height > 0)) continue;
        const y = (low - worldBottom(frame)) / height;
        loginAnchor = { x: 0.5, y: Math.min(0.9, Math.max(0.08, y - 0.02)) };
        if (!loginAnchorLogged) { loginAnchorLogged = true; log(`loading version: below the login form at ${loginAnchor.y.toFixed(2)}`); }
        break;
      }
    } catch (error) {
      const detail = String(error);
      if (detail !== loginAnchorError) { loginAnchorError = detail; log(`loading version: login form placement failed: ${detail}`); }
    }
    return loginAnchor;
  }
  function portVersionCaption() {
    if (cachedPortCaption) return cachedPortCaption;
    // The Builder that made the APK ("Builder 2.229 (test)"), as the setup
    // screens show it; older APKs only recorded "APK 50".
    let build = "APK legacy";
    try {
      const setup = JSON.parse(readTextFile(`${persistentPath()}/tesl-reborn-setup.json`) || "{}");
      const builder = setup.builder;
      if (builder && typeof builder === "object") {
        const number = Number(builder.build), channel = builder.channel === "stable" ? "stable" : "test";
        const level = Number(builder.apkLevel);
        build = `${Number.isSafeInteger(number) && number > 0 ? `Builder ${Number.isSafeInteger(level) && level > 0 ? `${level}.` : ""}${number}` : "local build"} (${channel})`;
      } else if (Number.isSafeInteger(setup.androidBuild)) build = `APK ${setup.androidBuild}`;
    } catch (_) {}
    const revision = globalThis.TeslRebornUpdater?.current()?.revision;
    // The update channel this phone follows, from its updater settings.
    let channel = "";
    try {
      const feed = String(JSON.parse(readTextFile(`${persistentPath()}/tesl-reborn-updater.json`) || "{}").feedUrl || "");
      channel = /\/updates\/stable\//.test(feed) ? " (stable)" : /\/updates\/test\//.test(feed) ? " (test)" : "";
    } catch (_) {}
    return cachedPortCaption = `Reborn ${PLUGIN_VERSION}\nAndroid ${Number.isSafeInteger(revision) ? patchVersion(revision) : "embedded"}${channel} · ${build}`;
  }

  function noticeCanvasProperty(canvas, name, value?: number) {
    const method = canvas.tryMethod(name, value === undefined ? 0 : 1);
    if (!method) {
      const error: any = new Error(`Notice Canvas managed binding unavailable: ${name}`);
      error.noticeCanvasUnavailable = true;
      throw error;
    }
    if (value === undefined) return method.invoke();
    const type = method.parameters[0].type.class;
    return method.invoke(type.isEnum ? enumBox(type, value) : value);
  }

  function uiSystemText(go, text, size) {
    // Prefer Unity's built-in Arial before language assets arrive. Stripped
    // legacy UI APIs fall back to the same TMP path used by the working chat.
    let label = null;
    try {
      const type=ucls("UnityEngine.UI.Text");
      if (!type.tryMethod("set_font",1)) throw Error("Legacy Text setters stripped");
      const font = ucls("UnityEngine.Resources").method("GetBuiltinResource")
        .overload("System.Type", "System.String").invoke(ucls("UnityEngine.Font").type.object, Il2Cpp.string("Arial.ttf"));
      if (isNull(font)) throw Error("Built-in notice font is unavailable");
      label = uiAdd(go, "UnityEngine.UI.Text");
      call(label, "set_font", font); call(label, "set_fontSize", size);
      call(label, "set_raycastTarget", false); call(label, "set_supportRichText", false);
      call(label, "set_alignment", uiEnum("UnityEngine.TextAnchor", "MiddleCenter"));
      call(label, "set_color", rgba(1, 1, 1, 1)); call(label, "set_text", Il2Cpp.string(text));
      return label;
    } catch (_) {
      if(label) try {ucls("UnityEngine.Object").method("Destroy").overload("UnityEngine.Object").invoke(label);} catch(_){}
      return uiText(go,text,size);
    }
  }
  function noticeTextLayout(label, right = false) {
    const tmp = label.class.type.name === "TMPro.TextMeshProUGUI";
    call(label,"set_alignment",uiEnum(tmp ? "TMPro.TextAlignmentOptions" : "UnityEngine.TextAnchor",
      right ? (tmp ? "Right" : "MiddleRight") : (tmp ? "Center" : "MiddleCenter")));
    if(!right) {
      const options=tmp ? [["set_enableAutoSizing",true],["set_fontSizeMin",18],["set_fontSizeMax",22]]
        : [["set_resizeTextForBestFit",true],["set_resizeTextMinSize",18],["set_resizeTextMaxSize",22]];
      for(const [name,value] of options) label.tryMethod(String(name),1)?.invoke(value);
    }
  }

  function isLoadingVersionScreen(sceneName, names) {
    const loading=/^(?:.*[\/ _-])?(?:loading|bootstrap|splash)(?:screen|scene|canvas|win|controller)?(?:\(clone\))?$/i;
    return loading.test(String(sceneName||"")) || names.some(name=>loading.test(String(name)));
  }
  let startupVersionComplete=false,startupReadyHooked=false;
  let versionScreenCheck=0,versionScreenState={visible:false,scene:"",popup:""};
  function installStartupVersionTracking() {
    try {
      const owner=img.classes.find(c=>c.name==="MainMenuNavManager");
      const init=owner?.methods.find(m=>m.name==="Init" && !m.isStatic && !m.virtualAddress.isNull());
      if(init) {hookAttach(init.virtualAddress,{onLeave(){startupVersionComplete=true;versionScreenCheck=0;}});startupReadyHooked=true;}
    }catch(error){log(`loading version readiness: ${error}`);}
  }
  function startupVersionVisible(scene,ready) {
    return !ready && !/^(?:mainmenu|battle|match|gameboard|login)$/i.test(String(scene||""));
  }
  function loadingVersionState() {
    if(Date.now()<versionScreenCheck)return versionScreenState;
    versionScreenCheck=Date.now()+500;
    // simpleperf on a battle: these scans of every loaded object were 12% of
    // the main thread. The badge only waits for the first menu; after that
    // the answer cannot change.
    if(startupVersionComplete)return versionScreenState={visible:false,scene:versionScreenState.scene,popup:""};
    let scene="",names=[];
    try {const value=ucls("UnityEngine.SceneManagement.SceneManager").method("GetActiveScene",0).invoke();scene=String(value.method("get_name",0).invoke()?.content||"");}catch(_){}
    try {
      const find=ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type");
      for(const owner of img.classes.filter(c=>/^(?:LoadingScreen|LoadingWin|LoadingScreenController|GameLoadingScreen)$/.test(c.name)
        && Array.from(c.hierarchy()).some(base=>base.type.name==="UnityEngine.Component"))) {
        const values=find.invoke(owner.type.object);
        for(let i=0;i<values.length;i++){const go=call(values.get(i),"get_gameObject");if(call(go,"get_activeInHierarchy"))names.push(String(call(go,"get_name")?.content||owner.name));}
      }
    }catch(_){}
    // The splash component disappears while Unity is still loading resources.
    // Keep the version until real menu initialization, rather than that splash's lifetime.
    if(!startupVersionComplete)try {
      // Report 36: after a crash the game resumed straight into the match,
      // the main menu never initialised and the badge stayed all battle.
      for(const name of ["BoardInputController","MatchIntroWin"]) {
        const owner=img.classes.find(c=>c.name===name);if(!owner)continue;
        const values=ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type").invoke(owner.type.object);
        for(let i=0;i<values.length;i++)if(call(call(values.get(i),"get_gameObject"),"get_activeInHierarchy")){startupVersionComplete=true;break;}
      }
    }catch(_){}
    if(!startupVersionComplete && !startupReadyHooked)try {
      const owner=img.classes.find(c=>c.name==="MainMenuNavManager");
      if(owner) {
        const values=ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type").invoke(owner.type.object);
        for(let i=0;i<values.length;i++) {
          const go=call(values.get(i),"get_gameObject");
          if(call(go,"get_activeInHierarchy") && Number(call(call(go,"get_transform"),"get_childCount"))>0)startupVersionComplete=true;
        }
      }
    }catch(_){}
    const visible=startupVersionVisible(scene,startupVersionComplete);
    // The badge sat on the text of "You have logged in on another device":
    // it steps aside while a game popup is open.
    let popup="";
    if(visible)try {
      const find=ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type");
      for(const owner of img.classes.filter(c=>/^(?:PopupWin|UIPopupWindow|ReconnectDialog)$/.test(c.name)
        && Array.from(c.hierarchy()).some(base=>base.type.name==="UnityEngine.Component"))) {
        const values=find.invoke(owner.type.object);
        for(let i=0;i<values.length&&!popup;i++)if(call(call(values.get(i),"get_gameObject"),"get_activeInHierarchy"))popup=owner.name;
      }
    }catch(_){}
    return versionScreenState={visible,scene,popup};
  }

  // A frame counter for tests (Game Data cannot show the real rate). On by
  // default on the Test channel; tesl-reborn-graphics.json "showFps" decides
  // when present.
  // The frame bus counts frames natively.
  const fpsCounter = { base: 0, since: Date.now(), value: 0,
    get frames() { return ((globalThis as any).__teslFrameBus?.frames() ?? 0) - this.base; },
    set frames(value) { this.base = ((globalThis as any).__teslFrameBus?.frames() ?? 0) - value; } };
  function fpsMeterEnabled() {
    try {
      const graphics = JSON.parse(readTextFile(`${persistentPath()}/tesl-reborn-graphics.json`) || "null");
      if (typeof graphics?.showFps === "boolean") return graphics.showFps;
    } catch (_) {}
    try {
      const updater = JSON.parse(readTextFile(`${persistentPath()}/tesl-reborn-updater.json`) || "null");
      return /\/updates\/test\//.test(String(updater?.feedUrl || ""));
    } catch (_) { return false; }
  }
  function fpsSample(counter, now) {
    const elapsed = now - counter.since;
    if (elapsed < 1000) return counter.value;
    counter.value = Math.round(counter.frames * 1000 / elapsed);
    counter.frames = 0; counter.since = now;
    return counter.value;
  }

  function createUpdateBanner() {
    const showFps = fpsMeterEnabled();
    let fps = null, fpsText = null, fpsLogAt = 0, lastFrameAt = 0;
    let badgeShown = null, fpsTop = null, fpsShown = null, badgeCaption = null, badgePlacedAt = 0;
    let root = null, label = null, canvas = null, panel = null, badge = null, badgeText = null;
    let disabled = false, canvasScale = 1, nested = false, hostRetryAt = 0, hostReportAt = 0;
    let hostKey = "", hostCheckAt = 0, shownVersion = null, hostRoots = [];
    let loadingState = null;
    let message = null, shownAt = 0, lastError = "";
    const unityObject = ucls("UnityEngine.Object");
    // Unity's own null check: a destroyed object compares equal to null
    // without throwing, so nothing is called on it.
    const alive = value => !isNull(value) && !unityObject.method("op_Equality").invoke(value, NULL);
    // The live root Canvas that covers the screen: ScreenSpaceOverlay (0) or
    // ScreenSpaceCamera (1), overlay first, then the highest sorting. The
    // game's whole UI is one camera-space root, CanvasRoot:1/1 (report 26);
    // WorldSpace (2) is not the screen and never hosts the notice.
    function overlayHost() {
      // Report 119 (Pixel 8 Pro): this scan of every Canvas, prefabs and
      // hidden ones included, grew through each battle (865 -> 1473 ms per
      // 15 s). Only active ones can host the banner.
      const values = ucls("UnityEngine.Object").method("FindObjectsOfType").overload("System.Type")
        .invoke(ucls("UnityEngine.Canvas").type.object);
      let host = null, rank = -Infinity;
      const seen = hostRoots = [];
      for (let i = 0; i < values.length; i++) {
        const candidate = values.get(i);
        if (!alive(candidate) || !call(candidate, "get_isRootCanvas")) continue;
        const go = call(candidate, "get_gameObject");
        if (!call(go, "get_activeInHierarchy")) continue;
        const mode = enumVal(call(candidate, "get_renderMode")), sorting = Number(call(candidate, "get_sortingOrder"));
        seen.push(`${String(call(go, "get_name")?.content || "?")}:${mode}/${sorting}`);
        if (mode !== 0 && mode !== 1) continue;
        const score = (mode === 0 ? 1e6 : 0) + sorting;
        if (score >= rank) { host = candidate; rank = score; }
      }
      // Without a host, name the live root canvases and their render modes
      // (0 overlay, 1 camera, 2 world), at most every 30 s.
      if (!host && Date.now() >= hostReportAt) {
        hostReportAt = Date.now() + 30000;
        log(`update notice: no screen Canvas to host it; live roots ${seen.slice(0, 12).join(", ") || "none"}`);
      }
      return host;
    }
    let reportedCaption = "",badgeBackground=null,gradientTexture=null,gradientSprite=null;
    function discard() {
      if (root) {
        try { ucls("UnityEngine.Object").method("Destroy").overload("UnityEngine.Object").invoke(root.target); } catch (_) {}
        root.free();
      }
      for(const asset of [gradientSprite,gradientTexture])if(asset)try{ucls("UnityEngine.Object").method("Destroy").overload("UnityEngine.Object").invoke(asset);}catch(_){}
      gradientTexture=gradientSprite=badgeBackground=null;
      fps = fpsText = null;
      root = label = canvas = panel = badge = badgeText = null;
      badgeShown = fpsTop = fpsShown = badgeCaption = null; badgePlacedAt = 0;
    }
    function ensure(wanted) {
      if (disabled) return;
      let better = null;
      if (root) {
        // A banner nested in a game Canvas goes away with that Canvas's scene.
        if (!alive(root.target)) discard();
        else {
          // The host is chosen as soon as one exists, and a loading screen may
          // put a later screen Canvas above it (report 27: built under
          // CanvasRoot, yet never seen). While the badge or a message should
          // show, move to a better host when one appears.
          // No better host is looked for in battle, and every 10 s elsewhere.
          if (!nested || !wanted || Date.now() < hostCheckAt || globalThis.__teslInBattle) return;
          hostCheckAt = Date.now() + 10000;
          better = overlayHost();
          if (!better || better.handle.toString() === hostKey) return;
          discard();
        }
      }
      // This player strips Canvas.set_renderMode, and a new root Canvas does
      // not render as an overlay (report 24); since OTA 69 that hid the
      // version badge and the update banner. Our own object then goes under
      // the game's overlay Canvas as a nested Canvas sorted above it - the
      // mechanism that raises the friends button. Game UI is never moved.
      // Without a host yet (early startup), look again in 2 s, building nothing.
      nested = !ucls("UnityEngine.Canvas").tryMethod("set_renderMode", 1);
      let host = better;
      if (nested && !host) {
        if (Date.now() < hostRetryAt) return;
        host = overlayHost();
        if (!host) { hostRetryAt = Date.now() + 2000; return; }
      }
      if (host) { hostKey = host.handle.toString(); hostCheckAt = Date.now() + 2000; }
      // The first frame may precede the game's fonts. Keep the message queued
      // and retry later instead of delaying authentication or failing startup.
      const go = newWith(ucls("UnityEngine.GameObject"), Il2Cpp.string("RebornUpdateNotice"),
        Il2Cpp.array(Il2Cpp.corlib.class("System.Type"), [ucls("UnityEngine.RectTransform").type.object]));
      root = go.ref(false);
      try {
        canvas = uiAdd(go, "UnityEngine.Canvas");
        if (!nested) {
          noticeCanvasProperty(canvas, "set_renderMode", 0); // Unity ScreenSpaceOverlay.
          noticeCanvasProperty(canvas, "set_sortingOrder", 32760);
          noticeCanvasProperty(canvas, "set_scaleFactor", 1);
          canvasScale = 1;
        } else {
          // A camera-space host is only drawn for the layers its camera
          // culls in (UI); a new GameObject sits on layer 0 and every child
          // made by uiNew copies its parent's layer. Report 28: shown under
          // CanvasRoot for 20 s, never drawn. Take the host's layer first.
          call(go, "set_layer", Number(call(call(host, "get_gameObject"), "get_layer")));
          call(go, "get_transform").method("SetParent").overload("UnityEngine.Transform", "System.Boolean").invoke(call(host, "get_transform"), false);
          uiStretch(uiRect(go));
          noticeCanvasProperty(canvas, "set_overrideSorting", true);
          noticeCanvasProperty(canvas, "set_sortingOrder", 32760);
          canvasScale = Number(call(host, "get_scaleFactor")) || 1;
          log(`update notice: nested under ${String(call(call(host, "get_gameObject"), "get_name")?.content || "?")} (order ${Number(call(host, "get_sortingOrder"))}); live roots ${hostRoots.slice(0, 12).join(", ")}`);
        }
        // No CanvasScaler or CanvasGroup: both may lose unused setters in this
        // mobile player. Every graphic is non-raycastable and has no handlers.
        panel = uiNew("Banner", call(go, "get_transform"));
        const background = uiAdd(panel, "UnityEngine.UI.Image");
        call(background, "set_color", rgba(0.09, 0.11, 0.14, 0.95));
        call(background, "set_raycastTarget", false);
        const text = uiNew("Message", call(panel, "get_transform"));
        uiStretch(uiRect(text));
        call(uiRect(text), "set_offsetMin", vec2(16, 10));
        call(uiRect(text), "set_offsetMax", vec2(-16, -10));
        label = uiSystemText(text, "", 22);
        noticeTextLayout(label);
        badge = uiNew("PortVersion", call(go, "get_transform"));
        badgeBackground=uiAdd(badge,"UnityEngine.UI.Image");call(badgeBackground,"set_raycastTarget",false);
        call(badgeBackground,"set_color",rgba(0,0,0,.8));
        // Render the same fade with UI strips; Sprite.Create overloads are
        // stripped in this Android player. No texture or fallback rectangle.
        call(badgeBackground,"set_color",rgba(0,0,0,0));
        for(let i=0;i<32;i++){
          const strip=uiNew("Fade"+i,call(badge,"get_transform")),rect=uiRect(strip);
          call(rect,"set_anchorMin",vec2(i/32,0));call(rect,"set_anchorMax",vec2((i+1)/32,1));
          call(rect,"set_offsetMin",vec2(0,0));call(rect,"set_offsetMax",vec2(0,0));
          const graphic=uiAdd(strip,"UnityEngine.UI.Image"),t=(i+.5)/32;
          call(graphic,"set_color",rgba(0,0,0,Math.min(1,Math.min(t,1-t)*3)*.8));call(graphic,"set_raycastTarget",false);
        }
        const badgeLabel=uiNew("RebornPluginVersion",call(badge,"get_transform"));uiStretch(uiRect(badgeLabel));
        badgeText = uiSystemText(badgeLabel, "", 26);
        try{call(badgeText,badgeText.class.type.name==="TMPro.TextMeshProUGUI"?"set_richText":"set_supportRichText",true);}catch(_){}
        call(badgeText,"set_alignment",uiEnum(badgeText.class.type.name==="TMPro.TextMeshProUGUI"?"TMPro.TextAlignmentOptions":"UnityEngine.TextAnchor",badgeText.class.type.name==="TMPro.TextMeshProUGUI"?"Center":"MiddleCenter"));
        call(badgeText, "set_color", rgba(1, 1, 1, 1));
        if (showFps) {
          fps = uiNew("RebornFps", call(go, "get_transform"));
          const back = uiAdd(fps, "UnityEngine.UI.Image");
          call(back, "set_color", rgba(0, 0, 0, .6)); call(back, "set_raycastTarget", false);
          const inner = uiNew("Value", call(fps, "get_transform")); uiStretch(uiRect(inner));
          fpsText = uiSystemText(inner, "", 22);
          noticeTextLayout(fpsText);
          call(fpsText, "set_color", rgba(.4, 1, .4, 1));
        }
        // DontDestroyOnLoad only applies to root objects.
        if (!nested) ucls("UnityEngine.Object").method("DontDestroyOnLoad").overload("UnityEngine.Object").invoke(go);
        call(panel, "SetActive", false);
        // No GraphicRaycaster, event handlers or buttons: all taps pass through.
      } catch (error) {
        if ((error as any)?.noticeCanvasUnavailable) disabled = true;
        discard();
        throw error;
      }
    }
    return {
      show(kind, revision, onShown) {
        message = { kind, revision, onShown, duration: kind === "restart" ? 10000 : kind === "apk" || kind === "applied" ? 15000 : 6000 };
        shownAt = 0;
      },
      tick() {
        if (disabled) return;
        if (message && shownAt && Date.now() - shownAt >= message.duration) {
          try { if (panel) call(panel, "SetActive", false); } catch (_) { discard(); }
          message = null;
        }
        try {
          const versionScreen=loadingVersionState();
          ensure(versionScreen.visible || Boolean(message) || showFps);
          // No host yet: nothing was built; the message stays queued (report 25:
          // this tick went on with a null Canvas and never got past it).
          if (!root) return;
          const screen = chatScreen();
          // A nested Canvas takes the host's scale; only a root one sets it.
          const scale = nested ? Math.max(0.1, Number(call(call(canvas, "get_rootCanvas"), "get_scaleFactor")) || canvasScale)
            : Math.max(0.1, Math.min(screen.width / 1280, screen.height / 720));
          if (nested) canvasScale = scale;
          else if (Math.abs(scale - canvasScale) >= 0.01) {
            noticeCanvasProperty(canvas, "set_scaleFactor", scale);
            canvasScale = scale;
          }
          const width = Math.min(1000, screen.width / scale - 32);
          let top = 16;
          try {
            const safe = ucls("UnityEngine.Screen").method("get_safeArea", 0).invoke();
            top += Math.max(0, screen.height - Number(call(safe, "get_yMax"))) / scale;
          } catch (_) {}
          // Report 120 (Pixel 8 Pro): this tick still grew through a battle
          // (441 -> 1042 ms per 15 s). The badge is placed by searching the
          // login and splash screens; it shows only on those, so it is placed
          // only while it shows, and switched only when that changes.
          // Report 124: still 1.2-1.4 s per 15 s on the loading screens, so
          // the search runs once a second, not on every tick.
          if (versionScreen.visible && Date.now() >= badgePlacedAt + 1000) {
            badgePlacedAt = Date.now();
            const badgeAnchor=locateLoginVersion(call(root.target,"get_transform"))||locateSplashVersion();
            uiPlace(badge,badgeAnchor.x,badgeAnchor.y,0.5,1,0,0,Math.min(620,Math.max(240,width)),72);
          }
          const badgeVisible = versionScreen.visible && !versionScreen.popup;
          if (badgeShown !== badgeVisible) {
            if (versionScreen.popup) log(`loading version: hidden under ${versionScreen.popup}`);
            badgeShown = badgeVisible; call(badge,"SetActive",badgeVisible);
          }
          // The status file keeps only the last state; the log keeps each change.
          // Leaving the game during its first load breaks it (GestureBridge
          // restarts it on return): tell the APK while this process is still
          // loading, and once the login form or the main menu is reached.
          const loaded = !versionScreen.visible || loginAnchorLogged;
          if (loadingState !== loaded) {
            loadingState = loaded;
            try { writeTextFile(`${persistentPath()}/tesl-reborn-loading.json`, JSON.stringify({ pid: Process.id, loaded, at: Date.now() })); } catch (_) {}
          }
          if (shownVersion !== versionScreen.visible) {
            shownVersion = versionScreen.visible;
            log(`loading version: ${versionScreen.visible ? "shown" : "hidden"} (scene "${versionScreen.scene}")`);
          }
          // Report 23: back from the background Unity had vSync on again
          // (menu at 106 FPS) and the emoji atlas was blank. No frames run
          // while paused, so a long gap between them is a return.
          const frameAt = Date.now();
          // A long load also counts: with the screen locked the game can stay
          // the foreground app, so being in the background cannot tell them
          // apart, and running the handlers once too often is harmless.
          if (lastFrameAt && frameAt - lastFrameAt > 5000) {
            log(`resumed after ${Math.round((frameAt - lastFrameAt) / 1000)} s`);
            for (const handler of globalThis.__teslOnResume || []) {
              try { handler(); } catch (error) { log(`resume: ${error}`); }
            }
          }
          lastFrameAt = frameAt; globalThis.__teslLastFrameAt = frameAt;
          const measured = fpsSample(fpsCounter, Date.now());
          // Report 39: the setting looked like it did nothing; the log now
          // keeps the measured rate, so a report shows what changed.
          if (Date.now() >= fpsLogAt && measured) {
            fpsLogAt = Date.now() + 15000; log(`fps: ${measured}`);
            try { globalThis.__teslGovernor?.(measured, versionScreen.visible); }
            catch (error) { log(`graphics: auto frame rate failed: ${error}`); }
          }
          if (fps) {
            if (fpsTop !== top) { fpsTop = top; uiPlace(fps, 0, 1, 0, 1, 12, -top, 110, 36); }
            if (fpsShown !== measured) { fpsShown = measured; call(fpsText, "set_text", Il2Cpp.string(`${measured} FPS`)); }
          }
          const caption = portVersionCaption();
          if (badgeCaption !== caption) { badgeCaption = caption; call(badgeText, "set_text", Il2Cpp.string(caption.replace("\nAndroid", "\n<size=20>Android")+"</size>")); }
          const signature=caption+":"+versionScreen.visible+":"+versionScreen.scene;
          if (signature !== reportedCaption) {
            reportedCaption = signature;
            try { writeTextFile(`${persistentPath()}/tesl-reborn-ui-status.json`, JSON.stringify({ version: caption, patchVersion: Number.isSafeInteger(globalThis.TeslRebornUpdater?.current()?.revision) ? patchVersion(globalThis.TeslRebornUpdater.current().revision) : "", visible: versionScreen.visible, scene:versionScreen.scene, at: new Date().toISOString() })); } catch (_) {}
          }
          if (!message) { lastError = ""; return; }
          uiPlace(panel, 0.5, 1, 0.5, 1, 0, -top, Math.max(240, width), 92);
          call(label, "set_text", Il2Cpp.string(updateNoticeText(message.kind, message.revision, resourceLanguage())));
          call(panel, "SetActive", true);
          if (!shownAt) shownAt = Date.now();
          else if (message.onShown) { const acknowledge = message.onShown; message.onShown = null; acknowledge(); }
          lastError = "";
        } catch (error) {
          const detail = String(error);
          if (detail !== lastError) {
            log(`update notice: ${detail}`); lastError = detail;
            try { writeTextFile(`${persistentPath()}/tesl-reborn-ui-status.json`, JSON.stringify({ error: detail.slice(0,300), at: new Date().toISOString() })); } catch (_) {}
          }
        }
      }
    };
  }

  function installUpdateNotices(updater) {
    installStartupVersionTracking();
    const banner = createUpdateBanner();
    const noticeFile = `${persistentPath()}/tesl-reborn-update-notice.json`;
    const read = path => { try { return JSON.parse(readTextFile(path) || "null"); } catch (_) { return null; } };
    const notices = createUpdateNotices(updater, {
      readNotice: () => read(noticeFile),
      readStatus: () => read(`${persistentPath()}/tesl-reborn-update-status.json`),
      writeNotice: value => {
        try { if (writeTextFile(noticeFile + ".part", JSON.stringify(value))) atomicRename(noticeFile + ".part", noticeFile); } catch (_) {}
      },
      emit: (kind, revision, onShown) => { if (kind !== "restart" || !offerRestart()) banner.show(kind, revision, onShown); }
    });
    // A downloaded patch: the game's own Confirm/Cancel dialog offers the
    // restart, which the setup code of an APK of level 2 or newer performs
    // (teslreborn://language?apply=1&restart=1). Never in a battle: the
    // dialog waits for its end. Older APKs, or a failure, keep the banner.
    let restartDialogText = null;
    try {
      const common = cls(img, "UIPopupWindow").tryMethod("ShowGenericCommon", 12);
      if (common && !common.virtualAddress.isNull()) hookAttach(common.virtualAddress, {
        onEnter(args) {
          if (!restartDialogText) return;
          const [title, body, now, later] = restartDialogText;
          args[1] = title.handle; args[2] = ptr(0); args[3] = body.handle;
          args[4] = ptr(0); args[5] = ptr(0); args[6] = now.handle; args[7] = later.handle;
        }
      });
      else log("updater: UIPopupWindow.ShowGenericCommon not found; plain restart dialog");
    } catch (error) { log(`updater: restart dialog styling unavailable: ${error}`); }
    function offerRestart() {
      const setup = read(`${persistentPath()}/tesl-reborn-setup.json`) || {};
      if (!(Number(setup.apkLevel) >= 2)) return false;
      const ask = () => {
        if (globalThis.__teslInBattle) { schedule(5000, ask, "restart offer"); return; }
        try {
          const accept = Il2Cpp.delegate(ucls("UnityEngine.Events.UnityAction"), () => {
            log("updater: restart accepted");
            try { ucls("UnityEngine.Application").method("OpenURL", 1).invoke(Il2Cpp.string(languageSetupUri("apply=1&restart=1"))); }
            catch (error) { log(`updater: restart failed: ${error}`); banner.show("restart", 0, null); }
          });
          const later = Il2Cpp.delegate(ucls("UnityEngine.Events.UnityAction"), () => log("updater: restart postponed"));
          // The confirmation dialog puts its text in the title bar and shows a
          // random picture; while it is built, its common Show gets a title,
          // the text, no picture and Restart / Later.
          const language = resourceLanguage();
          restartDialogText = [updateNoticeText("restartTitle", 0, language), updateNoticeText("restartBody", 0, language),
            updateNoticeText("restartNow", 0, language), updateNoticeText("restartLater", 0, language)].map(text => Il2Cpp.string(text));
          try {
            cls(img, "WindowUtils").method("OpenConfirmationDialog", 3)
              .invoke(Il2Cpp.string(updateNoticeText("restartAsk", 0, language)), accept, later);
          } finally { restartDialogText = null; }
          globalThis.__teslRestartActions = [accept, later];
          log("updater: restart offered");
        } catch (error) { log(`updater: restart dialog failed: ${error}`); banner.show("restart", 0, null); }
      };
      schedule(0, ask, "restart offer");
      return true;
    }
    let nextPoll = 0, queued = false;
    hookAttach(cls(img, "SparkleServices.ServicesManager").method("Update", 0).virtualAddress, {
      onLeave() {
        if (queued || Date.now() < nextPoll) return;
        queued = true; nextPoll = Date.now() + 250;
        schedule(0, () => {
          queued = false;
          try { notices.poll(); banner.tick(); } catch (error) { log(`update notice poll: ${error}`); }
        }, "banner tick");
      }
    });
    // A patch can need a newer APK (setup screens, the Java side of the game).
    // The APK records its level at every start; an older one gets a notice.
    schedule(8000, () => {
      try {
        const setup = read(`${persistentPath()}/tesl-reborn-setup.json`) || {};
        const level = Number.isSafeInteger(setup.apkLevel) ? setup.apkLevel : 1;
        if (level < APK_LEVEL) { log(`apk: level ${level}, patches expect ${APK_LEVEL}; asking for a new APK`); banner.show("apk", 0, null); }
      } catch (error) { log(`apk level check: ${error}`); }
    });
    // Public HTTPS requests need no account token. Never wait for this check
    // before starting login, loading resources or entering a match.
    schedule(1000, () => {
      const prelaunch=read(`${persistentPath()}/tesl-reborn-prelaunch-status.json`);
      const age=Date.now()-Number(prelaunch?.checkedAt);
      if(Number.isFinite(age) && age>=0 && age<60000) {log("updater: prelaunch gate handled this start");return;}
      notices.check((url, callback) => httpGet(url, false, callback, true));
    });
  }
  // END android-ui: update-notices

