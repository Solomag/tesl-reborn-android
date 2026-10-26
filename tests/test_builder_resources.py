import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

from builder.resources import (
    build_packs,
    read_manifest,
    ensure_outside,
    unpack_xapk,
    PACKAGE,
    OBB,
)
from builder.build import patch_manifest, build, ANDROID, SETUP_ACTIVITY


def fixture(root):
    game = root / "game"
    assets = game / "The Elder Scrolls Legends_Data/StreamingAssets"
    assets.mkdir(parents=True)
    entries = []
    for name, code in [
        ("contentpack000/filemanifest", -1),
        ("appbase/en_us", 0),
        ("appbase/ru_ru", 8),
    ]:
        p = assets / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(("PC " + name).encode())
        entries.append(
            dict(
                BundleName=name,
                BundleHash=hashlib.md5(name.encode()).hexdigest(),
                LocCode=code,
                StorageMode=0,
            )
        )
    return game, assets, json.dumps({"_entries": entries}).encode()


def xapk_file(root, versions):
    base = io.BytesIO()
    with zipfile.ZipFile(base, "w") as z:
        z.writestr("lib/arm64-v8a/libmain.so", b"ELF fixture")
    obb = io.BytesIO()
    with zipfile.ZipFile(obb, "w") as z:
        z.writestr("assets/versions.json", versions)
    source = root / "original.xapk"
    with zipfile.ZipFile(source, "w") as z:
        z.writestr(
            "manifest.json",
            json.dumps(dict(package_name=PACKAGE, version_code="11009")),
        )
        z.writestr(PACKAGE + ".apk", base.getvalue())
        z.writestr(f"Android/obb/{PACKAGE}/{OBB}", obb.getvalue())
        z.writestr("icon.png", b"icon")
    return source


def convert(src, dst):
    dst.write_bytes(b"ANDROID " + src.read_bytes())


