"""Smoke-test the frozen Windows EXE without game data."""

import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import traceback


def run(report_path):
    result = {"ok": False}
    try:
        from .build import data_root
        import lief
        import UnityPy
        import qrcode
        import PIL.ImageTk
        import tkinter

        window = tkinter.Tk()
        from .gui import BuilderWindow

        form = BuilderWindow(window)
        form.ui_locale.current(8)
        form.translate_ui(window)
        form.ui_locale.current(0)
        form.translate_ui(window)
        window.withdraw()
        form.qr = PIL.ImageTk.PhotoImage(
            qrcode.make("teslreborn://resources").resize((160, 160))
        )
        form.qr_label.configure(image=form.qr)
        window.update_idletasks()
        window.destroy()
        root = data_root()
        vendor = root / "vendor"
        java = vendor / "jre/bin/java.exe"
        flags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
        checks = [
            [str(java), "-version"],
            [str(java), "-jar", str(vendor / "apktool.jar"), "--version"],
            [str(java), "-jar", str(vendor / "uber-apk-signer.jar"), "--version"],
        ]
        for command in checks:
            process = subprocess.run(
                command, capture_output=True, creationflags=flags, timeout=60
            )
            if process.returncode:
                raise RuntimeError(
                    "Bundled tool smoke test failed: " + Path(command[0]).name
                )
        alignment = subprocess.run(
            [str(vendor / "build-tools/zipalign.exe"), "-h"],
            capture_output=True,
            creationflags=flags,
            timeout=30,
        )
        if alignment.returncode not in (0, 1, 2):
            raise RuntimeError("zipalign could not start")
        binary = lief.parse(str(vendor / "gadget.so"))
        if binary is None:
            raise RuntimeError("LIEF cannot read bundled ARM64 gadget")
        if not (vendor / "setup/classes.dex").read_bytes().startswith(b"dex\n"):
            raise RuntimeError("Missing setup DEX")
        loader = (root / "hook.js").read_text(encoding="utf-8")
        embedded = json.loads(
            re.search(r"const embedded = (.*);\n  const packageName", loader).group(1)
        )
        if (
            hashlib.sha256(embedded["code"].encode()).hexdigest()
            != embedded["meta"]["sha256"]
        ):
            raise RuntimeError("Bundled core hash mismatch")
        result.update(
            ok=True,
            core=embedded["meta"]["version"],
            frozen=bool(getattr(sys, "frozen", False)),
            checks=[
                "Tk GUI and QR rendering",
                "UnityPy",
                "LIEF",
                "QR/Pillow",
                "bundled Java/apktool/signer/zipalign",
                "setup DEX",
                "core SHA-256",
            ],
        )
    except Exception:
        result["error"] = traceback.format_exc()
    Path(report_path).write_text(json.dumps(result, indent=2), encoding="utf-8")
    if not result["ok"]:
        raise SystemExit(1)
