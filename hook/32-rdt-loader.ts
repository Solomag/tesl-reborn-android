  // BEGIN android-ui: rdt-channel
  // Reborn Deck Tracker (RDT) is a separate module, released from its own
  // repository (Solomag/RDT-Android). The port only fetches, checks and runs
  // it; the contract is E:\RDT-Android\docs\loader-contract.md.
  const RDT = {
    manifestUrl: "https://raw.githubusercontent.com/Solomag/RDT-Android/main/release/manifest.json",
    // The public half of the RDT release key (tools/keygen.mjs in
    // RDT-Android); the private half is the RDT_SIGNING_KEY Actions secret.
    publicKey: "8e8414717e295a6fdafbe517c40cbea6d2b1fc73ed0bd910927e8edfa7d74700",
    marker: "// RDT-ANDROID-MODULE v1",
    maxBytes: 4 * 1024 * 1024,
  };
  function rdtHex(text) {
    if (typeof text !== "string" || text.length % 2 || /[^0-9a-f]/i.test(text)) return null;
    const bytes = new Uint8Array(text.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(text.substr(i * 2, 2), 16);
    return bytes;
  }
  function rdtUtf8(text) {
    const bytes = [];
    for (const ch of String(text)) {
      const c = ch.codePointAt(0);
      if (c < 0x80) bytes.push(c);
      else if (c < 0x800) bytes.push(0xc0 | c >> 6, 0x80 | c & 63);
      else if (c < 0x10000) bytes.push(0xe0 | c >> 12, 0x80 | c >> 6 & 63, 0x80 | c & 63);
      else bytes.push(0xf0 | c >> 18, 0x80 | c >> 12 & 63, 0x80 | c >> 6 & 63, 0x80 | c & 63);
    }
    return new Uint8Array(bytes);
  }
  // The manifest, in the contract's order: signature, no downgrade, core
  // version. Returns why it is refused, or "" when it may be downloaded.
  function rdtCheckManifest(manifest, publicKey, cachedRevision, coreRevision, verify) {
    if (!manifest || typeof manifest !== "object") return "manifest is not an object";
    const { revision, minCore, bytes, sha256, sig, url } = manifest;
    if (!Number.isSafeInteger(revision) || revision < 1) return "bad revision";
    if (typeof sha256 !== "string" || !/^[0-9a-f]{64}$/.test(sha256)) return "bad sha256";
    const key = rdtHex(publicKey), signature = rdtHex(sig);
    if (!key || key.length !== 32) return "no release key";
    if (!signature || signature.length !== 64) return "bad signature";
    let valid = false;
    try { valid = verify(rdtUtf8(`${sha256}:${revision}`), signature, key); } catch (_) {}
    if (!valid) return "signature does not match";
    if (revision < cachedRevision) return `revision ${revision} is older than the cached ${cachedRevision}`;
    if (!Number.isSafeInteger(minCore) || minCore > coreRevision) return `needs core ${minCore}, this is ${coreRevision}`;
    if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > RDT.maxBytes) return "bad size";
    if (typeof url !== "string" || !url.startsWith("https://")) return "url is not HTTPS";
    return "";
  }
  // The downloaded payload against the signed manifest.
  function rdtCheckPayload(data, manifest, sha256) {
    if (!data || data.byteLength !== manifest.bytes) return `size ${data ? data.byteLength : 0} instead of ${manifest.bytes}`;
    if (sha256(data) !== manifest.sha256) return "sha256 does not match";
    const head = new Uint8Array(data, 0, Math.min(data.byteLength, RDT.marker.length));
    if (String.fromCharCode(...head) !== RDT.marker) return "not an RDT module";
    return "";
  }