class BuilderResourcesTest(unittest.TestCase):
    def test_original_game_touch_dispatch_is_preserved(self):
        from builder.build import patch_game_touch

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            path = root / "smali/game/Main.smali"
            path.parent.mkdir(parents=True)
            header = ".class public Lgame/Main;\n.super Landroid/app/Activity;\n"
            for body in [
                "",
                ".method public dispatchTouchEvent(Landroid/view/MotionEvent;)Z\n    .registers 3\n    const/4 v0, 0x1\n    return v0\n.end method\n",
            ]:
                path.write_text(header + body)
                patch_game_touch(root, "game.Main")
                value = path.read_text()
                self.assertEqual(
                    value.count("Lorg/teslreborn/setup/GestureBridge;->onTouch"), 1
                )
                self.assertEqual(value.count("GestureBridge;->onResume"), 1)
                if body:
                    self.assertIn("const/4 v0, 0x1", value)
                else:
                    self.assertIn("invoke-super", value)
                patch_game_touch(root, "game.Main")
                self.assertEqual(path.read_text(), value)

    def test_existing_touch_instrumentation_gets_resume_marker_too(self):
        from builder.build import patch_game_touch

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            path = root / "smali/game/Main.smali"
            path.parent.mkdir(parents=True)
            path.write_text(
                ".class public Lgame/Main;\n.super Landroid/app/Activity;\n.method public dispatchTouchEvent(Landroid/view/MotionEvent;)Z\n .locals 1\n invoke-static {p0, p1}, Lorg/teslreborn/setup/GestureBridge;->onTouch(Landroid/app/Activity;Landroid/view/MotionEvent;)V\n const/4 v0, 0x1\n return v0\n.end method\n.method protected onResume()V\n .locals 0\n invoke-super {p0}, Landroid/app/Activity;->onResume()V\n return-void\n.end method\n"
            )
            patch_game_touch(root, "game.Main")
            result = path.read_text()
            self.assertEqual(result.count("GestureBridge;->onTouch"), 1)
            self.assertEqual(result.count("GestureBridge;->onResume"), 1)
            self.assertEqual(
                result.count("invoke-super {p0}, Landroid/app/Activity;->onResume()V"),
                1,
            )
            patch_game_touch(root, "game.Main")
            self.assertEqual(path.read_text(), result)

    def test_framework_native_activity_can_receive_the_gesture(self):
        from builder.build import patch_game_touch

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "AndroidManifest.xml").write_text(
                '<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application><activity android:name="android.app.NativeActivity"><meta-data android:name="android.app.lib_name" android:value="main"/></activity></application></manifest>'
            )
            activity = patch_game_touch(root, "android.app.NativeActivity")
            self.assertEqual(activity, "org.teslreborn.setup.GameActivityBridge")
            text = (
                root / "smali/org/teslreborn/setup/GameActivityBridge.smali"
            ).read_text()
            self.assertIn(".super Landroid/app/NativeActivity;", text)
            self.assertIn("GestureBridge;->onTouch", text)
            from xml.etree import ElementTree as ET

            metadata = ET.parse(root / "AndroidManifest.xml").find(
                "application/activity/meta-data"
            )
            self.assertEqual(metadata.get(ANDROID + "value"), "main")

    def test_localization_tables_keep_language_values(self):
        from builder.resources import localization_map

        self.assertEqual(
            localization_map('{"menu.play":"Play","card.title":"Guard"}'),
            {"menu.play": "Play", "card.title": "Guard"},
        )
        self.assertEqual(
            localization_map(
                {"_localizedData": [{"Key": "menu.play", "Value": "Играть"}]}
            ),
            {"menu.play": "Играть"},
        )
        self.assertEqual(
            localization_map({"_keys": ["x"], "_values": ["y"]}), {"x": "y"}
        )
        self.assertEqual(localization_map({"not-a-table": 15}), {})

    def test_appended_payload_data_is_aligned(self):
        from build_single_apk import append_to_apk
        import struct

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "source.apk"
            dest = root / "result.apk"
            data = root / "data"
            data.write_bytes(b"payload")
            with zipfile.ZipFile(source, "w") as z:
                z.writestr("old", b"original")
            append_to_apk(
                str(source),
                str(dest),
                {"assets/one": str(data), "assets/two-extra": str(data)},
            )
            with zipfile.ZipFile(dest) as z, dest.open("rb") as raw:
                for name in ["assets/one", "assets/two-extra"]:
                    info = z.getinfo(name)
                    raw.seek(info.header_offset)
                    header = raw.read(30)
                    name_size, extra_size = struct.unpack_from("<HH", header, 26)
                    self.assertEqual(
                        (info.header_offset + 30 + name_size + extra_size) % 4, 0
                    )
                    self.assertEqual(z.read(name), b"payload")

    def test_language_split_and_read_only_sources(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            game, assets, versions = fixture(root)
            before = {
                p.relative_to(game): p.read_bytes()
                for p in game.rglob("*")
                if p.is_file()
            }
            catalog = build_packs(
                assets,
                versions,
                ["en_us", "ru_ru"],
                root / "out",
                root / "scratch",
                lambda _: None,
                convert,
            )
            self.assertEqual(
                [p["id"] for p in catalog["packs"]], ["common", "en_us", "ru_ru"]
            )
            for pack in catalog["packs"]:
                path = root / "out" / pack["path"]
                self.assertEqual(
                    hashlib.sha256(path.read_bytes()).hexdigest(), pack["sha256"]
                )
                with zipfile.ZipFile(path) as z:
                    self.assertIsNone(z.testzip())
                    m = json.loads(z.read("pack.json"))
                    self.assertEqual(m["id"], pack["id"])
                    self.assertEqual(
                        "versions.json" in z.namelist(), pack["id"] == "common"
                    )
                    for entry in m["files"]:
                        self.assertEqual(
                            hashlib.sha256(z.read(entry["path"])).hexdigest(),
                            entry["sha256"],
                        )
            after = {
                p.relative_to(game): p.read_bytes()
                for p in game.rglob("*")
                if p.is_file()
            }
            self.assertEqual(before, after)

    def test_missing_sources_fail_before_writing(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            game, assets, versions = fixture(root)
            (assets / "appbase/ru_ru").unlink()
            with self.assertRaisesRegex(ValueError, "Missing PC resource"):
                build_packs(
                    assets,
                    versions,
                    ["ru_ru"],
                    root / "out",
                    root / "scratch",
                    converter=convert,
                )
            self.assertFalse((root / "out").exists())

    def test_path_validation(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with self.assertRaises(ValueError):
                ensure_outside(root / "game/output", [root / "game"])
            for name in ["../secret", "/absolute", "C:/windows", "a\\b", "a/./b"]:
                with self.assertRaises(ValueError):
                    read_manifest(
                        json.dumps(
                            [
                                dict(
                                    BundleName=name,
                                    BundleHash="a" * 32,
                                    LocCode=0,
                                    StorageMode=0,
                                )
                            ]
                        )
                    )

    def test_manifest_launcher_replaced_and_deeplink_added(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "AndroidManifest.xml"
            path.write_text(
                f"""<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="{PACKAGE}"><uses-sdk android:minSdkVersion="21"/><application><activity android:name=".UnityPlayerActivity"><intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LAUNCHER"/></intent-filter></activity></application></manifest>"""
            )
            self.assertEqual(patch_manifest(path), PACKAGE + ".UnityPlayerActivity")
            from xml.etree import ElementTree as E

            tree = E.parse(path)
            self.assertEqual(tree.find("uses-sdk").get(ANDROID + "minSdkVersion"), "26")
            activities = tree.findall("application/activity")
            setup_activity = next(
                a for a in activities if a.get(ANDROID + "name") == SETUP_ACTIVITY
            )
            self.assertEqual(setup_activity.get(ANDROID + "process"), ":resources")
            scanner = next(
                a
                for a in activities
                if a.get(ANDROID + "name").endswith("ScanActivity")
            )
            self.assertEqual(scanner.get(ANDROID + "exported"), "false")
            for activity in (setup_activity, scanner):
                self.assertEqual(
                    activity.get(ANDROID + "theme"),
                    "@style/TeslRebornSetup",
                )
            self.assertEqual(
                activities[0].get(ANDROID + "theme"), "@style/TeslRebornGame"
            )
            for qualifier in ("values", "values-v31"):
                styles = E.parse(path.parent / "res" / qualifier / "tesl_reborn_windows.xml")
                for name in ("TeslRebornSetup", "TeslRebornGame", "TeslRebornTransition"):
                    alias = styles.find(f"style[@name='{name}']")
                    self.assertEqual(alias.get("parent"), "@style/" + name + "Base")
                    if qualifier == "values":
                        style = styles.find(f"style[@name='{name}Base']")
                        background = "android:windowBackground"
                    else:
                        style = alias
                        background = "android:windowSplashScreenBackground"
                    self.assertEqual(style.find(f"item[@name='{background}']").text, "#171b22" if name == "TeslRebornSetup" else "#000000")
            transition = next(a for a in activities if a.get(ANDROID + "name").endswith("LanguageActivity"))
            self.assertEqual(transition.get(ANDROID + "screenOrientation"), "sensorLandscape")
            self.assertEqual(transition.get(ANDROID + "theme"), "@style/TeslRebornTransition")
            self.assertEqual(transition.find("intent-filter/data").get(ANDROID + "host"), "language")
            provider = tree.find("application/provider")
            self.assertEqual(provider.get(ANDROID + "exported"), "false")
            self.assertEqual(provider.get(ANDROID + "grantUriPermissions"), "true")
            self.assertEqual(provider.get(ANDROID + "process"), ":resources")
            self.assertEqual(provider.get(ANDROID + "authorities"), PACKAGE + ".tesl-reborn-diagnostics")
            self.assertTrue(any(a.get(ANDROID + "name").endswith("DiagnosticsActivity") and a.get(ANDROID + "process") == ":resources" for a in activities))
            gate = next(
                a
                for a in activities
                if a.get(ANDROID + "name").endswith("LaunchActivity")
            )
            self.assertEqual(
                gate.get(ANDROID + "theme"), "@android:style/Theme.NoDisplay"
            )
            self.assertEqual(
                gate.find("intent-filter/action").get(ANDROID + "name"),
                "android.intent.action.MAIN",
            )
            self.assertEqual(len(setup_activity.findall("intent-filter")), 1)
            self.assertEqual(len(activities[0].findall("intent-filter")), 0)
            self.assertEqual(
                setup_activity.findall("intent-filter")[0]
                .find("data")
                .get(ANDROID + "scheme"),
                "teslreborn",
            )

    def test_starting_window_keeps_game_theme_and_launcher_alias(self):
        from xml.etree import ElementTree as E

        for activity_theme in ("", 'android:theme="@style/OriginalGame"'):
            with self.subTest(activity_theme=activity_theme), tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / "AndroidManifest.xml"
                path.write_text(
                    f'''<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="{PACKAGE}">
                    <application android:theme="@style/OriginalApp">
                    <activity android:name="Game" {activity_theme} android:screenOrientation="landscape">
                    <meta-data android:name="android.app.lib_name" android:value="main"/></activity>
                    <activity-alias android:name=".Launcher" android:targetActivity="Game">
                    <intent-filter><action android:name="android.intent.action.MAIN"/>
                    <category android:name="android.intent.category.LAUNCHER"/></intent-filter>
                    </activity-alias></application></manifest>'''
                )
                self.assertEqual(patch_manifest(path), PACKAGE + ".Game")
                styles = E.parse(path.parent / "res/values/tesl_reborn_windows.xml")
                game = styles.find("style[@name='TeslRebornGameBase']")
                self.assertEqual(game.get("parent"), "@style/OriginalGame" if activity_theme else "@style/OriginalApp")
                app = E.parse(path).find("application")
                self.assertEqual(app.get(ANDROID + "theme"), "@style/OriginalApp")
                activity = app.find("activity")
                self.assertEqual(activity.get(ANDROID + "screenOrientation"), "landscape")
                self.assertEqual(activity.find("meta-data").get(ANDROID + "value"), "main")

    def test_xapk_and_manual_outputs_keep_original_obb(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            game, assets, versions = fixture(root)
            source = xapk_file(root, versions)
            original = source.read_bytes()
            vendor = root / "data/vendor"
            vendor.mkdir(parents=True)
            for name in [
                "apktool.jar",
                "uber-apk-signer.jar",
                "gadget.so",
                "setup/classes.dex",
            ]:
                p = vendor / name
                p.parent.mkdir(exist_ok=True)
                p.write_bytes(b"tool fixture")

            channel = root / "data/runtime/channel.json"
            channel.parent.mkdir(parents=True)
            channel.write_text('{"feedUrl":"https://example.com/manifest.json"}')

            def fake_native(base, work, vendor, setup, embedded, catalog, log):
                out = work / "test.apk"
                with zipfile.ZipFile(out, "w") as z:
                    z.writestr("test", b"APK fixture")
                return out

            with patch("builder.build.data_root", return_value=root / "data"), patch(
                "builder.build.native_base", side_effect=fake_native
            ), patch("builder.build.prepare_builder_emojis"):
                for fmt in ("manual", "xapk", "apk"):
                    result = build(
                        game,
                        source,
                        [] if fmt == "apk" else ["ru_ru"],
                        default_language="system" if fmt == "apk" else "ru_ru",
                        embedded=False,
                        format=fmt,
                        appdir=root / "builder",
                        log=lambda _: None,
                        converter=convert,
                    )
                    self.assertTrue((result / "resources/catalog.json").exists())
                    if fmt == "apk":
                        self.assertTrue((result / "tesl-reborn.apk").is_file())
                        self.assertFalse((result / "tesl-reborn-data.zip").exists())
                        self.assertFalse((result / "resources/game.obb").exists())
                        self.assertFalse((result / "resources/packs").exists())
                        self.assertEqual(
                            json.loads((result / "resources/catalog.json").read_text())[
                                "packs"
                            ],
                            [],
                        )
                    elif fmt == "manual":
                        with zipfile.ZipFile(result / "tesl-reborn-data.zip") as data:
                            self.assertEqual(
                                data.read("game.obb"),
                                (result / "resources/game.obb").read_bytes(),
                            )
                            self.assertEqual(data.namelist()[0], "catalog.json")
                    else:
                        with zipfile.ZipFile(result / "tesl-reborn.xapk") as z:
                            self.assertEqual(
                                json.loads(z.read("manifest.json"))["package_name"],
                                PACKAGE,
                            )
            self.assertEqual(source.read_bytes(), original)
