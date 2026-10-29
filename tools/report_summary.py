"""Summarise a tesl-reborn-report zip: what ran, how it went, what broke.

    python tools/report_summary.py "tesl-reborn-report (98).zip" [--syms game-libunity.syms]

Prints the phone, Builder and patch, then per game start (the "attached"
lines of each log): experiments, engine patches, frame rate per minute,
heat, stalls, failures and known bad signs; and every native crash with its
abort message and top frames (libunity frames named when --syms is given).
The zip is read in memory; nothing is extracted or run.
"""
import argparse
import bisect
import json
import re
import statistics
import sys
import zipfile

SIGNS = [
    (r"setjmp (?:cookie|checksum) mismatch", "abort through a Frida frame (an exception crossed a hook)"),
    (r"cameras: $", "camera probe saw no frames (main thread stuck)"),
    (r"FAIL ", "a hook section failed to install"),
    (r"frame bus: native unavailable", "frame bus fell back to JS"),
    (r"field unknown|layout unknown", "an engine getter could not be read"),
    (r"main loop stalled [0-9]{4,}ms", "main thread blocked for over a second"),
    (r"physics replace failed|job wake patch failed|kept \(another libunity build\)", "a native patch did not apply"),
    (r"Game data tab (?:outside|hidden|shown again)", "Game data tab had to be repaired"),
]


def load_syms(path):
    if not path:
        return None
    rows = sorted((int(a, 16), int(b, 16), n.strip()) for a, b, n in (l.split(" ", 2) for l in open(path, encoding="utf-8")))
    return rows, [r[0] for r in rows]


def name_frame(syms, pc):
    if not syms:
        return ""
    rows, starts = syms
    i = bisect.bisect_right(starts, pc) - 1
    if i >= 0 and pc < rows[i][0] + rows[i][1]:
        return f" {rows[i][2][:70]}+{pc - rows[i][0]:#x}"
    return ""


def sessions(text):
    parts = re.split(r"(?m)^(?=\S+ attached, )", text)
    return [p for p in parts if " attached, " in p.split("\n", 1)[0]]


def summarise_session(log):
    head = log.split("\n", 1)[0]
    stamp = head.split(" ")[0]
    patch = (re.search(r"patch (\d+)", head) or [None, "?"])[1]
    lines = log.splitlines()
    out = [f"  start {stamp} patch {patch}"]
    exp = re.findall(r"experiments on: (.+)", log)
    if exp:
        out.append(f"    experiments: {exp[0]}")
    engine = sorted(set(re.sub(r"^\S+ ", "", l) for l in lines if " engine: " in l and "animators cull" not in l))
    for e in engine[:8]:
        out.append(f"    {e}")
    culled = re.findall(r"engine: (\d+) of (\d+) animators", log)
    if culled:
        out.append(f"    animators culled: {sum(int(a) for a, _ in culled)} over {len(culled)} passes")
    # Frame rate per minute, battle or menu as the governor last said.
    minute, mode, per = None, "menu", {}
    for l in lines:
        m = re.match(r"(\S+) graphics: (battle|menu)[,:]", l)
        if m:
            mode = m.group(2)
        m = re.match(r"(\S+) fps: (\d+)", l)
        if m:
            key = (m.group(1)[11:16], mode)
            per.setdefault(key, []).append(int(m.group(2)))
    if per:
        row = " ".join(f"{t}{'b' if md == 'battle' else 'm'}:{round(statistics.mean(v))}" for (t, md), v in per.items())
        out.append(f"    fps/min (b battle, m menu): {row}")
    caps = re.findall(r"graphics: (?:auto \w+ frame rate (\d+) -> (\d+)|frame rate (\d+) \((?:battle rate|cap lifted|auto \w+)\))", log)
    if caps:
        out.append("    rate changes: " + ", ".join(f"{a}->{b}" if a else c for a, b, c in caps)[:300])
    clocks = re.findall(r"GHz (.+?); heat", log)
    if clocks:
        big = [float(x) for x in re.findall(r"\d+:(\d\.\d+)/", clocks[-1])]
        out.append(f"    last clocks GHz: {' '.join(f'{c:.2f}' for c in big)}")
    costs = [float(x) for x in re.findall(r"hook cost: ([\d.]+) ms/s", log)]
    if costs:
        out.append(f"    hook cost ms/s: median {statistics.median(costs):.1f}, max {max(costs):.1f}")
    stalls = [int(x) for x in re.findall(r"main loop stalled (\d+)ms", log)]
    if stalls:
        out.append(f"    stalls: {len(stalls)}, longest {max(stalls)} ms")
    for pattern, meaning in SIGNS:
        hits = [l for l in lines if re.search(pattern, l)]
        if hits:
            out.append(f"    ! {meaning}: {len(hits)}x, first: {hits[0][:150]}")
    out.append(f"    last line: {lines[-1][:150] if lines else ''}")
    return out


