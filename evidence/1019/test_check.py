"""Regression tests for the offline checker's deterministic comparison."""
import copy
import json
from pathlib import Path
import runpy
import unittest
from unittest.mock import patch


class CheckTest(unittest.TestCase):
    def run_check(self, mutate):
        read_text = Path.read_text
        report_path = Path('benchmarks/reference/maxord-983/report.json')
        report = json.loads(report_path.read_text())
        receipt = json.loads(Path('evidence/1019/receipt.json').read_text())
        report['fixtures'][0] = copy.deepcopy(receipt['pump']['after'])
        mutate(report['fixtures'][0])

        def read_with_report(path, *args, **kwargs):
            if path == report_path:
                return json.dumps(report)
            return read_text(path, *args, **kwargs)

        with patch.object(Path, 'read_text', read_with_report):
            runpy.run_path('evidence/1019/check.py')

    def test_runtime_is_not_deterministic(self):
        self.run_check(lambda row: row.update(runtime={
            'ngspiceWallMs': 12345, 'spiceTsWallMs': 67890,
        }))

    def test_error_drift_is_rejected(self):
        with self.assertRaises(AssertionError):
            self.run_check(lambda row: row['comparisons'][0]['metrics']['signals']
                           ['i(vnin)']['absoluteError'].update(max=0))

    def test_point_count_drift_is_rejected(self):
        with self.assertRaises(AssertionError):
            self.run_check(lambda row: row['spiceTs'].update(analyses=['tran:866']))


if __name__ == '__main__':
    unittest.main()
