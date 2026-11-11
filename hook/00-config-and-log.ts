// @ts-nocheck
// TESL Reborn client hooks for the Android (IL2CPP) build.
// Mirrors the patches of TeslRebornPlugin 1.3.1 (BepInEx/Harmony, Windows):
// the connectivity patches (config redirect, auth bypass, HTTP) plus the
// feature patches (rewards refresh, match history, deck statistics, news,
// custom titles, translations, credits, title banners and player title
// banners).
import "frida-il2cpp-bridge";
declare const console: { log(...a: any[]): void };

const CONFIG_LOCAL = "http://localhost:3000/config.json";
const CONFIG_URL = "https://tesl-reborn.com/config.json";
const PLUGIN_VERSION = "1.3.1-beta";     // sent as X-TeslRebornPlugin-Version (= Plugin.GetVersionString(): version + "-beta"); bump when the plugin updates
// The server expects a Windows/Steam client, so we present as one:
const COMPONENT_TYPE = "win";
const MAJOR_VERSION = "db-630167952";    // hardcoded by the plugin
const CHANGELIST = "317259";             // SourceControlVersion.GetChangelist() on the Windows build
const TAG = "[tesl-hook]";

let androidLogWrite: NativeFunction<number, [number, NativePointer, NativePointer]> | null = null;
try {
  androidLogWrite = new NativeFunction(
    (Process as any).getModuleByName("liblog.so").getExportByName("__android_log_write"),
    "int", ["int", "pointer", "pointer"]);
} catch (e) { console.log(`${TAG} no liblog: ${e}`); }
const tagPtr = Memory.allocUtf8String("tesl-hook");
function redactLog(message) {
  // Handle escaped quotes and unterminated values before limiting log length.
  return String(message)
    .replace(/("(?:password|encryptedAppTicket|token|sessionToken|access_token|refresh_token|authorization|x-session-token)"\s*:\s*")(?:[^"\\]|\\[\s\S])*(?:"|\\?$)/gi, '$1[REDACTED]"')
    .replace(/\b(?:Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/((?:authorization|x-session-token)\s*:\s*)[^\r\n]*/gi, '$1[REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]*){0,2}/g, '[REDACTED-JWT]')
    // Also for logcat, which anyone with adb reads: the account name.
    .replace(/(auto login as )[^\r\n]*/i, '$1[omitted]');
}

let portLog = null;
try { portLog = createNativePortLog(redactLog); } catch (_) {}
const log = (m: string) => {
  m = redactLog(m);
  portLog?.(m);
  console.log(`${TAG} ${m}`);
  try { androidLogWrite?.(4, tagPtr, Memory.allocUtf8String(m.length > 900 ? m.slice(0, 900) + "..." : m)); } catch (_) {}
};
// Detailed diagnostics (per-hook timing, the 15 s CPU/GPU/thread report,
// every request, every asset load, render snapshots, thread dumps after a
// return) cost the main thread time on every frame. They are on for the test
// channel and off for stable; tesl-reborn-verbose-logs.json {"enabled": true
// or false} next to the updater settings overrides that either way.
const verboseLogs = (() => {
  const files = "/sdcard/Android/data/com.bethsoft.theelderscrollslegends/files/";
  const read = (name: string) => { try { return JSON.parse(String((File as any).readAllText(files + name))); } catch (_) { return null; } };
  const forced = read("tesl-reborn-verbose-logs.json");
  if (forced && typeof forced.enabled === "boolean") return forced.enabled;
  return String(read("tesl-reborn-updater.json")?.feedUrl ?? "/updates/test/").includes("/updates/test/");
})();
// The app's private directory (/data/user/<user>/<package>/files), which
// adb, backups and other apps cannot read, unlike persistentPath() on
// /sdcard. Secrets (the saved login) live here.
let privateDirCache = "";
function privateDir(): string {
  if (!privateDirCache) {
    try {
      const uid = new NativeFunction(Process.getModuleByName("libc.so").getExportByName("getuid"), "uint", [])() as number;
      privateDirCache = `/data/user/${Math.floor(uid / 100000)}/com.bethsoft.theelderscrollslegends/files`;
    } catch (_) { privateDirCache = "/data/data/com.bethsoft.theelderscrollslegends/files"; }
  }
  return privateDirCache;
}
let nativeRename = null;
function atomicRename(from: string, to: string): boolean {
  try {
    if (!nativeRename) nativeRename = new NativeFunction(Process.getModuleByName("libc.so").getExportByName("rename"), "int", ["pointer", "pointer"]);
    return nativeRename(Memory.allocUtf8String(from), Memory.allocUtf8String(to)) === 0;
  } catch (_) { return false; }
}

