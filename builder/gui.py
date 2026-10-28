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
from datetime import datetime, timezone
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
from tkinter import font as tkfont
from urllib.parse import urlsplit

from .build import build, application_directory, data_root, cancel_build, BuildCancelled
from . import selfupdate
from .resources import LANGUAGES, NAMES, find_assets, ensure_outside, source_roots
from .server import ResourceServer


def configure_ui_font(window):
    # Legacy Windows bitmap fonts can render Cyrillic while dropping Latin
    # accents. Use a Unicode outline font for controls and popup lists alike.
    available = {family.casefold(): family for family in tkfont.families(window)}
    preferred = (
        ("Segoe UI", "Tahoma", "Arial")
        if sys.platform == "win32"
        else ("Noto Sans", "DejaVu Sans", "Liberation Sans")
    )
    family = next(
        (
            available[name.casefold()]
            for name in preferred
            if name.casefold() in available
        ),
        None,
    )
    if family is None:
        return
    for name in (
        "TkDefaultFont",
        "TkTextFont",
        "TkMenuFont",
        "TkHeadingFont",
        "TkCaptionFont",
        "TkIconFont",
        "TkTooltipFont",
    ):
        try:
            tkfont.nametofont(name, root=window).configure(family=family, size=10)
        except tk.TclError:
            pass
    ttk.Style(window).configure(".", font="TkDefaultFont")
    window.option_add("*TCombobox*Listbox.font", "TkTextFont")


def configure_dark_theme(window):
    """Use the same palette on Windows/Linux, independent of OS light mode."""
    bg, panel, field = "#171b22", "#202630", "#262e3a"
    text, muted, accent = "#e8edf5", "#9daabd", "#345985"
    style = ttk.Style(window)
    if "clam" in style.theme_names():
        style.theme_use("clam")
    window.configure(background=bg)
    window.option_add("*background", bg)
    window.option_add("*foreground", text)
    window.option_add("*Text.background", field)
    window.option_add("*Text.foreground", text)
    window.option_add("*Text.insertBackground", text)
    window.option_add("*Text.selectBackground", accent)
    window.option_add("*TCombobox*Listbox.background", field)
    window.option_add("*TCombobox*Listbox.foreground", text)
    window.option_add("*TCombobox*Listbox.selectBackground", accent)
    window.option_add("*TCombobox*Listbox.selectForeground", text)
    style.configure(
        ".",
        background=bg,
        foreground=text,
        bordercolor="#414c5d",
        lightcolor=panel,
        darkcolor=bg,
        focuscolor=accent,
    )
    style.map(".", foreground=[("disabled", muted)])
    style.configure("TButton", background=panel, padding=(8, 5))
    style.map(
        "TButton",
        background=[("pressed", accent), ("active", "#303d50")],
        foreground=[("disabled", muted)],
    )
    for name in ("TCheckbutton", "TRadiobutton"):
        style.configure(
            name, background=bg, indicatorbackground=field, indicatorforeground=text
        )
        style.map(
            name,
            background=[("active", panel)],
            indicatorbackground=[("selected", accent), ("disabled", panel)],
            foreground=[("disabled", muted)],
        )
    for name in ("TEntry", "TCombobox", "TSpinbox"):
        style.configure(
            name,
            fieldbackground=field,
            background=field,
            foreground=text,
            insertcolor=text,
            selectbackground=accent,
            selectforeground=text,
            arrowcolor=text,
        )
        style.map(
            name,
            fieldbackground=[("disabled", panel), ("readonly", field)],
            foreground=[("disabled", muted), ("readonly", text)],
            selectbackground=[("readonly", accent)],
        )
    style.configure("TLabelframe", background=bg, bordercolor="#414c5d")
    style.configure("TLabelframe.Label", background=bg, foreground=text)
    style.configure("TScrollbar", background=panel, troughcolor=bg, arrowcolor=text)


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


def open_folder(folder):
    """The platform file manager at this folder."""
    import subprocess

    if sys.platform == "win32":
        os.startfile(str(folder))
    else:
        subprocess.Popen(["open" if sys.platform == "darwin" else "xdg-open", str(folder)])


