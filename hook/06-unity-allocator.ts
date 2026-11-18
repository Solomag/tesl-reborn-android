// Report 142 (MEIZU 21, Android 16): every launch died while the lobby
// loaded, right after Unity logged "Using memoryadresses from more that 16GB
// of memory". UnityDefaultAllocator<LowLevelAllocator> remembers each of its
// allocations in a bitmap tree per 4 GB window of addresses (the pointer's
// upper 32 bits), and it has room for five windows (at +0x38, 16 bytes each:
// u32 window, tree root). This phone's malloc hands out pointers in more
// windows than that; Unity then logs the line and uses slot -1, a byte
// counter, as a tree root. The three AllocationPage functions (register,
// unregister, contains; called with the allocator's mutex held) are replaced
// natively. They keep the five slots exactly as Unity does and keep any
// further windows in a side table. The offsets are for this build of
// libunity, checked by their first bytes.
const unityAllocatorWindows = (() => {
  const SIGNATURES: [string, number, string][] = [
    ["add", 0x179b10, "fc6fbaa9fa6701a9f85f02a9f65703a9"],
    ["remove", 0x179dbc, "f85fbca9f65701a9f44f02a9fd7b03a9"],
    ["contains", 0x179a44, "28fc60d3a8020034ea031faa0be00091"],
  ];
  const EXTRA = 1024;
  let stats: NativePointer | null = null;
  function install(): string {
    const unity = Process.findModuleByName("libunity.so");
    if (!unity) return "libunity.so not loaded";
    const hex = (at: NativePointer) => Array.from(new Uint8Array(at.readByteArray(16)!)).map(b => b.toString(16).padStart(2, "0")).join("");
    for (const [name, offset, bytes] of SIGNATURES)
      if (hex(unity.base.add(offset)) !== bytes) return `another libunity build (${name}: ${hex(unity.base.add(offset))})`;
    const libc = Process.getModuleByName("libc.so");
    // stats: [0] side table entries in use, [1] windows dropped (table full),
    // [2] how many of Unity's five slots may take a new window (5; fewer only
    // to test the side table).
    stats = Memory.alloc(16);
    stats.add(8).writeS32(5);
    const extra = Memory.alloc(EXTRA * 24);
    // A bionic pthread mutex (all zeros is PTHREAD_MUTEX_INITIALIZER). Frida's
    // GMutex hung the game here: no frame after ~20 s on the OnePlus.
    const lock = Memory.alloc(64);
    lock.writeByteArray(new Array(64).fill(0));
    const cm = new CModule(`
typedef unsigned int u32;
typedef unsigned long long u64;
typedef struct { u32 key; u32 pad; void ** root; } Slot;
typedef struct { void * owner; u32 key; u32 pad; void ** root; } Extra;
extern Extra extra[${EXTRA}];
extern volatile int stats[4];
extern void * calloc (unsigned long count, unsigned long size);
extern void free (void * p);
extern char lock[64];
extern int pthread_mutex_lock (void * mutex);
extern int pthread_mutex_unlock (void * mutex);
#define COUNT(p, off) (*(u32 *) ((char *) (p) + (off)))
#define BYTES(self) (*(u64 *) ((char *) (self) + 0x30))

static void *** root_of (void * self, u32 key, int create) {
  Slot * s = (Slot *) ((char *) self + 0x38);
  int i, at = -1;
  void *** found = 0;
  if (key == 0) return &s[0].root;
  for (i = 0; i < 5; i++) if (s[i].key == key) at = i;
  if (at >= 0) return &s[at].root;
  if (!create && stats[0] == 0) return 0;
  pthread_mutex_lock (lock);
  for (i = 0; i < stats[0]; i++)
    if (extra[i].owner == self && extra[i].key == key) { found = &extra[i].root; break; }
  if (!found && create) {
    for (i = 0; i < 5 && i < stats[2]; i++)
      if (!s[i].root) { s[i].key = key; found = &s[i].root; break; }
    if (!found)
      for (i = 0; i < stats[0]; i++)
        if (extra[i].owner == self && !extra[i].root) { extra[i].key = key; found = &extra[i].root; break; }
    if (!found && stats[0] < ${EXTRA}) {
      i = stats[0];
      extra[i].owner = self; extra[i].key = key; extra[i].root = 0;
      found = &extra[i].root;
      stats[0] = i + 1;
    }
    if (!found) stats[1]++;
  }
  pthread_mutex_unlock (lock);
  return found;
}

static void * node (void * self, unsigned long size) {
  void * p = calloc (1, size);
  if (p) BYTES (self) += size;
  return p;
}

int page_add (void * self, void * pointer) {
  u64 a = (u64) pointer;
  void *** rp = root_of (self, (u32) (a >> 32), 1);
  void ** r, ** b, ** c; u32 * d;
  u64 i1 = (a >> 25) & 127, i2 = (a >> 18) & 127, i3 = (a >> 13) & 31, i4 = (a >> 9) & 15;
  if (!rp) return 1;
  r = *rp; if (!r) { r = node (self, 0x408); if (!r) return 1; *rp = r; }
  b = r[i1]; if (!b) { b = node (self, 0x408); if (!b) return 1; r[i1] = b; }
  c = b[i2]; if (!c) { c = node (self, 0x108); if (!c) return 1; b[i2] = c; }
  d = c[i3]; if (!d) { d = node (self, 0x88); if (!d) return 1; c[i3] = d; }
  d[i4] |= 1u << ((a >> 4) & 31);
  COUNT (d, 0x40)++; COUNT (c, 0x100)++; COUNT (b, 0x400)++; COUNT (r, 0x400)++;
  return 1;
}

int page_remove (void * self, void * pointer) {
  u64 a = (u64) pointer;
  void *** rp = root_of (self, (u32) (a >> 32), 0);
  void ** r, ** b, ** c; u32 * d;
  u64 i1 = (a >> 25) & 127, i2 = (a >> 18) & 127, i3 = (a >> 13) & 31, i4 = (a >> 9) & 15;
  if (!rp || !(r = *rp) || !(b = r[i1]) || !(c = b[i2]) || !(d = c[i3])) return 1;
  d[i4] &= ~(1u << ((a >> 4) & 31));
  if (--COUNT (d, 0x40) == 0) { BYTES (self) -= 0x88; free (d); c[i3] = 0; }
  if (--COUNT (c, 0x100) == 0) { BYTES (self) -= 0x108; free (c); b[i2] = 0; }
  if (--COUNT (b, 0x400) == 0) { BYTES (self) -= 0x408; free (b); r[i1] = 0; }
  if (--COUNT (r, 0x400) == 0) { BYTES (self) -= 0x408; free (r); *rp = 0; }
  return 1;
}

int page_contains (void * self, void * pointer) {
  u64 a = (u64) pointer;
  void *** rp = root_of (self, (u32) (a >> 32), 0);
  void ** r, ** b, ** c; u32 * d;
  if (!rp || !(r = *rp) || !(b = r[(a >> 25) & 127]) || !(c = b[(a >> 18) & 127]) || !(d = c[(a >> 13) & 31])) return 0;
  return (d[(a >> 9) & 15] >> ((a >> 4) & 31)) & 1;
}
`, { extra, stats, lock, calloc: libc.getExportByName("calloc"), free: libc.getExportByName("free"),
      pthread_mutex_lock: libc.getExportByName("pthread_mutex_lock"), pthread_mutex_unlock: libc.getExportByName("pthread_mutex_unlock") });
    // No Interceptor.replace, so no Frida bookkeeping on every allocation:
    // each function's first instruction becomes one "b" to a
    // veneer next to libunity ("ldr x16, #8; br x16; .quad target"), written
    // in one 4-byte store, so a thread never sees half a patch.
    const veneers = Memory.alloc(Process.pageSize, { near: unity.base.add(0x179a44), maxDistance: 0x7000000 } as any);
    const targets: [number, NativePointer][] = [[0x179b10, cm.page_add], [0x179dbc, cm.page_remove], [0x179a44, cm.page_contains]];
    targets.forEach(([, target], i) => {
      const at = veneers.add(i * 16);
      at.writeU32(0x58000050); at.add(4).writeU32(0xd61f0200); at.add(8).writePointer(target);
    });
    Memory.protect(veneers, Process.pageSize, "r-x");
    for (const [offset] of targets) {
      const distance = veneers.sub(unity.base.add(offset)).toInt32();
      if (Math.abs(distance) > 0x7000000) return `no memory near libunity (${distance})`;
    }
    targets.forEach(([offset], i) => {
      const at = unity.base.add(offset), distance = veneers.add(i * 16).sub(at).toInt32();
      Memory.patchCode(at, 4, code => { code.writeU32((0x14000000 | ((distance >> 2) & 0x3ffffff)) >>> 0); });
    });
    // Memory.alloc'd blocks are freed once nothing in JS refers to them.
    (globalThis as any).__teslUnityAllocatorKeep = [cm, veneers, extra, stats, lock];
    let reported = "0/0";
    setInterval(() => {
      const now = `${stats!.readS32()}/${stats!.add(4).readS32()}`;
      if (now === reported) return;
      reported = now;
      log(`unity allocator: ${stats!.readS32()} address windows beyond Unity's five${stats!.add(4).readS32() ? `, ${stats!.add(4).readS32()} untracked (table full)` : ""}`);
    }, 5000);
    return "";
  }
  return {
    install,
    // The test channel's experiment "allocatorSideTable": new windows skip
    // Unity's own slots, so the side table is used on every phone.
    testSideTable() { if (stats) { stats.add(8).writeS32(0); log("unity allocator: new windows go to the side table (experiment)"); } },
  };
})();
