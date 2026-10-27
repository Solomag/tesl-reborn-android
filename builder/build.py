"""Windows-native build pipeline. All writes are confined to builder-owned paths."""

import json
import os
import re
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading
import xml.etree.ElementTree as ET
import zipfile

from .resources import (
    PACKAGE,
    OBB,
    LANGUAGES,
    ensure_outside,
    find_assets,
    unpack_xapk,
    build_packs,
    source_roots,
    read_manifest,
)

ANDROID = "{http://schemas.android.com/apk/res/android}"
SETUP_ACTIVITY = "org.teslreborn.setup.ResourceActivity"


def write_window_themes(decoded, game_parent):
    """Supply starting-window backgrounds before any Activity code can run."""
    common = {
        "android:windowLightStatusBar": "false",
        "android:windowLightNavigationBar": "false",
    }
    for qualifier in ("values", "values-v31"):
        resources = ET.Element("resources")
        for name, parent, color in (
            ("TeslRebornSetup", "@android:style/Theme.Material.NoActionBar", "#171b22"),
            ("TeslRebornGame", game_parent, "#000000"),
            ("TeslRebornTransition", "@android:style/Theme.Material.NoActionBar", "#000000"),
        ):
            if qualifier == "values":
                base = ET.SubElement(
                    resources, "style", {"name": name + "Base", "parent": parent}
                )
                for key, value in common.items():
                    ET.SubElement(base, "item", {"name": key}).text = value
                for key in ("windowBackground", "colorBackground", "statusBarColor", "navigationBarColor"):
                    ET.SubElement(base, "item", {"name": "android:" + key}).text = color
                if name in ("TeslRebornSetup", "TeslRebornTransition"):
                    ET.SubElement(
                        base, "item", {"name": "android:windowAnimationStyle"}
                    ).text = "@null"
                if name == "TeslRebornTransition":
                    ET.SubElement(base, "item", {"name": "android:windowFullscreen"}).text = "true"
            style = ET.SubElement(
                resources, "style", {"name": name, "parent": "@style/" + name + "Base"}
            )
            if qualifier == "values-v31":
                ET.SubElement(
                    style, "item", {"name": "android:windowSplashScreenBackground"}
                ).text = color
        path = decoded / "res" / qualifier / "tesl_reborn_windows.xml"
        path.parent.mkdir(parents=True, exist_ok=True)
        ET.ElementTree(resources).write(path, encoding="utf-8", xml_declaration=True)


def data_root():
    return Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[1]))


def _valid_feed(feed):
    from urllib.parse import urlsplit

    if feed:
        uri = urlsplit(feed)
        if (
            uri.scheme != "https"
            or not uri.hostname
            or uri.username
            or uri.password
            or uri.query
            or uri.fragment
        ):
            raise ValueError("Hook channel must be a public HTTPS manifest URL")
    return feed


def _channel_file():
    return json.loads((data_root() / "runtime/channel.json").read_text(encoding="utf-8"))


def hook_feed():
    """The default channel baked into this build: stable from the main
    repository's CI, test otherwise (tools/select_channel.py)."""
    return _valid_feed(_channel_file()["feedUrl"])


def hook_channels():
    """Stable and test feeds the Game Data screen lets the player switch to."""
    channels = _channel_file().get("channels") or {}
    return {
        name: _valid_feed(url)
        for name, url in channels.items()
        if name in ("stable", "test") and url
    }


def application_directory():
    return (
        Path(sys.executable).resolve().parent
        if getattr(sys, "frozen", False)
        else Path(__file__).resolve().parents[1]
    )


