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
            with self.assertRaisesRegex(ValueError, "Не хватает"):
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
            self.assertEqual(activities[-1].get(ANDROID + "name"), SETUP_ACTIVITY)
            self.assertEqual(len(activities[0].findall("intent-filter")), 0)
            self.assertEqual(
                activities[-1]
                .findall("intent-filter")[1]
                .find("data")
                .get(ANDROID + "scheme"),
                "teslreborn",
            )

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

            def fake_native(base, work, vendor, setup, embedded, catalog, log):
                out = work / "test.apk"
                with zipfile.ZipFile(out, "w") as z:
                    z.writestr("test", b"APK fixture")
                return out

            with patch("builder.build.data_root", return_value=root / "data"), patch(
                "builder.build.native_base", side_effect=fake_native
            ), patch("builder.build.prepare_builder_emojis"):
                for fmt in ("manual", "xapk"):
                    result = build(
                        game,
                        source,
                        ["ru_ru"],
                        default_language="ru_ru",
                        embedded=False,
                        format=fmt,
                        appdir=root / "builder",
                        log=lambda _: None,
                        converter=convert,
                    )
                    self.assertTrue((result / "resources/catalog.json").exists())
                    if fmt == "manual":
                        self.assertTrue(
                            (result / f"Android/obb/{PACKAGE}/{OBB}").exists()
                        )
                    else:
                        with zipfile.ZipFile(result / "tesl-reborn.xapk") as z:
                            self.assertEqual(
                                json.loads(z.read("manifest.json"))["package_name"],
                                PACKAGE,
                            )
            self.assertEqual(source.read_bytes(), original)
