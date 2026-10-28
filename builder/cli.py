"""Build from the command line with the same steps as the Builder window.

    python -m builder.cli --xapk TESL.xapk [--game "PC game folder"]
                          [--format manual|xapk|apk|data]
                          [--languages en_us,ru_ru] [--default-language system]
                          [--output DIR]

Without --game, the Steam libraries are searched as the window does. The
output is a build-... folder in DIR (default: output next to the Builder).
"""

import argparse
from pathlib import Path
import sys

from .build import build
from .resources import LANGUAGES


def find_game():
    try:
        from .gui import steam_games
    except ImportError:  # No tkinter: the folder has to be given.
        return None
    found = steam_games()
    return found[0] if len(found) == 1 else None


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--xapk", type=Path, required=True, help="the original Android XAPK (versionCode 11009)")
    parser.add_argument("--game", type=Path, help="the PC game folder with StreamingAssets")
    parser.add_argument("--format", choices=("manual", "xapk", "apk", "data"), default="manual",
                        help="manual: APK + data ZIP (default); xapk: offline XAPK; "
                             "apk: APK only; data: data ZIP only")
    parser.add_argument("--languages", default="en_us",
                        help="comma-separated game languages: " + ",".join(LANGUAGES))
    parser.add_argument("--default-language", default="system")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(argv)
    game = args.game or find_game()
    if not game:
        parser.error("--game is needed: the PC game was not found in exactly one Steam library")
    languages = [code for code in args.languages.split(",") if code] if args.format != "apk" else []
    unknown = [code for code in languages if code not in LANGUAGES]
    if unknown:
        parser.error("unknown languages: " + ", ".join(unknown))
    result = build(
        game=game,
        xapk=args.xapk,
        languages=languages,
        default_language=args.default_language,
        embedded=args.format == "xapk",
        format=args.format,
        output_dir=args.output,
        log=lambda text: print(text, flush=True),
    )
    print("BUILD_READY:", result)


if __name__ == "__main__":
    sys.exit(main())
