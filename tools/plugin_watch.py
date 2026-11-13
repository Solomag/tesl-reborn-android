#!/usr/bin/env python3
"""Watch for and compare releases of the Reborn PC plugin (TeslRebornPlugin).

The Android hook re-implements the plugin's Harmony patches by hand
(hook/*.ts), so a new plugin release means: find what changed, port it,
publish a patch. This tool does the finding.

    python tools/plugin_watch.py latest
        The release on tesl-reborn.com/download. Exit 3 when it is not the
        one the hook follows (PLUGIN_VERSION in hook/00-config-and-log.ts).

    python tools/plugin_watch.py diff 1.3.1-beta 1.3.2-beta [--report r.md]
    python tools/plugin_watch.py diff old.zip new.zip

    python tools/plugin_watch.py audit 1.3.1-beta
        Every Harmony patch of one release against the hook: where it is
        handled, or that the plugin's patch is empty.
        What changed between two releases (versions are downloaded from
        tesl-reborn.com, ZIPs are read as they are):
        - files of the archive (data, images, BepInEx itself);
        - TeslRebornPlugin.dll: Harmony patch targets, methods whose code
          changed, added or removed (metadata tokens are compared by name,
          so a moved string or call does not count as a change), string
          literals;
        - JSON and text data, line by line;
        - where the hook handles each changed patch target.

Needs dnfile (pip install dnfile). The archives are cached in the system
temp folder and never added to git.
"""
import argparse
import difflib
import hashlib
import io
import json
from pathlib import Path
import re
import struct
import sys
import tempfile
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SITE = "https://tesl-reborn.com"
DLL = "BepInEx/plugins/TeslRebornPlugin/TeslRebornPlugin.dll"
LIMIT = 32 * 1024 * 1024
AGENT = {"User-Agent": "TESL-Reborn-Android-plugin-watch"}


def pinned_version():
    source = (ROOT / "hook/00-config-and-log.ts").read_text(encoding="utf-8")
    return re.search(r'const PLUGIN_VERSION = "([^"]+)"', source).group(1)


def releases_on(html):
    """Plugin versions linked from the download page, as they appear."""
    return list(dict.fromkeys(re.findall(r'/download/tesl-reborn-plugin-([0-9A-Za-z.+-]+?)\.zip', html)))


def get(url, limit=LIMIT):
    with urllib.request.urlopen(urllib.request.Request(url, headers=AGENT), timeout=60) as response:
        data = response.read(limit + 1)
    if len(data) > limit:
        raise ValueError(f"{url} is larger than {limit} bytes")
    return data


def archive(name, cache):
    """A plugin ZIP: a path as it is, or a version from the site (cached)."""
    path = Path(name)
    if path.suffix.lower() == ".zip" and path.is_file():
        return path.name, path.read_bytes()
    if not re.fullmatch(r"[0-9A-Za-z.+-]+", name):
        raise ValueError(f"not a version or a ZIP: {name}")
    cached = Path(cache) / f"tesl-reborn-plugin-{name}.zip"
    if not cached.is_file():
        cached.parent.mkdir(parents=True, exist_ok=True)
        data = get(f"{SITE}/download/tesl-reborn-plugin-{name}.zip")
        zipfile.ZipFile(io.BytesIO(data)).testzip()
        cached.write_bytes(data)
    return name, cached.read_bytes()


# --- IL, compared by meaning -------------------------------------------------

