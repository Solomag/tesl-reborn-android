// A Samsung A25 (Android 16, 25.11.2026) stopped on the "Legends" screen on
// almost every start: the patch's log ended about 0.2 s after it attached,
// at a different line in different patches, and Unity logged nothing more
// either. This watchdog runs on a thread of its own, made in C, that Unity's
// collector does not know and that needs neither the patch's JavaScript nor
// Unity: when the patch has not finished installing 8 s after it attached,
// and again at 24 s, it appends to the patch's own log what every thread of
// the game is waiting for: its state, kernel wait, system call, signal masks,
// where it is (module + offset) and the code addresses found on its stack.
// It only reads /proc and the game's memory (through /proc/self/mem, so a
// bad address is an error, not a crash) and allocates nothing.
// tesl-reborn-experiments.json {"startWatchdogTest": true} keeps it armed on
// a start that does finish, to see the report on a phone that does not hang.
// {"startWatchdogOff": true} turns it off.
const startWatchdog = (() => {
  const files = "/sdcard/Android/data/com.bethsoft.theelderscrollslegends/files/";
  let flags: any = {};
  try { flags = JSON.parse(String((File as any).readAllText(files + "tesl-reborn-experiments.json"))) ?? {}; } catch (_) {}
  const test = flags.startWatchdogTest === true;
  const keep: any[] = [];
  let finish: any = null;
  try {
    if (flags.startWatchdogOff === true) throw Error("off (experiment startWatchdogOff)");
    const libc = Process.getModuleByName("libc.so");
    const uid = new NativeFunction(libc.getExportByName("getuid"), "uint", [])() as number;
    const logPath = Memory.allocUtf8String(`/data/user/${Math.floor(uid / 100000)}/com.bethsoft.theelderscrollslegends/files/tesl-reborn-logs/current.log`);
    const hookTid = Memory.alloc(4);
    hookTid.writeS32(Process.getCurrentThreadId());
    // Everything the C code writes (see Area below), well over its ~650 KB.
    const area = Memory.alloc(1024 * 1024);
    const cm = new CModule(`
typedef unsigned long u64;
typedef long i64;
extern int open (const char * path, int flags, int mode);
extern int close (int fd);
extern i64 read (int fd, void * buf, u64 count);
extern i64 pread64 (int fd, void * buf, u64 count, i64 offset);
extern i64 write (int fd, const void * buf, u64 count);
extern i64 syscall (i64 number, ...);
extern int pthread_create (u64 * thread, void * attr, void * (* start) (void *), void * arg);
extern int usleep (unsigned int usec);
extern void * memset (void * p, int c, u64 n);
extern int clock_gettime (int clock, i64 * ts);
extern char log_path[];
extern int hook_tid[1];

#define O_WRONLY 01
#define O_CREAT 0100
#define O_APPEND 02000
#define O_CLOEXEC 02000000
#define MAX_RANGES 6000
#define NAMES 393216

/* A CModule's own globals are not writable: everything lives in memory the
   script allocates (area, set up in start). */
typedef struct {
  volatile int finished;
  u64 thread;
  u64 range_start[MAX_RANGES], range_end[MAX_RANGES], range_off[MAX_RANGES];
  int range_name[MAX_RANGES];
  int ranges, names_used, out_len, out_fd;
  char names[NAMES];
  char chunk[65536 + 512];
  char out[8192];
  char path[96];
  char file[4096];
  u64 stack[256];
  char dirents[8192];
} Area;
extern Area area[1];
#define finished (area->finished)
#define thread (area->thread)
#define range_start (area->range_start)
#define range_end (area->range_end)
#define range_off (area->range_off)
#define range_name (area->range_name)
#define ranges (area->ranges)
#define names (area->names)
#define names_used (area->names_used)
#define chunk (area->chunk)
#define out (area->out)
#define out_len (area->out_len)
#define out_fd (area->out_fd)
#define path (area->path)
#define file (area->file)
#define stack (area->stack)
#define dirents (area->dirents)

static void flush (void) { if (out_fd >= 0 && out_len > 0) write (out_fd, out, out_len); out_len = 0; }
static void put (const char * s) { while (*s) { if (out_len >= (int) sizeof (out) - 2) flush (); out[out_len++] = *s++; } }
static void put_n (const char * s, int n) { for (int i = 0; i < n && s[i]; i++) { if (out_len >= (int) sizeof (out) - 2) flush (); out[out_len++] = s[i]; } }
static void put_dec (i64 v) { char b[24]; int n = 0; if (v < 0) { put ("-"); v = -v; } do { b[n++] = '0' + v % 10; v /= 10; } while (v); while (n) { char c[2] = { b[--n], 0 }; put (c); } }
static void put_hex (u64 v) { char b[20]; int n = 0; do { int d = v & 15; b[n++] = d < 10 ? '0' + d : 'a' + d - 10; v >>= 4; } while (v); put ("0x"); while (n) { char c[2] = { b[--n], 0 }; put (c); } }
static void put_ch (char ch) { char c[2] = { ch, 0 }; put (c); }

static int is_hex (char c) { return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'); }
static u64 parse_hex (const char * s, const char ** end) {
  u64 v = 0; if (s[0] == '0' && s[1] == 'x') s += 2;
  while (is_hex (*s)) { v = v * 16 + (*s <= '9' ? *s - '0' : *s - 'a' + 10); s++; }
  if (end) *end = s; return v;
}

/* Executable mappings, parsed line by line from /proc/self/maps. */
static void map_line (char * line, int len) {
  const char * p = line; u64 start = parse_hex (p, &p); if (*p != '-') return;
  u64 end = parse_hex (p + 1, &p); if (*p != ' ') return; p++;
  if (p[2] != 'x') return;
  p += 5; u64 off = parse_hex (p, &p);
  /* skip dev and inode */
  while (*p == ' ') p++; while (*p && *p != ' ') p++; while (*p == ' ') p++; while (*p && *p != ' ') p++; while (*p == ' ') p++;
  const char * name = p; const char * slash = 0;
  for (const char * q = name; q < line + len; q++) if (*q == '/') slash = q;
  if (slash) name = slash + 1;
  int name_len = (int) (line + len - name); if (name_len > 80) name_len = 80;
  if (ranges >= MAX_RANGES) return;
  int idx = -1;
  if (ranges > 0) { int last = range_name[ranges - 1]; int same = 1; for (int i = 0; i < name_len; i++) if (names[last + i] != name[i]) { same = 0; break; } if (same && names[last + name_len] == 0) idx = last; }
  if (idx < 0) { if (names_used + name_len + 1 >= NAMES) return; idx = names_used; for (int i = 0; i < name_len; i++) names[names_used++] = name[i]; names[names_used++] = 0; }
  range_start[ranges] = start; range_end[ranges] = end; range_off[ranges] = off; range_name[ranges] = idx; ranges++;
}
static void read_maps (void) {
  ranges = 0; names_used = 0;
  int fd = open ("/proc/self/maps", O_CLOEXEC, 0); if (fd < 0) return;
  int have = 0;
  for (;;) {
    i64 n = read (fd, chunk + have, 65536 - have); if (n <= 0) break; have += (int) n;
    int start = 0;
    for (int i = 0; i < have; i++) if (chunk[i] == '\\n') { chunk[i] = 0; map_line (chunk + start, i - start); start = i + 1; }
    for (int i = start; i < have; i++) chunk[i - start] = chunk[i];
    have -= start; if (have >= 65536) have = 0;
  }
  close (fd);
}
static int find_range (u64 a) {
  int lo = 0, hi = ranges - 1;
  while (lo <= hi) { int mid = (lo + hi) / 2; if (a < range_start[mid]) hi = mid - 1; else if (a >= range_end[mid]) lo = mid + 1; else return mid; }
  return -1;
}
static void put_where (u64 a) {
  int r = find_range (a);
  if (r < 0) { put_hex (a); return; }
  put (names[range_name[r]] ? &names[range_name[r]] : "anon"); put ("+"); put_hex (a - range_start[r] + range_off[r]);
}

static int read_file (const char * p, int max) {
  int fd = open (p, O_CLOEXEC, 0); if (fd < 0) { file[0] = 0; return 0; }
  i64 n = read (fd, file, max - 1); close (fd); if (n < 0) n = 0; file[n] = 0;
  while (n > 0 && (file[n - 1] == '\\n' || file[n - 1] == ' ')) file[--n] = 0;
  return (int) n;
}
static void task_path (const char * tid, const char * leaf) {
  int n = 0; const char * a = "/proc/self/task/";
  while (*a) path[n++] = *a++; while (*tid && n < 60) path[n++] = *tid++; path[n++] = '/';
  while (*leaf && n < 94) path[n++] = *leaf++; path[n] = 0;
}
static void status_field (const char * key) {
  int k = 0; while (key[k]) k++;
  for (char * p = file; *p; ) {
    int match = 1; for (int i = 0; i < k; i++) if (p[i] != key[i]) { match = 0; break; }
    if (match) { p += k; while (*p == ' ' || *p == '\\t') p++; char * e = p; while (*e && *e != '\\n') e++; put (" "); put_n (key, k - 1); put ("="); put_n (p, (int) (e - p)); return; }
    while (*p && *p != '\\n') p++; if (*p) p++;
  }
}

static void dump_thread (const char * tid, int mem) {
  i64 id = 0; for (const char * p = tid; *p; p++) id = id * 10 + (*p - '0');
  put (id == hook_tid[0] ? "start watchdog: *" : "start watchdog:  "); put (tid); put (" ");
  task_path (tid, "comm"); read_file (path, 64); put (file);
  task_path (tid, "stat"); read_file (path, 512);
  { char * close_paren = 0; for (char * p = file; *p; p++) if (*p == ')') close_paren = p; if (close_paren && close_paren[1]) { put (" "); put_ch (close_paren[2]); } }
  task_path (tid, "wchan"); read_file (path, 128); put (" "); put (file[0] ? file : "-");
  task_path (tid, "status"); read_file (path, 4096); status_field ("SigPnd:"); status_field ("SigBlk:");
  task_path (tid, "syscall"); read_file (path, 256);
  /* "nr a1 .. a6 sp pc", "-1 sp pc" or "running" */
  const char * tok[9]; int count = 0;
  for (char * p = file; *p && count < 9; ) { while (*p == ' ') p++; if (!*p) break; tok[count++] = p; while (*p && *p != ' ') p++; if (*p) *p++ = 0; }
  if (count >= 3) {
    put (" sys "); put (tok[0]);
    if (count == 9) { put (" "); put (tok[1]); put (" "); put (tok[2]); }
    u64 sp = parse_hex (tok[count - 2], 0), pc = parse_hex (tok[count - 1], 0);
    put (" pc "); put_where (pc);
    if (mem >= 0 && sp) {
      i64 n = pread64 (mem, stack, sizeof (stack), (i64) sp);
      int shown = 0;
      if (n > 0) for (int i = 0; i < n / 8 && shown < 14; i++) {
        u64 v = stack[i]; if (v < 0x10000 || find_range (v) < 0) continue;
        put (shown ? " " : " | "); put_where (v); shown++;
      }
    }
  } else { put (" "); put (file[0] ? file : "?"); }
  put ("\\n");
}

static void dump (int seconds) {
  out_fd = open (log_path, O_WRONLY | O_CREAT | O_APPEND | O_CLOEXEC, 0600);
  if (out_fd < 0) return;
  i64 ts[2] = { 0, 0 }; clock_gettime (0, ts);
  put ("start watchdog: the patch did not finish installing "); put_dec (seconds); put (" s after it attached (epoch "); put_dec (ts[0]); put ("); threads:\\n");
  flush ();
  read_maps ();
  int mem = open ("/proc/self/mem", O_CLOEXEC, 0);
  int dir = open ("/proc/self/task", O_CLOEXEC, 0);
  if (dir >= 0) {
    for (;;) {
      i64 n = syscall (61, dir, dirents, sizeof (dirents));
      if (n <= 0) break;
      for (i64 at = 0; at < n; ) {
        unsigned short len = *(unsigned short *) (dirents + at + 16);
        if (!len) break;
        const char * name = dirents + at + 19;
        if (name[0] >= '0' && name[0] <= '9') { dump_thread (name, mem); flush (); }
        at += len;
      }
    }
    close (dir);
  }
  if (mem >= 0) close (mem);
  put ("start watchdog: end of threads\\n"); flush ();
  close (out_fd); out_fd = -1;
}

static void * watch (void * arg) {
  for (int tick = 1; tick <= 48 && !finished; tick++) {
    usleep (500000);
    if (finished) break;
    if (tick == 16 || tick == 48) dump (tick / 2);
  }
  return 0;
}

int start (void) { finished = 0; out_len = 0; out_fd = -1; ranges = 0; names_used = 0; return pthread_create (&thread, 0, watch, 0); }
void finish (void) { finished = 1; }
`, { log_path: logPath, hook_tid: hookTid, area,
      open: libc.getExportByName("open"), close: libc.getExportByName("close"), read: libc.getExportByName("read"),
      pread64: libc.getExportByName("pread64"), write: libc.getExportByName("write"), syscall: libc.getExportByName("syscall"),
      pthread_create: libc.getExportByName("pthread_create"), usleep: libc.getExportByName("usleep"),
      clock_gettime: libc.getExportByName("clock_gettime"), memset: libc.getExportByName("memset") });
    // The thread runs this code and memory until it ends, long after the
    // patch's own references are gone: held globally, or the collector
    // unmaps the module and the thread wakes from usleep into freed code
    // (SIGSEGV with pc = fault address, Palace 26.11, 0.3 s after "setup finished").
    keep.push(cm, logPath, hookTid, area);
    (globalThis as any).__teslStartWatchdog = keep;
    const started = new NativeFunction(cm.start, "int", [])() as number;
    if (started !== 0) throw Error(`pthread_create ${started}`);
    finish = new NativeFunction(cm.finish, "void", []);
  } catch (error) { log(`start watchdog unavailable: ${error}`); }
  return {
    keep, test,
    // Called when every section has been installed (hook/99-perform-close.ts).
    done() {
      if (test) { log("start watchdog: kept armed (experiment startWatchdogTest)"); return; }
      try { finish?.(); } catch (_) {}
    },
  };
})();
