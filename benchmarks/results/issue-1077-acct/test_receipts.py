"""Offline evidence checks: python3 -m unittest discover -s ... -p 'test_*.py'."""
import unittest
import gzip
import hashlib
from unittest.mock import patch

import summarize


class ReceiptTests(unittest.TestCase):
    def test_regenerates_summary_exactly(self):
        self.assertEqual(summarize.summarize(), summarize.load('summary.json'))

    def test_inclusive_quartiles(self):
        self.assertEqual(summarize.distribution([5, 1, 4, 2, 3]), dict(
            n=5, medianMs=3, q1Ms=2, q3Ms=4, iqrMs=2, samplesMs=[1, 2, 3, 4, 5]))

    def test_detects_waveform_drift(self):
        original = summarize.load
        def changed(name):
            value = original(name)
            if name == 'ngspice-diagnostic-instrumented-0.json':
                value[0]['waveforms'][0] = 'wrong'
            return value
        with patch.object(summarize, 'load', side_effect=changed):
            with self.assertRaises(AssertionError):
                summarize.summarize()

    def test_detects_missing_cold_run(self):
        original = summarize.load
        def changed(name):
            value = original(name)
            if name == 'wall.json':
                return value[:-1]
            return value
        with patch.object(summarize, 'load', side_effect=changed):
            with self.assertRaises(AssertionError):
                summarize.summarize()

    def test_timer_manifest_is_complete(self):
        manifest = summarize.load('instrumentation.json')
        expected = {'transient', 'advance', 'historyRestamp', 'attempt', 'loadStamp',
                    'output', 'factor', 'solve', 'deviceStaticDynamic', 'deviceCharge'}
        self.assertEqual({r['bucket'] for r in manifest}, expected)
        self.assertEqual(len(manifest), 11)  # output record/flush have one reentrant bucket

    def test_archived_bundle_hashes(self):
        for name, expected in summarize.load('bundle-hashes.json').items():
            data = gzip.decompress((summarize.OUT / (name + '.gz')).read_bytes())
            self.assertEqual(hashlib.sha256(data).hexdigest(), expected)


if __name__ == '__main__':
    unittest.main()
