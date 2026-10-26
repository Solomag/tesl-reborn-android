import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

class LegacyCacheTests(unittest.TestCase):
    def test_multiple_bundle_input_fails_before_write(self):
        spec=importlib.util.spec_from_file_location('legacy_cache',Path(__file__).resolve().parents[1]/'restore_cache.py')
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        bundle=module.BundleFile.__new__(module.BundleFile)
        with patch.object(module.UnityPy,'load',return_value=type('Env',(),{'files':{'a':bundle,'b':bundle}})()):
            with self.assertRaisesRegex(ValueError,'expected 1'):module.patch_platform('fixture','unused/out')
    def test_language_codes_stay_mobile(self):
        spec=importlib.util.spec_from_file_location('legacy_cache',Path(__file__).resolve().parents[1]/'restore_cache.py')
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        self.assertEqual(module.LANGUAGES['es_mx'],3);self.assertEqual(module.LANGUAGES['ru_ru'],8);self.assertEqual(module.LANGUAGES['tr_tr'],9)