# Operand sizes of the one-byte opcodes (ECMA-335 III); "t" is a metadata
# token, "s" the switch table. Missing opcodes are not valid IL.
OPERANDS = {**{op: 0 for op in range(0x00, 0x0E)}, **{op: 1 for op in range(0x0E, 0x14)}, 0x14: 0,
            **{op: 0 for op in range(0x15, 0x1F)}, 0x1F: 1, 0x20: 4, 0x21: 8, 0x22: 4, 0x23: 8, 0x25: 0, 0x26: 0,
            0x27: "t", 0x28: "t", 0x29: "t", 0x2A: 0, **{op: 1 for op in range(0x2B, 0x38)},
            **{op: 4 for op in range(0x38, 0x45)}, 0x45: "s", **{op: 0 for op in range(0x46, 0x6F)},
            0x6F: "t", 0x70: "t", 0x71: "t", 0x72: "t", 0x73: "t", 0x74: "t", 0x75: "t", 0x76: 0, 0x79: "t", 0x7A: 0,
            **{op: "t" for op in range(0x7B, 0x82)}, **{op: 0 for op in range(0x82, 0x8C)}, 0x8C: "t", 0x8D: "t",
            0x8E: 0, 0x8F: "t", **{op: 0 for op in range(0x90, 0xA3)}, 0xA3: "t", 0xA4: "t", 0xA5: "t",
            **{op: 0 for op in range(0xB3, 0xBB)}, 0xC2: "t", 0xC3: 0, 0xC6: "t", 0xD0: "t",
            **{op: 0 for op in range(0xD1, 0xDD)}, 0xDC: 0, 0xDD: 4, 0xDE: 1, 0xDF: 0, 0xE0: 0}
PREFIXED = {0x00: 0, 0x01: 0, 0x02: 0, 0x03: 0, 0x04: 0, 0x05: 0, 0x06: "t", 0x07: "t", 0x09: 2, 0x0A: 2,
            0x0B: 2, 0x0C: 2, 0x0D: 2, 0x0E: 2, 0x0F: 0, 0x11: 0, 0x12: 1, 0x13: 0, 0x14: 0, 0x15: "t",
            0x16: "t", 0x17: 0, 0x18: 0, 0x19: 1, 0x1A: 0, 0x1C: "t", 0x1D: 0, 0x1E: 0}


SHORT_BRANCH = {f"{op:x}" for op in range(0x2B, 0x38)}
LONG_BRANCH = {f"{op:x}" for op in range(0x38, 0x45)}
STLOC, LDLOC, LDLOCA = {"a", "b", "c", "d", "13", "fe0e"}, {"6", "7", "8", "9", "11", "fe0c"}, {"12", "fe0d"}


def essential(stream):
    """What a method does, the same whether built Debug or Release: no nops,
    no branch to the next instruction, no store-then-load of a temporary, no
    branch distances or local slot numbers (a Debug build has more locals
    and other jumps)."""
    out = []
    for line in stream:
        op, _, operand = line.partition(" ")
        if op == "0":
            continue
        if op in SHORT_BRANCH or op in LONG_BRANCH:
            if operand.strip("0") == "" and op in ("2b", "38"):
                continue  # br to the next instruction
            short = op if op in SHORT_BRANCH else f"{int(op, 16) - 0x0D:x}"
            out.append("br" if short == "2b" else "branch " + short)
            continue
        if op in ("dd", "de"):
            out.append("leave")
            continue
        if op in STLOC:
            out.append("stloc")
            continue
        if op in LDLOC:
            if out and out[-1] == "stloc":
                out.pop()  # Debug: the value went through a temporary
                continue
            out.append("ldloc")
            continue
        if op in LDLOCA:
            out.append("ldloca")
            continue
        out.append(line)
    # A Debug ret goes through a temporary and a jump to the shared ret.
    while len(out) >= 2 and out[-1] == "2a" and out[-2] in ("br", "ldloc"):
        del out[-2]
    return out


def normalized_il(code, resolve):
    """The instruction stream with every token replaced by what it names."""
    out, at = [], 0
    while at < len(code):
        op = code[at]
        at += 1
        if op == 0xFE:
            if at >= len(code):
                raise ValueError("truncated IL")
            op = 0xFE00 | code[at]
            at += 1
            kind = PREFIXED.get(op & 0xFF)
        else:
            kind = OPERANDS.get(op)
        if kind is None:
            raise ValueError(f"unknown opcode {op:#x}")
        if kind == "t":
            token = struct.unpack_from("<I", code, at)[0]
            out.append(f"{op:x} {resolve(token)}")
            at += 4
        elif kind == "s":
            count = struct.unpack_from("<I", code, at)[0]
            out.append(f"{op:x} {code[at:at + 4 + 4 * count].hex()}")
            at += 4 + 4 * count
        else:
            out.append(f"{op:x} {code[at:at + kind].hex()}" if kind else f"{op:x}")
            at += kind
    return out


