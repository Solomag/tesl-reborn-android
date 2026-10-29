"""Check the hook's native patches against the game's own libraries, offline.

Every place where hook.ts reads or rewrites engine code is guarded by the
bytes it expects at a libunity offset. This script finds those guards in
hook.ts, compares them with the game's libunity.so, names the functions with
Unity's symbols matched into that build, and decodes the instructions the
patches write, so a wrong offset or a wrong encoding is caught before a phone
runs it. The game's libraries stay outside Git; pass their paths.

    python tools/verify_native_patches.py --libunity game-libunity.so \
        --syms game-libunity.syms [--libil2cpp game-libil2cpp.so --script script.json]
"""
import argparse
import bisect
import json
import re
import struct
import sys
from pathlib import Path


def load_segments(data):
    phoff, = struct.unpack_from("<Q", data, 0x20)
    phentsize, phnum = struct.unpack_from("<HH", data, 0x36)
    segments = []
    for i in range(phnum):
        p_type, flags, off, vaddr, _, filesz, _, _ = struct.unpack_from("<IIQQQQQQ", data, phoff + i * phentsize)
        if p_type == 1:
            segments.append((vaddr, off, filesz))
    return segments


def file_offset(segments, vaddr):
    for start, off, size in segments:
        if start <= vaddr < start + size:
            return vaddr - start + off
    return None


def build_id(data):
    at = data.find(b"GNU\x00", 0x100)
    return data[at + 4:at + 24].hex() if at >= 0 else "?"


class Symbols:
    def __init__(self, path):
        rows = []
        if path and Path(path).is_file():
            for line in open(path, encoding="utf-8"):
                start, size, name = line.split(" ", 2)
                rows.append((int(start, 16), int(size, 16), name.strip()))
        rows.sort()
        self.rows, self.starts = rows, [r[0] for r in rows]

    def at(self, address):
        i = bisect.bisect_right(self.starts, address) - 1
        if i >= 0 and address < self.rows[i][0] + self.rows[i][1]:
            start, _, name = self.rows[i]
            return name, address - start
        return None, None


def reg(n, wide):
    return ("x" if wide else "w") + str(n) if n != 31 else ("sp" if wide else "wsp")


def decode(word, pc=0):
    """The few A64 forms the patches use; anything else is shown as hex."""
    if word & 0x7C000000 == 0x14000000:
        imm = word & 0x3FFFFFF
        if imm & 0x2000000:
            imm -= 0x4000000
        return ("bl" if word & 0x80000000 else "b") + f" #{pc + imm * 4:#x}"
    if word == 0xD65F03C0:
        return "ret"
    if word & 0x7F800000 == 0x52800000:
        wide = bool(word & 0x80000000)
        return f"mov {reg(word & 31, wide)}, #{(word >> 5) & 0xFFFF:#x}"
    if word & 0xBFC00000 == 0xB9400000:
        wide = bool(word & 0x40000000)
        scale = 8 if wide else 4
        return f"ldr {reg(word & 31, wide)}, [{reg((word >> 5) & 31, True)}, #{((word >> 10) & 0xFFF) * scale:#x}]"
    if word & 0x7FE00C00 == 0x1A800000:
        wide = bool(word & 0x80000000)
        conds = ["eq", "ne", "hs", "lo", "mi", "pl", "vs", "vc", "hi", "ls", "ge", "lt", "gt", "le", "al", "nv"]
        return (f"csel {reg(word & 31, wide)}, {reg((word >> 5) & 31, wide)}, "
                f"{reg((word >> 16) & 31, wide)}, {conds[(word >> 12) & 15]}")
    return f".word {word:#010x}"


