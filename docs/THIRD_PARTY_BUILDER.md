# Builder third-party components

The builder contains no original game APK, OBB or Unity asset bundles. Inputs
are supplied by its user. Do not add these inputs, generated outputs, logs or
private signing material to git or Actions artifacts.

Upstream build/runtime components:

- Python / tkinter: https://www.python.org/ and https://www.tcl.tk/
- PyInstaller: https://pyinstaller.org/ (including its bootloader exception).
- UnityPy: https://github.com/K0lb3/UnityPy (and its packaged dependencies).
- LIEF: https://github.com/lief-project/LIEF
- qrcode / Pillow: https://github.com/lincolnloop/python-qrcode and https://python-pillow.org/
- Apktool 3.0.3: https://github.com/iBotPeaches/Apktool/releases/tag/v3.0.3
- uber-apk-signer 1.3.0: https://github.com/patrickfav/uber-apk-signer/releases/tag/v1.3.0
- Frida gadget 17.23.3: https://github.com/frida/frida/releases/tag/17.23.3
  and corresponding component source https://github.com/frida/frida-core/tree/17.23.3
  (the Android gadget is not modified).
- Existing IL2CPP bridge snapshot: runtime/IL2CPP-BRIDGE-LICENSE and runtime/README.md.
- Android build-tools 35.0.0: https://developer.android.com/tools/releases/build-tools
  Preserve the supplied NOTICE.txt with redistributed tooling.
- Eclipse Temurin OpenJDK 17: https://adoptium.net/ and the runtime's legal/ notices.

Original license/notice files must accompany distributions. The packaging recipe
copies Python distribution license files, the bridge notice, jar notices and
Android NOTICE, and retains Java runtime legal notices. Review the final Windows
artifact and applicable redistribution conditions before publishing it broadly.
Android SDK android.jar, D8 test/compiler artifacts and synthetic APK fixtures are
build-time tools and are not included in the runtime EXE.

Emoji resources are obtained from the pinned official Reborn plugin distribution
at user build time (or read from an installed matching plugin). Their inclusion
does not imply a new license grant; this project does not upload them to git.

ZXing Core 3.5.3 (https://github.com/zxing/zxing/tree/zxing-3.5.3), Apache-2.0,
is compiled into the Android setup DEX for local QR decoding. Its LICENSE is
included in the generated APK and the Windows distribution. Camera frames are
not saved or sent to the network.