def ser_strings(blob):
    """The strings of a custom attribute's arguments (type names, method
    names), read greedily after the 0x0001 prolog."""
    found, at = [], 2
    while at < len(blob):
        first = blob[at]
        if first == 0xFF:
            at += 1
            continue
        if first & 0x80 == 0:
            length, size = first, 1
        elif first & 0xC0 == 0x80 and at + 1 < len(blob):
            length, size = ((first & 0x3F) << 8) | blob[at + 1], 2
        else:
            break
        text = blob[at + size:at + size + length]
        if length == 0 or len(text) < length:
            at += size
            continue
        try:
            value = text.decode("utf-8")
        except UnicodeDecodeError:
            break
        if not value.isprintable():
            break
        found.append(value)
        at += size + length
    return found


def dll_summary(data):
    import dnfile

    pe = dnfile.dnPE(data=data)
    md = pe.net.mdtables
    value = lambda item: getattr(item, "value", item)
    types = list(md.TypeDef)
    # Nested types by their enclosing type (Plugin/<>c), so the compiler's
    # many <>c and <>c__DisplayClass types keep apart and stable.
    enclosing = {}
    for row in md.NestedClass or []:
        enclosing[row.NestedClass.row_index] = row.EnclosingClass.row_index

    def full_name(rid, depth=0):
        row = types[rid - 1]
        own = (value(row.TypeNamespace) + "." if value(row.TypeNamespace) else "") + value(row.TypeName)
        return f"{full_name(enclosing[rid], depth + 1)}/{own}" if rid in enclosing and depth < 8 else own

    method_owner = {}
    for index, row in enumerate(types, start=1):
        name = full_name(index)
        for ref in row.MethodList:
            method_owner[ref.row_index] = name

    def type_name(row):
        name = value(getattr(row, "TypeName", "")) or "?"
        space = value(getattr(row, "TypeNamespace", ""))
        return f"{space}.{name}" if space else name

    def resolve(token):
        table, rid = token >> 24, token & 0xFFFFFF
        try:
            if table == 0x70:
                return "str " + json.dumps(pe.net.user_strings.get(rid).value, ensure_ascii=False)
            if table == 0x06:
                return f"{method_owner.get(rid, '?')}::{value(md.MethodDef[rid - 1].Name)}"
            if table == 0x0A:
                row = md.MemberRef[rid - 1]
                parent = row.Class.row
                owner = type_name(parent) if hasattr(parent, "TypeName") else type(parent).__name__
                return f"{owner}::{value(row.Name)}"
            if table == 0x04:
                return "field " + value(md.Field[rid - 1].Name)
            if table in (0x01, 0x02):
                return "type " + type_name((md.TypeRef if table == 0x01 else md.TypeDef)[rid - 1])
            if table == 0x2B:
                inner = md.MethodSpec[rid - 1].Method
                return "spec " + resolve((0x06 if inner.table.name == "MethodDef" else 0x0A) << 24 | inner.row_index)
        except Exception:
            pass
        return f"token {table:#x}"

    methods, strings, empty_methods = {}, set(), set()
    instructions = nops = 0
    for rid, row in enumerate(md.MethodDef, start=1):
        key = f"{method_owner.get(rid, '?')}::{value(row.Name)}"
        if key in methods:  # overloads: numbered in declaration order
            n = 2
            while f"{key}#{n}" in methods:
                n += 1
            key += f"#{n}"
        if not row.Rva:
            methods[key] = "abstract"
            continue
        offset = pe.get_offset_from_rva(row.Rva)
        head = data[offset]
        if head & 3 == 2:
            code = data[offset + 1:offset + 1 + (head >> 2)]
        else:
            flags, size = struct.unpack_from("<H", data, offset)[0], struct.unpack_from("<I", data, offset + 4)[0]
            start = offset + (flags >> 12) * 4
            code = data[start:start + size]
        try:
            stream = normalized_il(code, resolve)
        except (ValueError, struct.error):
            stream = ["raw " + code.hex()]
        strings.update(line.split(" ", 2)[2] for line in stream if line.startswith("72 str "))
        instructions += len(stream)
        nops += stream.count("0")
        stream = essential(stream)
        if stream == ["2a"]:  # a lone ret: a patch method that does nothing
            empty_methods.add(key)
        methods[key] = hashlib.sha256("\n".join(stream).encode()).hexdigest()[:16]

    patches = {}
    for row in md.CustomAttribute:
        ctor = row.Type.row
        try:
            attribute = value(ctor.Class.row.TypeName)
        except Exception:
            continue
        if attribute != "HarmonyPatch":
            continue
        parent = row.Parent.row
        owner = type_name(parent) if hasattr(parent, "TypeName") else (
            f"{method_owner.get(row.Parent.row_index, '?')}::{value(parent.Name)}")
        args = [item.split(",")[0] for item in ser_strings(bytes(value(row.Value)))]
        if args:
            patches.setdefault(owner, []).append(".".join(args))
    assembly = md.Assembly[0]
    version = f"{assembly.MajorVersion}.{assembly.MinorVersion}.{assembly.BuildNumber}"
    # Patch classes whose every method (constructors aside) is empty.
    empty = set()
    for owner in {key.split("::")[0] for key in patches}:
        own = [k for k in methods if k.split("::")[0] == owner and not k.split("::")[1].startswith((".ctor", ".cctor"))]
        if own and all(k in empty_methods for k in own):
            empty.add(owner)
    # A Debug build is full of nops; a Release build has none.
    debug = instructions > 0 and nops / instructions > 0.02
    return {"version": version, "methods": methods, "strings": strings, "patches": patches, "empty": empty,
            "debug": debug}


