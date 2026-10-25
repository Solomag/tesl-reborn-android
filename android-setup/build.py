"""Compile the standalone resource Activity to a DEX injected by the builder."""

import argparse
import os
from pathlib import Path
import shutil
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--vendor", type=Path, default=ROOT / "vendor")
    args = parser.parse_args()
    vendor = args.vendor.resolve()
    out = ROOT / "android-setup/build"
    out.mkdir(exist_ok=True)
    classes = out / "classes"
    if classes.exists():
        shutil.rmtree(classes)
    classes.mkdir()
    sources = list((ROOT / "android-setup/src").rglob("*.java"))
    compiler = (
        ["javac"]
        if shutil.which("javac")
        else ["java", "-m", "jdk.compiler/com.sun.tools.javac.Main"]
    )
    boot = os.pathsep.join(
        map(str, [vendor / "android.jar", vendor / "build-tools/core-lambda-stubs.jar"])
    )
    subprocess.run(
        [
            *compiler,
            "-encoding",
            "UTF-8",
            "-source",
            "8",
            "-target",
            "8",
            "-bootclasspath",
            boot,
            "-d",
            str(classes),
            *map(str, sources),
        ],
        check=True,
    )
    jar = out / "setup.jar"
    with zipfile.ZipFile(jar, "w") as archive:
        for p in classes.rglob("*.class"):
            archive.write(p, p.relative_to(classes).as_posix())
    dex = vendor / "setup"
    dex.mkdir(exist_ok=True)
    subprocess.run(
        [
            "java",
            "-cp",
            str(vendor / "build-tools/lib/d8.jar"),
            "com.android.tools.r8.D8",
            "--min-api",
            "26",
            "--lib",
            str(vendor / "android.jar"),
            "--output",
            str(dex),
            str(jar),
        ],
        check=True,
    )
    print("SETUP_DEX_READY:", dex / "classes.dex")


if __name__ == "__main__":
    main()