// END android-ui: rdt-channel

  // BEGIN android-ui: rdt-loader
  // Off unless tesl-reborn-rdt.json says {"enabled": true}; off means
  // nothing is downloaded or run. A change applies on the next start.
  section("rdt module loader", () => {
    const optionFile = `${persistentPath()}/tesl-reborn-rdt.json`;
    let enabled = false;
    try { enabled = JSON.parse(readTextFile(optionFile) || "{}")?.enabled === true; } catch (_) {}
    if (!enabled) return;
    const dir = `${privateDir()}/rdt`, cacheFile = `${dir}/rdt.js`, stateFile = `${dir}/state.json`, settingsFile = `${dir}/settings.json`;
    makeDirectory(dir);
    const readJson = path => { try { return JSON.parse(readTextFile(path) || "{}") || {}; } catch (_) { return {}; } };
    const coreRevision = Number(globalThis.TeslRebornUpdater?.current()?.revision) || 0;
    let ran = false;

    const settings = readJson(settingsFile);
    globalThis.teslPort = {
      version: `${APK_LEVEL}.${coreRevision}`,
      core: coreRevision,
      log: message => log(`rdt: ${message}`),
      dataDir: dir,
      settings: {
        get: key => settings[key],
        set: (key, value) => {
          if (!String(key).startsWith("rdt.")) throw Error("RDT settings keys start with rdt.");
          settings[key] = value;
          writeTextFile(settingsFile, JSON.stringify(settings));
        },
      },
      // Runs fn on the Unity main thread, on a later frame.
      frameGate: (name, fn) => schedule(0, () => { try { fn(); } catch (error) { log(`rdt: ${name} failed: ${error}`); } }, `rdt ${name}`),
      httpGetBytes: url => new Promise((resolve, reject) =>
        httpGetBytes(url, (status, bytes) => bytes ? resolve(new Uint8Array(bytes)) : reject(Error(`HTTP ${status}`)))),
      hookAttach, cls, ucls, call, img,
      ui: { uiNew, uiAdd, uiRect, uiPlace, uiStretch, uiText, uiButton, uiLabeledButton },
    };

    function run(code, origin) {
      if (ran) return;
      ran = true;
      try {
        Script.evaluate("/rdt/rdt.js", code);
        log(`rdt: module started (${origin})`);
      } catch (error) { log(`rdt: module failed (${origin}): ${error?.stack || error}`); }
    }

    // Development: an rdt.js in the update inbox runs instead of the
    // channel copy, unsigned, only where local updates are allowed.
    const updater = readJson(`${persistentPath()}/tesl-reborn-updater.json`);
    const inbox = `${persistentPath()}/tesl-reborn-inbox/rdt.js`;
    if (updater.allowLocalUpdates === true) {
      const code = readTextFile(inbox);
      if (code) {
        if (code.startsWith(RDT.marker)) run(code, "inbox"); else log("rdt: inbox rdt.js has no module marker");
      }
    }
    const state = readJson(stateFile);
    const cached = readTextFile(cacheFile);
    if (!ran && cached && state.sha256 && Checksum.compute("sha256", cached) === state.sha256) run(cached, `cached revision ${state.revision}`);
    else if (!ran && cached) log("rdt: cached module does not match its record; not run");

    // Once per start: a newer release is saved for the next one (or run
    // now when nothing has run yet).
    if (!RDT.publicKey) { log("rdt: no release key pinned yet; channel skipped"); return; }
    httpGet(RDT.manifestUrl, false, (status, body) => {
      if (status !== 200) { log(`rdt: manifest HTTP ${status}`); return; }
      setTimeout(() => {
        let manifest = null;
        try { manifest = JSON.parse(body); } catch (_) {}
        const cachedRevision = cached && state.sha256 ? Number(state.revision) || 0 : 0;
        const refused = rdtCheckManifest(manifest, RDT.publicKey, cachedRevision, coreRevision, tweetnaclVerify);
        if (refused) { log(`rdt: manifest refused: ${refused}`); return; }
        if (manifest.revision === cachedRevision && manifest.sha256 === state.sha256) { log(`rdt: revision ${cachedRevision} is current`); return; }
        httpGetBytes(manifest.url, (code, bytes) => {
          if (!bytes) { log(`rdt: download HTTP ${code}`); return; }
          setTimeout(() => {
            const problem = rdtCheckPayload(bytes, manifest, data => Checksum.compute("sha256", data));
            if (problem) { log(`rdt: payload refused: ${problem}`); return; }
            const part = `${cacheFile}.part`, out = new File(part, "wb");
            try { out.write(bytes); out.flush(); } finally { out.close(); }
            if (!atomicRename(part, cacheFile)) { log("rdt: could not save the module"); return; }
            writeTextFile(stateFile, JSON.stringify({ revision: manifest.revision, sha256: manifest.sha256, at: new Date().toISOString() }));
            log(`rdt: revision ${manifest.revision} saved`);
            if (!ran) schedule(0, () => run(readTextFile(cacheFile), `revision ${manifest.revision}`), "rdt start");
          }, 0);
        });
      }, 0);
    });
  });
// END android-ui: rdt-loader
