// Hook cost: a lower render resolution gave no more FPS (report 45), so the
// limit may be the main thread, and the hook's own per-frame callbacks run
// there. hookAttach times every callback under the section that attached it;
// every 15 s the costliest are logged as "hook cost: ...". Patch 104 replaced
// Interceptor.attach itself, which this Frida does not allow: the hook failed
// before its first log line and was rolled back. Nothing here may throw.
let currentSection = "startup";
// Report 10: the Pixel 8 Pro ran the hook 4-13x slower with MTE off. Every 15 s
// say where the process may run, which core this thread is on, the core clocks
// and the hottest sensors, to tell small cores, low clocks and heat apart.
// Report 116 (Samsung S24+): the game stood for 174 s right as the thread
// report ran. Frida's Process.enumerateThreads() queries every thread; the
// game's thread ids are now listed from /proc/self/task with readdir.
const listThreadIds = (() => {
  try {
    const libc = Process.getModuleByName("libc.so");
    const opendir = new NativeFunction(libc.getExportByName("opendir"), "pointer", ["pointer"]);
    const readdir = new NativeFunction(libc.getExportByName("readdir"), "pointer", ["pointer"]);
    const closedir = new NativeFunction(libc.getExportByName("closedir"), "int", ["pointer"]);
    const path = Memory.allocUtf8String("/proc/self/task");
    return (): number[] => {
      const ids = [], dir = opendir(path);
      if (dir.isNull()) return ids;
      try {
        // struct dirent (bionic, 64-bit): d_ino 8, d_off 8, d_reclen 2, d_type 1, d_name @19
        for (let entry = readdir(dir); !entry.isNull(); entry = readdir(dir)) {
          const id = Number(entry.add(19).readCString());
          if (id > 0) ids.push(id);
        }
      } finally { closedir(dir); }
      return ids;
    };
  } catch (_) { return (): number[] => []; }
})();
const threadTicks = new Map<number, number>();
// The core of the game's main thread, read there; the rest of the report
// (some 130 sysfs files) is read on Frida's own thread.
let cpuReportMainCpu = -1;
let schedGetCpu: any = null;
let gpuModel = "";
let waitThreads: any[] | null = null;
let threadTicksAt = 0;
const cpuReport = (() => {
  try {
    const getCpu = new NativeFunction(Process.getModuleByName("libc.so").getExportByName("sched_getcpu"), "int", []);
    const read = (path: string) => { try { return String((File as any).readAllText(path)).trim(); } catch (_) { return ""; } };
    return () => {
      const allowed = (read("/proc/self/status").match(/Cpus_allowed_list:\s*(\S+)/) || [])[1] || "?";
      const clocks = [];
      for (let cpu = 0; cpu < 16; cpu++) {
        const base = `/sys/devices/system/cpu/cpu${cpu}/cpufreq/`, current = Number(read(base + "scaling_cur_freq"));
        if (!current) continue;
        const max = Number(read(base + "cpuinfo_max_freq"));
        clocks.push(`${cpu}:${(current / 1e6).toFixed(2)}/${(max / 1e6).toFixed(2)}`);
      }
      const heat = [];
      for (let zone = 0; zone < 48; zone++) {
        const temp = Number(read(`/sys/class/thermal/thermal_zone${zone}/temp`));
        if (temp > 1000) heat.push({ name: read(`/sys/class/thermal/thermal_zone${zone}/type`) || `zone${zone}`, c: temp / 1000 });
      }
      heat.sort((a, b) => b.c - a.c);
      log(`cpu: allowed ${allowed}, main thread on ${cpuReportMainCpu}, report thread on ${getCpu()}; GHz ${clocks.join(" ") || "unreadable"}; ` +
        `heat ${heat.slice(0, 3).map(h => `${h.name} ${h.c.toFixed(0)}C`).join(", ") || "unreadable"}`);
      // Reports 106-110: on the Pixel 8 Pro the main thread waits in battle
      // (40% busy at 20-30 FPS); is the GPU the limit? The kernel's GPU
      // load and clock, where the app may read them (Mali, Adreno).
      try {
        const parts = [];
        const mali = "/sys/class/misc/mali0/device/";
        const utilization = read(mali + "utilization"), cur = read(mali + "cur_freq"), max = read(mali + "max_freq");
        if (utilization) parts.push(`load ${utilization}%`);
        if (cur) parts.push(`clock ${Math.round(Number(cur) / 1000)}/${Math.round(Number(max) / 1000) || "?"} MHz`);
        const adreno = read("/sys/class/kgsl/kgsl-3d0/gpu_busy_percentage") || read("/sys/kernel/gpu/gpu_busy");
        if (adreno) parts.push(`load ${adreno.replace(/\s+/g, " ")}`);
        const adrenoClock = read("/sys/class/kgsl/kgsl-3d0/gpuclk") || read("/sys/kernel/gpu/gpu_clock");
        if (adrenoClock) parts.push(`clock ${Math.round(Number(adrenoClock) / (Number(adrenoClock) > 1e6 ? 1e6 : 1))} MHz`);
        if (!gpuModel) gpuModel = read(mali + "gpuinfo") || read("/sys/class/kgsl/kgsl-3d0/gpu_model") || "-";
        log(`gpu: ${parts.join(", ") || "load and clock unreadable"}${gpuModel !== "-" ? `; ${gpuModel}` : ""}`);
      } catch (_) {}
      // Report 112 (Pixel 8 Pro): hints accepted, the GPU still at 150 MHz,
      // every thread under half busy: what do the main and graphics threads
      // wait on? Twenty samples 25 ms apart of each one's current system
      // call (/proc/self/task/N/syscall: "running", or the call number:
      // futex = another thread, ioctl = a driver such as the GPU's,
      // nanosleep = a deliberate wait, ppoll/epoll = events).
      try {
        if (!waitThreads) {
          waitThreads = [];
          // Report 114: the thread with the process id is Android's UI
          // thread (epoll). Unity's main thread is the busiest of the
          // threads named UnityMain (CPU time from the last threads: line).
          let main = null, most = -1;
          for (const thread of listThreadIds().map(id => ({ id }))) {
            const name = read(`/proc/self/task/${thread.id}/comm`);
            if (name === "UnityMain") {
              const stat = read(`/proc/self/task/${thread.id}/stat`), close = stat.lastIndexOf(")");
              const fields = close < 0 ? [] : stat.slice(close + 2).split(" ");
              const ticks = Number(fields[11]) + Number(fields[12]);
              if (ticks > most) { most = ticks; main = thread.id; }
            } else if (name === "UnityGfxDeviceW") waitThreads.push({ id: thread.id, name: `gfx${waitThreads.length + 1}` });
          }
          if (main !== null) waitThreads.unshift({ id: main, name: "main" });
        }
        const names = { 98: "futex", 29: "ioctl", 101: "nanosleep", 115: "nanosleep", 73: "ppoll", 22: "epoll", 63: "read", 64: "write" };
        const counts = waitThreads.map(() => new Map());
        let samples = 0;
        const timer = setInterval(() => {
          waitThreads.forEach((thread, i) => {
            const raw = read(`/proc/self/task/${thread.id}/syscall`);
            const first = raw.split(" ")[0];
            const key = !raw ? "?" : first === "running" ? "running" : first === "-1" ? "blocked" : (names[Number(first)] || `#${first}`);
            counts[i].set(key, (counts[i].get(key) || 0) + 1);
          });
          if (++samples < 20) return;
          clearInterval(timer);
          log(`waits: ${waitThreads.map((thread, i) => `${thread.name} ${Array.from(counts[i].entries()).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n * 5}%`).join(" ")}`).join("; ")}`);
        }, 25);
      } catch (_) {}
      // Report 31 (Pixel 8 Pro): 10-14 FPS with the main thread on a fast
      // core and the others idle. How busy each game thread is (CPU time
      // since the last line, % of one core) says whether a frame waits on the
      // main thread, the graphics driver thread or something else.
      try {
        const now = Date.now(), totals = new Map();
        for (const thread of listThreadIds().map(id => ({ id }))) {
          const stat = read(`/proc/self/task/${thread.id}/stat`);
          const close = stat.lastIndexOf(")");
          if (close < 0) continue;
          const name = stat.slice(stat.indexOf("(") + 1, close), fields = stat.slice(close + 2).split(" ");
          const ticks = Number(fields[11]) + Number(fields[12]);
          const group = /^Worker Thread/.test(name) ? "workers" : name;
          const last = threadTicks.get(thread.id);
          threadTicks.set(thread.id, ticks);
          if (last !== undefined && ticks >= last) totals.set(group, (totals.get(group) || 0) + ticks - last);
        }
        if (threadTicksAt) {
          const seconds = (now - threadTicksAt) / 1000;
          const top = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6)
            .map(([name, ticks]) => `${name} ${Math.round(ticks / seconds)}%`);
          log(`threads: ${top.join(", ")}`);
        }
        threadTicksAt = now;
      } catch (_) {}
    };
  } catch (_) { return null; }
})();
const hookTimer = (() => {
  if (!verboseLogs) return null;
  try {
    const spent = new Map<string, { us: number; calls: number }>();
    const now = new NativeFunction(Process.getModuleByName("libc.so").getExportByName("clock_gettime"), "int", ["int", "pointer"]);
    const buffer = Memory.alloc(16);
    const micros = () => { now(1, buffer); return buffer.readS64().toNumber() * 1e6 + buffer.add(8).readS64().toNumber() / 1e3; };
    let reportAt = Date.now() + 15000, since = Date.now();
    const record = (name: string, us: number) => {
      const entry = spent.get(name) || { us: 0, calls: 0 };
      entry.us += us; entry.calls++; spent.set(name, entry);
      if (Date.now() < reportAt) return;
      // Report 116: the report ran three times within 30 ms (its own work
      // fired hooks before reportAt moved on). The next time is set first.
      reportAt = Date.now() + 15000;
      const seconds = (Date.now() - since) / 1000;
      const top = Array.from(spent.entries()).sort((a, b) => b[1].us - a[1].us).slice(0, 8)
        .map(([key, value]) => `${key} ${(value.us / seconds / 1000).toFixed(1)} ms/s ${Math.round(value.calls / seconds)}/s`);
      let total = 0; spent.forEach(value => { total += value.us; });
      log(`hook cost: ${(total / seconds / 1000).toFixed(1)} ms/s; ${top.join("; ")}`);
      try { const tasks = (globalThis as any).__teslTaskTime?.(); if (tasks) log(`task time (15 s): ${tasks}`); } catch (_) {}
      if (cpuReport) {
        try { cpuReportMainCpu = (schedGetCpu ??= new NativeFunction(Process.getModuleByName("libc.so").getExportByName("sched_getcpu"), "int", []))() as number; } catch (_) {}
        setTimeout(() => { try { cpuReport(); } catch (_) {} }, 0);
      }
      spent.clear(); since = Date.now(); reportAt = since + 15000;
    };
    micros();
    return (name: string, fn: Function) => function (this: any, ...args: any[]) {
      const start = micros();
      try { return fn.apply(this, args); } finally { try { record(name, micros() - start); } catch (_) {} }
    };
  } catch (_) { return null; }
})();
