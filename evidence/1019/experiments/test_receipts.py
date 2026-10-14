"""Receipt integrity regressions: numerical/count/guard drift must fail closed."""
import copy
import unittest
from check import verify
from summarize import load

class ReceiptTests(unittest.TestCase):
    def test_retained_receipts(self):
        self.assertTrue(verify(load('summary.json')))

    def test_pump_error_drift_rejected(self):
        report = copy.deepcopy(load('summary.json'))
        report['e3']['pump']['error'] = 0.0
        with self.assertRaises(AssertionError):
            verify(report)

    def test_point_count_drift_rejected(self):
        report = copy.deepcopy(load('summary.json'))
        report['e1']['pump']['points']['native'] -= 1
        with self.assertRaises(AssertionError):
            verify(report)

    def test_hidden_guard_loss_rejected(self):
        report = copy.deepcopy(load('summary.json'))
        report['e2']['guards']['mosamp2']['passed'] = True
        with self.assertRaises(AssertionError):
            verify(report)

    def test_first_divergence_drift_rejected(self):
        report = copy.deepcopy(load('summary.json'))
        report['e2']['pump']['firstGridDifferenceOver1as']['spiceTs'] = 0.0
        with self.assertRaises(AssertionError):
            verify(report)

if __name__ == '__main__':
    unittest.main()