def patch_manifest(path):
    ET.register_namespace("android", ANDROID[1:-1])
    tree = ET.parse(path)
    manifest = tree.getroot()
    application = manifest.find("application")
    if manifest.get("package") != PACKAGE:
        raise ValueError("Unexpected Android package name")
    if application is None:
        raise ValueError("Missing application in Android manifest")
    if application.get(ANDROID + "networkSecurityConfig"):
        raise ValueError(
            "This base APK has a custom network security config; explicit support is required"
        )
    original = None
    for component in list(application):
        if component.tag not in ("activity", "activity-alias"):
            continue
        for intent in list(component.findall("intent-filter")):
            actions = [a.get(ANDROID + "name") for a in intent.findall("action")]
            categories = [a.get(ANDROID + "name") for a in intent.findall("category")]
            if (
                "android.intent.action.MAIN" in actions
                and "android.intent.category.LAUNCHER" in categories
            ):
                if original is not None:
                    raise ValueError("Ambiguous original game launcher")
                original = component.get(
                    ANDROID
                    + (
                        "targetActivity"
                        if component.tag == "activity-alias"
                        else "name"
                    )
                )
                component.remove(intent)
    if not original:
        raise ValueError("Original game launcher not found")
    if original.startswith("."):
        original = PACKAGE + original
    elif "." not in original:
        original = PACKAGE + "." + original

    def activity_name(component):
        name = component.get(ANDROID + "name", "")
        if name.startswith("."):
            return PACKAGE + name
        return name if "." in name else PACKAGE + "." + name

    game = next(
        (
            component
            for component in application.findall("activity")
            if activity_name(component) == original
        ),
        None,
    )
    if game is None:
        raise ValueError("Original game Activity declaration not found")
    game_parent = (
        game.get(ANDROID + "theme")
        or application.get(ANDROID + "theme")
        or "@android:style/Theme.Material.NoActionBar"
    )
    write_window_themes(path.parent, game_parent)
    game.set(ANDROID + "theme", "@style/TeslRebornGame")
    application.set(ANDROID + "usesCleartextTraffic", "true")
    if not any(
        e.get(ANDROID + "name") == "android.permission.INTERNET"
        for e in manifest.findall("uses-permission")
    ):
        ET.SubElement(
            manifest,
            "uses-permission",
            {ANDROID + "name": "android.permission.INTERNET"},
        )
    sdk = manifest.find("uses-sdk")
    if sdk is None:
        sdk = ET.SubElement(manifest, "uses-sdk", {ANDROID + "minSdkVersion": "26"})
    if sdk is not None and int(sdk.get(ANDROID + "minSdkVersion", "1")) < 26:
        sdk.set(ANDROID + "minSdkVersion", "26")
    activity = ET.SubElement(
        application,
        "activity",
        {
            ANDROID + "name": SETUP_ACTIVITY,
            ANDROID + "exported": "true",
            ANDROID + "launchMode": "singleTop",
            ANDROID + "theme": "@style/TeslRebornSetup",
            ANDROID + "label": "TESL Reborn",
            ANDROID + "configChanges": "keyboard|keyboardHidden|orientation|screenSize",
        },
    )
    gate = ET.SubElement(
        application,
        "activity",
        {
            ANDROID + "name": "org.teslreborn.setup.LaunchActivity",
            ANDROID + "exported": "true",
            ANDROID + "process": ":resources",
            # Its own task: the launcher icon must create this gate again while
            # the game runs, or Android just resumes the game task and the
            # update offer is never reached. The game goes to its own task.
            ANDROID + "taskAffinity": PACKAGE + ".tesl_reborn_launcher",
            ANDROID + "excludeFromRecents": "true",
            ANDROID + "theme": "@style/TeslRebornTransition",
            ANDROID + "screenOrientation": game.get(ANDROID + "screenOrientation", "sensorLandscape"),
            ANDROID + "label": "TESL Reborn",
        },
    )
    launcher = ET.SubElement(gate, "intent-filter")
    ET.SubElement(launcher, "action", {ANDROID + "name": "android.intent.action.MAIN"})
    ET.SubElement(
        launcher, "category", {ANDROID + "name": "android.intent.category.LAUNCHER"}
    )
    link = ET.SubElement(activity, "intent-filter")
    ET.SubElement(link, "action", {ANDROID + "name": "android.intent.action.VIEW"})
    for name in ("DEFAULT", "BROWSABLE"):
        ET.SubElement(
            link, "category", {ANDROID + "name": "android.intent.category." + name}
        )
    ET.SubElement(
        link, "data", {ANDROID + "scheme": "teslreborn", ANDROID + "host": "resources"}
    )
    ET.SubElement(
        manifest, "uses-permission", {ANDROID + "name": "android.permission.CAMERA"}
    )
    ET.SubElement(
        manifest,
        "uses-feature",
        {ANDROID + "name": "android.hardware.camera", ANDROID + "required": "false"},
    )
    activity.set(ANDROID + "process", ":resources")
    ET.SubElement(application, "activity", {
        ANDROID + "name": "org.teslreborn.setup.DiagnosticsActivity",
        ANDROID + "exported": "true", ANDROID + "process": ":resources",
        ANDROID + "theme": "@style/TeslRebornSetup", ANDROID + "label": "TESL Reborn diagnostics",
    })
    ET.SubElement(application, "provider", {
        ANDROID + "name": "org.teslreborn.setup.DiagnosticsProvider",
        ANDROID + "authorities": PACKAGE + ".tesl-reborn-diagnostics",
        ANDROID + "exported": "false", ANDROID + "grantUriPermissions": "true",
        ANDROID + "process": ":resources",
    })
    transition = ET.SubElement(application, "activity", {
        ANDROID + "name": "org.teslreborn.setup.LanguageActivity",
        ANDROID + "exported": "true",
        ANDROID + "process": ":resources",
        ANDROID + "theme": "@style/TeslRebornTransition",
        ANDROID + "screenOrientation": game.get(ANDROID + "screenOrientation", "sensorLandscape"),
        ANDROID + "configChanges": "keyboard|keyboardHidden|orientation|screenSize",
    })
    transition_link = ET.SubElement(transition, "intent-filter")
    ET.SubElement(transition_link, "action", {ANDROID + "name": "android.intent.action.VIEW"})
    for category in ("DEFAULT", "BROWSABLE"):
        ET.SubElement(transition_link, "category", {ANDROID + "name": "android.intent.category." + category})
    ET.SubElement(transition_link, "data", {ANDROID + "scheme": "teslreborn", ANDROID + "host": "language"})
    ET.SubElement(
        application,
        "activity",
        {
            ANDROID + "name": "org.teslreborn.setup.ScanActivity",
            ANDROID + "hardwareAccelerated": "true",
            ANDROID + "exported": "false",
            ANDROID + "process": ":resources",
            ANDROID + "theme": "@style/TeslRebornSetup",
        },
    )
    tree.write(path, encoding="utf-8", xml_declaration=True)
    return original


