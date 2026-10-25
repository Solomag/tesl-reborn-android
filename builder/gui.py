"""Desktop UI. Launch with python -m builder.gui or the frozen Windows EXE."""

import json
import os
from pathlib import Path
import queue
import re
import socket
import sys
import threading
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
from urllib.parse import urlencode
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
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("192.0.2.1", 9))
            found.add(sock.getsockname()[0])
    except OSError:
        pass
    try:
        found.update(
            item[4][0]
            for item in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)
        )
    except OSError:
        pass
    return sorted(ip for ip in found if not ip.startswith("127.")) or ["127.0.0.1"]


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
            root, text="TESL Reborn · Сборка Android", font=("", 19, "bold")
        ).pack(anchor="w")
        ttk.Label(
            root, text="Исходная ПК-игра и XAPK используются только для чтения."
        ).pack(anchor="w")
        self.game = tk.StringVar()
        games = steam_games()
        row = ttk.Frame(root)
        row.pack(fill="x", pady=4)
        ttk.Label(row, text="ПК-игра", width=16).pack(side="left")
        self.game_picker = ttk.Combobox(
            row, textvariable=self.game, values=[str(p) for p in games]
        )
        self.game_picker.pack(side="left", fill="x", expand=True)
        ttk.Button(row, text="Выбрать…", command=self.choose_game).pack(side="left")
        if games:
            self.game.set(str(games[0]))
        self.xapk = tk.StringVar()
        self.path_row(root, "Оригинальный XAPK", self.xapk, False)
        self.destination = tk.StringVar(value=str(self.appdir))
        self.path_row(root, "Рабочая папка", self.destination, True)
        ttk.Label(
            root, text="Результаты: выбранная рабочая папка / output / build-…"
        ).pack(anchor="w")
        options = ttk.Frame(root)
        options.pack(fill="x", pady=6)
        self.format = tk.StringVar(value="xapk")
        self.embedded = tk.BooleanVar(value=True)
        ttk.Radiobutton(options, text="XAPK", variable=self.format, value="xapk").pack(
            side="left"
        )
        ttk.Radiobutton(
            options,
            text="APK + OBB (ручное копирование)",
            variable=self.format,
            value="manual",
        ).pack(side="left")
        ttk.Checkbutton(
            root,
            text="Включить языковые пакеты в APK; иначе подготовить отдельную передачу",
            variable=self.embedded,
        ).pack(anchor="w")
        languages = ttk.LabelFrame(
            root, text="Языки для сборки или передачи", padding=6
        )
        languages.pack(fill="x", pady=6)
        self.languages = {}
        for i, code in enumerate(LANGUAGES):
            value = tk.BooleanVar(value=code in ("en_us", "ru_ru"))
            self.languages[code] = value
            ttk.Checkbutton(languages, text=NAMES[code], variable=value).grid(
                row=i // 5, column=i % 5, sticky="w", padx=6
            )
        row = ttk.Frame(root)
        row.pack(fill="x")
        ttk.Label(row, text="Язык по умолчанию:").pack(side="left")
        self.default = ttk.Combobox(
            row, values=["По системе телефона", *NAMES.values()], state="readonly"
        )
        self.default.current(0)
        self.default.pack(side="left", padx=8)
        self.build_button = ttk.Button(root, text="Собрать", command=self.start_build)
        self.build_button.pack(fill="x", pady=8)
        transfer = ttk.LabelFrame(root, text="Передача ресурсов на телефон", padding=6)
        transfer.pack(fill="x")
        row = ttk.Frame(transfer)
        row.pack(fill="x")
        ttk.Button(
            row, text="Выбрать готовый каталог…", command=self.choose_catalog
        ).pack(side="left")
        ttk.Label(row, text="Адрес ПК:").pack(side="left", padx=8)
        self.ip = ttk.Combobox(row, values=local_ips(), width=18)
        self.ip.current(0)
        self.ip.pack(side="left")
        ttk.Button(row, text="Начать передачу", command=self.start_server).pack(
            side="left", padx=8
        )
        ttk.Button(row, text="Остановить", command=self.stop_server).pack(side="left")
        ttk.Button(
            transfer, text="HTTPS / интернет…", command=self.network_options
        ).pack(anchor="w", pady=3)
        self.connection = tk.StringVar(
            value="После сборки включите передачу. На телефоне откройте экран подготовки ресурсов."
        )
        ttk.Label(transfer, textvariable=self.connection, wraplength=790).pack(
            anchor="w", pady=6
        )
        self.qr_label = ttk.Label(transfer)
        self.qr_label.pack(side="right")
        self.copy_button = ttk.Button(
            transfer, text="Скопировать подключение", command=self.copy_connection
        )
        self.copy_button.pack(anchor="w")
        ttk.Label(
            transfer,
            text="Сервер остановится через минуту после подтверждения установки\nили после 15 минут бездействия. Активная передача не прерывается.",
        ).pack(anchor="w")
        self.text = tk.Text(root, height=12, wrap="word", state="disabled")
        self.text.pack(fill="both", expand=True, pady=8)
        self.window.protocol("WM_DELETE_WINDOW", self.close)
        self.window.after(100, self.poll)

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
                    filetypes=filetypes or [("XAPK", "*.xapk"), ("Все файлы", "*.*")]
                )
            )
            if path:
                variable.set(path)

        ttk.Button(row, text="Выбрать…", command=choose).pack(side="left")

    def choose_game(self):
        path = filedialog.askdirectory(
            title="Выберите папку ПК-игры или StreamingAssets"
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
                raise ValueError("Выберите ПК-игру и оригинальный XAPK")
            assets = find_assets(game)
            ensure_outside(destination / "output", source_roots(game, assets))
            ensure_outside(destination / "work", source_roots(game, assets))
            selected = [c for c, v in self.languages.items() if v.get()]
            if not selected:
                raise ValueError("Выберите языки")
            default = (
                "system"
                if self.default.current() == 0
                else list(LANGUAGES)[self.default.current() - 1]
            )
            if default != "system" and default not in selected:
                raise ValueError("Выберите пакет языка по умолчанию")
            args = dict(
                game=game,
                xapk=source,
                languages=selected,
                default_language=default,
                embedded=self.embedded.get(),
                format=self.format.get(),
                appdir=destination,
                log=self.log,
            )
        except Exception as error:
            messagebox.showerror("Проверка исходников", str(error))
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
        path = filedialog.askopenfilename(
            title="Выберите catalog.json",
            filetypes=[("Каталог ресурсов", "catalog.json")],
        )
        if path:
            self.result = Path(path).parent
            self.log("Выбран каталог: " + str(self.result))

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
                "Передача", "Сначала соберите пакеты или выберите готовый catalog.json"
            )
            return
        try:
            port = int(self.port.get())
            cert = self.cert.get().strip() or None
            key = self.key.get().strip() or None
            public = self.public_url.get().strip()
            if not 0 <= port <= 65535:
                raise ValueError("Некорректный порт")
            if bool(cert) != bool(key):
                raise ValueError("Нужны и сертификат, и приватный ключ")
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
                        "Для внешнего адреса нужен HTTPS URL без пароля и query"
                    )
            if cert and not public:
                raise ValueError("Укажите HTTPS-адрес, соответствующий сертификату")
        except ValueError as error:
            messagebox.showerror("Сеть", str(error))
            return

        self.server_starting = True
        self.connection.set("Проверка пакетов и запуск сервера…")

        def start():
            try:
                self.events.put(
                    (
                        "server",
                        (
                            ResourceServer(
                                root, log=self.log, port=port, cert=cert, key=key
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
        dialog.title("HTTPS / интернет")
        dialog.geometry("700x280")
        ttk.Label(
            dialog,
            text="Внешний адрес и доступность настраиваются отдельно. Сертификат должен быть\nдоверенным на телефоне. Пустые поля — обычная передача в локальной сети.",
        ).pack(anchor="w", padx=8, pady=8)
        self.path_row(
            dialog,
            "Сертификат PEM",
            self.cert,
            False,
            [("PEM certificate", "*.pem *.crt"), ("Все файлы", "*.*")],
        )
        self.path_row(
            dialog,
            "Приватный ключ PEM",
            self.key,
            False,
            [("PEM key", "*.pem *.key"), ("Все файлы", "*.*")],
        )
        row = ttk.Frame(dialog)
        row.pack(fill="x", padx=8, pady=5)
        ttk.Label(row, text="Внешний HTTPS URL", width=20).pack(side="left")
        ttk.Entry(row, textvariable=self.public_url).pack(
            side="left", fill="x", expand=True
        )
        row = ttk.Frame(dialog)
        row.pack(fill="x", padx=8, pady=5)
        ttk.Label(row, text="Порт сервера (0 = авто)", width=25).pack(side="left")
        ttk.Entry(row, textvariable=self.port, width=10).pack(side="left")
        ttk.Label(
            dialog,
            text="При TLS на внешнем reverse proxy сертификат и ключ здесь не нужны.",
        ).pack(anchor="w", padx=8)
        ttk.Button(dialog, text="Готово", command=dialog.destroy).pack(pady=8)

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
                        self.log("Результат: " + str(value))
                        messagebox.showinfo(
                            "Готово", "Сборка завершена.\n" + str(value)
                        )
                    else:
                        self.log("ОШИБКА: " + value)
                        messagebox.showerror("Сборка остановлена", value)
                elif kind == "server":
                    self.server_starting = False
                    self.server, public = value
                    url = (
                        public.rstrip("/") + "/"
                        if public
                        else f"http://{self.ip.get()}:{self.server.port}/"
                    )
                    self.connection.set(
                        f"Адрес: {url}\nКод доступа: {self.server.token}"
                    )
                    try:
                        import qrcode
                        from PIL import ImageTk

                        image = qrcode.make(
                            "teslreborn://resources?"
                            + urlencode({"url": url, "token": self.server.token})
                        ).resize((160, 160))
                        self.qr = ImageTk.PhotoImage(image)
                        self.qr_label.configure(image=self.qr)
                    except ImportError:
                        self.log("QR недоступен; используйте адрес и код вручную.")
                elif kind == "server-error":
                    self.server_starting = False
                    messagebox.showerror("Сервер", value)
        except queue.Empty:
            pass
        if (
            self.server
            and not self.server_starting
            and self.server.stopped.is_set()
            and self.connection.get() != "Сервер остановлен."
        ):
            self.connection.set("Сервер остановлен.")
            self.qr_label.configure(image="")
            self.qr = None
        self.window.after(100, self.poll)

    def close(self):
        if self.running:
            messagebox.showinfo(
                "Сборка",
                "Дождитесь завершения сборки. Закрытие сейчас оставит неполный результат.",
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
