"""Windows-native build pipeline. All writes are confined to builder-owned paths."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
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
FEED = "https://raw.githubusercontent.com/Solomag/tesl-reborn-android/android-ui-and-update-loader/updates/test/manifest.json"


def data_root():
    return Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[1]))


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
            ANDROID + "theme": "@android:style/Theme.Material.Light.NoActionBar",
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
            ANDROID + "theme": "@android:style/Theme.NoDisplay",
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
    ET.SubElement(
        application,
        "activity",
        {
            ANDROID + "name": "org.teslreborn.setup.ScanActivity",
            ANDROID + "hardwareAccelerated": "true",
            ANDROID + "exported": "false",
            ANDROID + "process": ":resources",
            ANDROID + "theme": "@android:style/Theme.Material.Light.NoActionBar",
        },
    )
    tree.write(path, encoding="utf-8", xml_declaration=True)
    return original


def invoke(command, log, cwd=None):
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
        for line in process.stdout:
            log(line.rstrip())
        if process.wait():
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


def build(
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
    if default_language not in ("system", *LANGUAGES):
        raise ValueError("Unknown default language")
    if default_language != "system" and default_language not in languages:
        raise ValueError("Include the default language in the languages to prepare")
    if format not in ("xapk", "manual"):
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

        result = output / (
            "build-" + datetime.datetime.now().strftime("%Y%m%d-%H%M%S-%f")
        )
        result.mkdir()
        resources = result / "resources"
        emit = log

        def log(text):
            with (result / "build.log").open("a", encoding="utf-8") as stream:
                stream.write(str(text) + "\n")
            emit(text)

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
        shutil.copyfile(obb_source, resources / "game.obb")
        public["obb"] = obb_meta
        (resources / "catalog.json").write_text(
            json.dumps(public, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        setup = dict(
            schema=1,
            obb=obb_meta,
            defaultLanguage=default_language,
            hookFeed=FEED,
            embeddedPacks=public["packs"] if embedded else [],
        )
        try:
            prepare_builder_emojis(work, game, assets, log)
            apk = native_base(
                work / "inputs/base.apk", work, vendor, setup, embedded, resources, log
            )
            if format == "manual":
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
            if format == "manual":
                from .archive import write_data_archive

                write_data_archive(resources, result / "tesl-reborn-data.zip", log)
            (result / "build.json").write_text(
                json.dumps(
                    dict(
                        defaultLanguage=default_language,
                        languages=languages,
                        embedded=embedded,
                        format=format,
                        androidBuild=28,
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