class BuildCancelled(RuntimeError):
    """The player cancelled the build; its partial folder is removed."""


# Cancelling a build: the running tool (Java, apktool, ...) is killed and the
# build stops at its next log line, which every stage writes often.
_cancel = threading.Event()
_processes = set()
_process_lock = threading.Lock()
_current_result = None


def cancel_build():
    _cancel.set()
    with _process_lock:
        for process in list(_processes):
            try:
                process.kill()
            except OSError:
                pass


def check_cancelled():
    if _cancel.is_set():
        raise BuildCancelled("Build cancelled")


def invoke(command, log, cwd=None):
    check_cancelled()
    creationflags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
    with subprocess.Popen(
        list(map(str, command)),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        encoding="utf-8",
        errors="replace",
        creationflags=creationflags,
        cwd=cwd,
    ) as process:
        with _process_lock:
            _processes.add(process)
        try:
            for line in process.stdout:
                log(line.rstrip())
            code = process.wait()
        except BaseException:
            # Leaving the with-block waits for the tool: stop it first.
            process.kill()
            raise
        finally:
            with _process_lock:
                _processes.discard(process)
    check_cancelled()
    if code:
        raise RuntimeError("Tool failed: " + Path(str(command[0])).name)


def prepare_builder_emojis(work, game, assets, log):
    from tools.prepare_emojis import FILES, URL, extract
    from .resources import sha256

    for root in source_roots(game, assets):
        directory = root / "BepInEx/plugins/TeslRebornPlugin/data/images/emojis"
        if all(
            (directory / name).is_file() and sha256(directory / name) == digest
            for name, digest in FILES.items()
        ):
            (work / "emojis").mkdir()
            for name in FILES:
                shutil.copyfile(directory / name, work / "emojis" / name)
            return
    log("Downloading verified emoji resources from the official Reborn archive…")
    import urllib.request

    with urllib.request.urlopen(URL, timeout=60) as response:
        data = response.read(16 * 1024**2 + 1)
    if len(data) > 16 * 1024**2:
        raise ValueError("Emoji archive exceeds the size limit")
    extract(data, work / "emojis")


