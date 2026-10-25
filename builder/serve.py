"""Serve prepared resources on LAN or with an explicitly supplied TLS certificate."""

import argparse
import time
from pathlib import Path
from .server import ResourceServer


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("catalog_directory", type=Path)
    parser.add_argument("--port", type=int, default=0)
    parser.add_argument("--bind", default="0.0.0.0")
    parser.add_argument("--cert", type=Path)
    parser.add_argument("--key", type=Path)
    parser.add_argument(
        "--apk",
        type=Path,
        help="APK or builder XAPK offered on the QR installation page",
    )
    args = parser.parse_args()
    server = ResourceServer(
        args.catalog_directory,
        host=args.bind,
        port=args.port,
        cert=args.cert,
        key=args.key,
        apk=args.apk,
    ).start()
    print("Installation page path:", server.connect_path, flush=True)
    print("Port:", server.port, "\nTemporary access code:", server.token, flush=True)
    try:
        while not server.stopped.wait(1):
            pass
    except KeyboardInterrupt:
        server.stop()


if __name__ == "__main__":
    main()
