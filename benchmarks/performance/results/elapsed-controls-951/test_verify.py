"""Offline receipt reconciliation and corruption rejection. No measurements."""
from copy import deepcopy
import json
from pathlib import Path
import unittest
from verify import summarize

OUT = Path(__file__).resolve().parent


class ReceiptTest(unittest.TestCase):
    def setUp(self):
        self.rows = [json.loads(line) for line in (OUT / 'samples.jsonl').read_text().splitlines()]
        self.budget = json.loads((OUT / 'budget.json').read_text())

    def test_complete_plan_timeout_and_censoring(self):
        result = summarize(self.rows, self.budget)
        self.assertEqual(result['started'], 17)
        self.assertEqual(result['completed'], 16)
        self.assertEqual(result['censored'], 1)
        self.assertEqual(result['pairedSimulationPhases'], 16)
        self.assertEqual(result['pairedFactorPhases'], 6)
        self.assertEqual(result['clockDisagreements'], [])
        self.assertFalse(result['fullCalibrationCompleted'])
        self.assertTrue(result['observedBoundsSatisfied'])

    def test_corrupt_factor_and_output_rejected(self):
        for index, field in [(1, 'outputSha256'), (3, 'factorSha256')]:
            rows = deepcopy(self.rows)
            rows[index]['phases'][0][field] = '0' * 64
            with self.assertRaisesRegex(AssertionError, 'invariance'):
                summarize(rows, self.budget)

    def test_missing_duplicate_or_reordered_rows_rejected(self):
        for rows in (self.rows[:-1], self.rows + [self.rows[-1]], [self.rows[1], self.rows[0], *self.rows[2:]]):
            with self.assertRaisesRegex(AssertionError, 'plan'):
                summarize(rows, self.budget)

    def test_missing_phase_rejected(self):
        rows = deepcopy(self.rows)
        rows[0]['phases'].pop()
        with self.assertRaisesRegex(AssertionError, 'phases'):
            summarize(rows, self.budget)

    def test_clock_corruption_cannot_be_certified(self):
        rows = deepcopy(self.rows)
        rows[0]['nodeLifetime']['performanceMs'] += 1000000
        with self.assertRaisesRegex(AssertionError, 'clock'):
            summarize(rows, self.budget)

    def test_actual_elapsed_corruption_rejected(self):
        rows = deepcopy(self.rows)
        rows[0]['actualElapsedSeconds'] = 0
        with self.assertRaisesRegex(AssertionError, 'elapsed'):
            summarize(rows, self.budget)

    def test_budget_and_cleanup_corruption_rejected(self):
        budget = dict(self.budget, sumChildActualSeconds=0)
        with self.assertRaisesRegex(AssertionError, 'budget'):
            summarize(self.rows, budget)
        rows = deepcopy(self.rows)
        rows[0]['processGroupGone'] = False
        with self.assertRaisesRegex(AssertionError, 'cleanup'):
            summarize(rows, self.budget)

    def test_claiming_full_certification_after_timeout_rejected(self):
        budget = dict(self.budget, deadlineAndBudgetCertified=True)
        with self.assertRaisesRegex(AssertionError, 'certification'):
            summarize(self.rows, budget)


if __name__ == '__main__':
    unittest.main(verbosity=2)