def patch_game_touch(decoded, activity):
    """Preserve the original touch handler and add Android keyboard gesture input."""
    files = list(Path(decoded).glob("smali*/" + activity.replace(".", "/") + ".smali"))
    if not files and activity.startswith("android."):
        wrapped = "org.teslreborn.setup.GameActivityBridge"
        path = Path(decoded) / "smali" / (wrapped.replace(".", "/") + ".smali")
        path.parent.mkdir(parents=True, exist_ok=True)
        descriptor = "L" + activity.replace(".", "/") + ";"
        path.write_text(
            ".class public Lorg/teslreborn/setup/GameActivityBridge;\n.super "
            + descriptor
            + "\n.method public constructor <init>()V\n    .locals 0\n    invoke-direct {p0}, "
            + descriptor
            + "-><init>()V\n    return-void\n.end method\n"
        )
        manifest = Path(decoded) / "AndroidManifest.xml"
        tree = ET.parse(manifest)
        for component in tree.getroot().find("application"):
            if component.get(ANDROID + "name") == activity:
                component.set(ANDROID + "name", wrapped)
            if component.get(ANDROID + "targetActivity") == activity:
                component.set(ANDROID + "targetActivity", wrapped)
        tree.write(manifest, encoding="utf-8", xml_declaration=True)
        patch_game_touch(decoded, wrapped)
        return wrapped
    if len(files) != 1:
        raise ValueError(
            "Cannot locate the original game Activity for the debug gesture"
        )
    path = files[0]
    text = path.read_text(encoding="utf-8")
    parent = re.search(r"(?m)^\.super (L[^;]+;)", text)
    if not parent:
        raise ValueError("Game Activity superclass is missing")
    methods = [
        (
            "dispatchTouchEvent(Landroid/view/MotionEvent;)Z",
            "public",
            "{p0 .. p1}",
            "onTouch(Landroid/app/Activity;Landroid/view/MotionEvent;)V",
            1,
            "    invoke-super {p0, p1}, "
            + parent[1]
            + "->dispatchTouchEvent(Landroid/view/MotionEvent;)Z\n    move-result v0\n    return v0\n",
        ),
        (
            "onResume()V",
            "protected",
            "{p0 .. p0}",
            "onResume(Landroid/app/Activity;)V",
            0,
            "    invoke-super {p0}, " + parent[1] + "->onResume()V\n    return-void\n",
        ),
    ]
    for signature, visibility, registers, hook, locals_, fallback in methods:
        if "Lorg/teslreborn/setup/GestureBridge;->" + hook in text:
            continue
        call = (
            "    invoke-static/range "
            + registers
            + ", Lorg/teslreborn/setup/GestureBridge;->"
            + hook
            + "\n"
        )
        method = re.search(
            r"(?m)^\.method [^\n]* " + re.escape(signature) + r"\s*$", text
        )
        if method:
            end = text.index(".end method", method.end())
            local = re.search(
                r"(?m)^\s*\.(?:locals|registers) \d+[^\n]*\n", text[method.end() : end]
            )
            if not local:
                raise ValueError("Cannot instrument the game " + signature)
            pos = method.end() + local.end()
            text = text[:pos] + call + text[pos:]
        else:
            text += (
                "\n.method "
                + visibility
                + " "
                + signature
                + "\n    .locals "
                + str(locals_)
                + "\n"
                + call
                + fallback
                + ".end method\n"
            )
    path.write_text(text, encoding="utf-8")
    return activity


