"""Desktop UI. Launch with python -m builder.gui or the frozen Windows EXE."""

import json
import ipaddress
import os
from pathlib import Path
import queue
import re
import socket
import sys
import threading
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
from urllib.parse import urlsplit

from .build import build, application_directory
from .resources import LANGUAGES, NAMES, find_assets, ensure_outside, source_roots
from .server import ResourceServer


def steam_games():
    libraries = []
    if sys.platform == "win32":
        import winreg

        for hive, name, key in [
            (winreg.HKEY_CURRENT_USER, r"Software\Valve\Steam", "SteamPath"),
            (
                winreg.HKEY_LOCAL_MACHINE,
                r"SOFTWARE\WOW6432Node\Valve\Steam",
                "InstallPath",
            ),
        ]:
            try:
                with winreg.OpenKey(hive, name) as entry:
                    libraries.append(Path(winreg.QueryValueEx(entry, key)[0]))
            except OSError:
                pass
    for candidate in [
        Path.home() / ".steam/steam",
        Path("C:/Program Files (x86)/Steam"),
    ]:
        if candidate.is_dir():
            libraries.append(candidate)
    for library in list(libraries):
        vdf = library / "steamapps/libraryfolders.vdf"
        if vdf.is_file():
            for value in re.findall(
                r'"path"\s+"([^"]+)"', vdf.read_text(encoding="utf-8", errors="replace")
            ):
                libraries.append(Path(value.replace("\\\\", "\\")))
    found = []
    for library in libraries:
        common = library / "steamapps/common"
        if not common.is_dir():
            continue
        for directory in common.iterdir():
            if "legend" not in directory.name.lower():
                continue
            try:
                find_assets(directory)
                if directory.resolve() not in found:
                    found.append(directory.resolve())
            except (ValueError, OSError):
                pass
    return found


def local_ips():
    found = set()
    preferred = None
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("192.0.2.1", 9))
            preferred = sock.getsockname()[0]
            found.add(preferred)
    except OSError:
        pass
    try:
        found.update(
            item[4][0]
            for item in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)
        )
    except OSError:
        pass

    def priority(value):
        ip = ipaddress.ip_address(value)
        private = any(
            ip in ipaddress.ip_network(net)
            for net in ("192.168.0.0/16", "10.0.0.0/8", "172.16.0.0/12")
        )
        return (0 if private and value == preferred else 1 if private else 2, value)

    return sorted((ip for ip in found if not ip.startswith("127.")), key=priority) or [
        "127.0.0.1"
    ]


