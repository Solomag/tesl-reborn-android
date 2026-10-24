// Installed once as lib/arm64-v8a/libhook.js.so. The loader itself is stable.
(() => {
  const embedded = __EMBEDDED_RELEASE__;
  const packageName = "com.bethsoft.theelderscrollslegends";
  const libc = Process.getModuleByName("libc.so");
  const native = (name, result, args) => new NativeFunction(libc.getExportByName(name), result, args);
  const mkdir = native("mkdir", "int", ["pointer", "uint"]);
  const rename = native("rename", "int", ["pointer", "pointer"]);
  const open = native("open", "int", ["pointer", "int"]);
  const fsync = native("fsync", "int", ["int"]);
  const close = native("close", "int", ["int"]);
  const getuid = native("getuid", "uint", []);
  const userId = Math.floor(getuid() / 100000);
  const files = `/data/user/${userId}/${packageName}/files`;
  const root = `${files}/tesl-reborn-updater`;
  const external = `/storage/emulated/${userId}/Android/data/${packageName}/files`;
  const paths = { config: `${external}/tesl-reborn-updater.json`, state: `${root}/state.json`,
    status: `${external}/tesl-reborn-update-status.json`,
    inboxManifest: `${external}/tesl-reborn-inbox/manifest.json` };
  let logWrite = null;
  try { logWrite = new NativeFunction(Process.getModuleByName("liblog.so").getExportByName("__android_log_write"),
    "int", ["int", "pointer", "pointer"]); } catch (_) {}
  const tag = Memory.allocUtf8String("tesl-hook");
  const log = message => {
    console.log(`[tesl-hook] ${message}`);
    try { if (logWrite) logWrite(4, tag, Memory.allocUtf8String(message.slice(0, 900))); } catch (_) {}
  };
  function read(path, limit) {
    const file = new File(path, "rb");
    try {
      file.seek(0, 2);
      if (file.tell() > limit) throw Error("File exceeds size limit");
      file.seek(0, 0);
      return file.readText();
    } finally { file.close(); }
  }
  function write(path, text) {
    const temp = `${path}.tmp`;
    const file = new File(temp, "wb");
    try { file.write(text); file.flush(); } finally { file.close(); }
    const fd = open(Memory.allocUtf8String(temp), 0);
    if (fd < 0) throw Error("Could not reopen update file");
    let syncResult;
    try { syncResult = fsync(fd); } finally { close(fd); }
    if (syncResult !== 0) throw Error("Could not flush update file");
    if (rename(Memory.allocUtf8String(temp), Memory.allocUtf8String(path)) !== 0)
      throw Error("Could not atomically publish update file");
    // Persist the rename as well as the file contents on the private ext4 directory.
    const dirFd = open(Memory.allocUtf8String(path.slice(0, path.lastIndexOf("/"))), 0);
    if (dirFd >= 0) { try { fsync(dirFd); } finally { close(dirFd); } }
  }
  let evaluationStarted = false;
  try {
    mkdir(Memory.allocUtf8String(files), 0o700);
    mkdir(Memory.allocUtf8String(root), 0o700);
    const updater = createRebornUpdater({
      readJSON(key, limit) {
        try { return JSON.parse(read(paths[key], limit)); }
        catch (error) {
          if (key === "state") log("updater: no valid saved state; using embedded defaults");
          return null;
        }
      },
      writeJSON: (key, data) => write(paths[key], JSON.stringify(data)),
      readCore: (hash, limit) => read(`${root}/${hash}.js`, limit),
      writeCore: (hash, code) => write(`${root}/${hash}.js`, code),
      readInbox: limit => read(`${external}/tesl-reborn-inbox/hook.js`, limit),
      sha256: code => Checksum.compute("sha256", code),
      byteLength: text => unescape(encodeURIComponent(text)).length,
      evaluate: code => {
        evaluationStarted = true;
        return Script.evaluate("/tesl-reborn/core.js", `(function(){\n${code}\n})();`);
      },
      log
    }, embedded);
    globalThis.TeslRebornUpdater = updater;
    updater.boot();
  } catch (error) {
    // Storage may be unavailable at early startup. Only this setup failure
    // precedes any hook evaluation, so the embedded core remains safe to load.
    log(`updater: bootstrap error: ${error}`);
    if (!evaluationStarted) {
      globalThis.TeslRebornUpdater = null;
      Script.evaluate("/tesl-reborn/embedded.js", `(function(){\n${embedded.code}\n})();`);
    }
  }
})();