def find_dll(files):
    """TeslRebornPlugin.dll wherever the archive keeps it (plugins/ in 1.0,
    plugins/TeslRebornPlugin/ since 1.2)."""
    names = [name for name in files if name.rsplit("/", 1)[-1] == "TeslRebornPlugin.dll"]
    return min(names, key=len) if names else None


# --- the report --------------------------------------------------------------

def hook_lines(words):
    """hook/*.ts lines that name any of these identifiers."""
    # Also as a property accessor: IsCachingDisabled is get_IsCachingDisabled.
    pattern = re.compile(r"(?:\b|(?<=_))(" + "|".join(map(re.escape, sorted(words, key=len, reverse=True))) + r")\b") if words else None
    hits = []
    if pattern:
        for path in sorted((ROOT / "hook").glob("*.ts")):
            for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
                if pattern.search(line):
                    hits.append(f"hook/{path.name}:{number}")
    return hits


# Names too common to say where a patch is handled: Unity messages,
# namespaces, everyday method names.
COMMON = {"Awake", "Start", "Show", "Hide", "Update", "OnEnable", "OnDisable", "OnDestroy", "SetData", "UpdateUi",
          "Execute", "OnResponse", "SparkleServices", "SPTESL", "BestHTTP", "TMPro", "UnityEngine"}


def specific(targets):
    """The names of these targets that point at one place in the hook."""
    return {part for target in targets for part in target.split(".") if len(part) > 3 and part not in COMMON}


def patch_classes(summary):
    """Each Harmony patch class with all its targets (class and method level)."""
    classes = {}
    for owner, targets in summary["patches"].items():
        classes.setdefault(owner.split("::")[0], []).extend(targets)
    return classes


