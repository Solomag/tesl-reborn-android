#!/usr/bin/env python3
"""Inject frida-gadget + the TESL hook script into the Android APK (arm64-v8a only).

The patched classes.dex is rebuilt at build time from base.apk and the committed
JNIBridge_a.patched.smali (no proprietary binary blob is shipped in the repo).
A leftover patched_classes.dex is used only with an explicit --prebuilt-dex.

Usage: python3 build_apk.py [base.apk] [out.apk] [--prebuilt-dex] [--allow-stale-hook]
                            [--ks FILE --ks-alias NAME --ks-pass PASS [--ks-key-pass PASS]]
"""
import argparse, hashlib, json, re, os, shutil, subprocess, sys, zipfile, lief

HERE     = os.path.dirname(os.path.abspath(__file__))
GADGET   = os.path.join(HERE, "gadget.so")
HOOK_JS  = os.path.join(HERE, "hook.js")
HOOK_TS  = os.path.join(HERE, "hook.ts")
SIGNER   = os.path.join(HERE, "uber-apk-signer.jar")
ABI      = "lib/arm64-v8a"
WORK     = os.path.join(HERE, "work")

ap = argparse.ArgumentParser()
ap.add_argument("base", nargs="?", default=os.path.join(HERE, "base.apk"))
ap.add_argument("out", nargs="?", default=os.path.join(HERE, "tesl-reborn.apk"))
ap.add_argument("--prebuilt-dex", action="store_true",
                help="use patched_classes.dex next to the script instead of rebuilding it from the smali")
ap.add_argument("--allow-stale-hook", action="store_true",
                help="build even when hook.ts is newer than hook.js")
ap.add_argument("--ks", help="keystore for signing (default: the public debug key of uber-apk-signer)")
ap.add_argument("--ks-alias")
ap.add_argument("--ks-pass")
ap.add_argument("--ks-key-pass")
args = ap.parse_args()
BASE, OUT_NAME = args.base, args.out

# fail before the long extract and repack, not at the end with a traceback
local_dex = os.path.join(HERE, "patched_classes.dex")
needed = [BASE, GADGET, HOOK_JS, SIGNER]
if args.prebuilt_dex:
    needed.append(local_dex)
missing = [p for p in needed if not os.path.isfile(p)]
if missing:
    sys.exit("missing: " + ", ".join(missing))
tools = ["zipalign", "java"] + ([] if args.prebuilt_dex else ["baksmali", "smali"])
absent = [t for t in tools if not shutil.which(t)]
if absent:
    sys.exit("not on PATH: " + ", ".join(absent))
if not args.allow_stale_hook:
    metadata = os.path.join(HERE, "runtime", "manifest.json")
    with open(metadata, encoding="utf-8") as f:
        release = json.load(f)
    with open(HOOK_TS, "rb") as f:
        source_hash = hashlib.sha256(f.read()).hexdigest()
    with open(HOOK_JS, encoding="utf-8") as f:
        match = re.search(r"const embedded = (.*);\n  const packageName", f.read())
    embedded = json.loads(match.group(1)) if match else {}
    if release.get("sourceSha256") != source_hash or embedded.get("meta", {}).get("sha256") != release["sha256"] or hashlib.sha256(embedded.get("code", "").encode()).hexdigest() != release["sha256"]:
        sys.exit("Hook is stale or inconsistent: run npm run build (or explicitly use --allow-stale-hook)")
if args.ks and not (args.ks_alias and args.ks_pass):
    sys.exit("--ks needs --ks-alias and --ks-pass")

lief.logging.disable()
emoji_resources = {
    "people.json": "ea39cac729868b482d2147ef8c5758d9f23f605cfd5eedcb9d9117408e71531d",
    "people.png": "95198a82da017136cb923b655cbe0c83d40456404bef87c86e8a2ae9e67fb4aa",
}
for name, expected in emoji_resources.items():
    path = os.path.join(HERE, "resources", "emojis", name)
    if not os.path.isfile(path) or hashlib.sha256(open(path, "rb").read()).hexdigest() != expected:
        sys.exit("Missing or invalid emoji resources. Run: python3 tools/prepare_emojis.py")
shutil.rmtree(WORK, ignore_errors=True); os.makedirs(WORK)

# Rebuild patched_classes.dex from the committed smali source + the game's base dex.
PATCHED_DEX = os.path.join(WORK, "patched_classes.dex")
if args.prebuilt_dex:
    print("using prebuilt patched_classes.dex from the script directory")
    shutil.copyfile(local_dex, PATCHED_DEX)
