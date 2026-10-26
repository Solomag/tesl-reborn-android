"""Exercise the real form's state transitions without requiring a display server."""
import ast
import json
from pathlib import Path
from types import SimpleNamespace
import threading
import unittest
from unittest.mock import patch
from builder import gui


class Variable:
    def __init__(self, value="", **kwargs): self.value = value
    def get(self): return self.value
    def set(self, value): self.value = value


class Widget:
    serial = 0
    def __init__(self, parent=None, **kwargs):
        Widget.serial += 1
        self.id = Widget.serial
        self.children, self.options, self.mapped, self.exists = [], {"text": "", **kwargs}, False, True
        self.index, self.states = -1, set()
        if parent: parent.children.append(self)
    def __str__(self): return f"widget-{self.id}"
    def __getitem__(self, name): return self.options[name]
    def __setitem__(self, name, value): self.options[name] = value
    def keys(self): return self.options.keys()
    def configure(self, **kwargs): self.options.update(kwargs)
    def pack(self, **kwargs): self.mapped = True
    def grid(self, **kwargs): self.mapped = True
    def pack_forget(self): self.mapped = False
    def state(self, states):
        for state in states:
            if state.startswith("!"): self.states.discard(state[1:])
            else: self.states.add(state)
    def current(self, index=None):
        if index is not None:
            self.index = index
            self.set(self.options["values"][index]); self.index = index
        return self.index
    def set(self, value):
        self.options["value"] = value
        self.index = -1
        if "textvariable" in self.options: self.options["textvariable"].set(value)
    def get(self): return self.options.get("textvariable", Variable(self.options.get("value", ""))).get()
    def winfo_children(self): return self.children
    def winfo_exists(self): return self.exists
    def destroy(self): self.exists = False
    def title(self, value): self.caption = value
    def geometry(self, *args): pass
    def bind(self, *args): pass
    def protocol(self, *args): pass
    def after(self, *args): pass
    def lift(self): pass
    def insert(self, *args): pass
    def see(self, *args): pass


class GuiTests(unittest.TestCase):
    def setUp(self):
        self.patches = [patch.object(gui, 'configure_ui_font'), patch.object(gui, 'configure_dark_theme'),
                        patch.object(gui, 'steam_games', return_value=[]), patch.object(gui, 'local_ips', return_value=['192.168.1.2'])]
        self.patches += [patch.object(gui.tk, n, Variable) for n in ['StringVar', 'BooleanVar']]
        self.patches += [patch.object(gui.tk, n, Widget) for n in ['Text', 'Toplevel']]
        self.patches += [patch.object(gui.ttk, n, Widget) for n in ['Frame', 'Label', 'LabelFrame', 'Combobox', 'Button', 'Checkbutton', 'Radiobutton', 'Entry']]
        for item in self.patches: item.start()
        self.addCleanup(lambda: [item.stop() for item in reversed(self.patches)])
        self.root = Widget()
        self.form = gui.BuilderWindow(self.root)

    def test_expert_selection_is_cleared_and_restored(self):
        form = self.form
        form.languages['ru_ru'].set(True)
        form.default.current(9)
        form.expert.set(True); form.expert_changed()
        self.assertTrue(form.expert_row.mapped)
        form.apk_only.set(True); form.apk_only_changed()
        self.assertFalse(any(v.get() for v in form.languages.values()))
        self.assertEqual(form.default.get(), '')
        self.assertTrue(all('disabled' in w.states for w in form.language_checks))
        form.expert.set(False); form.expert_changed()
        self.assertFalse(form.expert_row.mapped)
        self.assertFalse(form.apk_only.get())
        self.assertTrue(form.languages['ru_ru'].get())
        self.assertTrue(form.languages['en_us'].get())
        self.assertEqual(form.default.current(), 9)
        self.assertTrue(all('disabled' not in w.states for w in form.language_checks))

    def test_connection_controls_follow_server_lifetime(self):
        form = self.form
        self.assertFalse(form.stop_button.mapped)
        self.assertFalse(form.connect_button.mapped)
        self.assertIsNone(form.connection_popup)
        server = SimpleNamespace(stopped=threading.Event(), port=8000, token='TEMP_CODE',
                                 connection_url=lambda url: url+'connect/TEMP_CODE')
        # The no-QR dependency path must still provide copying in the popup.
        with patch.dict('sys.modules', {'qrcode': None}):
            form.events.put(('server', (server, ''))); form.poll()
        self.assertTrue(form.stop_button.mapped)
        popup = form.connection_popup
        copies = [w for w in popup.children if w.options.get('text') == 'Copy connection details']
        self.assertEqual(len(copies), 1)
        self.assertFalse(any(w.options.get('text') == 'Copy connection details' for w in self.root.children))
        server.stopped.set(); form.poll()
        self.assertFalse(form.stop_button.mapped)
        self.assertFalse(form.connect_button.mapped)
        self.assertFalse(popup.exists)

    def test_all_visible_literal_notes_have_every_locale(self):
        texts = json.loads(Path(gui.__file__).with_name('ui-text.json').read_text())
        tree = ast.parse(Path(gui.__file__).read_text())
        for node in ast.walk(tree):
            if isinstance(node, ast.keyword) and node.arg == 'text' and isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
                self.assertIn(node.value.value, texts)
                self.assertTrue(all(texts[node.value.value].get(code) for code in gui.NAMES), node.value.value)
        self.form.ui_locale.current(list(gui.NAMES).index('ru_ru'))
        self.form.translate_ui(self.root)
        def walk(widget):
            yield widget
            for child in widget.children: yield from walk(child)
        labels = [w.options.get('text') for w in walk(self.root)]
        self.assertIn('Для каждой сборки создаётся отдельная папка. Временные файлы удаляются автоматически.', labels)
        self.assertIn('Режим эксперта', labels)
        self.assertIn('Передать готовую сборку…', labels)