def crashes(errors, syms):
    out = []
    # A tombstone starts with a line of "*** *** ..."; consecutive star
    # lines and blocks without a process line are not crashes.
    for block in re.split(r"\*\*\*(?: \*\*\*){5,}", errors)[1:]:
        if "pid:" not in block:
            continue
        when = (re.search(r"^(\d\d-\d\d \d\d:\d\d:\d\d)", block, re.M) or re.search(r"(\d\d-\d\d \d\d:\d\d:\d\d)", block))
        thread = re.search(r"tid: \d+, name: (\S+)", block)
        abort = re.search(r"Abort message: '([^']+)'", block)
        signal = re.search(r"signal \d+ \((\w+)\)", block)
        out.append(f"  crash {when.group(1) if when else '?'} thread {thread.group(1) if thread else '?'}: "
                   f"{abort.group(1) if abort else signal.group(1) if signal else '?'}")
        for pc, lib in re.findall(r"#\d+ pc ([0-9a-f]+)\s+(\S+)", block)[:8]:
            short = lib.rsplit("/", 1)[-1]
            named = name_frame(syms, int(pc, 16)) if short == "libunity.so" else ""
            out.append(f"    {short}+{pc}{named}")
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("report")
    parser.add_argument("--syms")
    args = parser.parse_args()
    syms = load_syms(args.syms)
    with zipfile.ZipFile(args.report) as z:
        read = lambda name: z.read(name).decode("utf-8", "replace") if name in z.namelist() else ""
        device = json.loads(read("device.json") or "{}")
        setup = json.loads(read("tesl-reborn-setup.json") or "{}")
        update = json.loads(read("tesl-reborn-update-status.json") or "{}")
        prelaunch = json.loads(read("tesl-reborn-prelaunch-status.json") or "{}")
        builder = setup.get("builder", {})
        print(f"{device.get('model', '?')} Android SDK {device.get('sdk', '?')}, thermal {device.get('thermalStatus', '?')}, "
              f"game {round(device['gamePssKb'] / 1024) if device.get('gamePssKb') else '?'} MB; Builder {builder.get('build', '?')} ({builder.get('channel', '?')}); "
              f"patch {update.get('current', {}).get('revision', '?')} ({update.get('status', '?')}); prelaunch {prelaunch.get('status', '?')}")
        logs = sorted((n for n in z.namelist() if n.startswith("logs/") and n.endswith(".log") and "native" not in n),
                      key=lambda n: (re.search(r"attached", read(n)) is None, read(n)[:24]))
        found = []
        for name in logs:
            for s in sessions(read(name)):
                found.append(s)
        found.sort(key=lambda s: s[:24])
        print(f"{len(found)} game starts in the logs")
        for s in found[-4:]:
            print("\n".join(summarise_session(s)))
        errors = read("android-errors.log")
        listed = crashes(errors, syms)
        print("native crashes:" if listed else "no native crash in android-errors.log")
        if listed:
            print("\n".join(listed))
    return 0


if __name__ == "__main__":
    sys.exit(main())