else:
    print("building patched_classes.dex from base.apk + JNIBridge_a.patched.smali")
    src_dex = os.path.join(WORK, "base_classes.dex")
    with zipfile.ZipFile(BASE) as z:
        z.extract("classes.dex", WORK)
        os.replace(os.path.join(WORK, "classes.dex"), src_dex)
    disasm_dir = os.path.join(WORK, "dexdis")
    shutil.rmtree(disasm_dir, ignore_errors=True); os.makedirs(disasm_dir)
    subprocess.check_call(["baksmali", "disassemble", src_dex, "-o", disasm_dir])
    src_smali = os.path.join(HERE, "JNIBridge_a.patched.smali")
    if not os.path.isfile(src_smali):
        sys.exit("JNIBridge_a.patched.smali is missing next to build_apk.py")
    os.makedirs(os.path.join(disasm_dir, "bitter", "jnibridge"), exist_ok=True)
    shutil.copyfile(src_smali,
                    os.path.join(disasm_dir, "bitter", "jnibridge",
                                 "JNIBridge$a.smali"))
    subprocess.check_call(["smali", "assemble", "-o", PATCHED_DEX, disasm_dir])
    print("rebuilt patched_classes.dex (%.2f MB)" % (os.path.getsize(PATCHED_DEX) / 1e6))

# 1) make libmain.so load the gadget (adds DT_NEEDED libgadget.so)
with zipfile.ZipFile(BASE) as z:
    z.extract(f"{ABI}/libmain.so", WORK)
libmain = os.path.join(WORK, ABI, "libmain.so")
elf = lief.parse(libmain)
elf.add_library("libgadget.so")
elf.write(libmain)
print("DT_NEEDED now:", [getattr(l, "name", l) for l in lief.parse(libmain).libraries])

# 2) gadget config: run our script, never wait for a debugger
cfg = {"interaction": {"type": "script", "path": "libhook.js.so", "on_change": "ignore"}}
with open(os.path.join(WORK, "libgadget.config.so"), "w") as f:
    f.write(json.dumps(cfg))

# 3) repack: drop old signature, replace libmain, add gadget + config + script
unsigned = os.path.join(WORK, "unsigned.apk")
extra = {
    f"{ABI}/libmain.so":          libmain,
    f"{ABI}/libgadget.so":        GADGET,
    f"{ABI}/libgadget.config.so": os.path.join(WORK, "libgadget.config.so"),
    f"{ABI}/libhook.js.so":       HOOK_JS,
    "classes.dex":                PATCHED_DEX,
}
for name in emoji_resources:
    extra[f"assets/tesl-reborn/emojis/{name}"] = os.path.join(HERE, "resources", "emojis", name)
with zipfile.ZipFile(BASE) as zin, zipfile.ZipFile(unsigned, "w", zipfile.ZIP_DEFLATED) as zout:
    for item in zin.infolist():
        n = item.filename
        if n.startswith("META-INF/") and (n.endswith((".SF", ".RSA", ".DSA", ".EC", ".MF"))):
            continue                       # old signature
        if n in extra:
            continue                       # replaced below
        zout.writestr(item, zin.read(n), compress_type=item.compress_type)
    for name, path in extra.items():
        zout.write(path, name, compress_type=zipfile.ZIP_STORED if name.startswith("assets/tesl-reborn/emojis/") else zipfile.ZIP_DEFLATED)

# 4) align + sign: without --ks uber-apk-signer uses its one fixed, public debug keystore, so every build from every user carries the same key
aligned = os.path.join(WORK, "aligned.apk")
subprocess.check_call(["zipalign", "-f", "-p", "4", unsigned, aligned])
sign = ["java", "-jar", SIGNER, "-a", aligned, "--allowResign", "--out", WORK]
if args.ks:
    sign += ["--ks", args.ks, "--ksAlias", args.ks_alias, "--ksPass", args.ks_pass,
             "--ksKeyPass", args.ks_key_pass or args.ks_pass]
subprocess.check_call(sign)
signed = [f for f in os.listdir(WORK) if f.endswith(("-debugSigned.apk", "-signed.apk"))][0]
os.replace(os.path.join(WORK, signed), os.path.abspath(OUT_NAME))
print("built", OUT_NAME, os.path.getsize(OUT_NAME) // 1024, "KB")
