# SPDX-License-Identifier: MIT
import gzip
import json
import math
import re
from pathlib import Path
import subprocess

import tempfile
import unittest
from unittest.mock import Mock, patch
from run import Budget, REPO, ROOT, digest, metrics, raw_samples


class EvidenceTests(unittest.TestCase):
    def assertEvidenceEqual(self, actual, expected):
        # Only float roundoff is tolerated; structures, counts and hashes stay exact.
        self.assertIs(type(actual), type(expected))
        if isinstance(expected, dict):
            self.assertEqual(actual.keys(), expected.keys())
            for key in expected:
                self.assertEvidenceEqual(actual[key], expected[key])
        elif isinstance(expected, float):
            self.assertTrue(math.isclose(actual, expected, rel_tol=1e-12, abs_tol=0.0),
                            f'{actual!r} != {expected!r} within relative float tolerance')
        else:
            self.assertEqual(actual, expected)

    @classmethod
    def setUpClass(cls):
        (ROOT / '.run').mkdir(exist_ok=True)
        cls.report = json.loads((ROOT / 'receipt.json').read_text())

    def test_exact_five_inputs_and_no_includes(self):
        rows = self.report['fixtures']
        self.assertEqual(len(rows), 5)
        self.assertEqual(len({r['manifest']['id'] for r in rows}), 5)
        for row in rows:
            path = REPO / row['manifest']['localPath']
            self.assertEqual(digest(path), row['manifest']['sha256'])
            self.assertEqual(set(row['inputHashes'].values()), {digest(path)})
            self.assertEqual(row['includeClosure'], [])
            for line in path.read_text().splitlines():
                self.assertFalse(line.strip().lower().startswith(('.include ', '.inc ', '.lib ')))

    def test_all_buckets_and_losses(self):
        self.assertEqual(self.report['counts'], {'success': 1, 'unsupported': 4, 'failed': 0, 'timeout': 0, 'not-run': 0})
        for row in self.report['fixtures']:
            self.assertEqual(row['reference']['exit'], 0)
            if row['bucket'] == 'unsupported':
                self.assertEqual(row['nativeResult']['error']['code'], 'UNSUPPORTED_XSPICE_CODE_MODEL')
                self.assertEqual(row['nativeResult']['error']['model'], 'core')
                self.assertIsNone(row['metrics'])
            else:
                self.assertEqual(row['nativeResult']['status'], 'success')
                self.assertEqual(row['referenceExtraction']['exit'], 0)
                self.assertEqual([p['kind'] for p in row['metrics']], ['ac', 'tran'])

    def test_hashes_and_offline_recomparison(self):
        for path, sha in self.report['sourceHashes'].items():
            self.assertEqual(digest(ROOT / path), sha)
        for row in self.report['fixtures']:
            if 'referenceRawSha256' in row:
                raw = gzip.decompress((ROOT / 'reference' / (row['manifest']['id'] + '.raw.gz')).read_bytes())
                import hashlib
                self.assertEqual(hashlib.sha256(raw).hexdigest(), row['referenceRawSha256'])
                raw_samples(raw.decode())
            if row['metrics'] is not None:
                native = json.loads(gzip.decompress((ROOT / (row['manifest']['id'] + '.native.json.gz')).read_bytes()))
                for plot in row['metrics']:
                    raw = gzip.decompress((ROOT / 'reference' / f"xfer-{plot['kind']}.raw.gz").read_bytes())
                    import hashlib
                    self.assertEqual(hashlib.sha256(raw).hexdigest(), plot['rawSha256'])
                    actual = next(p for p in native['plots'] if p['kind'] == plot['kind'])
                    self.assertEvidenceEqual(metrics(actual, raw_samples(raw.decode()), plot['kind']), plot['metrics'])
                ac, tran = [p['metrics'] for p in row['metrics']]
                self.assertEqual(ac['matchedPoints'], ac['referencePoints'])
                self.assertLess(tran['matchedPoints'], tran['referencePoints'])
                self.assertGreater(tran['vectors']['v(node3)']['maxRelative'], 0.15)

    def test_ledger_and_limits(self):
        ledger = json.loads(gzip.decompress((ROOT / 'budget-ledger.json.gz').read_bytes()))
        self.assertEqual(len(ledger), self.report['budget']['children'])
        self.assertEvidenceEqual(sum(r['wallSeconds'] for r in ledger), self.report['budget']['actualWallSeconds'])
        self.assertLess(sum(r['wallSeconds'] for r in ledger), 300)
        self.assertTrue(all(r['wallSeconds'] < 15 for r in ledger))
        first = json.loads((ROOT / 'first-attempt.json').read_text())
        self.assertEqual(first['fixtures'][-1]['referenceExtraction']['exit'], 1)
        self.assertIn("Can't open display", first['fixtures'][-1]['referenceExtraction']['stderr'])

    def test_model_analysis_and_licence_closure(self):
        for row in self.report['fixtures']:
            text = (REPO / row['manifest']['localPath']).read_text().lower()
            if row['bucket'] == 'unsupported':
                models = set(re.findall(r'\.model\s+\S+\s+(\w+)\b', text))
                self.assertEqual(models, {'int', 'd_dt', 's_xfer', 'core', 'lcouple'})
                self.assertIn('mode=1', text)
                self.assertNotIn('.control', text)
            else:
                measurements = row['nativeResult']['measurements']
                self.assertEqual(len(measurements), 5)
                self.assertTrue(all(m['status'] == 'ok' for m in measurements))
            self.assertEqual(row['manifest']['licence'], 'BSD-3-Clause')
        for file in (ROOT / 'source/src/xspice/icm').rglob('*'):
            if file.is_file():
                self.assertIn('Public Domain', file.read_text())
        self.assertIn('license for this document: CC-BY-SA v4.0', (ROOT / 'source/COPYING').read_text())

    def test_metric_no_interpolation_and_zero_floor(self):
        self.assertEvidenceEqual({'rms': 7.712823752999999, 'count': 27, 'missing': None},
                                 {'rms': 7.712823752999998, 'count': 27, 'missing': None})
        for actual, expected in [(1.000000000002, 1.0), (1e-30, 0.0),
                                 ({'count': 28}, {'count': 27}),
                                 ({'count': 27.0}, {'count': 27}),
                                 ({'rms': 1.0}, {'max': 1.0}), ('changed', 'original')]:
            with self.assertRaises(AssertionError):
                self.assertEvidenceEqual(actual, expected)
        native = {'x': [0, 2], 'vectors': {'v(out)': [0, 2]}}
        reference = {'x': [0, 1, 2], 'vectors': {'v(out)': [0, 1, 3]}}
        result = metrics(native, reference, 'tran')
        self.assertEqual(result['matchedPoints'], 2)
        self.assertEqual(result['vectors']['v(out)']['maxAbsolute'], 1)
        native['x'] = []
        native['vectors']['v(out)'] = []
        self.assertIsNone(metrics(native, reference, 'tran')['vectors']['v(out)'])

    def test_budget_exhaustion_and_owned_timeout(self):
        with tempfile.TemporaryDirectory(dir=ROOT / '.run') as directory:
            budget = Budget(Path(directory) / 'ledger.json')
            budget.entries = [{'wallSeconds': 300}]
            with patch('run.subprocess.Popen') as popen:
                self.assertEqual(budget.run(['unused'])['status'], 'not-run')
                popen.assert_not_called()
            budget.entries = []
            process = Mock(pid=12345, returncode=-9)
            process.communicate.side_effect = [subprocess.TimeoutExpired(['unused'], 15), (b'', b'')]
            with patch('run.subprocess.Popen', return_value=process) as popen, patch('run.os.killpg') as kill:
                self.assertEqual(budget.run(['unused'])['status'], 'timeout')
                kill.assert_called_once_with(12345, 9)
                self.assertTrue(popen.call_args.kwargs['start_new_session'])
                self.assertLessEqual(process.communicate.call_args_list[0].kwargs['timeout'], 15)


if __name__ == '__main__':
    unittest.main()