class BuilderWindow:
    def __init__(self, window):
        self.window = window
        configure_ui_font(window)
        configure_dark_theme(window)
        self.window.title("TESL Reborn Builder")
        self.window.geometry("850x850")
        self.events = queue.Queue()
        self.server = None
        self.result = None
        self.running = False
        self.server_starting = False
        self.connection_popup = None
        self.qr = None
        self.appdir = application_directory()
        self.expert = tk.BooleanVar(value=False)
        self.saved_language_selection = None
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
            "<<ComboboxSelected>>", lambda event: self.translate_ui(self.window)
        )
        ttk.Checkbutton(uirow, text="Expert mode", variable=self.expert,
                        command=self.expert_changed).pack(side="right")
        # The Builder updates itself from the main repository's releases
        # (builder/selfupdate.py): checked at start, and on demand here.
        self.version = selfupdate.current(data_root())
        updates = ttk.Frame(root)
        updates.pack(fill="x", pady=2)
        self.version_label = ttk.Label(updates, text=self.version_text())
        self.version_label.pack(side="left")
        self.update_button = ttk.Button(updates, text="Check for updates",
                                        command=lambda: self.check_updates(manual=True))
        self.update_button.pack(side="right")
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
        opener = ttk.Frame(root)
        opener.pack(fill="x")
        ttk.Button(opener, text="Open folder", command=self.open_output).pack(side="right")
        ttk.Label(
            root,
            text="Each build gets its own folder. Temporary files are removed automatically.",
        ).pack(anchor="w")
        options = ttk.Frame(root)
        options.pack(fill="x", pady=6)
        self.apk_only = tk.BooleanVar(value=False)
        self.data_only = tk.BooleanVar(value=False)
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
        self.language_checks = []
        for i, code in enumerate(LANGUAGES):
            value = tk.BooleanVar(value=code == "en_us")
            self.languages[code] = value
            check = ttk.Checkbutton(languages, text=NAMES[code], variable=value)
            check.grid(row=i // 5, column=i % 5, sticky="w", padx=6)
            self.language_checks.append(check)
        row = ttk.Frame(root)
        row.pack(fill="x")
        ttk.Label(row, text="Default game language:").pack(side="left")
        self.default = ttk.Combobox(
            row, values=["Phone system language", *NAMES.values()], state="readonly"
        )
        self.default.current(1)
        self.default.pack(side="left", padx=8)
        self.output_options = options
        self.expert_row = ttk.Frame(root)
        ttk.Checkbutton(self.expert_row, text="APK only (keep installed game data)",
                        variable=self.apk_only, command=self.apk_only_changed).pack(side="left")
        ttk.Checkbutton(self.expert_row, text="Data ZIP only (keep installed APK)",
                        variable=self.data_only, command=self.data_only_changed).pack(side="left", padx=12)
        ttk.Button(self.expert_row, text="Advanced connection…",
                   command=self.network_options).pack(side="right")
        self.expert_hint = ttk.Label(root, wraplength=790,
            text="APK only: installed game data is kept. No languages, OBB or data ZIP are built.")
        self.build_button = ttk.Button(root, text="Build", command=self.start_build)
        self.build_button.pack(fill="x", pady=8)
        transfer = ttk.LabelFrame(root, text="Transfer game data to phone", padding=6)
        transfer.pack(fill="x")
        row = ttk.Frame(transfer)
        row.pack(fill="x")
        self.previous_button = ttk.Button(
            row, text="Transfer an existing build…", command=self.choose_catalog)
        self.previous_button.pack(side="left")

        self.ip_var = tk.StringVar()
        self.ip = ttk.Combobox(
            row, textvariable=self.ip_var, values=local_ips(), width=18
        )
        self.ip.current(0)

        self.start_button = ttk.Button(row, text="Start transfer", command=self.start_server)
        self.start_button.pack(side="left", padx=8)
        self.stop_button = ttk.Button(row, text="Stop", command=self.stop_server)
        self.connect_button = ttk.Button(row, text="Show QR / connection", command=self.show_connection)
        ttk.Label(transfer, text="Reuse an output folder to transfer it again without rebuilding.").pack(anchor="w")
        self.connection = tk.StringVar(
            value="Build first, then start transfer. Scan the QR with your phone camera to install, or from TESL Reborn for game data. Use the same Wi-Fi or Tailscale."
        )
        ttk.Label(transfer, textvariable=self.connection, wraplength=790).pack(
            anchor="w", pady=6
        )
        self.qr_label = ttk.Label(transfer)
        self.qr_label.pack(side="right")
        ttk.Label(
            transfer,
            text="Transfer stops 60 seconds after the phone is ready, or after 15 minutes idle.",
        ).pack(anchor="w")
        self.text = tk.Text(root, height=12, wrap="word", state="disabled")
        self.text.pack(fill="both", expand=True, pady=8)
        self.window.protocol("WM_DELETE_WINDOW", self.close)
        if self.preferences().get("expert"):
            self.expert.set(True)
            self.expert_changed()
        self.window.after(100, self.poll)
        if getattr(sys, "frozen", False):
            selfupdate.cleanup()
            self.window.after(1500, self.check_updates)

    def version_text(self):
        build = self.version["build"]
        return "Builder " + (f"build {build}" if build else "local build") + " · " + self.version["channel"]

    def check_updates(self, manual=False):
        """Ask the release of this Builder's channel in the background."""
        self.update_button.state(["disabled"])

        def work():
            try:
                self.events.put(("update-offer", (selfupdate.check(self.version), manual)))
            except Exception as error:
                self.events.put(("update-error", (str(error), manual)))

        threading.Thread(target=work, daemon=True).start()

    def offer_update(self, offer, manual):
        # The start-up check and "Check for updates" can both offer the same
        # build; a second install overwrote the restarted Builder (WinError 32).
        if getattr(self, "installing", False):
            return
        self.update_button.state(["!disabled"])
        if not offer:
            if manual:
                messagebox.showinfo("Builder", self.tr("You have the latest Builder.") + "\n" + self.version_text())
            return
        if not getattr(sys, "frozen", False):
            self.log(f"Builder build {offer['build']} is available; a source checkout does not update itself.")
            return
        if self.running:
            if manual:
                messagebox.showinfo("Builder", self.tr("Wait for the build to finish, then update."))
            return
        self.installing = True
        if not messagebox.askyesno(
            "Builder",
            self.tr("A new Builder is available. Update and restart now?")
            + f"\n{self.version_text()} → build {offer['build']}",
        ):
            self.installing = False
            return
        self.update_button.state(["disabled"])
        self.log(f"Downloading Builder build {offer['build']}…")

        def work():
            try:
                self.events.put(("update-installed", selfupdate.install(offer)))
            except Exception as error:
                self.events.put(("update-error", (str(error), True)))

        threading.Thread(target=work, daemon=True).start()

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
        index = self.default.current()
        self.default.configure(values=[self.tr("Phone system language"), *NAMES.values()])
        if index >= 0:
            self.default.current(index)
        self.build_button.configure(text=self.build_text())
        if self.server and not self.server.stopped.is_set():
            self.connection.set(self.connection_details())
        elif self.server_starting:
            self.connection.set(self.tr("Checking files and starting transfer…"))
        elif self.server:
            self.connection.set(self.tr("Transfer stopped."))
        else:
            self.connection.set(self.tr("Build first, then start transfer. Scan the QR with your phone camera to install, or from TESL Reborn for game data. Use the same Wi-Fi or Tailscale."))

    def tr(self, key):
        translations = json.loads(
            Path(__file__).with_name("ui-text.json").read_text(encoding="utf-8")
        )
        return translations.get(key, {}).get(list(NAMES)[self.ui_locale.current()], key)

    def build_text(self):
        if self.running:
            return self.tr("Cancel build")
        if self.apk_only.get():
            return self.tr("Build APK only")
        if self.data_only.get():
            return self.tr("Build data ZIP only")
        return self.tr("Build")

    def data_only_changed(self):
        """The language packs, OBB and data ZIP for a phone that already has
        this APK: no APK is built, so the output format does not apply."""
        if self.data_only.get() and self.apk_only.get():
            self.apk_only.set(False)
            self.apk_only_changed()
        for widget in self.output_options.winfo_children():
            widget.state(["disabled"] if self.data_only.get() else ["!disabled"])
        self.build_button.configure(text=self.build_text())

    @staticmethod
    def preferences_path():
        return application_directory() / "builder-settings.json"

    def preferences(self):
        try:
            value = json.loads(self.preferences_path().read_text(encoding="utf-8"))
            return value if isinstance(value, dict) else {}
        except (OSError, ValueError):
            return {}

    def expert_changed(self):
        preferences = self.preferences()
        if preferences.get("expert") != self.expert.get():
            preferences["expert"] = self.expert.get()
            try:
                self.preferences_path().write_text(json.dumps(preferences), encoding="utf-8")
            except OSError:
                pass  # A read-only folder only loses the remembered choice.
        if self.expert.get():
            self.expert_row.pack(fill="x", before=self.build_button)
        else:
            self.apk_only.set(False)
            self.apk_only_changed()
            self.data_only.set(False)
            self.data_only_changed()
            self.expert_row.pack_forget()

    def apk_only_changed(self):
        only = self.apk_only.get()
        if only and self.saved_language_selection is None:
            self.saved_language_selection = (
                {code: value.get() for code, value in self.languages.items()}, self.default.current())
            for value in self.languages.values():
                value.set(False)
            self.default.set("")
        elif not only and self.saved_language_selection is not None:
            values, index = self.saved_language_selection
            for code, selected in values.items():
                self.languages[code].set(selected)
            self.default.current(index)
            self.saved_language_selection = None
        for widget in self.language_checks + list(self.output_options.winfo_children()):
            widget.state(["disabled"] if only else ["!disabled"])
        self.default.configure(state="disabled" if only else "readonly")
        if only and self.data_only.get():
            self.data_only.set(False)
        self.build_button.configure(text=self.build_text())
        if only:
            self.expert_hint.pack(anchor="w", before=self.build_button)
        else:
            self.expert_hint.pack_forget()

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
        return row

    def open_output(self):
        """Open the latest build, or the output folder, in the file manager:
        to copy the APK and data to the phone directly."""
        folder = self.result if self.result and Path(self.result).is_dir() else Path(self.destination.get())
        try:
            folder.mkdir(parents=True, exist_ok=True)
            open_folder(folder)
        except Exception as error:
            messagebox.showerror("Builder", "\n".join([self.tr("Could not open the folder."), str(folder), str(error)]))

    def choose_game(self):
        path = filedialog.askdirectory(
            title=self.tr("Select the PC game folder or StreamingAssets")
        )
        if path:
            self.game.set(path)

    def log(self, text):
        self.events.put(("log", str(text)))

    def start_build(self):
        if self.running:
            # The button reads "Cancel build" while a build runs.
            if messagebox.askyesno("Build", self.tr("Cancel this build? Its partial output folder is removed.")):
                self.build_button.state(["disabled"])
                self.build_button.configure(text=self.tr("Cancelling…"))
                cancel_build()
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
            if not selected and not self.apk_only.get():
                raise ValueError("Select at least one language")
            default = (
                "system"
                if self.apk_only.get() or self.default.current() == 0
                else list(LANGUAGES)[self.default.current() - 1]
            )
            if (
                not self.apk_only.get()
                and default != "system"
                and default not in selected
            ):
                raise ValueError("Select the default language pack")
            if self.apk_only.get() and not messagebox.askyesno(
                self.tr("APK update only"),
                self.tr(
                    "Build only the APK? Game data must already be installed on the phone. No language packs, OBB or data ZIP will be produced."
                ),
            ):
                return
            args = dict(
                game=game,
                xapk=source,
                languages=selected,
                default_language=default,
                embedded=not self.apk_only.get() and not self.data_only.get() and self.format.get() == "xapk",
                format="apk" if self.apk_only.get() else "data" if self.data_only.get() else self.format.get(),
                appdir=self.appdir,
                output_dir=destination,
                log=self.log,
            )
        except Exception as error:
            messagebox.showerror("Input files", str(error))
            return
        self.running = True
        self.build_button.configure(text=self.build_text())

        def work():
            try:
                self.events.put(("built", build(**args)))
            except BuildCancelled:
                self.events.put(("cancelled", None))
            except Exception as error:
                self.events.put(("failed", str(error)))

        threading.Thread(target=work, daemon=True).start()

    def choose_catalog(self):
        path = filedialog.askdirectory(title=self.tr("Select an existing output folder"))
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
        self.start_button.state(["disabled"])
        self.previous_button.state(["disabled"])
        self.connection.set(self.tr("Checking files and starting transfer…"))

        def transfer_log(message):
            self.log(message)
            try:
                target = root.parent if root.name == "resources" else root
                with (target / "transfer.log").open("a", encoding="utf-8") as stream:
                    stream.write(datetime.now(timezone.utc).isoformat() + " " + str(message) + "\n")
            except OSError:
                pass

        def start():
            try:
                self.events.put(
                    (
                        "server",
                        (
                            ResourceServer(
                                root,
                                log=transfer_log,
                                port=port,
                                cert=cert,
                                key=key,
                                # Named after channel and build (TESL-Reborn-Test-build46.apk);
                                # older builds used tesl-reborn.apk.
                                apk=next(
                                    (path for pattern in ("*.apk", "*.xapk")
                                     for path in sorted(root.parent.glob(pattern)) if path.is_file()),
                                    None,
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
        dialog.title(self.tr("Advanced connection…"))
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
        self.translate_ui(dialog)

    def stop_server(self):
        if self.server:
            self.stop_button.state(["disabled"])
            threading.Thread(target=self.server.stop, daemon=True).start()

    def copy_connection(self):
        if not self.server or self.server.stopped.is_set():
            return
        self.window.clipboard_clear()
        self.window.clipboard_append(self.connection.get())

    def connection_details(self):
        return self.tr("Install / connect: {link}\nAddress: {url}\nConnection code: {code}").format(
            link=self.server.connection_url(self.transfer_url), url=self.transfer_url, code=self.server.token)

    def show_connection(self):
        if not self.server or self.server.stopped.is_set():
            return
        if self.connection_popup and self.connection_popup.winfo_exists():
            self.connection_popup.lift()
            return
        popup = tk.Toplevel(self.window)
        self.connection_popup = popup
        popup.title(self.tr("Connect your phone"))
        ttk.Label(popup,
            text="Scan with your phone camera to install the APK, or scan inside TESL Reborn to download game data.",
            padding=12, wraplength=370).pack()
        try:
            import qrcode
            from PIL import ImageTk
            large = ImageTk.PhotoImage(qrcode.make(self.server.connection_url(self.transfer_url)).resize((360, 360)))
            label = ttk.Label(popup, image=large)
            label.image = large
            label.pack(padx=12)
        except ImportError:
            self.log("QR unavailable; enter the address and code manually.")
        ttk.Label(popup, textvariable=self.connection, padding=12, wraplength=440).pack()
        ttk.Button(popup, text="Copy connection details", command=self.copy_connection).pack(pady=4)
        ttk.Label(popup, text="Keep this builder open until the phone is ready.", padding=12).pack()
        ttk.Button(popup, text="Close", command=popup.destroy).pack(pady=8)
        self.translate_ui(popup)

    def poll(self):
        try:
            while True:
                kind, value = self.events.get_nowait()
                if kind == "log":
                    self.text.configure(state="normal")
                    self.text.insert("end", value + "\n")
                    self.text.see("end")
                    self.text.configure(state="disabled")
                elif kind == "cancelled":
                    self.running = False
                    self.build_button.state(["!disabled"])
                    self.build_button.configure(text=self.build_text())
                    self.log(self.tr("Build cancelled. The partial output folder was removed."))
                elif kind in ("built", "failed"):
                    self.running = False
                    self.build_button.state(["!disabled"])
                    self.build_button.configure(text=self.build_text())
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
                    self.transfer_url = public.rstrip("/") + "/" if public else f"http://{self.ip.get()}:{self.server.port}/"
                    self.connection.set(self.connection_details())
                    self.stop_button.state(["!disabled"])
                    self.stop_button.pack(side="left")
                    self.connect_button.pack(side="left", padx=8)
                    self.show_connection()
                elif kind == "update-offer":
                    self.offer_update(*value)
                elif kind == "update-error":
                    message, manual = value
                    self.installing = False
                    self.update_button.state(["!disabled"])
                    self.log("Builder update check failed: " + message)
                    if manual:
                        messagebox.showerror("Builder", message)
                elif kind == "update-installed":
                    self.log("Builder updated. Restarting…")
                    self.stop_server()
                    selfupdate.restart(value)
                    self.window.destroy()
                    return
                elif kind == "server-error":
                    self.server_starting = False
                    self.start_button.state(["!disabled"])
                    self.previous_button.state(["!disabled"])
                    messagebox.showerror("Transfer", value)
        except queue.Empty:
            pass
        if self.server and not self.server_starting and self.server.stopped.is_set():
            self.connection.set(self.tr("Transfer stopped."))
            self.stop_button.pack_forget()
            self.connect_button.pack_forget()
            self.start_button.state(["!disabled"])
            self.previous_button.state(["!disabled"])
            if self.connection_popup and self.connection_popup.winfo_exists():
                self.connection_popup.destroy()
            self.connection_popup = None
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
