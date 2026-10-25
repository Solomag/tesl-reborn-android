"""Create verified Android cache packs without modifying the source game."""

import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import time
import zipfile

LANGUAGES = {
    "en_us": 0,
    "de_de": 1,
    "es_es": 2,
    "es_mx": 3,
    "fr_fr": 4,
    "it_it": 5,
    "pl_pl": 6,
    "pt_br": 7,
    "ru_ru": 8,
    "tr_tr": 9,
}
NAMES = {
    "en_us": "English",
    "de_de": "Deutsch",
    "es_es": "Español",
    "es_mx": "Español (México)",
    "fr_fr": "Français",
    "it_it": "Italiano",
    "pl_pl": "Polski",
    "pt_br": "Português (Brasil)",
    "ru_ru": "Русский",
    "tr_tr": "Türkçe",
}
PACKAGE = "com.bethsoft.theelderscrollslegends"
OBB = f"main.11009.{PACKAGE}.obb"


def sha256(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def safe_relative(value):
    if not isinstance(value, str) or not value or "\\" in value or ":" in value:
        raise ValueError("Invalid resource path")
    path = PurePosixPath(value)
    if path.is_absolute() or any(p in ("", ".", "..") for p in value.split("/")):
        raise ValueError("Unsafe resource path: " + value)
    return path


def read_manifest(raw):
    data = json.loads(raw)
    entries = data.get("_entries") if isinstance(data, dict) else data
    if not isinstance(entries, list) or not entries:
        raise ValueError("No bundle inventory in versions.json")
    for entry in entries:
        safe_relative(entry["BundleName"])
        if not re.fullmatch("[a-fA-F0-9]{1,32}", str(entry["BundleHash"])):
            raise ValueError("Invalid bundle hash")
        if entry["StorageMode"] not in (0, 1):
            raise ValueError("Unsupported storage mode")
        if entry["LocCode"] not in (-1, *LANGUAGES.values()):
            raise ValueError("Unsupported language code")
    return entries


def find_assets(path):
    path = Path(path).resolve()
    for candidate in (
        path / "The Elder Scrolls Legends_Data/StreamingAssets",
        path / "StreamingAssets",
        path,
    ):
        if candidate.is_dir() and any(
            p.is_dir() and p.name.startswith(("contentpack", "appbase"))
            for p in candidate.iterdir()
        ):
            return candidate
    raise ValueError("Не найдена папка StreamingAssets в выбранной игре")


def ensure_outside(path, sources):
    target = Path(path).resolve()
    for source in sources:
        source = Path(source).resolve()
        if target == source or target.is_relative_to(source):
            raise ValueError(
                "Папка результатов/работы должна находиться вне папки исходной игры"
            )


def source_roots(game, assets):
    roots = [Path(game).resolve(), Path(assets).resolve()]
    if roots[1].name == "StreamingAssets" and roots[1].parent.name.endswith("_Data"):
        roots.append(roots[1].parent.parent)
    return roots


def unpack_xapk(source, work):
    """Extract only expected inputs, never arbitrary archive paths."""
    work = Path(work)
    work.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(source) as archive:
        if len(archive.namelist()) != len(set(archive.namelist())):
            raise ValueError("Duplicate XAPK entries")
        if (
            archive.getinfo("manifest.json").file_size > 1024**2
            or archive.getinfo("icon.png").file_size > 5 * 1024**2
        ):
            raise ValueError("XAPK metadata exceeds size limit")
        meta = json.loads(archive.read("manifest.json"))
        if (
            meta.get("package_name") != PACKAGE
            or str(meta.get("version_code")) != "11009"
        ):
            raise ValueError(
                "Нужен оригинальный XAPK com.bethsoft.theelderscrollslegends, versionCode 11009"
            )
        apk_names = [n for n in archive.namelist() if n.endswith(".apk")]
        if len(apk_names) != 1:
            raise ValueError(
                "Split APK packages are not supported; choose the original single-base XAPK"
            )
        obb_name = f"Android/obb/{PACKAGE}/{OBB}"
        if (
            archive.getinfo(apk_names[0]).file_size > 512 * 1024**2
            or archive.getinfo(obb_name).file_size > 4 * 1024**3
        ):
            raise ValueError("Original APK/OBB exceeds supported input size")
        for entry, output in [
            (apk_names[0], work / "base.apk"),
            (obb_name, work / OBB),
        ]:
            with archive.open(entry) as src, output.open("wb") as dst:
                import shutil

                shutil.copyfileobj(src, dst, 1024 * 1024)
        icon = archive.read("icon.png")
    with zipfile.ZipFile(work / "base.apk") as base:
        base.getinfo("lib/arm64-v8a/libmain.so")
    with zipfile.ZipFile(work / OBB) as obb:
        info = obb.getinfo("assets/versions.json")
        if info.file_size > 32 * 1024**2:
            raise ValueError("Oversized versions.json")
        raw = obb.read(info)
    read_manifest(raw)
    (work / "versions.json").write_bytes(raw)
    return meta, icon, raw


def convert_bundle(source, output):
    import UnityPy
    from UnityPy.enums import BuildTarget
    from UnityPy.files import BundleFile

    env = UnityPy.load(str(source))
    found = [f for f in env.files.values() if isinstance(f, BundleFile)]
    if len(found) != 1:
        raise ValueError(f"Expected exactly one Unity bundle: {source}")
    for item in found[0].files.values():
        if hasattr(item, "_m_target_platform"):
            item._m_target_platform = 13
            item.target_platform = BuildTarget.Android
    Path(output).write_bytes(found[0].save(packer="original"))


def build_packs(
    assets, versions, languages, output, scratch, log=print, converter=convert_bundle
):
    assets, output, scratch = Path(assets).resolve(), Path(output), Path(scratch)
    ensure_outside(output, source_roots(assets, assets))
    ensure_outside(scratch, source_roots(assets, assets))
    entries = read_manifest(versions)
    if not languages or any(lang not in LANGUAGES for lang in languages):
        raise ValueError("Выбери хотя бы один язык")
    selected = {LANGUAGES[lang] for lang in languages}
    common = [
        e
        for e in entries
        if e["StorageMode"] == 0
        and ("filemanifest" in e["BundleName"] or e["LocCode"] == -1)
    ]
    local = {
        lang: [
            e
            for e in entries
            if e["StorageMode"] == 0
            and e["LocCode"] == LANGUAGES[lang]
            and e not in common
        ]
        for lang in languages
    }
    if any(not group for group in local.values()):
        raise ValueError("В манифесте нет пакетов для одного из выбранных языков")
    wanted = common + [e for group in local.values() for e in group]
    missing = []
    for entry in wanted:
        path = assets.joinpath(*safe_relative(entry["BundleName"]).parts).resolve()
        if not path.is_relative_to(assets) or not path.is_file():
            missing.append(entry["BundleName"])
    if missing:
        raise ValueError("Не хватает исходных ресурсов:\n" + "\n".join(missing[:25]))
    output.mkdir(parents=True, exist_ok=True)
    scratch.mkdir(parents=True, exist_ok=True)
    catalog = dict(
        schema=1,
        format="tesl-reborn-resources-v1",
        gameVersionCode=11009,
        abi="arm64-v8a",
        packs=[],
    )
    for pack_id, group in [("common", common), *local.items()]:
        files = []
        staging = scratch / pack_id
        staging.mkdir()

        def record(path, relative):
            files.append(
                dict(path=relative, bytes=path.stat().st_size, sha256=sha256(path))
            )

        if pack_id == "common":
            p = staging / "versions.json"
            p.write_bytes(versions)
            record(p, "versions.json")
        seen = set()
        for index, entry in enumerate(group):
            relative = f'UnityCache/Shared/{PurePosixPath(entry["BundleName"]).name}/{entry["BundleHash"]}'
            if relative in seen:
                raise ValueError("Duplicate cache key: " + relative)
            seen.add(relative)
            target = staging / relative
            target.mkdir(parents=True)
            log(f'{pack_id}: {index + 1}/{len(group)} {entry["BundleName"]}')
            converter(assets / entry["BundleName"], target / "__data")
            (target / "__info").write_bytes(
                f"-1\n{int(time.time())}\n1\n__data\n".encode("ascii")
            )
            for name in ("__data", "__info"):
                record(target / name, relative + "/" + name)
        manifest = dict(
            schema=1,
            format="tesl-reborn-pack-v1",
            id=pack_id,
            gameVersionCode=11009,
            files=files,
        )
        partial = output / (pack_id + ".zip.partial")
        with zipfile.ZipFile(
            partial, "w", zipfile.ZIP_STORED, allowZip64=False
        ) as archive:
            archive.writestr("pack.json", json.dumps(manifest, separators=(",", ":")))
            for item in files:
                archive.write(staging / item["path"], item["path"])
        digest = sha256(partial)
        if partial.stat().st_size > 1024**3:
            raise ValueError(
                "Пакет превышает поддерживаемый клиентом размер 1 GiB: " + pack_id
            )
        directory = output / "packs"
        directory.mkdir(exist_ok=True)
        final = directory / (digest + ".zip")
        os.replace(partial, final)
        catalog["packs"].append(
            dict(
                id=pack_id,
                name=NAMES.get(pack_id, "Общие ресурсы"),
                path="packs/" + final.name,
                bytes=final.stat().st_size,
                sha256=digest,
                unpackedBytes=sum(f["bytes"] for f in files),
                manifest=manifest,
            )
        )
    # Full file manifests are in each archive; the public catalog remains small.
    public = {
        **catalog,
        "packs": [
            {k: v for k, v in p.items() if k != "manifest"} for p in catalog["packs"]
        ],
    }
    (output / "catalog.json").write_text(
        json.dumps(public, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return catalog