def native_base(base, work, vendor, setup, embedded, catalog, log):
    import lief

    java = vendor / "jre/bin" / ("java.exe" if sys.platform == "win32" else "java")
    if not java.exists():
        # Source development only; distributed EXE always includes its runtime.
        found = shutil.which("java")
        if not found:
            raise ValueError("The builder is missing its Java runtime")
        java = Path(found)
    java_temp = work / "java-temp"
    java_temp.mkdir()

    def run(command, log):
        if command[0] == java:
            command = [java, "-Djava.io.tmpdir=" + str(java_temp), *command[1:]]
        return invoke(command, log, cwd=work)

    decoded = work / "decoded"
    framework = work / "framework"
    framework.mkdir()
    run(
        [
            java,
            "-jar",
            vendor / "apktool.jar",
            "d",
            "-f",
            "-p",
            framework,
            "-o",
            decoded,
            base,
        ],
        log,
    )
    smali = list(decoded.glob("smali*/bitter/jnibridge/JNIBridge$a.smali"))
    if len(smali) != 1:
        raise ValueError("Could not find a unique original JNIBridge$a")
    shutil.copyfile(data_root() / "JNIBridge_a.patched.smali", smali[0])
    for directory in (decoded / "lib").iterdir():
        if directory.is_dir() and directory.name != "arm64-v8a":
            shutil.rmtree(directory)
    setup["gameActivity"] = patch_manifest(decoded / "AndroidManifest.xml")
    setup["gameActivity"] = patch_game_touch(decoded, setup["gameActivity"])
    setup["debugInput"] = "android-key-events"
    patched = work / "base-patched.apk"
    run(
        [
            java,
            "-jar",
            vendor / "apktool.jar",
            "b",
            "-p",
            framework,
            "-o",
            patched,
            decoded,
        ],
        log,
    )
    with zipfile.ZipFile(patched) as archive:
        lib = work / "libmain.so"
        lib.write_bytes(archive.read("lib/arm64-v8a/libmain.so"))
        classes = set(archive.namelist())
    elf = lief.parse(str(lib))
    if not elf.has_library("libgadget.so"):
        elf.add_library("libgadget.so")
    elf.write(str(lib))
    index = 2
    while f"classes{index}.dex" in classes:
        index += 1
    extra = {
        "lib/arm64-v8a/libmain.so": lib,
        "lib/arm64-v8a/libgadget.so": vendor / "gadget.so",
        "lib/arm64-v8a/libhook.js.so": data_root() / "hook.js",
        f"classes{index}.dex": vendor / "setup/classes.dex",
    }
    config = work / "gadget-config.json"
    config.write_text(
        json.dumps(
            {
                "interaction": {
                    "type": "script",
                    "path": "libhook.js.so",
                    "on_change": "ignore",
                }
            }
        )
    )
    extra["lib/arm64-v8a/libgadget.config.so"] = config
    settings = work / "setup.json"
    settings.write_text(json.dumps(setup, ensure_ascii=False), encoding="utf-8")
    extra["assets/tesl-reborn/setup.json"] = settings
    extra["assets/tesl-reborn/notices/LICENSE-zxing"] = vendor / "LICENSE-zxing"
    from tools.prepare_emojis import FILES
    from .resources import sha256

    for name, expected in FILES.items():
        path = work / "emojis" / name
        if sha256(path) != expected:
            raise ValueError("Emoji resources failed verification")
        extra["assets/tesl-reborn/emojis/" + name] = path
    small = work / "small-unsigned.apk"
    with zipfile.ZipFile(patched) as source, zipfile.ZipFile(small, "w") as dest:
        for entry in source.infolist():
            if entry.filename in extra or entry.filename.startswith("META-INF/"):
                continue
            dest.writestr(entry, source.read(entry.filename))
        for name, path in extra.items():
            method = (
                zipfile.ZIP_STORED
                if name.startswith("assets/")
                else zipfile.ZIP_DEFLATED
            )
            dest.write(path, name, compress_type=method)
    aligned = work / "aligned.apk"
    align = (
        vendor
        / "build-tools"
        / ("zipalign.exe" if sys.platform == "win32" else "zipalign")
    )
    run([align, "-f", "-p", "4", small, aligned], log)
    unsigned = work / "unsigned.apk"
    if embedded:
        from build_single_apk import append_to_apk

        packs = {
            "assets/tesl-reborn/" + pack["path"]: catalog / pack["path"]
            for pack in setup["embeddedPacks"]
        }
        if (
            aligned.stat().st_size
            + sum(Path(p).stat().st_size for p in packs.values())
            + 1024**2
            >= (1 << 32) - 1
        ):
            raise ValueError(
                "APK would exceed the ZIP32 4 GiB limit; use separate resource transfer"
            )
        append_to_apk(
            str(aligned), str(unsigned), {k: str(v) for k, v in packs.items()}
        )
    else:
        shutil.copyfile(aligned, unsigned)
    signed = work / "signed"
    signed.mkdir()
    run(
        [
            java,
            "-Xmx2g",
            "-jar",
            vendor / "uber-apk-signer.jar",
            "-a",
            unsigned,
            "--allowResign",
            "--skipZipAlign",
            "--out",
            signed,
        ],
        log,
    )
    files = list(signed.glob("*-debugSigned.apk"))
    if len(files) != 1:
        raise ValueError("Signed APK was not produced")
    return files[0]


