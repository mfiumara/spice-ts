"""Offline plan, control and lossless archive checks. No simulations."""
import gzip
import importlib.util
import sys
from pathlib import Path
import tempfile
import unittest
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('solver_growth', Path(__file__).with_name('solver-growth-991.py'))
assert spec is not None and spec.loader is not None
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)


class ControlsTest(unittest.TestCase):
    def test_complete_rotating_plan(self):
        rows = run.plan()
        self.assertEqual(len(rows), 270)
        self.assertEqual(len({tuple(r.values()) for r in rows}), 270)
        for start in range(0, len(rows), 3):
            group = rows[start:start + 3]
            round = group[0]['round']
            modes = ['control', 'candidate', 'ngspice']
            offset = (round - 1) % 3
            self.assertEqual([r['mode'] for r in group], modes[offset:] + modes[:offset])

    def test_uniform_suspend_safe_deadlines(self):
        start = run.controls.ClockSample(1, 1, 1)
        budget = run.Budget(start)
        self.assertIsNone(budget.check(run.controls.ClockSample(120.9, 120.9, 120.9), start))
        self.assertEqual(budget.check(run.controls.ClockSample(121, 121, 121), start), 'child-deadline')
        now = run.controls.ClockSample(1801, 1801, 1801)
        self.assertEqual(budget.check(now, run.controls.ClockSample(1800, 1800, 1800)), 'run-budget')
        self.assertEqual(run.clock_error(start, run.controls.ClockSample(2, 1, 2)), 'monotonic-disagreement')

    def test_native_archive_is_lossless_and_deduplicated(self):
        with tempfile.TemporaryDirectory() as directory:
            out = Path(directory)
            rows = []
            for id in ['one', 'two']:
                raw = f'Title: {id}\nBinary:\n'.encode() + b'\x00\x01\x02'
                (out / (id + '.raw')).write_bytes(raw)
                row = {'id': id}
                run.archive_raw(out, row)
                recovered = gzip.decompress((out / (id + '.header.gz')).read_bytes()) + gzip.decompress((out / 'native-payloads' / (row['rawPayloadSha256'] + '.bin.gz')).read_bytes())
                self.assertEqual(recovered, raw)
                self.assertFalse((out / (id + '.raw')).exists())
                rows.append(row)
            self.assertEqual(rows[0]['rawPayloadSha256'], rows[1]['rawPayloadSha256'])
            self.assertNotEqual(rows[0]['rawSha256'], rows[1]['rawSha256'])
            self.assertEqual(len(list((out / 'native-payloads').iterdir())), 1)


if __name__ == '__main__':
    unittest.main()
