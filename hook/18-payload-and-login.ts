  const emojiDirectory = () => `${persistentPath()}/tesl-reborn-emojis`;
  function emojiInstalled(name) {
    try { return Checksum.compute("sha256", File.readAllBytes(`${emojiDirectory()}/${name}`)) === EMOJI_FILES[name]; } catch (_) { return false; }
  }
  // Emojis the APK did not bring: from the official plugin archive, every
  // file checked against EMOJI_FILES. At most once an hour, and the work is
  // done on the script's thread, not the game's.
  function fetchEmojis() {
    const missing = Object.keys(EMOJI_FILES).filter(name => !emojiInstalled(name));
    if (!missing.length) return;
    const stamp = `${emojiDirectory()}/fetch.json`;
    try { if (Date.now() - Number(JSON.parse(readTextFile(stamp) || "{}").at || 0) < 3600000) return; } catch (_) {}
    makeDirectory(emojiDirectory());
    writeTextFile(stamp, JSON.stringify({ at: Date.now(), url: EMOJI_SOURCE.url }));
    log(`emojis: ${missing.join(", ")} missing; fetching the Reborn plugin archive`);
    httpGetBytes(EMOJI_SOURCE.url, (status, bytes) => {
      if (!bytes) { log(`emojis: download failed (HTTP ${status})`); return; }
      setTimeout(() => {
        try {
          const archive = new Uint8Array(bytes);
          if (Checksum.compute("sha256", bytes) !== EMOJI_SOURCE.sha256) throw Error("the archive is not the expected plugin release");
          for (const name of missing) {
            const data = zipEntry(archive, EMOJI_SOURCE.folder + name);
            if (!data) throw Error(`${name} is not in the archive`);
            if (Checksum.compute("sha256", data.buffer) !== EMOJI_FILES[name]) throw Error(`${name} failed verification`);
            const target = `${emojiDirectory()}/${name}`, part = target + ".part", out = new File(part, "wb");
            try { out.write(data.buffer); out.flush(); } finally { out.close(); }
            if (!atomicRename(part, target)) throw Error(`could not save ${name}`);
          }
          emojiInitAttempted = false;  // the chat loads them on its next use
          log(`emojis: installed ${missing.join(", ")} from the plugin archive`);
        } catch (e) { log(`emojis: ${e}`); }
      }, 0);
    });
  }

  section("payload from the apk", () => {
    const apk = apkPath();
    if (!apk) { log("payload: the apk was not found"); return; }
    const zip = new ZipReader(apk);
    if (!zip.valid()) return;
    try {
    // Keep Reborn artwork out of git, but install the verified build resources
    // from the APK so a clean installation does not require an ADB asset push.
    // An APK with other emojis (an older plugin) leaves them to the download.
    for (const name of Object.keys(EMOJI_FILES)) {
      if (emojiInstalled(name)) continue;
      const entry = zip.find(`assets/tesl-reborn/emojis/${name}`);
      if (!entry) { log(`emoji payload: ${name} is not in the APK`); continue; }
      if (entry.method !== 0 || entry.size > 2 * 1024 * 1024) { log(`emoji payload: ${name} in the APK is not usable`); continue; }
      makeDirectory(emojiDirectory());
      zip.copy(entry, `${emojiDirectory()}/${name}`);
      log(emojiInstalled(name) ? `emoji payload: restored ${name}` : `emoji payload: ${name} in the APK is another version`);
    }
    // Simplified Chinese is a text-only language: the dictionary and the
    // atlas of its font come with the APK (languages/zh_cn in the repository).
    const chineseFiles = {
      "zh_cn.json": ["tesl-localization-zh_cn.json", "a907539a59efadd7fd249d4ceb4f9a5b4606d9e7c47680ea8f5617ccb17177b8", 1497505],
      "zh_cn-login.json": ["tesl-localization-zh_cn-login.json", "89514985e1d924c84ce36c297441b201b538eb1d3d706bfbc182de9ef0de2c5f", 47185],
      "cjk.json": ["tesl-reborn-fonts/cjk.json", "94d97387bc4410e1ef8fcd6663af331eed34802fe1eaf8b314313bc6a443ae50", 274879],
      "cjk.png": ["tesl-reborn-fonts/cjk.png", "d29137bd7ae0bb0496055604e0863b613ab8f68896f95ca1612c251dc3e6b73a", 2029736]
    };
    // An APK from another patch carries other versions: they are left alone
    // (and the rest of the payload still installs).
    for (const [name, [path, expected, size]] of Object.entries(chineseFiles)) {
      const entry = zip.find(`assets/tesl-reborn/zh_cn/${name}`);
      if (!entry) continue;
      if (entry.method !== 0 || entry.size !== size) { log(`chinese payload: ${name} in the APK is another version`); continue; }
      const target = `${persistentPath()}/${path}`;
      let current = false;
      try { current = Checksum.compute("sha256", File.readAllBytes(target)) === expected; } catch (_) {}
      if (current) continue;
      makeDirectory(target.substring(0, target.lastIndexOf("/")));
      zip.copy(entry, target);
      log(Checksum.compute("sha256", File.readAllBytes(target)) === expected ? `chinese payload: restored ${name}` : `chinese payload: ${name} failed verification`);
    }
    const obb = zip.find("assets/tesl-payload/obb.bin");
    const cache = zip.find("assets/tesl-payload/cache.bin");
    const perFileEntries = zip.list().filter(e => e.startsWith("assets/tesl-payload/UnityCache/Shared/"));
    if (!obb && !cache && !perFileEntries.length) { log("payload: the apk carries no payload"); return; }

    if (obb) {
      const target = obbPath();
      if (target && fileSize(target) !== obb.size) {
        log(`payload: writing the streaming assets to ${target}`);
        makeDirectory(target.substring(0, target.lastIndexOf("/")));
        zip.copy(obb, target);
        log("payload: the streaming assets are ready");
      }
    }
    if (cache) {
      const target = `${persistentPath()}/UnityCache/Shared`;
      const head = new DataView(zip.read(cache, 0, 12));
      const count = head.getUint32(8, true);
      let at = 12;
      const files: { name: string; size: number }[] = [];
      for (let i = 0; i < count; i++) {
        const len = new DataView(zip.read(cache, at, 2)).getUint16(0, true);
        at += 2;
        const name = readString(zip.read(cache, at, len));
        at += len;
        const size = readUInt64(new DataView(zip.read(cache, at, 8)));
        at += 8;
        files.push({ name, size });
      }
      let offset = at;
      let written = 0;
      for (const f of files) {
        const path = `${target}/${f.name}`;
        if (!fileExists(path)) {
          makeDirectory(path.substring(0, path.lastIndexOf("/")));
          const out = new File(path, "wb");
          let done = 0;
          while (done < f.size) {
            const n = Math.min(4 * 1024 * 1024, f.size - done);
            out.write(zip.read(cache, offset + done, n));
            done += n;
          }
          out.close();
          written++;
        }
        offset += f.size;
      }
          log(`payload: ${written} of ${count} cache files written (packed)`);
    } else {
      const prefix = "assets/tesl-payload/UnityCache/Shared/";
      const perEntry = (zip as any).list().filter((e:string) => e.startsWith(prefix));
      if (perEntry.length) {
        const tgt = `${persistentPath()}/UnityCache/Shared`;
        let written = 0;
        for (const name of perEntry) {
          const rel = name.substring(prefix.length);
          const path = `${tgt}/${rel}`;
          const e = zip.find(name);
          if (fileSize(path) !== e.size) {
            makeDirectory(path.substring(0, path.lastIndexOf("/")));
            zip.copy(e, path);
            written++;
          }
        }
        log(`payload: ${written} of ${perEntry.length} cache files written (per-file)`);
      }
    }
        const versions = zip.find("assets/tesl-payload/versions.json");
    if (versions) {
      const target = `${persistentPath()}/versions.json`;
      if (!fileExists(target)) {
        log("payload: writing versions.json");
        makeDirectory(target.substring(0, target.lastIndexOf("/")));
        zip.copy(versions, target);
      }
    }
    } finally { zip.close(); }
  });
  section("emojis from the plugin archive", () => schedule(20000, fetchEmojis, "emoji check"));

  // The path of the APK of the game, taken from the streaming assets path.
  // Discover the package's APK even when an OBB is installed.  On Android
  // both Application.dataPath and streamingAssetsPath report the OBB's path
  // once an OBB is present (that OBB would then be treated as the APK and
  // the embedded payload would be invisible).  The APK is only reliably
  // findable as a mapped module in /proc/self/maps.
  function apkPath(): string {
    try {
      const f = new File("/proc/self/maps", "rb");
      let line = "";
      let fallback = "";
      while ((line = f.readLine()) !== "") {
        const matches = line.match(/(\/[^\s]+\.apk)/g);
        if (matches) for (const cand of matches) {
          if (cand.indexOf("base.apk") >= 0) { try { f.close(); } catch (_) {}; return cand; }
          if (!fallback) fallback = cand;
        }
      }
      try { f.close(); } catch (_) {}
      if (fallback) return fallback;
    } catch (_) {}
    try {
      const path = String((ucls("UnityEngine.Application").method("get_streamingAssetsPath") as any)
        .invoke()?.content ?? "");
      const m = path.match(/^jar:file:\/\/(.*)!.*$/);
      return m ? m[1] : "";
    } catch { return ""; }
  }

  // The place where the game expects the OBB of the package.
  function obbPath(): string {
    const persistent = persistentPath();      // /sdcard/Android/data/<pkg>/files
    const android = persistent.replace(/\/data\/[^/]+\/files$/, "");
    return `${android}/obb/com.bethsoft.theelderscrollslegends/main.11009.com.bethsoft.theelderscrollslegends.obb`;
  }

  function fileSize(path: string): number {
    try { const f = new File(path, "rb"); try { f.seek(0, File.SEEK_END); return f.tell(); } finally { f.close(); } }
    catch (_) { return -1; }
  }
  function fileExists(path: string): boolean {
    try {
      return Boolean((Il2Cpp.corlib.class("System.IO.File").method("Exists") as any)
        .invoke(Il2Cpp.string(path)));
    } catch (_) { return false; }
  }

  function makeDirectory(path: string) {
    try {
      (Il2Cpp.corlib.class("System.IO.Directory").method("CreateDirectory") as any)
        .invoke(Il2Cpp.string(path));
    } catch (e) { log(`payload: cannot create ${path}: ${e}`); }
  }

  function readString(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let text = "";
    for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
    return text;
  }

  function readUInt64(view: DataView): number {
    const low = view.getUint32(0, true);
    const high = view.getUint32(4, true);
    return low + high * 4294967296;
  }


  // ---------------------------------------------------------------------
  // Auto login: the Linux rebuild of the client remembers the credentials of
  // the last successful sign-in (SparkleServices.LoginCredentials) so the
  // login window does not have to be filled in on every start. The same is
  // done here: the credentials are kept in a small file in the app's data
  // directory and used on the next start. A repeated login screen is not
  // sufficient evidence to delete these credentials.
  // ---------------------------------------------------------------------
  const LOGIN_FILE = "tesl-login.json";
  // When the remembered login was last used. A login screen right after it
  // means the server refused it; one much later (a reconnect after the phone
  // slept, report 121) is a new session and may log in again.
  let autoLoginAt = 0;
  const autoLoginRecent = () => Date.now() - autoLoginAt < 60000;

  function readSavedLogin(): { username: string; password: string } | null {
    const parse = (text: string) => {
      try {
        const json = text ? JSON.parse(text) : null;
        return json && json.username ? { username: String(json.username), password: String(json.password ?? "") } : null;
      } catch (e) { return null; }
    };
    const saved = parse(readTextFile(`${privateDir()}/${LOGIN_FILE}`));
    if (saved) return saved;
    // Patches before 280 kept it on /sdcard, readable over USB: moved once,
    // and the old file is removed only after the new one is written.
    const legacy = `${persistentPath()}/${LOGIN_FILE}`, old = parse(readTextFile(legacy));
    if (old && writeSavedLogin(old.username, old.password) && deleteFile(legacy)) log("login: saved login moved to private storage");
    return old;
  }

  function writeSavedLogin(username: string, password: string): boolean {
    if (!username) return false;
    const path = `${privateDir()}/${LOGIN_FILE}`;
    if (!writeTextFile(path + ".part", JSON.stringify({ username, password }))) {
      log("login: credential write failed"); return false;
    }
    if (atomicRename(path + ".part", path)) { log("login: saved username and credential state"); return true; }
    log("login: could not commit saved credentials; previous file retained");
    return false;
  }

  // The form can appear later than the login callback (after Log Out it
  // came up empty): it is retried until a username field is active, 10 s
  // at most.
  function prefillLoginUsername(username: string) {
    if (!username) return;
    const until = Date.now() + 10000;
    const attempt = () => {
      let found = false;
      for (const typeName of ["UnityEngine.UI.InputField", "TMPro.TMP_InputField"]) try {
        const fields = ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type")
          .invoke(ucls(typeName).type.object);
        for (let i = 0; i < fields.length; i++) {
          const field = fields.get(i), go = call(field, "get_gameObject");
          if (!Boolean(call(go, "get_activeInHierarchy"))) continue;
          const name = String(call(go, "get_name")?.content || "");
          if (!/user[_ ]?name|account[_ ]?name|email/i.test(name)) continue;
          found = true;
          if (!String(call(field, "get_text")?.content || "")) { call(field, "set_text", Il2Cpp.string(username)); log("login: username filled in from the saved login"); }
        }
      } catch (_) {}
      if (!found && Date.now() < until) schedule(400, attempt, "login username prefill");
    };
    schedule(0, attempt, "login username prefill");
  }

  // Password managers fill only fields that Android knows are a username or a
  // password. The game types into Unity's own text dialog, which says
  // neither; when the login form opens its keyboard, the field kind is
  // written here for the setup code, which marks that dialog's text box.
  section("login autofill hint", () => {
    const klass = ucls("UnityEngine.UI.InputField");
    const method = klass.tryMethod("ActivateInputFieldInternal", 0);
    if (!method || method.virtualAddress.isNull()) throw Error("InputField.ActivateInputFieldInternal not found");
    const file = `${persistentPath()}/tesl-reborn-autofill.json`;
    let logged = false;
    // Unity's text dialog shows one field at a time; the setup code adds a
    // hidden box of the other kind so a password manager fills both. What it
    // filled there (tesl-reborn-autofill-fill.json) goes into the other field
    // of the login form, and the file is cleared at once.
    // New APKs write it to private storage; older ones next to the game data.
    const fillFiles = [`${privateDir()}/tesl-reborn-autofill-fill.json`, `${persistentPath()}/tesl-reborn-autofill-fill.json`];
    let watchUntil = 0;
    const watchCompanion = () => {
      const running = Date.now() < watchUntil;
      watchUntil = Date.now() + 60000;
      if (running) return;
      const tick = () => {
        if (Date.now() > watchUntil) return;
        try {
          let fill = null;
          for (const fillFile of fillFiles) {
            const text = readTextFile(fillFile);
            if (!text || text === "{}") continue;
            deleteFile(fillFile);
            try { fill = JSON.parse(text); } catch (_) {}
            if (fill) break;
          }
          if (fill && fill.value && Math.abs(Date.now() - Number(fill.at)) < 60000) {
            const forms = ucls("UnityEngine.Resources").method("FindObjectsOfTypeAll").overload("System.Type").invoke(cls(img, "LoginWin").type.object);
            for (let i = 0; i < forms.length; i++) {
              const form = forms.get(i);
              if (!unityAlive(form) || !call(call(form, "get_gameObject"), "get_activeInHierarchy")) continue;
              const input = form.field(fill.field === "password" ? "_pwdInput" : "_unameInput").value;
              if (unityAlive(input)) { call(input, "set_text", Il2Cpp.string(String(fill.value))); log(`login autofill: filled the ${fill.field === "password" ? "password" : "username"} field too`); }
              break;
            }
          }
        } catch (error) { log(`login autofill: companion fill failed: ${error}`); }
        schedule(300, tick, "login autofill fill");
      };
      schedule(300, tick, "login autofill fill");
    };
    hookAttach(method.virtualAddress, {
      onEnter(args) {
        try {
          const field = new Il2Cpp.Object(args[0]);
          const name = String(call(call(field, "get_gameObject"), "get_name")?.content || "");
          let kind = "";
          if (/pass(word)?|pwd/i.test(name) || enumVal(call(field, "get_inputType")) === 2) kind = "password";
          else if (/user[_ ]?name|account[_ ]?name|email|login/i.test(name)) kind = "username";
          writeTextFile(file, JSON.stringify({ field: kind, at: Date.now() }));
          if (kind && !logged) { logged = true; log(`login autofill: ${kind} field ${name} opened the keyboard`); }
          if (kind) watchCompanion();
        } catch (error) { log(`login autofill: ${error}`); }
      }
    });
  });

  // Log Out from the options menu went straight back in: the game showed the
  // login form and auto login filled the remembered password. A logout the
  // player chose (option 19, then the actual logout) forgets the password and
  // keeps the username for the form; a logout the game makes on its own (an
  // account signed in elsewhere) keeps both.
  section("log out forgets the password", () => {
    const LOGOUT_OPTION = 19;
    let chosenAt = 0;
    hookAttach(cls(img, "OptionsController").method("HandleOnOption", 1).virtualAddress, {
      onEnter(args) { if (args[1].toInt32() === LOGOUT_OPTION) chosenAt = Date.now(); }
    });
    hookAttach(cls(img, "SparkleServices.ServicesManager").method("LogOutOfApplication", 0).virtualAddress, {
      onEnter() {
        if (!chosenAt || Date.now() - chosenAt > 120000) { log("logout: by the game; saved login kept"); return; }
        chosenAt = 0;
        const saved = readSavedLogin();
        if (saved?.password) writeSavedLogin(saved.username, "");
        log("logout: chosen by the player; saved password forgotten");
      }
    });
  });

  section("auto login", () => {
    const credentials = cls(img, "SparkleServices.UsernameAndPassword");

    // Hands the remembered credentials to the login callback instead of
    // showing the login window.
    const useRemembered = (callback: any, saved: { username: string; password: string }, failed: () => void) => {
      const retained = new Il2Cpp.Object(callback?.handle ?? callback).ref(false);
      autoLoginAt = Date.now();
      log("auto login as [omitted]");
      schedule(0, () => {
        try {
          const value = credentials.alloc();
          value.field<Il2Cpp.String>("username").value = Il2Cpp.string(saved.username);
          value.field<Il2Cpp.String>("password").value = Il2Cpp.string(saved.password);
          retained.target.method("Invoke").invoke(value.unbox() as any);
        } catch (e) { log(`auto login callback failed: ${e}`); failed(); }
        finally { retained.free(); }
      });
    };

    // The login screen of the mobile client.
    const mobile = cls(img, "LoginHandler").method("OnLogin", 3);
    const mobileOriginal = new NativeFunction(mobile.virtualAddress, "void",
      ["pointer", "pointer", "pointer", "pointer"]);
    mobile.implementation = function (title, description, callback) {
      try {
        const stored = readSavedLogin();
        const saved = autoLoginRecent() || !stored?.password ? null : stored;
        if (!saved) {
          if (autoLoginRecent()) {
            // The server did not accept the remembered credentials.
            // A second login screen can follow a network/session failure, not a credential rejection.
            log("auto login already attempted; keeping saved credentials and showing login");
          }
          mobileOriginal(this.handle, title?.handle ?? title, description?.handle ?? description, callback?.handle ?? callback);
          prefillLoginUsername(stored?.username || "");
          return;
        }
        useRemembered(callback, saved, () => {
          mobileOriginal(this.handle, title?.handle ?? title, description?.handle ?? description, callback?.handle ?? callback);
          prefillLoginUsername(stored?.username || "");
        });
      } catch (e) {
        log(`auto login error: ${e}`);
        const stored = readSavedLogin();
        mobileOriginal(this.handle, title?.handle ?? title, description?.handle ?? description, callback?.handle ?? callback);
          prefillLoginUsername(stored?.username || "");
      }
    };

    // The login screen of the desktop client (a fallback for the other builds).
    const fallback = cls(img, "SparkleServices.DefaultLoginHandler").method("LoginHandler", 3);
    const fallbackOriginal = new NativeFunction(fallback.virtualAddress, "void",
      ["pointer", "pointer", "pointer"]);
    fallback.implementation = function (title, description, callback) {
      try {
        const stored = readSavedLogin();
        const saved = autoLoginRecent() || !stored?.password ? null : stored;
        if (!saved) {
          if (autoLoginRecent()) {
            // A second login screen can follow a network/session failure, not a credential rejection.
            log("auto login already attempted; keeping saved credentials and showing login");
          }
          fallbackOriginal(title?.handle ?? title, description?.handle ?? description, callback?.handle ?? callback);
          prefillLoginUsername(stored?.username || "");
          return;
        }
        useRemembered(callback, saved, () => {
          fallbackOriginal(title?.handle ?? title, description?.handle ?? description, callback?.handle ?? callback);
          prefillLoginUsername(stored?.username || "");
        });
      } catch (e) {
        log(`auto login error: ${e}`);
        const stored = readSavedLogin();
        fallbackOriginal(title?.handle ?? title, description?.handle ?? description, callback?.handle ?? callback);
          prefillLoginUsername(stored?.username || "");
      }
    };
  });

