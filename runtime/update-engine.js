// TESL Reborn Android loader API 1. No game credentials are used here.
function createRebornUpdater(io, embedded) {
  const LIMIT = 4 * 1024 * 1024;
  const defaults = { enabled: true, feedUrl: embedded.feedUrl || "", allowLocalUpdates: false, safeMode: false };
  const config = Object.assign({}, defaults, io.readJSON("config", 8192) || {});
  let state = io.readJSON("state", 32768);
  if (!state || state.schema !== 1 || !Array.isArray(state.rejected))
    state = { schema: 1, active: null, previous: null, pending: null, booting: null, rejected: [] };
  let selected = embedded.meta;
  let trial = false;
  let busy = false;
  let checked = false;
  let lastStatus = "starting";

  function report(status, detail) {
    lastStatus = status;
    io.log(`updater: ${status}${detail ? " — " + detail : ""}`);
    try {
      io.writeJSON("status", { loaderApi: 1, status, detail: detail || "", current: selected,
        pending: state.pending, previous: state.previous, at: new Date().toISOString() });
    } catch (_) {}
  }
  function save() { io.writeJSON("state", state); }
  function httpsOrigin(url) {
    if (typeof url !== "string" || url.length > 2048) throw Error("Invalid update URL");
    // Deliberately excludes credentials, query strings, fragments and HTTP.
    const match = /^https:\/\/([a-z0-9.-]+)(?::([0-9]{1,5}))?(\/[^\s?#\\]*)?$/i.exec(url);
    if (!match) throw Error("Updates require a public HTTPS URL without credentials/query/fragment");
    return `https://${match[1].toLowerCase()}:${Number(match[2] || 443)}`;
  }
  function validate(meta) {
    if (!meta || meta.schema !== 1 || meta.format !== "tesl-reborn-hook-v1" ||
        meta.loaderApi !== 1 || meta.gameVersionCode !== 11009 || meta.abi !== "arm64-v8a" ||
        !Number.isSafeInteger(meta.revision) || meta.revision < 1 ||
        typeof meta.version !== "string" || !/^[a-z0-9._+-]{1,80}$/i.test(meta.version) ||
        !Number.isSafeInteger(meta.bytes) || meta.bytes < 1 || meta.bytes > LIMIT ||
        typeof meta.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(meta.sha256))
      throw Error("Incompatible or invalid Android release manifest");
    return { schema: 1, format: meta.format, loaderApi: 1, gameVersionCode: 11009,
      abi: "arm64-v8a", revision: meta.revision, version: meta.version,
      bytes: meta.bytes, sha256: meta.sha256 };
  }
  function verify(meta, code) {
    validate(meta);
    if (typeof code !== "string" || io.byteLength(code) !== meta.bytes ||
        io.sha256(code) !== meta.sha256 || !code.startsWith("// TESL-REBORN-ANDROID-CORE v1\n"))
      throw Error("Hook size, SHA-256 or Android format mismatch");
    return code;
  }
  function readCore(meta) {
    const clean = validate(meta);
    if (clean.sha256 === embedded.meta.sha256) return verify(clean, embedded.code);
    return verify(clean, io.readCore(clean.sha256, LIMIT));
  }
  function reject(hash) {
    if (typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash) && !state.rejected.includes(hash))
      state.rejected = state.rejected.concat(hash).slice(-16);
  }
  function floor() {
    return Math.max(embedded.meta.revision, ...[state.active, state.pending].map(m => {
      try { return validate(m).revision; } catch (_) { return 0; }
    }));
  }
  function wanted(meta) {
    const clean = validate(meta);
    return clean.revision > floor() && !state.rejected.includes(clean.sha256);
  }
  function stage(meta, code) {
    const clean = validate(meta);
    if (!wanted(clean)) return false;
    verify(clean, code);
    // Store immutable content first, then atomically publish the state pointer.
    io.writeCore(clean.sha256, code);
    verify(clean, io.readCore(clean.sha256, LIMIT));
    state.pending = clean;
    save();
    report("restart-required", clean.version);
    return true;
  }
  function boot() {
    verify(embedded.meta, embedded.code);
    if (state.booting) {
      reject(state.booting);
      state.pending = null;
      state.booting = null;
      save();
      report("rolled-back", "The trial hook did not finish initialization");
    }
    if (!config.safeMode && config.allowLocalUpdates) {
      try {
        const local = io.readJSON("inboxManifest", 32768);
        if (local && wanted(local)) stage(local, io.readInbox(LIMIT));
      } catch (error) { report("local-update-rejected", String(error)); }
    }
    if (config.safeMode) {
      report("safe-mode", "Using the hook embedded in the APK");
    } else {
      const candidates = [state.pending, state.active, state.previous].filter(Boolean);
      for (const candidate of candidates) {
        try {
          const clean = validate(candidate);
          if (clean.revision < embedded.meta.revision) continue;
          if (state.rejected.includes(clean.sha256)) continue;
          readCore(clean);
          selected = clean;
          // Any fallback to previous is also a trial, committed only by ready().
          trial = !state.active || selected.sha256 !== state.active.sha256;
          break;
        } catch (error) {
          reject(candidate && candidate.sha256);
          if (candidate === state.pending) state.pending = null;
          save();
          report("cached-update-rejected", String(error));
        }
      }
    }
    if (trial) {
      state.booting = selected.sha256;
      save();
    }
    report("loading", `${selected.version} (${trial ? "trial" : "current"})`);
    try {
      io.evaluate(readCore(selected));
    } catch (error) {
      // An exception may follow partial hook installation: never install a
      // second hook in the same process. Recovery occurs on the next launch.
      report("load-failed-restart", String(error));
    }
  }
  function ready() {
    if (trial) {
      const old = state.active || embedded.meta;
      if (old.sha256 !== selected.sha256) state.previous = old;
      state.active = selected;
      if (state.pending && state.pending.sha256 === selected.sha256) state.pending = null;
      state.booting = null;
      save();
      trial = false;
    }
    report("ready", selected.version);
  }
  function check(get) {
    if (checked || busy || config.safeMode || !config.enabled) return;
    checked = true;
    if (!config.feedUrl) { report("no-feed", "HTTPS update channel has not been configured"); return; }
    let origin;
    try { origin = httpsOrigin(config.feedUrl); }
    catch (error) { report("update-error", String(error)); return; }
    busy = true;
    report("checking");
    try {
      get(config.feedUrl, (status, text) => {
        try {
          if (status !== 200 || io.byteLength(text) > 32768) throw Error(`Manifest HTTP ${status} or oversized response`);
          const manifest = JSON.parse(text);
          validate(manifest);
          if (!wanted(manifest)) { busy = false; report("up-to-date"); return; }
          if (httpsOrigin(manifest.url) !== origin) throw Error("Hook and manifest must have the same HTTPS origin");
          get(manifest.url, (codeStatus, code) => {
            try {
              if (codeStatus !== 200) throw Error(`Hook HTTP ${codeStatus}`);
              stage(manifest, code);
            } catch (error) { report("update-error", String(error)); }
            finally { busy = false; }
          });
        } catch (error) { busy = false; report("update-error", String(error)); }
      });
    } catch (error) { busy = false; report("update-error", String(error)); }
  }
  return { boot, ready, check, stage, validate, verify, httpsOrigin,
    current: () => selected, status: () => lastStatus };
}