def builder_channel():
    from .selfupdate import current

    return current(data_root())["channel"]


def hook_revision():
    try:
        return int(json.loads((data_root() / "runtime/manifest.json").read_text(encoding="utf-8"))["revision"])
    except (OSError, ValueError, KeyError):
        return 0


def build_folder_name(channel, revision, format, languages, now):
    """What a build is, readable in the output folder:
    test_patch91_apk+data_en_us+ru_ru_2026-10-28_1015. The files inside keep fixed
    names; transfers and the phone rely on them."""
    kind = {"manual": "apk+data", "xapk": "xapk", "apk": "apk-only", "data": "data-only"}.get(format, format)
    # Full codes: es_es and es_mx are both "es".
    codes = "all-languages" if set(languages) >= set(LANGUAGES) else "+".join(sorted(set(languages)))
    parts = [channel, f"patch{revision}", kind] + ([codes] if codes and format != "apk" else [])
    return "_".join(parts + [now.strftime("%Y-%m-%d_%H%M")])


def build(*args, **kwargs):
    """Build, or stop on cancel_build() and remove the partial build folder."""
    global _current_result
    _cancel.clear()
    _current_result = None
    try:
        return _build(*args, **kwargs)
    except BuildCancelled:
        if _current_result is not None:
            shutil.rmtree(_current_result, ignore_errors=True)
        raise
    finally:
        _current_result = None


