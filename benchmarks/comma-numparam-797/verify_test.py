# SPDX-License-Identifier: MIT
import copy
import json
from pathlib import Path
import unittest
from verify import verify
from compare import metrics

REPORT = json.loads((Path(__file__).parent / 'receipt.json').read_text())


class EvidenceTests(unittest.TestCase):
    def test_receipt(self):
        self.assertEqual(verify(REPORT), dict(agree=9, numericalLoss=6, statusDifference=5))

    def test_tampered_metric_rejected(self):
        report = copy.deepcopy(REPORT)
        report['rows'][1]['metrics']['maxAbsolute'] = 0
        with self.assertRaises(AssertionError):
            verify(report)

    def test_missing_case_rejected(self):
        report = copy.deepcopy(REPORT)
        report['rows'].pop()
        with self.assertRaises(AssertionError):
            verify(report)

    def test_hash_change_rejected(self):
        report = copy.deepcopy(REPORT)
        report['rows'][0]['deckHashAfter'] = '0' * 64
        with self.assertRaises(AssertionError):
            verify(report)

    def test_failure_metrics_are_null(self):
        self.assertIsNone(metrics(None, {'v(o)': 1}))
        self.assertIsNone(metrics({'v(o)': 1}, None))

    def test_zero_policy(self):
        exact = metrics({'v(o)': 0}, {'v(o)': 0})
        loss = metrics({'v(o)': 0}, {'v(o)': 1})
        assert exact is not None and loss is not None
        self.assertEqual(exact['maxRelative'], 0)
        self.assertIsNone(loss['maxRelative'])


if __name__ == '__main__':
    unittest.main()