def audit(name, data):
    """Every patch of one release against the hook."""
    archive_file = zipfile.ZipFile(io.BytesIO(data))
    dll = find_dll(archive_file.namelist())
    if not dll:
        raise ValueError(f"{name}: no TeslRebornPlugin.dll")
    summary = dll_summary(archive_file.read(dll))
    lines = [f"# Reborn plugin {name} (assembly {summary['version']}) against the hook", "",
             "| Patch | Targets | In the hook |", "|---|---|---|"]
    missing = 0
    for owner, targets in sorted(patch_classes(summary).items()):
        words = specific(targets)
        if owner in summary["empty"]:
            found = "empty in the plugin: nothing to port"
        else:
            hits = hook_lines(words)
            absent = sorted(w for w in words if not hook_lines({w}))
            found = ", ".join(sorted({h.rsplit(":", 1)[0] for h in hits})) or "**not found**"
            if absent:
                found += " (no " + ", ".join(f"`{w}`" for w in absent) + ")"
                missing += 1
        lines.append(f"| `{owner.split('.')[-1]}` | {', '.join(f'`{t}`' for t in targets)} | {found} |")
    lines += ["", f"{missing} patch(es) name something the hook does not mention." if missing
              else "Every patch has a counterpart in the hook or is empty."]
    return "\n".join(lines) + "\n"