class BuilderWindow:
    def __init__(self, window):
        self.window = window
        self.window.title("TESL Reborn Builder")
        self.window.geometry("850x850")
        self.events = queue.Queue()
        self.server = None
        self.result = None
        self.running = False
        self.server_starting = False
        self.qr = None
        self.appdir = application_directory()
        self.public_url = tk.StringVar()
        self.cert = tk.StringVar()
        self.key = tk.StringVar()
        self.port = tk.StringVar(value="0")
        root = ttk.Frame(window, padding=12)
        root.pack(fill="both", expand=True)
        ttk.Label(
            root, text="TESL Reborn · Android builder", font=("", 19, "bold")
        ).pack(anchor="w")
        ttk.Label(root, text="Your PC game and original XAPK are read-only.").pack(
            anchor="w"
        )
        uirow = ttk.Frame(root)
        uirow.pack(fill="x", pady=4)
        ttk.Label(uirow, text="Interface language:").pack(side="left")
        self.ui_locale = ttk.Combobox(
            uirow, values=list(NAMES.values()), state="readonly"
        )
        self.ui_locale.current(0)
        self.ui_locale.pack(side="left", padx=8)
        self.ui_locale.bind(
            "<<ComboboxSelected>>", lambda event: self.translate_ui(root)
        )
        self.translated_widgets = {}
        self.game = tk.StringVar()
        games = steam_games()
        row = ttk.Frame(root)
        row.pack(fill="x", pady=4)
        ttk.Label(row, text="PC game", width=16).pack(side="left")
        self.game_picker = ttk.Combobox(
            row, textvariable=self.game, values=[str(p) for p in games]
        )
        self.game_picker.pack(side="left", fill="x", expand=True)
        ttk.Button(row, text="Browse…", command=self.choose_game).pack(side="left")
        if games:
            self.game.set(str(games[0]))
        self.xapk = tk.StringVar()
        self.path_row(root, "Original XAPK", self.xapk, False)
        self.destination = tk.StringVar(value=str(self.appdir / "output"))
        self.path_row(root, "Output folder", self.destination, True)
        ttk.Label(
            root,
            text="Each build gets its own folder. Temporary files are removed automatically.",
        ).pack(anchor="w")
        options = ttk.Frame(root)
        options.pack(fill="x", pady=6)
        self.format = tk.StringVar(value="manual")
        ttk.Radiobutton(
            options,
            text="Small APK + data ZIP",
            variable=self.format,
            value="manual",
        ).pack(side="left")
        ttk.Radiobutton(
            options, text="Offline XAPK", variable=self.format, value="xapk"
        ).pack(side="left")
        ttk.Label(
            root,
            text="ZIP: import once on the phone, or download missing data from this PC.",
        ).pack(anchor="w")
        languages = ttk.LabelFrame(root, text="Game languages to prepare", padding=6)
        languages.pack(fill="x", pady=6)
        self.languages = {}
        for i, code in enumerate(LANGUAGES):
            value = tk.BooleanVar(value=code == "en_us")
            self.languages[code] = value
            ttk.Checkbutton(languages, text=NAMES[code], variable=value).grid(
                row=i // 5, column=i % 5, sticky="w", padx=6
            )
        row = ttk.Frame(root)
        row.pack(fill="x")
        ttk.Label(row, text="Default game language:").pack(side="left")
        self.default = ttk.Combobox(
            row, values=["Phone system language", *NAMES.values()], state="readonly"
        )
        self.default.current(1)
        self.default.pack(side="left", padx=8)
        self.build_button = ttk.Button(root, text="Build", command=self.start_build)
        self.build_button.pack(fill="x", pady=8)
        transfer = ttk.LabelFrame(root, text="Transfer game data to phone", padding=6)
        transfer.pack(fill="x")
        row = ttk.Frame(transfer)
        row.pack(fill="x")
        ttk.Button(
            row, text="Open a previous build…", command=self.choose_catalog
        ).pack(side="left")

        self.ip_var = tk.StringVar()
        self.ip = ttk.Combobox(
            row, textvariable=self.ip_var, values=local_ips(), width=18
        )
        self.ip.current(0)

        ttk.Button(row, text="Start transfer", command=self.start_server).pack(
            side="left", padx=8
        )
        ttk.Button(row, text="Stop", command=self.stop_server).pack(side="left")
        ttk.Button(
            transfer, text="Advanced connection…", command=self.network_options
        ).pack(anchor="w", pady=3)
        self.connection = tk.StringVar(
            value="Build first, then start transfer. Scan the QR with your phone camera to install, or from TESL Reborn for game data. Use the same Wi-Fi or Tailscale."
        )
        ttk.Label(transfer, textvariable=self.connection, wraplength=790).pack(
            anchor="w", pady=6
        )
        self.qr_label = ttk.Label(transfer)
        self.qr_label.pack(side="right")
        self.copy_button = ttk.Button(
            transfer, text="Copy connection details", command=self.copy_connection
        )
        self.copy_button.pack(anchor="w")
        ttk.Label(
            transfer,
            text="Transfer stops 60 seconds after the phone is ready, or after 15 minutes idle.",
        ).pack(anchor="w")
        self.text = tk.Text(root, height=12, wrap="word", state="disabled")
        self.text.pack(fill="both", expand=True, pady=8)
        self.window.protocol("WM_DELETE_WINDOW", self.close)
        self.window.after(100, self.poll)

    def translate_ui(self, parent):
        translations = json.loads(
            (Path(__file__).with_name("ui-text.json")).read_text(encoding="utf-8")
        )
        code = list(NAMES)[self.ui_locale.current()]

        def visit(widget):
            if "text" in widget.keys():
                key = self.translated_widgets.setdefault(
                    str(widget), str(widget["text"])
                )
                widget["text"] = translations.get(key, {}).get(code, key)
            for child in widget.winfo_children():
                visit(child)

        visit(parent)

    def path_row(self, parent, label, variable, directory, filetypes=None):
        row = ttk.Frame(parent)
        row.pack(fill="x", pady=4)
        ttk.Label(row, text=label, width=20).pack(side="left")
        ttk.Entry(row, textvariable=variable).pack(side="left", fill="x", expand=True)

        def choose():
            path = (
                filedialog.askdirectory()
                if directory
                else filedialog.askopenfilename(
                    filetypes=filetypes or [("XAPK", "*.xapk"), ("All files", "*.*")]
                )
            )
            if path:
                variable.set(path)

        ttk.Button(row, text="Browse…", command=choose).pack(side="left")

    def choose_game(self):
        path = filedialog.askdirectory(
            title="Select the PC game folder or StreamingAssets"
        )
        if path:
            self.game.set(path)

    def log(self, text):
        self.events.put(("log", str(text)))

    def start_build(self):
        if self.running:
            return
        try:
            game = Path(self.game.get()).resolve()
            source = Path(self.xapk.get()).resolve()
            destination = Path(self.destination.get()).resolve()
            if not self.game.get() or not self.xapk.get() or not source.is_file():
                raise ValueError("Select the PC game and original XAPK")
            assets = find_assets(game)
            ensure_outside(destination, source_roots(game, assets))
            ensure_outside(destination / ".work", source_roots(game, assets))
            selected = [c for c, v in self.languages.items() if v.get()]
            if not selected:
                raise ValueError("Select at least one language")
            default = (
                "system"
                if self.default.current() == 0
                else list(LANGUAGES)[self.default.current() - 1]
            )
            if default != "system" and default not in selected:
                raise ValueError("Select the default language pack")
            args = dict(
                game=game,
                xapk=source,
                languages=selected,
                default_language=default,
                embedded=self.format.get() == "xapk",
                format=self.format.get(),
                appdir=self.appdir,
                output_dir=destination,
                log=self.log,
            )
        except Exception as error:
            messagebox.showerror("Input files", str(error))
            return
        self.running = True
        self.build_button.state(["disabled"])

        def work():
            try:
                self.events.put(("built", build(**args)))
            except Exception as error:
                self.events.put(("failed", str(error)))

        threading.Thread(target=work, daemon=True).start()

    def choose_catalog(self):
        path = filedialog.askdirectory(title="Select a previous build folder")
        if path:
            folder = Path(path)
            if (
                not (folder / "resources/catalog.json").is_file()
                and not (folder / "catalog.json").is_file()
            ):
                messagebox.showerror(
                    "Previous build",
                    "Select the build folder containing resources, not the PC game folder.",
                )
                return
            self.result = folder
            self.log("Opened previous build: " + str(self.result))

    def start_server(self):
        if self.server_starting:
            return
        if self.server and not self.server.stopped.is_set():
            return
        root = (
            self.result / "resources"
            if self.result and (self.result / "resources/catalog.json").exists()
            else self.result
        )
        if not root:
            messagebox.showinfo(
                "Transfer",
                "Build first, or open resources/catalog.json from a previous build.",
            )
            return
        try:
            port = int(self.port.get())
            cert = self.cert.get().strip() or None
            key = self.key.get().strip() or None
            public = self.public_url.get().strip()
            if not 0 <= port <= 65535:
                raise ValueError("Invalid port")
            if bool(cert) != bool(key):
                raise ValueError("Both certificate and private key are required")
            if public:
                parsed = urlsplit(public)
                if (
                    parsed.scheme != "https"
                    or not parsed.hostname
                    or parsed.username
                    or parsed.password
                    or parsed.query
                    or parsed.fragment
                ):
                    raise ValueError(
                        "Public internet requires an HTTPS URL without credentials or query"
                    )
            if cert and not public:
                raise ValueError("Enter the HTTPS address matching your certificate")
        except ValueError as error:
            messagebox.showerror("Connection", str(error))
            return

        self.server_starting = True
        self.connection.set("Checking files and starting transfer…")

        def start():
            try:
                self.events.put(
                    (
                        "server",
                        (
                            ResourceServer(
                                root,
                                log=self.log,
                                port=port,
                                cert=cert,
                                key=key,
                                apk=(
                                    (root.parent / "tesl-reborn.apk")
                                    if (root.parent / "tesl-reborn.apk").is_file()
                                    else (
                                        (root.parent / "tesl-reborn.xapk")
                                        if (root.parent / "tesl-reborn.xapk").is_file()
                                        else None
                                    )
                                ),
                            ).start(),
                            public,
                        ),
                    )
                )
            except Exception as error:
                self.events.put(("server-error", str(error)))

        threading.Thread(target=start, daemon=True).start()

    def network_options(self):
        dialog = tk.Toplevel(self.window)
        dialog.title("Advanced connection")
        dialog.geometry("700x280")
        ttk.Label(
            dialog,
            text="Wi-Fi and Tailscale need no certificate. These optional settings are only for an existing public HTTPS server.",
        ).pack(anchor="w", padx=8, pady=8)
        row = ttk.Frame(dialog)
        row.pack(fill="x", padx=8)
        ttk.Label(row, text="PC address (Wi-Fi / Tailscale)").pack(side="left")
        ttk.Combobox(row, textvariable=self.ip_var, values=local_ips()).pack(
            side="left"
        )
        self.path_row(
            dialog,
            "Certificate PEM",
            self.cert,
            False,
            [("PEM certificate", "*.pem *.crt"), ("All files", "*.*")],
        )
        self.path_row(
            dialog,
            "Private key PEM",
            self.key,
            False,
            [("PEM key", "*.pem *.key"), ("All files", "*.*")],
        )
        row = ttk.Frame(dialog)
        row.pack(fill="x", padx=8, pady=5)
        ttk.Label(row, text="Public HTTPS URL", width=20).pack(side="left")
        ttk.Entry(row, textvariable=self.public_url).pack(
            side="left", fill="x", expand=True
        )
        row = ttk.Frame(dialog)
        row.pack(fill="x", padx=8, pady=5)
        ttk.Label(row, text="Server port (0 = auto)", width=25).pack(side="left")
        ttk.Entry(row, textvariable=self.port, width=10).pack(side="left")
        ttk.Label(
            dialog,
            text="Leave these fields empty for Wi-Fi or Tailscale.",
        ).pack(anchor="w", padx=8)
        ttk.Button(dialog, text="Done", command=dialog.destroy).pack(pady=8)

    def stop_server(self):
        if self.server:
            threading.Thread(target=self.server.stop, daemon=True).start()

    def copy_connection(self):
        if not self.server or self.server.stopped.is_set():
            return
        self.window.clipboard_clear()
        self.window.clipboard_append(self.connection.get())

    def poll(self):
        try:
            while True:
                kind, value = self.events.get_nowait()
                if kind == "log":
                    self.text.configure(state="normal")
                    self.text.insert("end", value + "\n")
                    self.text.see("end")
                    self.text.configure(state="disabled")
                elif kind in ("built", "failed"):
                    self.running = False
                    self.build_button.state(["!disabled"])
                    if kind == "built":
                        self.result = value
                        self.log("Output: " + str(value))
                        messagebox.showinfo("Done", "Build complete.\n" + str(value))
                    else:
                        self.log("ERROR: " + value)
                        messagebox.showerror("Build failed", value)
                elif kind == "server":
                    self.server_starting = False
                    self.server, public = value
                    url = (
                        public.rstrip("/") + "/"
                        if public
                        else f"http://{self.ip.get()}:{self.server.port}/"
                    )
                    self.connection.set(
                        f"Install / connect: {self.server.connection_url(url)}\nAddress: {url}\nConnection code: {self.server.token}"
                    )
                    try:
                        import qrcode
                        from PIL import ImageTk

                        image = qrcode.make(self.server.connection_url(url)).resize(
                            (160, 160)
                        )
                        self.qr = ImageTk.PhotoImage(image)
                        self.qr_label.configure(image=self.qr)
                        popup = tk.Toplevel(self.window)
                        popup.title("Connect your phone")
                        ttk.Label(
                            popup,
                            text="Scan with your phone camera to install the APK, or scan inside TESL Reborn to download game data.",
                            padding=12,
                            wraplength=370,
                        ).pack()
                        large = ImageTk.PhotoImage(
                            qrcode.make(self.server.connection_url(url)).resize(
                                (360, 360)
                            )
                        )
                        label = ttk.Label(popup, image=large)
                        label.image = large
                        label.pack(padx=12)
                        ttk.Label(
                            popup, text=f"{url}\nCode: {self.server.token}", padding=12
                        ).pack()
                        ttk.Label(
                            popup,
                            text="Keep this builder open until the phone is ready.",
                            padding=12,
                        ).pack()
                        ttk.Button(popup, text="Close", command=popup.destroy).pack(
                            pady=8
                        )
                    except ImportError:
                        self.log("QR unavailable; enter the address and code manually.")
                elif kind == "server-error":
                    self.server_starting = False
                    messagebox.showerror("Transfer", value)
        except queue.Empty:
            pass
        if (
            self.server
            and not self.server_starting
            and self.server.stopped.is_set()
            and self.connection.get() != "Transfer stopped."
        ):
            self.connection.set("Transfer stopped.")
            self.qr_label.configure(image="")
            self.qr = None
        self.window.after(100, self.poll)

    def close(self):
        if self.running:
            messagebox.showinfo(
                "Build",
                "Wait for the build to finish. Closing now would leave an incomplete result.",
            )
            return
        self.stop_server()
        self.window.destroy()


def main():
    window = tk.Tk()
    BuilderWindow(window)
    window.mainloop()


if __name__ == "__main__":
    main()
