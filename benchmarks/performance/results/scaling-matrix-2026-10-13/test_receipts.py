"""Real archived receipt checks and corruptions, no simulation."""
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch
import summarize

class ReceiptTests(unittest.TestCase):
    def test_archive(self):
        result = summarize.summarize()
        self.assertEqual(len(result['cells']), 9)
        self.assertEqual(result['selected'], ('rc-ladder-tran', 1000))
        self.assertTrue(result['attribution']['hashMatchesBaseline'])

    def corrupt(self, change):
        with tempfile.TemporaryDirectory() as directory:
            out = Path(directory)
            for name in ['samples.jsonl', 'budget.json', 'decks.json']:
                shutil.copy(summarize.OUT / name, out / name)
            for name in ['logs', 'decks']:
                shutil.copytree(summarize.OUT / name, out / name)
            change(out)
            with patch.object(summarize, 'OUT', out):
                with self.assertRaises(AssertionError):
                    summarize.summarize()

    def test_bad_elapsed(self):
        def change(out):
            budget = json.loads((out / 'budget.json').read_text())
            budget['actualRunSeconds'] = 1
            (out / 'budget.json').write_text(json.dumps(budget))
        self.corrupt(change)

    def test_bad_deck(self):
        self.corrupt(lambda out: (out / 'decks/rc-ladder-tran-1000.cir').write_text('corrupt'))

    def test_bad_result(self):
        self.corrupt(lambda out: (out / 'logs/rc-ladder-tran-1000-spice-ts.result.json').write_text('{}'))

    def test_probe_interpolation(self):
        result = summarize.accuracy({'grid': [0, 1, 2], 'values': [0, 1, 2]}, ([0, 2], [0, 2]))
        self.assertEqual(result['points'], 3)
        self.assertEqual(result['maxAbs'], 0)

    def test_rounded_final_time_matches_previous_point(self):
        result = summarize.accuracy({'grid': [1.0000000000000001e-7], 'values': [2]}, ([1e-7], [2]))
        self.assertEqual(result['points'], 1)
        self.assertEqual(result['maxAbs'], 0)

if __name__ == '__main__':
    unittest.main()
