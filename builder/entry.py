if __name__ == "__main__":
    import sys

    if sys.platform == "linux" and getattr(sys, "frozen", False):
        from pathlib import Path

        vendor = Path(sys._MEIPASS) / "vendor"
        for name in ("jre/bin/java", "jre/lib/jspawnhelper", "build-tools/zipalign"):
            executable = vendor / name
            if executable.is_file():
                executable.chmod(executable.stat().st_mode | 0o500)

    if len(sys.argv) == 3 and sys.argv[1] in ("--self-test", "--self-test-headless"):
        from builder.selftest import run

        run(sys.argv[2], gui=sys.argv[1] == "--self-test")
    elif len(sys.argv) > 1 and sys.argv[1] == "--build":
        # A build without the window, with the options of builder/cli.py:
        # TESL-Reborn-Builder-Test.exe --build --xapk X --format apk --log build.log
        from builder.cli import main as build_main

        sys.exit(build_main(sys.argv[2:]))
    else:
        from builder.gui import main

        main()
