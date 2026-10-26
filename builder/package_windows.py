"""Freeze a self-contained desktop builder with tools and Java included."""

import os
from pathlib import Path
import shutil
import subprocess
import sys
import importlib.metadata
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def main():
    if sys.platform not in ("win32", "linux"):
        raise SystemExit("Package on Windows or Linux x86_64 using GitHub Actions")
    windows = sys.platform == "win32"
    binary = "TESL-Reborn-Builder" + (".exe" if windows else "")
    bundle = ROOT / "build/builder-data"
    if bundle.exists():
        shutil.rmtree(bundle)
    vendor = bundle / "vendor"
    vendor.mkdir(parents=True)
    for name in (
        "apktool.jar",
        "uber-apk-signer.jar",
        "gadget.so",
        "download-lock.json",
        "LICENSE-zxing",
    ):
        shutil.copyfile(ROOT / "vendor" / name, vendor / name)
    for name in ("setup", "jre"):
        shutil.copytree(ROOT / "vendor" / name, vendor / name)
    tools = vendor / "build-tools"
    tools.mkdir()
    align = "zipalign.exe" if windows else "zipalign"
    shutil.copy2(ROOT / "vendor/build-tools" / align, tools / align)
    shutil.copyfile(ROOT / "vendor/build-tools/NOTICE.txt", tools / "NOTICE.txt")
    for dll in (ROOT / "vendor/build-tools").glob("*.dll"):
        shutil.copyfile(dll, tools / dll.name)
    if (ROOT / "vendor/build-tools/lib64").exists():
        if windows:
            shutil.copytree(ROOT / "vendor/build-tools/lib64", tools / "lib64")
        else:
            (tools / "lib64").mkdir()
            # zipalign needs libc++, not the SDK's unrelated LLVM/clang libraries.
            for library in (ROOT / "vendor/build-tools/lib64").glob("libc++.so*"):
                shutil.copy2(library, tools / "lib64" / library.name)
    (bundle / "runtime").mkdir()
    shutil.copyfile(ROOT / "runtime/channel.json", bundle / "runtime/channel.json")
    (bundle / "builder").mkdir()
    shutil.copyfile(ROOT / "builder/ui-text.json", bundle / "builder/ui-text.json")
    shutil.copyfile(ROOT / "builder/apk-download.js", bundle / "builder/apk-download.js")
    shutil.copyfile(ROOT / "hook.js", bundle / "hook.js")
    shutil.copyfile(
        ROOT / "JNIBridge_a.patched.smali", bundle / "JNIBridge_a.patched.smali"
    )
    notices = bundle / "third-party-notices"
    notices.mkdir()
    shutil.copyfile(
        ROOT / "runtime/IL2CPP-BRIDGE-LICENSE", notices / "IL2CPP-BRIDGE-LICENSE"
    )
    shutil.copyfile(ROOT / "docs/THIRD_PARTY_BUILDER.md", notices / "README.md")
    for distribution in importlib.metadata.distributions():
        for file in distribution.files or []:
            if not any(
                word in file.name.lower()
                for word in ("license", "licence", "notice", "copying")
            ):
                continue
            source = Path(distribution.locate_file(file))
            if not source.is_file() or source.stat().st_size > 1024**2:
                continue
            relative = Path(*[part for part in file.parts if part not in ("..", ".")])
            target = notices / distribution.metadata["Name"] / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
    for jar_name in ("apktool.jar", "uber-apk-signer.jar", "zxing-core.jar"):
        with zipfile.ZipFile(ROOT / "vendor" / jar_name) as archive:
            for name in archive.namelist():
                if name.endswith("/") or not any(
                    word in name.rsplit("/", 1)[-1].lower()
                    for word in ("license", "notice", "copying")
                ):
                    continue
                target = notices / jar_name / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(archive.read(name))
    for file in (ROOT / "vendor").glob("*-frida"):
        shutil.copyfile(file, notices / file.name)
    shutil.copyfile(vendor / "LICENSE-zxing", notices / "LICENSE-zxing")
    shutil.copyfile(tools / "NOTICE.txt", notices / "ANDROID-SDK-NOTICE.txt")
    shutil.copytree(vendor / "jre/legal", notices / "java-legal")
    command = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--onefile",
        "--windowed",
        "--name",
        "TESL-Reborn-Builder",
        "--paths",
        str(ROOT),
        "--collect-all",
        "UnityPy",
        "--collect-all",
        "lief",
        "--collect-all",
        "qrcode",
        "--collect-all",
        "PIL",
        "--add-data",
        str(bundle) + os.pathsep + ".",
        str(ROOT / "builder/entry.py"),
    ]
    environment = os.environ.copy()
    if not windows:
        # Resolve Tcl/Tk shared libraries from non-system Python installations too.
        python_lib = str(Path(sys.base_prefix) / "lib")
        environment["LD_LIBRARY_PATH"] = (
            python_lib + os.pathsep + environment.get("LD_LIBRARY_PATH", "")
        )
    subprocess.run(command, cwd=ROOT, check=True, env=environment)
    for name in ("builder-ru.md", "THIRD_PARTY_BUILDER.md", "android-43-44-check-ru.md"):
        shutil.copyfile(ROOT / "docs" / name, ROOT / "dist" / name)
    shutil.copytree(notices, ROOT / "dist/third-party-notices", dirs_exist_ok=True)
    if not windows:
        import tarfile

        archive = ROOT / "dist/TESL-Reborn-Builder-Linux-x86_64.tar.gz"
        with tarfile.open(archive, "w:gz") as package:
            for name in (
                binary,
                "builder-ru.md",
                "THIRD_PARTY_BUILDER.md",
                "android-43-44-check-ru.md",
                "third-party-notices",
            ):
                package.add(ROOT / "dist" / name, arcname="TESL-Reborn-Builder/" + name)
    print("DESKTOP_BUILDER_READY:", ROOT / "dist" / binary)


if __name__ == "__main__":
    main()
