"""Single importable ZIP; original OBB and verified packs remain unchanged inside it."""

import json
import os
from pathlib import Path
import zipfile


def write_data_archive(resources, output, log=print):
    resources, output = Path(resources), Path(output)
    catalog = json.loads((resources / "catalog.json").read_text(encoding="utf-8"))
    # Put the catalog first for streaming Android import without a second full copy.
    items = [
        ("catalog.json", resources / "catalog.json"),
        ("game.obb", resources / "game.obb"),
    ]
    items += [(p["path"], resources / p["path"]) for p in catalog["packs"]]
    partial = output.with_name(output.name + ".partial")
    try:
        with zipfile.ZipFile(
            partial, "w", zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True
        ) as archive:
            for name, source in items:
                log("Compressing " + name)
                archive.write(
                    source,
                    name,
                    compress_type=(
                        zipfile.ZIP_STORED
                        if name.startswith("packs/")
                        else zipfile.ZIP_DEFLATED
                    ),
                )
        log("Checking data ZIP integrity…")
        with zipfile.ZipFile(partial) as archive:
            bad = archive.testzip()
            if bad:
                raise ValueError("Data archive verification failed: " + bad)
        os.replace(partial, output)
    except BaseException:
        partial.unlink(missing_ok=True)
        raise
    total = sum(source.stat().st_size for _, source in items)
    log(
        f"Data ZIP ready: {output.stat().st_size / 1e6:.1f} MB from {total / 1e6:.1f} MB"
    )
    return output
