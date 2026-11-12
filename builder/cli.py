"""Build from the command line with the same steps as the Builder window.

    python -m builder.cli --xapk TESL.xapk [--game "PC game folder"]
                          [--format manual|xapk|apk|data]
                          [--languages en_us,ru_ru] [--default-language system]
                          [--output DIR] [--log FILE]

The packaged Builder does the same with --build first:

    TESL-Reborn-Builder-Test.exe --build --xapk TESL.xapk --format apk --log build.log

It has no console on Windows, so --log is where its output goes. Without
--game, Steam and the Bethesda.net launcher are searched as the window does.
The output is a build folder in DIR (default: output next to the Builder);
the last line is "BUILD_READY: <folder>" or "BUILD_FAILED: <reason>", and the
exit code is 0 only for a finished build.
"""

import argparse
from pathlib import Path
import sys

from .build import build
from .resources import LANGUAGES, TEXT_LANGUAGES


def find_game():
    from .discovery import find_games
    found = find_games()
    return found[0] if len(found) == 1 else None


def _log_target(argv):
    """The --log file, opened before parsing so that argument errors land
    there too (a Builder without a console has no stdout)."""
    argv = list(sys.argv[1:] if argv is None else argv)
    for i, value in enumerate(argv):
        if value == "--log" and i + 1 < len(argv):
            path = argv[i + 1]
        elif value.startswith("--log="):
            path = value[len("--log="):]
        else:
            continue
        stream = open(path, "w", encoding="utf-8", buffering=1)
        sys.stdout = sys.stderr = stream
        return stream
    return None


def main(argv=None):
    stream = _log_target(argv)
    try:
        return _run(argv)
    finally:
        if stream:
            stream.close()


def _run(argv):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--xapk", type=Path, required=True, help="the original Android XAPK (versionCode 11009)")
    parser.add_argument("--game", type=Path, help="the PC game folder with StreamingAssets")
    parser.add_argument("--format", choices=("manual", "xapk", "apk", "data"), default="manual",
                        help="manual: APK + data ZIP (default); xapk: offline XAPK; "
                             "apk: APK only; data: data ZIP only")
    parser.add_argument("--languages", default="en_us",
                        help="comma-separated game languages: " + ",".join([*LANGUAGES, *TEXT_LANGUAGES]))
    parser.add_argument("--default-language", default="system")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--log", type=Path, help="write the output to this file instead of the console")
    try:
        args = parser.parse_args(argv)
    except SystemExit as stop:
        if stop.code:
            print("BUILD_FAILED: bad arguments", flush=True)
        return stop.code
    game = args.game or find_game()
    if not game:
        print("BUILD_FAILED: --game is needed: the PC game was not found in exactly one place "
              "(Steam, Bethesda.net launcher)", flush=True)
        return 2
    languages = [code for code in args.languages.split(",") if code] if args.format != "apk" else []
    unknown = [code for code in languages if code not in LANGUAGES and code not in TEXT_LANGUAGES]
    if unknown:
        print("BUILD_FAILED: unknown languages: " + ", ".join(unknown), flush=True)
        return 2
    try:
        result = build(
            game=game,
            xapk=args.xapk,
            languages=list(dict.fromkeys(TEXT_LANGUAGES.get(c, c) for c in languages)),
            default_language=args.default_language,
            embedded=args.format == "xapk",
            format=args.format,
            output_dir=args.output,
            log=lambda text: print(text, flush=True),
        )
    except Exception as error:
        print(f"BUILD_FAILED: {type(error).__name__}: {error}", flush=True)
        return 1
    print("BUILD_READY:", result, flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