def compare(old_name, old, new_name, new):
    a, b = zipfile.ZipFile(io.BytesIO(old)), zipfile.ZipFile(io.BytesIO(new))
    files = lambda z: {i.filename: z.read(i) for i in z.infolist() if not i.filename.endswith("/")}
    fa, fb = files(a), files(b)
    lines = [f"# Reborn plugin {old_name} → {new_name}", ""]
    added, removed = sorted(set(fb) - set(fa)), sorted(set(fa) - set(fb))
    changed = sorted(n for n in set(fa) & set(fb) if fa[n] != fb[n])
    lines.append("## Archive")
    if not (added or removed or changed):
        lines.append("No file changed.")
    for title, names in (("Added", added), ("Removed", removed), ("Changed", changed)):
        if names:
            lines.append(f"**{title}:**")
            lines += [f"- `{n}` ({len((fb if title != 'Removed' else fa)[n]):,} bytes)" for n in names]
    lines.append("")

    dll_a, dll_b = find_dll(fa), find_dll(fb)
    if dll_a and dll_b and fa[dll_a] != fb[dll_b]:
        sa, sb = dll_summary(fa[dll_a]), dll_summary(fb[dll_b])
        lines += ["## TeslRebornPlugin.dll", f"Assembly {sa['version']} → {sb['version']}."
                  + (f" Moved from `{dll_a}` to `{dll_b}`." if dll_a != dll_b else ""), ""]
        if sa["debug"] != sb["debug"]:
            build = lambda s: "Debug" if s["debug"] else "Release"
            lines += [f"> {old_name} is a {build(sa)} build, {new_name} a {build(sb)} build: the compiler's own "
                      "differences are smoothed over, but some methods may still show as changed without a "
                      "real change. Read their code before porting.", ""]
        ma, mb = sa["methods"], sb["methods"]
        m_added, m_removed = sorted(set(mb) - set(ma)), sorted(set(ma) - set(mb))
        m_changed = sorted(k for k in set(ma) & set(mb) if ma[k] != mb[k])
        targets_a, targets_b = sa["patches"], sb["patches"]
        p_all = sorted(set(targets_a) | set(targets_b))
        # A lambda or iterator of a patch (Patch/<>c) counts for the patch.
        touched = {k.split("::")[0].split("/")[0] for k in m_added + m_removed + m_changed}
        lines.append("### Harmony patches")
        marked = 0
        for owner in p_all:
            before, after = targets_a.get(owner), targets_b.get(owner)
            mark = "new" if before is None else "removed" if after is None else "retargeted" if before != after else (
                "code changed" if owner.split("::")[0] in touched else "")
            if mark and owner.split("::")[0] in sb["empty"]:
                mark += ", empty: nothing to port"
            if mark:
                marked += 1
                lines.append(f"- `{owner}` → {', '.join(f'`{t}`' for t in (after or before))} — **{mark}**")
        if not marked:
            lines.append("No patch changed: same targets, same code.")
        lines.append("")
        for title, names in (("Methods added", m_added), ("Methods removed", m_removed), ("Methods whose code changed", m_changed)):
            if names:
                lines.append(f"### {title}")
                lines += [f"- `{n}`" for n in names]
                lines.append("")
        s_added, s_removed = sorted(sb["strings"] - sa["strings"]), sorted(sa["strings"] - sb["strings"])
        if s_added or s_removed:
            lines.append("### String literals")
            lines += [f"- added {s}" for s in s_added[:80]] + [f"- removed {s}" for s in s_removed[:80]]
            lines.append("")
        # Where the hook handles what changed: the targets of the patch
        # classes involved, and the names of changed methods.
        words = set()
        for owner in p_all:
            if owner.split("::")[0] in touched or targets_a.get(owner) != targets_b.get(owner):
                words.update(specific(targets_b.get(owner) or targets_a.get(owner) or []))
        hits = hook_lines(words)
        lines.append("### In the hook")
        lines.append(f"Identifiers: {', '.join(f'`{w}`' for w in sorted(words)) or 'none'}")
        if words:
            lines += [f"- {hit}" for hit in hits[:60]] or ["- (not found: possibly new to the port)"]
        else:
            lines.append("- nothing to port: no patch changed")
        if len(hits) > 60:
            lines.append(f"- … {len(hits) - 60} more")
        lines.append("")

    texts = [n for n in changed if n.lower().endswith((".json", ".txt", ".cfg", ".md", ".ini"))]
    if texts:
        lines.append("## Text and data")
        for name in texts:
            diff = list(difflib.unified_diff(fa[name].decode("utf-8", "replace").splitlines(),
                                             fb[name].decode("utf-8", "replace").splitlines(),
                                             f"{old_name}/{name}", f"{new_name}/{name}", lineterm="", n=1))
            lines += ["```diff", *diff[:200], *(["… (cut)"] if len(diff) > 200 else []), "```", ""]
    emojis = [n for n in changed + added if "/images/emojis/" in n]
    if emojis:
        lines += ["## Emojis", "Update `EMOJI_SOURCE`/`EMOJI_FILES` in hook/00-config-and-log.ts and "
                  "`URL`/`FILES` in tools/prepare_emojis.py:", ""]
        lines += [f"- `{n.rsplit('/', 1)[-1]}`: `{hashlib.sha256(fb[n]).hexdigest()}`" for n in emojis]
        lines.append("")
    return "\n".join(lines) + "\n"


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("latest", help="the release on the site against PLUGIN_VERSION")
    diff = sub.add_parser("diff", help="what changed between two releases")
    diff.add_argument("old")
    diff.add_argument("new")
    diff.add_argument("--report", type=Path, help="also write the report to this file")
    check = sub.add_parser("audit", help="every patch of one release against the hook")
    check.add_argument("release")
    parser.add_argument("--cache", default=str(Path(tempfile.gettempdir()) / "tesl-reborn-plugins"))
    args = parser.parse_args(argv)
    if args.command == "latest":
        found = releases_on(get(f"{SITE}/download", 2 * 1024 * 1024).decode("utf-8", "replace"))
        if not found:
            print("PLUGIN: no plugin link on the download page")
            return 1
        latest, pinned = found[0], pinned_version()
        print(f"PLUGIN: site {latest}, hook {pinned}")
        if latest != pinned:
            print(f"NEW_PLUGIN: {latest}")
            return 3
        return 0
    if args.command == "audit":
        name, data = archive(args.release, args.cache)
        sys.stdout.buffer.write(audit(name, data).encode("utf-8"))
        return 0
    old_name, old = archive(args.old, args.cache)
    new_name, new = archive(args.new, args.cache)
    report = compare(old_name, old, new_name, new)
    sys.stdout.buffer.write(report.encode("utf-8"))
    if args.report:
        args.report.write_text(report, encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
