  // Deferred work has to run on the Unity main thread, so it is queued here
  // and executed by the services manager's update loop. The work itself is
  // handed to Unity's synchronisation context: calling managed code straight
  // from inside a hook would nest the interceptor callbacks, and Frida cannot
  // run those (the request would then not be rewritten).
  // BEGIN android-ui: frame-bus
  // ServicesManager.Update runs once a frame. Its per-frame work is native
  // (CModule): frame pacing, the frame count and the longest gap between
  // frames. JS is entered only when something is due: a scheduled task,
  // a touch on the screen (and the frame after it ends), or the leave
  // callbacks, four times a second (their own throttles were 250 ms or more). Before, a dozen JS callbacks ran on
  // every frame whether they had work or not.
  const frameBus = (() => {
    const update = cls(img, "SparkleServices.ServicesManager").method("Update", 0).virtualAddress;
    // double nextDue @0, double nextLeave @8, int64 frameUs @16, u32 frames @24,
    // u32 maxGap @28, int64 lastUs @32, int64 nextFrameUs @40, int prevTouch @48,
    // int hasTouch @52, int touchListeners @56
    const state = Memory.alloc(96);
    state.writeDouble(Infinity); state.add(8).writeDouble(0);
    const due = [], touch = [], leave = [];
    const run = (list) => { for (let i = 0; i < list.length; i++) { try { list[i](); } catch (_) { /* one failing callback does not stop the others */ } } };
    const dispatch = (flags: number) => {
      if (flags & 1) run(due);
      if (flags & 2) run(touch);
      if (flags & 4) { state.add(8).writeDouble(Date.now() + 250); run(leave); }
    };
    const wake = new NativeCallback(dispatch, "void", ["int"]);
    let touchCount = NULL;
    try {
      const resolve = new NativeFunction(Il2Cpp.module.getExportByName("il2cpp_resolve_icall"), "pointer", ["pointer"]);
      for (const name of ["UnityEngine.Input::get_touchCount()", "UnityEngine.Input::get_touchCount"]) {
        const at = resolve(Memory.allocUtf8String(name)); if (!at.isNull()) { touchCount = at; break; }
      }
    } catch (_) {}
    const noTouch = new NativeCallback(() => 0, "int", []);
    state.add(52).writeS32(touchCount.isNull() ? 0 : 1);
    const libc = Process.getModuleByName("libc.so");
    let cm = null, adpfTarget = null, lastFrameUs = NaN;
    try { cm = new CModule(`
#include <gum/guminterceptor.h>
typedef struct { long s; long ns; } ts_t;
typedef struct { double next_due; double next_leave; long long frame_us; unsigned frames; unsigned max_gap;
  long long last_us; long long next_frame_us; int prev_touch; int has_touch; int touch_listeners; int pad;
  void * session; int (* report) (void * session, long long nanos); long long work_start_us; } State;
extern int clock_gettime (int clock, ts_t * t);
extern int usleep (unsigned us);
extern void wake (int flags);
extern int touch_count (void);
extern State state;
/* Pacing and gaps on the monotonic clock (a clock change must not skew
   them); due times are Date.now() values, so they stay on the wall clock. */
static long long now_us (void) { ts_t t; clock_gettime (1, &t); return (long long) t.s * 1000000LL + t.ns / 1000; }
static long long wall_ms (void) { ts_t t; clock_gettime (0, &t); return (long long) t.s * 1000LL + t.ns / 1000000; }
void onEnter (GumInvocationContext * ic) {
  long long t = now_us ();
  if (state.last_us) { long long g = (t - state.last_us) / 1000; if (g > state.max_gap) state.max_gap = (unsigned) g; }
  state.last_us = t;
  if (state.frame_us > 0) {
    if (state.next_frame_us > t && state.next_frame_us - t <= state.frame_us) usleep ((unsigned) (state.next_frame_us - t));
    long long n = now_us (), next = state.next_frame_us + state.frame_us;
    state.next_frame_us = next > n ? next : n;
  } else state.next_frame_us = 0;
  state.frames++;
  // ADPF: the work this frame took, from the end of the last pacing wait.
  if (state.session && state.report && state.work_start_us) state.report (state.session, (t - state.work_start_us) * 1000LL);
  state.work_start_us = now_us ();
  int flags = 0;
  if ((double) wall_ms () >= state.next_due) flags |= 1;
  if (state.touch_listeners) {
    if (state.has_touch) { int c = touch_count (); if (c > 0 || state.prev_touch) flags |= 2; state.prev_touch = c > 0; }
    else flags |= 2;
  }
  if (flags) wake (flags);
}
void onLeave (GumInvocationContext * ic) {
  if ((double) wall_ms () >= state.next_leave) wake (4);
}
`, { clock_gettime: libc.getExportByName("clock_gettime"), usleep: libc.getExportByName("usleep"), wake, touch_count: touchCount.isNull() ? noTouch : touchCount, state });
      Interceptor.attach(update, cm as any);
      log("frame bus: native");
      // Pixel 8 Pro off-CPU profile: Unity's main thread left its core
      // ~30,000 times a second, mostly inside Semaphore::Signal as it woke a
      // job worker; the woken worker took the core and the main thread waited
      // (12 us median, half of all wall time). Workers at a lower priority
      // (nice +10) wait for a free core instead. Phones with one fastest
      // core first, where this was measured.
      // Report 137 (Pixel 8 Pro): both lists below were made when the frame
      // bus started, before Unity creates its job workers: "0 job workers
      // at nice 10" and hints for 2 threads only. The game's threads are
      // looked at again a few times after start (on Frida's thread), and
      // workers found later get both.
      const threadName = (id: number) => { try { return String((File as any).readAllText(`/proc/self/task/${id}/comm`)).trim(); } catch (_) { return ""; } };
      let niceWorkers: ((id: number) => boolean) | null = null;
      const niced = new Set<number>();
      try {
        let oneFastest = false;
        const max = [];
        for (let cpu = 0; cpu < 16; cpu++) {
          try { max.push(Number(String((File as any).readAllText(`/sys/devices/system/cpu/cpu${cpu}/cpufreq/cpuinfo_max_freq`)).trim()) || 0); } catch (_) {}
        }
        const top = Math.max(...max); oneFastest = top > 0 && max.filter(f => f === top).length === 1;
        if (oneFastest || experiment("workerNice")) {
          const setpriority = new NativeFunction(libc.getExportByName("setpriority"), "int", ["int", "int", "int"]);
          niceWorkers = (id) => setpriority(0, id, 10) === 0;
        }
      } catch (error) { log(`frame bus: worker priority unchanged: ${error}`); }
      // Reports 110-111 (Pixel 8 Pro): in battle the GPU sat at 150-302 of
      // ~890 MHz, the mid cores at 0.40 GHz and every game thread under half
      // busy, at 17-28 FPS. Pixels raise clocks for games that send
      // performance hints (ADPF); Unity 2017 sends none. A hint session for
      // the game's main, graphics and worker threads gets the target frame
      // time and, every frame from the native bus, the time the frame took.
      let hints: ((tids: number[]) => boolean) | null = null;
      const hinted = new Set<number>();
      try {
        const android = Process.getModuleByName("libandroid.so");
        const getManager = new NativeFunction(android.getExportByName("APerformanceHint_getManager"), "pointer", []);
        const createSession = new NativeFunction(android.getExportByName("APerformanceHint_createSession"), "pointer", ["pointer", "pointer", "size_t", "int64"]);
        const updateTarget = new NativeFunction(android.getExportByName("APerformanceHint_updateTargetWorkDuration"), "int", ["pointer", "int64"]);
        const report = android.getExportByName("APerformanceHint_reportActualWorkDuration");
        // Android 14+: a session's threads can be changed in place.
        const setThreadsAt = android.findExportByName("APerformanceHint_setThreads");
        const setThreads = setThreadsAt ? new NativeFunction(setThreadsAt, "int", ["pointer", "pointer", "size_t"]) : null;
        const closeAt = android.findExportByName("APerformanceHint_closeSession");
        const closeSession = closeAt ? new NativeFunction(closeAt, "void", ["pointer"]) : null;
        const manager = getManager();
        let session = ptr(0), targetNs = 16666667;
        if (!manager.isNull()) hints = (tids) => {
          const list = Memory.alloc(4 * tids.length);
          tids.forEach((tid, i) => list.add(4 * i).writeS32(tid));
          if (!session.isNull() && setThreads) return setThreads(session, list, tids.length) === 0;
          const fresh = createSession(manager, list, tids.length, targetNs);
          if (fresh.isNull()) return false;
          const old = session;
          // The frame bus reads the pointer every frame: the new session is
          // in place before the old one is closed.
          session = fresh;
          state.add(64).writePointer(fresh); state.add(72).writePointer(report);
          if (!old.isNull() && closeSession) setTimeout(() => { try { closeSession(old); } catch (_) {} }, 1000);
          return true;
        };
        adpfTarget = (us) => { targetNs = Math.round(us * 1000); return session.isNull() ? 0 : updateTarget(session, targetNs); };
      } catch (error) { log(`frame bus: performance hints unavailable: ${error}`); }
      const tuneThreads = (when: string) => {
        try {
          const game = listThreadIds().map(id => ({ id, name: threadName(id) }));
          const workers = game.filter(t => /^Worker Thread/.test(t.name) && !niced.has(t.id));
          if (niceWorkers && workers.length) {
            let changed = 0;
            for (const t of workers) { niced.add(t.id); if (niceWorkers(t.id)) changed++; }
            log(`frame bus: ${changed} job workers at nice 10 (${when})`);
          }
          // Nine threads are named UnityMain and two UnityGfxDeviceW, but one
          // of each runs the game: the one with the most CPU time. Idle
          // namesakes in the session only blur what it measures.
          const cpuTicks = (id: number) => {
            try {
              const stat = String((File as any).readAllText(`/proc/self/task/${id}/stat`));
              const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
              return Number(fields[11]) + Number(fields[12]);
            } catch (_) { return 0; }
          };
          const busiest = (pattern: RegExp) => game.filter(t => pattern.test(t.name))
            .map(t => ({ id: t.id, ticks: cpuTicks(t.id) })).sort((x, y) => y.ticks - x.ticks)[0];
          const wanted = [busiest(/^UnityMain/), busiest(/^UnityGfxDeviceW/)].filter(t => t && t.ticks > 0).map(t => t!.id)
            .concat(game.filter(t => /^Worker Thread/.test(t.name)).map(t => t.id));
          if (hints && wanted.some(id => !hinted.has(id))) {
            if (hints(wanted)) { wanted.forEach(id => hinted.add(id)); log(`frame bus: performance hints for ${wanted.length} game threads (${when})`); }
            else log(`frame bus: performance hints refused (${when})`);
          }
        } catch (error) { log(`frame bus: thread tuning failed: ${error}`); }
      };
      tuneThreads("start");
      for (const seconds of [5, 15, 45, 120]) setTimeout(() => tuneThreads(`${seconds} s`), seconds * 1000);
    } catch (error) {
      // The same work in JS, as before the bus: one listener instead of a dozen.
      log(`frame bus: native unavailable, JS fallback: ${error}`);
      const usleep = new NativeFunction(libc.getExportByName("usleep"), "int", ["uint"]);
      const touches = touchCount.isNull() ? null : new NativeFunction(touchCount, "int", []);
      let last = 0, nextFrame = 0, prevTouch = false;
      Interceptor.attach(update, {
        onEnter() {
          const t = Date.now();
          if (last && t - last > state.add(28).readU32()) state.add(28).writeU32(t - last);
          last = t;
          const frameMs = state.add(16).readS64().toNumber() / 1000;
          if (frameMs > 0) {
            if (nextFrame > t && nextFrame - t <= frameMs) usleep(Math.round((nextFrame - t) * 1000));
            nextFrame = Math.max(nextFrame + frameMs, Date.now());
          } else nextFrame = 0;
          state.add(24).writeU32((state.add(24).readU32() + 1) >>> 0);
          let flags = 0;
          if (t >= state.readDouble()) flags |= 1;
          if (touch.length) { const c = touches ? touches() : 1; if (c > 0 || prevTouch) flags |= 2; prevTouch = c > 0; }
          if (flags) dispatch(flags);
        },
        onLeave() { if (Date.now() >= state.add(8).readDouble()) dispatch(4); },
      });
    }
    (globalThis as any).__teslFrameBusKeep = [cm, wake, noTouch];
    const timed = (fn) => hookTimer ? hookTimer(currentSection, fn) : fn;
    return {
      update,
      onDue(fn) { due.push(timed(fn)); },
      setDue(at: number) { state.writeDouble(at); },
      onTouch(fn) { touch.push(reportingFailures(currentSection, timed(fn))); state.add(56).writeS32(touch.length); return { detach() {} }; },
      onLeave(fn) { const call = reportingFailures(currentSection, timed(fn)); leave.push(call); return { detach() { const i = leave.indexOf(call); if (i >= 0) leave.splice(i, 1); } }; },
      frames: () => state.add(24).readU32(),
      takeMaxGap() { const gap = state.add(28).readU32(); state.add(28).writeU32(0); return gap; },
      setFrameUs(us: number) {
        const rounded = Math.round(us);
        // Called every 250 ms; the hint session only hears of a change.
        if (rounded === lastFrameUs) return;
        lastFrameUs = rounded;
        state.add(16).writeS64(rounded);
        try { adpfTarget?.(us > 0 ? us : 1e6 / 120); } catch (_) {}
      },
    };
  })();
  frameLeaves = frameBus; (globalThis as any).__teslFrameBus = frameBus;
  // END android-ui: frame-bus
  const pending: { at: number; fn: () => void; tag?: string }[] = [];
  const taskTime = new Map<string, { ms: number; runs: number }>();
  (globalThis as any).__teslTaskTime = () => {
    const top = Array.from(taskTime.entries()).sort((a, b) => b[1].ms - a[1].ms).slice(0, 6)
      .map(([tag, e]) => `${tag} ${e.ms} ms/${e.runs}`);
    taskTime.clear();
    return top.join("; ");
  };
  // Recurring ticks keep the queue non-empty: every frame only the earliest
  // due time is compared, the queue is scanned when something is due.
  let nextDue = Infinity;
  function schedule(delayMs: number, fn: () => void, tag?: string) {
    // Report 81: three 100 ms ticks (title colours, chat sizes, previews)
    // each fell due on their own frame, so a managed dispatch ran 30 times a
    // second. Longer delays land on a 50 ms grid and share one dispatch.
    const at = delayMs >= 100 ? Math.ceil((Date.now() + delayMs) / 50) * 50 : Date.now() + delayMs;
    pending.push({ at, fn, tag });
    if (at < nextDue) { nextDue = at; frameBus.setDue(nextDue); }
  }
  function runPending() {
    const now = Date.now();
    if (now < nextDue) return;
    const due = [];
    nextDue = Infinity;
    for (let i = pending.length - 1; i >= 0; i--) {
      if (pending[i].at <= now) due.push(pending.splice(i, 1)[0]);
      else if (pending[i].at < nextDue) nextDue = pending[i].at;
    }
    frameBus.setDue(nextDue);
    if (!due.length) return;
    // Collected from the end so splice keeps the indices; run in the order
    // they were scheduled.
    due.reverse();
    // One dispatch for all due tasks: each Il2Cpp.mainThread.schedule is a
    // managed call of its own.
    try {
      Il2Cpp.mainThread.schedule(() => {
        for (const task of due) {
          const started = Date.now();
          try { task.fn(); } catch (e) { log(`scheduled task failed: ${e}`); }
          // Deferred hook work runs on the main thread, so a slow task is a
          // hitch the player feels. Name it instead of folding it into a
          // faceless stall report, and count it for the stall probe.
          const took = Date.now() - started;
          // Pixel 8 Pro profile: 6% of the main thread was a FindObjectsOfType
          // run from a scheduled task. Time per task tag, reported with the
          // hook cost line.
          const tag = task.tag || "untagged";
          const entry = taskTime.get(tag) || { ms: 0, runs: 0 };
          entry.ms += took; entry.runs++; taskTime.set(tag, entry);
          const probe = (globalThis as any).__teslRebornStallProbe;
          if (probe) probe.tasks++;
          if (took >= 100) log(`scheduled task slow ${took}ms (${task.tag || "untagged"})`);
        }
      });
    } catch (e) { log(`could not schedule a task: ${e}`); }
  }
  section("main thread scheduler", () => {
    frameBus.onDue(runPending);
  });

  // Report 106: the Pixel 8 Pro's main thread spent 86% of a core for about
  // 12 FPS where a Xiaomi spends 65% for 55. Said once per start: whether
  // the process runs with memory tagging (MTE, which Advanced Protection or
  // developer options can turn on and which slows every allocation) and the
  // graphics driver, the two things that set the Pixel 8 apart.
  section("device diagnostics", () => {
    const libc = Process.getModuleByName("libc.so");
    let mte = "unknown";
    try {
      const prctl = new NativeFunction(libc.getExportByName("prctl"), "int", ["int", "ulong", "ulong", "ulong", "ulong"]);
      const getauxval = new NativeFunction(libc.getExportByName("getauxval"), "ulong", ["ulong"]);
      const hardware = (Number(getauxval(26)) & (1 << 18)) !== 0; // AT_HWCAP2, HWCAP2_MTE
      const control = prctl(56, 0, 0, 0, 0); // PR_GET_TAGGED_ADDR_CTRL
      const mode = control < 0 ? "?" : (control & 2) ? "sync" : (control & 4) ? "async" : "off";
      mte = `${hardware ? "supported" : "not supported"}, ${control < 0 ? "control unreadable" : "tagged addresses " + ((control & 1) ? "on" : "off") + ", checks " + mode}`;
    } catch (error) { mte = `unreadable: ${error}`; }
    log(`device: MTE ${mte}`);
    schedule(2000, () => {
      try {
        const info = ucls("UnityEngine.SystemInfo"), read = (name) => { try { return String(info.method(name, 0).invoke()?.content ?? info.method(name, 0).invoke()); } catch (_) { return "?"; } };
        log(`device: GPU ${read("get_graphicsDeviceName")}; ${read("get_graphicsDeviceVersion")}; CPU ${read("get_processorType")} x${read("get_processorCount")}`);
      } catch (error) { log(`device: GPU unreadable: ${error}`); }
    }, "device diagnostics");
  });

  // A gap between two service updates means the main thread was busy or
  // blocked: every hook writes timestamped messages to the port log, so the
  // last message before a reported stall names the code that ran right before
  // it. The probe only observes; long gaps after the app was backgrounded are
  // ignored, and it reports at most once per second. Hitches the player feels
  // in a match are shorter than the loading ones, so 200ms is the floor, and
  // the report carries counters of what the blocked window executed: deferred
  // hook tasks and asset lookups (the trace counts each lookup once even when
  // nested overloads deliver it twice).
  // BEGIN android-ui: stall-probe
  section("main loop stall probe", () => {
    // The frame bus measures the longest gap natively; it is read once a
    // second, with what the hooks counted in that second.
    const probe = (globalThis as any).__teslRebornStallProbe = { loads: 0, tasks: 0 };
    setInterval(() => {
      const gap = (globalThis as any).__teslFrameBus.takeMaxGap();
      const loads = probe.loads, tasks = probe.tasks;
      probe.loads = 0; probe.tasks = 0;
      if (gap >= 200 && gap < 60000)
        log(`main loop stalled ${gap}ms` + ((loads || tasks) ? ` (asset loads ${loads}, tasks ${tasks})` : ""));
    }, 1000);
  });
  // END android-ui: stall-probe

  // Report 128: a minute and a half in the background, the game came back and
  // the log stopped half a second later, until it was restarted by hand. For a
  // minute after a return the timer thread says, every two seconds, how long
  // ago the last frame ran and what the game threads are doing (state, system
  // call, kernel wait). Nothing is logged while frames keep coming, except
  // every tenth second.
  section("resume watch", () => {
    const read = (path: string) => { try { return String((File as any).readAllText(path)).trim(); } catch (_) { return ""; } };
    const describe = (id: number) => {
      const stat = read(`/proc/self/task/${id}/stat`), close = stat.lastIndexOf(")");
      const state = close < 0 ? "?" : stat.slice(close + 2).split(" ")[0];
      return `${state} ${read(`/proc/self/task/${id}/syscall`).split(" ")[0] || "?"} ${read(`/proc/self/task/${id}/wchan`) || "-"}`;
    };
    let timer: any = null;
    if (verboseLogs) (globalThis.__teslOnResume ??= []).push(() => {
      if (timer) clearInterval(timer);
      log("resume watch: started");
      const started = Date.now();
      timer = setInterval(() => {
        try {
          const since = Date.now() - started, gap = Date.now() - (globalThis.__teslLastFrameAt || started);
          if (gap > 1000 || since % 10000 < 2000) {
            const parts = [];
            for (const id of listThreadIds()) {
              const name = read(`/proc/self/task/${id}/comm`);
              if (/^(UnityMain|UnityGfxDeviceW|UnityChoreograp|Thread-|AudioTrack|FMOD)/.test(name) || id === Process.id) parts.push(`${name || id} ${describe(id)}`);
            }
            log(`resume +${Math.round(since / 1000)} s: last frame ${gap} ms ago; ${parts.slice(0, 12).join("; ")}`);
          }
          if (since >= 60000) { clearInterval(timer); timer = null; }
        } catch (error) { log(`resume watch: ${error}`); clearInterval(timer); timer = null; }
      }, 2000);
    });
    // Report 130: back after 23 minutes the game ran one tick and drew no
    // frame again, so the watch above never started. Android keeps
    // oom_score_adj at 0 for the app on screen: on screen with no frame for
    // 12 s is a hang (report 138: one frame after the return, then none;
    // the player gave up after 16 s). The log gets every thread once, and the loading file
    // says "not loaded" for this process, so GestureBridge restarts the game
    // when it is left and opened again. A frame clears the mark. The timer
    // thread writes with Frida's File, not through Unity.
    const loadingFile = `${persistentPath()}/tesl-reborn-loading.json`;
    const mark = (loaded: boolean) => {
      const text = JSON.stringify({ pid: Process.id, loaded, at: Date.now() });
      (File as any).writeAllText(loadingFile + ".tmp", text);
      if (!atomicRename(loadingFile + ".tmp", loadingFile)) (File as any).writeAllText(loadingFile, text);
    };
    // GestureBridge (APK) checks, some seconds after a return, whether a
    // frame ran since: this file says when the last one ran, for this
    // process. Written only while frames come, every two seconds at most.
    const framesFile = `${persistentPath()}/tesl-reborn-frames.json`;
    let framesWritten = 0;
    let hung = false, seenAdj = "";
    setInterval(() => {
      try {
        const adj = read("/proc/self/oom_score_adj"), lastFrame = globalThis.__teslLastFrameAt;
        if (adj !== seenAdj) { seenAdj = adj; if (hung || adj === "0") log(`hang watch: oom_score_adj ${adj}`); }
        if (!lastFrame) return;
        const gap = Date.now() - lastFrame;
        if (lastFrame !== framesWritten && gap < 3000) {
          framesWritten = lastFrame;
          // Read by the setup code on return: renamed over, never half-written.
          (File as any).writeAllText(framesFile + ".tmp", JSON.stringify({ pid: Process.id, lastFrameAt: lastFrame }));
          if (!atomicRename(framesFile + ".tmp", framesFile)) (File as any).writeAllText(framesFile, JSON.stringify({ pid: Process.id, lastFrameAt: lastFrame }));
        }
        if (hung && gap < 5000) {
          hung = false; log("hang watch: frames are back"); mark(true);
        } else if (adj === "0" && gap > 12000) {
          if (!hung) {
            hung = true;
            // listThreadIds, not Process.enumerateThreads: see report 116 above.
            const parts = listThreadIds().map((id) => `${read(`/proc/self/task/${id}/comm`) || id} ${describe(id)}`);
            log(`hang watch: on screen, no frame for ${Math.round(gap / 1000)} s; restart armed; ${parts.join("; ")}`);
          }
          mark(false);
        }
      } catch (error) { log(`hang watch: ${error}`); }
    }, 2000);
  });

  // The inventory refreshes on its own, so the statistics are not pulled
  // more often than necessary.
  let lastDeckStatsFetch = 0;

  function winRate(wins: number, losses: number): number {
    const total = wins + losses;
    return total === 0 ? 0 : Math.round((wins * 100) / total);
  }

  function refreshDeckStats(force = false) {
    const base = endpointUrl(ENDPOINT_INVENTORY);
    if (!base) return;
    const now = Date.now();
    if (!force && now - lastDeckStatsFetch < 5000) return;
    lastDeckStatsFetch = now;
    httpGet(`${base}/fetchDeckStats`, true, (status, body) => {
      if (status !== 200) { log(`fetchDeckStats -> HTTP ${status}`); return; }
      try {
        const json = JSON.parse(body);
        const items = json.items ?? json.data ?? [];
        deckStats.clear();
        for (const it of items) {
          deckStats.set(Number(it.deckId), { wins: Number(it.wins) | 0, losses: Number(it.losses) | 0 });
        }
        log(`deck stats: ${deckStats.size} decks`);
        refreshDeckTileLabels();
      } catch (e) { log(`fetchDeckStats parse error: ${e}`); }
    });
  }

  function refreshMatchEntries() {
    const base = endpointUrl(ENDPOINT_STATS);
    if (!base) return;
    httpGet(`${base}/fetchExtendedData`, true, (status, body) => {
      if (status !== 200) { log(`fetchExtendedData -> HTTP ${status}`); statsFinishedLoading = true; return; }
      try {
        const json = JSON.parse(body);
        const entries = json.entries ?? [];
        matchEntryData = entries.map((e: any) => ({
          playedAt: e.playedAt,
          deckId: Number(e.deckId),
          deckName: String(e.deckName ?? ""),
          deckStats: e.deckStats ? { wins: Number(e.deckStats.wins) | 0, losses: Number(e.deckStats.losses) | 0 } : null,
          opponentDeckName: String(e.opponentDeckName ?? ""),
          opponentDeckStats: e.opponentDeckStats ? { wins: Number(e.opponentDeckStats.wins) | 0, losses: Number(e.opponentDeckStats.losses) | 0 } : null,
        }));
        statsFinishedLoading = true;
        log(`match history: ${matchEntryData.length} entries`);
        refreshHistoryTooltips();
      } catch (e) { log(`fetchExtendedData parse error: ${e}`); statsFinishedLoading = true; }
    });
  }

