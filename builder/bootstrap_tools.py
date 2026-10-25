"""Fetch build-time tools from upstreams, with recorded checksum verification."""

import argparse
import hashlib
import json
import lzma
from pathlib import Path
import shutil
import subprocess
import sys
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def download(url, target, digest=None, algorithm="sha256"):
    target = Path(target)
    if (
        target.exists()
        and digest
        and hashlib.new(algorithm, target.read_bytes()).hexdigest() == digest
    ):
        return digest
    target.parent.mkdir(parents=True, exist_ok=True)
    print("Downloading", target.name, flush=True)
    request = urllib.request.Request(
        url, headers={"User-Agent": "TESL-Reborn-Builder/1"}
    )
    partial = target.with_suffix(target.suffix + ".partial")
    with urllib.request.urlopen(request, timeout=90) as response, partial.open(
        "wb"
    ) as out:
        shutil.copyfileobj(response, out, 1024 * 1024)
    actual = hashlib.new(algorithm, partial.read_bytes()).hexdigest()
    if digest and actual != digest:
        partial.unlink()
        raise ValueError("Tool checksum mismatch: " + target.name)
    partial.replace(target)
    return actual


def unpack_tool_archive(source, destination):
    destination.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(source) as archive:
        for info in archive.infolist():
            parts = Path(info.filename).parts[1:]
            if not parts:
                continue
            path = destination.joinpath(*parts).resolve()
            if not path.is_relative_to(destination.resolve()):
                raise ValueError("Unsafe tool archive")
            if info.is_dir():
                path.mkdir(parents=True, exist_ok=True)
                continue
            path.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(info) as src, path.open("wb") as out:
                shutil.copyfileobj(src, out)
            if sys.platform != "win32" and info.external_attr >> 16:
                path.chmod((info.external_attr >> 16) & 0o777)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--vendor", type=Path, default=ROOT / "vendor")
    args = parser.parse_args()
    vendor = args.vendor.resolve()
    vendor.mkdir(parents=True, exist_ok=True)
    archives = vendor / "_downloads"
    archives.mkdir(exist_ok=True)
    download(
        "https://github.com/iBotPeaches/Apktool/releases/download/v3.0.3/apktool_3.0.3.jar",
        vendor / "apktool.jar",
        "dbf930b076c6b9be08d57c449cacefc3bdd6b71ebd59b3066fc0e1f5b14f9423",
    )
    download(
        "https://repo.maven.apache.org/maven2/com/google/zxing/core/3.5.3/core-3.5.3.jar",
        vendor / "zxing-core.jar",
        "8d8064c1636fdaef7189dd9055c7d59950a8940a12f2293956446ec3c109fd82",
    )
    download(
        "https://raw.githubusercontent.com/zxing/zxing/zxing-3.5.3/LICENSE",
        vendor / "LICENSE-zxing",
        "3f62881f0566227a24b12e5a754cc79f39aaa94883038e95c94812e1f50af42f",
    )
    # Also inventory the pinned signer in each distribution.
    lock = vendor / "download-lock.json"
    pins = json.loads(lock.read_text()) if lock.exists() else {}
    signer = vendor / "uber-apk-signer.jar"
    digest = download(
        "https://github.com/patrickfav/uber-apk-signer/releases/download/v1.3.0/uber-apk-signer-1.3.0.jar",
        signer,
        "e1299fd6fcf4da527dd53735b56127e8ea922a321128123b9c32d619bba1d835",
    )
    pins["signer"] = digest
    gadget_archive = archives / "gadget.so.xz"
    download(
        "https://github.com/frida/frida/releases/download/17.2.4/frida-gadget-17.2.4-android-arm64.so.xz",
        gadget_archive,
        "b3433370b61225e868874677a774bc1117934feb6c2b3044d4b93ef4e7f67c9d",
    )
    with lzma.open(gadget_archive) as src, (vendor / "gadget.so").open("wb") as out:
        shutil.copyfileobj(src, out)
    download(
        "https://raw.githubusercontent.com/frida/frida-core/17.2.4/COPYING",
        vendor / "COPYING-frida",
        "5ea1544b51a28bc823b03159190d4108f9fb4f4ef912389f5137c6d295e175b2",
    )
    host = "windows" if sys.platform == "win32" else "linux"
    checksum = {
        "linux": "2cfaa0bbb2336e9ec18ed3ecea84fa2e2af607bc",
        "windows": "af059bb67cf7786f45ee0db85e2d24985df1b4b6",
    }[host]
    sdk = archives / "build-tools.zip"
    download(
        f"https://dl.google.com/android/repository/build-tools_r35_{host}.zip",
        sdk,
        checksum,
        "sha1",
    )
    unpack_tool_archive(sdk, vendor / "build-tools")
    platform = archives / "platform.zip"
    download(
        "https://dl.google.com/android/repository/platform-35_r02.zip",
        platform,
        "0bb560a90a7a2cbd0dd8348224d518b638fe7949",
        "sha1",
    )
    with zipfile.ZipFile(platform) as archive:
        name = next(n for n in archive.namelist() if n.endswith("/android.jar"))
        (vendor / "android.jar").write_bytes(archive.read(name))
    lock.write_text(json.dumps(pins, indent=2) + "\n")
    print("TOOLS_READY:", vendor)


if __name__ == "__main__":
    main()