def _build(
    game,
    xapk,
    languages,
    default_language="system",
    embedded=False,
    format="manual",
    appdir=None,
    log=print,
    converter=None,
    output_dir=None,
):
    appdir = Path(appdir or application_directory()).resolve()
    game = Path(game).resolve()
    xapk = Path(xapk).resolve()
    assets = find_assets(game)
    output = Path(output_dir).resolve() if output_dir else appdir / "output"
    scratch = output / ".work"
    # If the EXE was placed in the game folder, refuse rather than write there.
    ensure_outside(output, source_roots(game, assets))
    ensure_outside(scratch, source_roots(game, assets))
    apk_only = format == "apk"
    if apk_only:
        languages, default_language, embedded = [], "system", False
    if default_language not in ("system", *LANGUAGES):
        raise ValueError("Unknown default language")
    if default_language != "system" and default_language not in languages:
        raise ValueError("Include the default language in the languages to prepare")
    if format not in ("xapk", "manual", "apk", "data"):
        raise ValueError("Unknown output format")
    vendor = data_root() / "vendor"
    for name in [
        "apktool.jar",
        "uber-apk-signer.jar",
        "gadget.so",
        "setup/classes.dex",
    ]:
        if not (vendor / name).is_file():
            raise ValueError("The builder is missing: " + name)
    output.mkdir(parents=True, exist_ok=True)
    scratch.mkdir(parents=True, exist_ok=True)
    if shutil.disk_usage(output).free < 2 * xapk.stat().st_size + 1024**3:
        raise ValueError("Not enough space for temporary input files and the result")
    with tempfile.TemporaryDirectory(prefix="run-", dir=scratch) as temp:
        work = Path(temp)
        meta, icon, versions = unpack_xapk(xapk, work / "inputs")
        # New builds never overwrite a previous successful output or active server catalog.
        import datetime

        name = build_folder_name(
            builder_channel(), hook_revision(), format, languages, datetime.datetime.now()
        )
        result = output / name
        for attempt in range(2, 100):
            try:
                result.mkdir()
                break
            except FileExistsError:
                result = output / f"{name}-{attempt}"
        else:
            raise ValueError("Too many builds with the same name in the output folder")
        global _current_result
        _current_result = result
        resources = result / "resources"
        emit = log

        def log(text):
            check_cancelled()
            with (result / "build.log").open("a", encoding="utf-8") as stream:
                stream.write(str(text) + "\n")
            emit(text)

        if apk_only:
            public = {"schema": 1, "gameVersionCode": 11009, "packs": []}
            log("APK-only update: no language packs or data archive will be prepared.")
        else:
            inventory = read_manifest(versions)
            codes = {LANGUAGES[language] for language in languages}
            estimated = sum(
                (assets / e["BundleName"]).stat().st_size
                for e in inventory
                if e["StorageMode"] == 0
                and (
                    e["LocCode"] in codes
                    or e["LocCode"] == -1
                    or "filemanifest" in e["BundleName"]
                )
                and (assets / e["BundleName"]).is_file()
            )
            required = 3 * xapk.stat().st_size + 5 * estimated + 512 * 1024**2
            if shutil.disk_usage(output).free < required:
                raise ValueError(
                    f"This build needs approximately {required / 1024**3:.1f} GiB of additional free space"
                )
            kwargs = {"converter": converter} if converter else {}
            try:
                catalog = build_packs(
                    assets,
                    versions,
                    languages,
                    resources,
                    work / "converted",
                    log,
                    **kwargs,
                )
            except BaseException:
                (result / "BUILD_FAILED.txt").write_text(
                    "Resource preparation failed. Do not use partial files.",
                    encoding="utf-8",
                )
                raise
            public = {
                **catalog,
                "packs": [
                    {k: v for k, v in p.items() if k != "manifest"}
                    for p in catalog["packs"]
                ],
            }
        obb_source = work / "inputs" / OBB
        from .resources import sha256

        obb_meta = dict(
            id="obb",
            path="game.obb",
            bytes=obb_source.stat().st_size,
            sha256=sha256(obb_source),
        )
        if not apk_only:
            shutil.copyfile(obb_source, resources / "game.obb")
            public["obb"] = obb_meta
        resources.mkdir(parents=True, exist_ok=True)
        (resources / "catalog.json").write_text(
            json.dumps(public, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        setup = dict(
            schema=1,
            androidBuild=50,
            obb=obb_meta,
            defaultLanguage=default_language,
            hookFeed=hook_feed(),
            hookChannels=hook_channels(),
            hookRelease=json.loads((data_root() / "runtime/manifest.json").read_text(encoding="utf-8")),
            embeddedPacks=public["packs"] if embedded else [],
        )
        try:
            # Data only: the language packs, OBB and data ZIP for a phone that
            # already has this APK; the APK step (Java, signing) is skipped.
            if format == "data":
                log("Data only: no APK is built; use the APK already on the phone.")
            else:
                prepare_builder_emojis(work, game, assets, log)
                apk = native_base(
                    work / "inputs/base.apk", work, vendor, setup, embedded, resources, log
                )
            if format == "data":
                pass
            elif format in ("manual", "apk"):
                shutil.copyfile(apk, result / "tesl-reborn.apk")
            else:
                final = result / "tesl-reborn.xapk"
                obb_path = f"Android/obb/{PACKAGE}/{OBB}"
                meta.update(
                    package_name=PACKAGE,
                    version_code="11009",
                    version_name="2.17.0",
                    total_size=apk.stat().st_size
                    + (work / "inputs" / OBB).stat().st_size
                    + len(icon),
                    split_apks=[{"file": PACKAGE + ".apk", "id": "base"}],
                    expansions=[
                        {
                            "file": obb_path,
                            "install_location": "EXTERNAL_STORAGE",
                            "install_path": obb_path,
                        }
                    ],
                )
                with zipfile.ZipFile(
                    final, "w", zipfile.ZIP_STORED, allowZip64=True
                ) as archive:
                    archive.write(apk, PACKAGE + ".apk")
                    archive.write(work / "inputs" / OBB, obb_path)
                    archive.writestr("icon.png", icon)
                    archive.writestr("manifest.json", json.dumps(meta))
            if format in ("manual", "data"):
                from .archive import write_data_archive

                write_data_archive(resources, result / "tesl-reborn-data.zip", log)
            (result / "build.json").write_text(
                json.dumps(
                    dict(
                        defaultLanguage=default_language,
                        languages=languages,
                        embedded=embedded,
                        format=format,
                        androidBuild=50,
                    ),
                    indent=2,
                ),
                encoding="utf-8",
            )
        except BaseException:
            (result / "BUILD_FAILED.txt").write_text(
                "Build failed. Do not install partial files. See build.log.",
                encoding="utf-8",
            )
            raise
    log("Output ready: " + str(result))
    return result