def guards(hook_source):
    """(name, offset, expected hex) for every guarded libunity offset. A name
    is reused in several places, so each check is paired with the nearest
    preceding "name = unity.base.add(...)"."""
    assigned = [(m.start(), m.group(1), int(m.group(2), 16))
                for m in re.finditer(r"(\w+) = unity\.base\.add\((0x[0-9a-f]+)\)", hook_source)]
    def offset_of(name, position):
        before = [off for at, n, off in assigned if n == name and at < position]
        return before[-1] if before else None
    found = []
    patterns = [r"hex\((\w+)\) === \"([0-9a-f]+)\"", r"same\((\w+), \"([0-9a-f]+)\"\)", r"(bytes) === \"([0-9a-f]+)\""]
    for pattern in patterns:
        for m in re.finditer(pattern, hook_source):
            name = "at" if m.group(1) == "bytes" else m.group(1)
            off = offset_of(name, m.start())
            if off is not None:
                found.append((name, off, m.group(2)))
    return found


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--hook", default=str(Path(__file__).resolve().parents[1] / "hook.ts"))
    parser.add_argument("--libunity", required=True)
    parser.add_argument("--syms")
    parser.add_argument("--libil2cpp")
    parser.add_argument("--script")
    args = parser.parse_args()

    source = Path(args.hook).read_text(encoding="utf-8")
    unity = Path(args.libunity).read_bytes()
    segments = load_segments(unity)
    syms = Symbols(args.syms)
    problems = []
    print(f"libunity build id {build_id(unity)}")

    seen = set()
    for name, off, expected in guards(source):
        if (off, expected) in seen:
            continue
        seen.add((off, expected))
        at = file_offset(segments, off)
        actual = unity[at:at + len(expected) // 2].hex() if at is not None else ""
        symbol, delta = syms.at(off)
        where = f"{symbol}+{delta:#x}" if symbol else "unnamed"
        ok = actual == expected
        print(f"{'OK  ' if ok else 'FAIL'} {name} {off:#x} ({where}) bytes {'match' if ok else 'differ: ' + actual}")
        if not ok:
            problems.append(f"{off:#x} bytes differ")

    # The physics patch: Simulate's first instruction becomes a branch to
    # SyncTransforms, which must take the same first argument (the manager).
    if "0x28a6e0" in source and "0x28b1f4" in source:
        simulate, sync = 0x28A6E0, 0x28B1F4
        word = (0x14000000 | (((sync - simulate) >> 2) & 0x3FFFFFF))
        text = decode(word, simulate)
        names = (syms.at(simulate)[0], syms.at(sync)[0])
        ok = text == f"b #{sync:#x}" and all(n and n.startswith("_ZN14PhysicsManager") for n in names)
        print(f"{'OK  ' if ok else 'FAIL'} physics: {text} ({names[0]} -> {names[1]})")
        if not ok:
            problems.append("physics branch")

    # The job wake patch: "ldr w8, [x20, #0x20]" (workers) feeds
    # "cmp w8, w24; csel w1, w8, w24, lo", min(workers, jobs), before the
    # semaphore signal; it becomes "mov w8, #2".
    if "0x41f58c" in source:
        at = file_offset(segments, 0x41F58C)
        words = struct.unpack_from("<5I", unity, at)
        listing = [decode(w, 0x41F58C + i * 4) for i, w in enumerate(words)]
        replaced = decode(0x52800048)
        ok = listing[0] == "ldr w8, [x20, #0x20]" and listing[3] == "csel w1, w8, w24, lo" and replaced == "mov w8, #0x2"
        print(f"{'OK  ' if ok else 'FAIL'} job wakes: {listing[0]} -> {replaced}; then {listing[3]}; {listing[4]}")
        if not ok:
            problems.append("job wake patch")

    # Engine calls by offset must start a function.
    for off in (0x185820, 0x18B970, 0x28A6E0, 0x28B1F4):
        if f"{off:#x}" in source:
            symbol, delta = syms.at(off)
            ok = symbol is not None and delta == 0
            print(f"{'OK  ' if ok else 'FAIL'} {off:#x} starts {symbol or 'no named function'}")
            if not ok:
                problems.append(f"{off:#x} not a function start")

    # "return false" written over AssetCatalog.PlatformDownloadsBundles: the
    # address must belong to that method alone (no identical-code folding).
    if args.libil2cpp and args.script and "AssetCatalog.PlatformDownloadsBundles" in source:
        script = json.load(open(args.script, encoding="utf-8"))
        methods = sorted((m["Address"], m["Name"]) for m in script["ScriptMethod"])
        target = [a for a, n in methods if n == "AssetCatalog$$PlatformDownloadsBundles"]
        if target:
            address = target[0]
            sharing = [n for a, n in methods if a == address]
            following = next((a for a, _ in methods if a > address), address + 8)
            il2cpp = Path(args.libil2cpp).read_bytes()
            at = file_offset(load_segments(il2cpp), address)
            first = [decode(w) for w in struct.unpack_from("<2I", il2cpp, at)]
            ok = len(sharing) == 1 and following - address >= 8
            print(f"{'OK  ' if ok else 'FAIL'} AssetCatalog.PlatformDownloadsBundles {address:#x}: "
                  f"{following - address} bytes, shared by {len(sharing)} method(s), starts {first}")
            if not ok:
                problems.append("PlatformDownloadsBundles patch")
        else:
            problems.append("AssetCatalog.PlatformDownloadsBundles not in script.json")

    if problems:
        print("PROBLEMS: " + "; ".join(problems))
        return 1
    print("all native patches match this build")
    return 0


if __name__ == "__main__":
    sys.exit(main())
