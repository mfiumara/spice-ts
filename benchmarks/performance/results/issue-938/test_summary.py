"""Offline receipt tests. No simulation or new measurement children."""
import copy
import json
from pathlib import Path
import unittest
from summarize import summarize

OUT = Path(__file__).resolve().parent
ROWS = [json.loads(line) for line in (OUT / 'samples.jsonl').read_text().splitlines()]

class ReceiptTests(unittest.TestCase):
    def test_complete_matrix_and_clock_disagreement(self):
        result = summarize(ROWS)
        self.assertEqual(result['children'], 72)
        self.assertEqual(result['statuses'], {'ok': 71, 'timeout': 1})
        self.assertEqual(result['pairedIsolationPhases'], 18)
        self.assertEqual(result['pairedSimulationPhases'], 53)
        self.assertEqual(len(result['clockDisagreements']), 7)
        self.assertFalse(result['deadlineAndBudgetCertified'])
        self.assertEqual(len(result['cells']), 48)

    def test_reject_changed_factor_and_waveform(self):
        for field, mode in [('factorSha256', 'isolate'), ('outputSha256', 'simulate')]:
            rows = copy.deepcopy(ROWS)
            next(r for r in rows if r['mode'] == mode and r['variant'] != 'baseline')['phases'][0][field] = 'corrupt'
            with self.assertRaises(AssertionError):
                summarize(rows)

    def test_reject_duplicate_and_missing_child(self):
        for rows in [ROWS[:-1], ROWS[:-1] + [ROWS[0]]]:
            with self.assertRaises(AssertionError):
                summarize(rows)

    def test_timeout_is_not_imputed(self):
        result = summarize(ROWS)
        cell = next(c for c in result['cells'] if c['mode'] == 'simulate' and c['circuit'] == 'cmos-inverter-chain-tran' and c['size'] == 50000 and c['variant'] == 'baseline' and c['phase'] == 'warm')
        self.assertEqual(cell['wallMs']['n'], 2)
        self.assertEqual(cell['missingPhases'], 1)

if __name__ == '__main__':
    unittest.main()
