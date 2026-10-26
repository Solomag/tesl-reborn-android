"""Full APK build/sign/inspect with synthetic inputs; no original game files."""

import io
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile

from builder.build import build, data_root, PACKAGE, OBB
from unittest.mock import patch


def main():
    repo = data_root()
    vendor = repo / "vendor"
    java = shutil.which("java")
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        project = root / "fixture"
        project.mkdir()
        (project / "res/values").mkdir(parents=True)
        (project / "res/values/strings.xml").write_text(
            '<resources><string name="app_name">Synthetic fixture</string></resources>'
        )
        (project / "AndroidManifest.xml").write_text(
            f"""<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="{PACKAGE}" android:versionCode="11009" android:versionName="2.17.0"><uses-sdk android:minSdkVersion="26" android:targetSdkVersion="28"/><application android:label="@string/app_name" android:extractNativeLibs="true"><activity android:name=".UnityPlayerActivity" android:exported="true"><intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LAUNCHER"/></intent-filter></activity></application></manifest>"""
        )
        compiled = root / "resources.zip"
        aapt = vendor / "build-tools/aapt2"
        subprocess.run(
            [str(aapt), "compile", "--dir", str(project / "res"), "-o", str(compiled)],
            check=True,
        )
        base = root / "base.apk"
        framework = root / "framework"
        subprocess.run(
            [
                str(aapt),
                "link",
                "-I",
                str(vendor / "android.jar"),
                "--manifest",
                str(project / "AndroidManifest.xml"),
                "-o",
                str(base),
                str(compiled),
            ],
            check=True,
        )
        java_source = root / "JNIBridge.java"
        java_source.write_text(
            "package bitter.jnibridge; public class JNIBridge { public static class a { public a() {} } }"
        )
        activity_source = root / "UnityPlayerActivity.java"
        activity_source.write_text(
            "package "
            + PACKAGE
            + "; public class UnityPlayerActivity extends android.app.Activity {}"
        )
        classes = root / "classes"
        classes.mkdir()
        subprocess.run(
            [
                java,
                "-m",
                "jdk.compiler/com.sun.tools.javac.Main",
                "-encoding",
                "UTF-8",
                "--release",
                "8",
                "-cp",
                str(vendor / "android.jar"),
                "-d",
                str(classes),
                str(java_source),
                str(activity_source),
            ],
            check=True,
        )
        jar = root / "fixture.jar"
        with zipfile.ZipFile(jar, "w") as z:
            for p in classes.rglob("*.class"):
                z.write(p, p.relative_to(classes).as_posix())
        dex = root / "dex"
        dex.mkdir()
        subprocess.run(
            [
                java,
                "-cp",
                str(vendor / "build-tools/lib/d8.jar"),
                "com.android.tools.r8.D8",
                "--min-api",
                "26",
                "--output",
                str(dex),
                str(jar),
            ],
            check=True,
        )
        with zipfile.ZipFile(base, "a") as z:
            z.write(dex / "classes.dex", "classes.dex")
            z.write(vendor / "gadget.so", "lib/arm64-v8a/libmain.so")
        game = root / "game"
        assets = game / "The Elder Scrolls Legends_Data/StreamingAssets"
        assets.mkdir(parents=True)
        entries = []
        for name, code in [
            ("appbase/en_us", 0),
            ("appbase/ru_ru", 8),
            ("contentpack000/filemanifest", -1),
        ]:
            p = assets / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(b"synthetic PC bundle")
            entries.append(
                dict(
                    BundleName=name,
                    BundleHash=("a" if code == 0 else "b" if code == 8 else "c") * 32,
                    LocCode=code,
                    StorageMode=0,
                )
            )
        versions = json.dumps({"_entries": entries}).encode()
        obb = io.BytesIO()
        with zipfile.ZipFile(obb, "w") as z:
            z.writestr("assets/versions.json", versions)
        source = root / "original.xapk"
        with zipfile.ZipFile(source, "w") as z:
            z.write(base, PACKAGE + ".apk")
            z.writestr(f"Android/obb/{PACKAGE}/{OBB}", obb.getvalue())
            z.writestr(
                "manifest.json",
                json.dumps(dict(package_name=PACKAGE, version_code="11009")),
            )
            z.writestr("icon.png", b"fixture")
        before = {
            p.relative_to(game): p.read_bytes() for p in game.rglob("*") if p.is_file()
        }

        def fake_convert(a, b):
            b.write_bytes(b"converted fixture " + a.read_bytes())

        def emojis(work, *args):
            shutil.copytree(repo / "resources/emojis", work / "emojis")

        with patch("builder.build.prepare_builder_emojis", side_effect=emojis):
            for embedded, fmt in [(False, "manual"), (True, "xapk"), (False, "apk")]:
                result = build(
                    game,
                    source,
                    [] if fmt == "apk" else ["en_us", "ru_ru"],
                    default_language="system" if fmt == "apk" else "ru_ru",
                    embedded=embedded,
                    format=fmt,
                    appdir=root / "builder",
                    converter=fake_convert,
                )
                if fmt in ("manual", "apk"):
                    apk = result / "tesl-reborn.apk"
                else:
                    with zipfile.ZipFile(result / "tesl-reborn.xapk") as z:
                        apk = root / "inspect.apk"
                        apk.write_bytes(z.read(PACKAGE + ".apk"))
                subprocess.run(
                    [
                        java,
                        "-jar",
                        str(vendor / "uber-apk-signer.jar"),
                        "--onlyVerify",
                        "-a",
                        str(apk),
                    ],
                    check=True,
                )
                from tools.apk_tools import verify_classic_zip

                verify_classic_zip(apk)
                with zipfile.ZipFile(apk) as z:
                    assert z.testzip() is None
                    settings = json.loads(z.read("assets/tesl-reborn/setup.json"))
                    assert settings["hookRelease"] == json.loads((repo / "runtime/manifest.json").read_text())
                    assert any(b"PrelaunchUpdater" in z.read(name) for name in z.namelist() if name.startswith("classes") and name.endswith(".dex"))
                    assert settings["gameActivity"] == PACKAGE + ".UnityPlayerActivity"
                    assert settings["defaultLanguage"] == (
                        "system" if fmt == "apk" else "ru_ru"
                    )
                    assert settings["obb"]["path"] == "game.obb"
                    assert (result / "resources/game.obb").is_file() == (fmt != "apk")
                    if fmt == "apk":
                        assert not (result / "tesl-reborn-data.zip").exists()
                        assert not (result / "resources/packs").exists()
                    assert bool(settings["embeddedPacks"]) == embedded
                    assert "classes2.dex" in z.namelist()
                    assert (
                        z.read("lib/arm64-v8a/libhook.js.so")
                        == (repo / "hook.js").read_bytes()
                    )
                    if embedded:
                        for pack in settings["embeddedPacks"]:
                            assert (
                                z.getinfo(
                                    "assets/tesl-reborn/" + pack["path"]
                                ).compress_type
                                == zipfile.ZIP_STORED
                            )
                # Exercise browser APK delivery from both output formats using the
                # actual signed APK, rather than only the small HTTP fixtures.
                from builder.server import ResourceServer
                import http.client

                transfer_source = (
                    apk if fmt in ("manual", "apk") else result / "tesl-reborn.xapk"
                )
                server = ResourceServer(
                    result / "resources",
                    host="127.0.0.1",
                    apk=transfer_source,
                    log=lambda _: None,
                ).start()
                try:
                    c = http.client.HTTPConnection("127.0.0.1", server.port, timeout=10)
                    c.request(
                        "GET",
                        server.connect_path + "/tesl-reborn.apk",
                        headers={"Range": "bytes=0-1023"},
                    )
                    response = c.getresponse()
                    assert response.status == 206
                    with apk.open("rb") as stream:
                        assert response.read() == stream.read(1024)
                    c.close()
                    assert server.finished_at is None
                finally:
                    server.stop()
                decoded = root / ("inspect-" + fmt)
                subprocess.run(
                    [
                        java,
                        "-jar",
                        str(vendor / "apktool.jar"),
                        "d",
                        "-f",
                        "-s",
                        "-p",
                        str(framework),
                        "-o",
                        str(decoded),
                        str(apk),
                    ],
                    check=True,
                )
                text = (decoded / "AndroidManifest.xml").read_text()
                assert "org.teslreborn.setup.ResourceActivity" in text
                assert "org.teslreborn.setup.ScanActivity" in text
                assert "org.teslreborn.setup.LaunchActivity" in text
                assert "@style/TeslRebornTransition" in text
                assert "@style/TeslRebornSetup" in text
                assert "@style/TeslRebornGame" in text
                from xml.etree import ElementTree as ET

                # Inspect compiled/re-decoded resources, not just the input XML.
                for folder, item_name in (
                    ("values", "android:windowBackground"),
                    ("values-v31", "android:windowSplashScreenBackground"),
                ):
                    items = [
                        item.text.lower()
                        for resource in (decoded / "res" / folder).glob("*.xml")
                        for item in ET.parse(resource).getroot().iter("item")
                        if item.get("name") == item_name
                    ]
                    assert sum(color in ("#171b22", "#ff171b22") for color in items) >= 1, (folder, items)
                    assert sum(color in ("#000000", "#ff000000") for color in items) >= 2, (folder, items)
                assert "org.teslreborn.setup.LanguageActivity" in text

                ns = "{http://schemas.android.com/apk/res/android}"
                application = ET.fromstring(text).find("application")
                provider = application.find("provider")
                assert provider.get(ns + "exported") == "false"
                assert provider.get(ns + "grantUriPermissions") == "true"
                assert provider.get(ns + "process") == ":resources"
                launchers = [
                    a
                    for a in application.findall("activity")
                    if any(
                        i.find("action") is not None
                        and i.find("action").get(ns + "name")
                        == "android.intent.action.MAIN"
                        for i in a.findall("intent-filter")
                    )
                ]
                assert len(launchers) == 1 and launchers[0].get(ns + "name").endswith(
                    "LaunchActivity"
                )
                assert 'android:process=":resources"' in text
        after = {
            p.relative_to(game): p.read_bytes() for p in game.rglob("*") if p.is_file()
        }
        assert before == after
    print(
        "PASS: full synthetic original XAPK -> native launcher/Dex/JNI/ELF -> signed manual, embedded XAPK and APK-only outputs; source game unchanged"
    )


if __name__ == "__main__":
    main()
