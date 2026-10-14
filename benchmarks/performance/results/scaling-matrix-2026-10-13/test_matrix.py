"""Offline budget/selection checks. Starts no simulator children."""
import unittest

import tempfile
from pathlib import Path
from unittest.mock import patch
import matrix
from matrix import classify, top_cell, can_start
from controls import ClockSample, Budget

class MatrixTests(unittest.TestCase):
    def test_deadline_is_not_circuit_failure(self):
        self.assertEqual(classify('deadline-reserve', -9), 'timeout')
        self.assertEqual(classify(None, 1), 'failed')
        self.assertEqual(classify(None, 0), 'ok')
        self.assertEqual(classify('monotonic-disagreement', 0), 'invalid-clock')

    def test_headroom_includes_cleanup(self):
        self.assertTrue(can_start(0))
        self.assertFalse(can_start(780))
        self.assertFalse(can_start(900))

    def test_selects_spice_timeout_before_ratio(self):
        rows = [dict(circuit='a', size=1000, engine='spice-ts', status='ok', wallMs=50),
                dict(circuit='a', size=1000, engine='ngspice', status='ok', wallMs=10),
                dict(circuit='b', size=50000, engine='spice-ts', status='timeout', wallMs=119800),
                dict(circuit='b', size=50000, engine='ngspice', status='ok', wallMs=100)]
        self.assertEqual(top_cell(rows), ('b', 50000))

    def test_ngspice_timeout_is_not_spice_loss(self):
        rows = [dict(circuit='a', size=1000, engine='spice-ts', status='ok', wallMs=50),
                dict(circuit='a', size=1000, engine='ngspice', status='ok', wallMs=10),
                dict(circuit='b', size=50000, engine='spice-ts', status='ok', wallMs=100),
                dict(circuit='b', size=50000, engine='ngspice', status='timeout', wallMs=119800)]
        self.assertEqual(top_cell(rows), ('a', 1000))

    def exercise_child(self, end, expected):
        zero = ClockSample(0, 0, 1000)
        clock = type('Clock', (), {'read': lambda self: next(self.samples, end)})()
        clock.samples = iter([zero, end, end])
        child = type('Child', (), {'pid': 12345, 'returncode': -9, 'poll': lambda self: None, 'wait': lambda self: -9})()
        calls = []
        def kill(pid, sig):
            self.assertEqual(pid, 12345)
            calls.append(sig)
            if sig == 0:
                raise ProcessLookupError()
        with tempfile.TemporaryDirectory() as directory:
            out = Path(directory); (out / 'logs').mkdir()
            with (out / 'samples.jsonl').open('w') as journal, patch.object(matrix, 'OUT', out), patch.object(matrix.subprocess, 'Popen', return_value=child), patch.object(matrix.os, 'killpg', side_effect=kill):
                row = matrix.run_child(dict(key='fake', engine='ngspice'), ['fake'], clock, Budget(zero), journal)
            self.assertEqual(row['status'], expected)
            self.assertTrue(row['processGroupGone'])
            self.assertEqual(row['wallMs'], end.continuous * 1000)
            self.assertEqual(calls, [matrix.signal.SIGKILL, 0])

    def test_timeout_kills_only_owned_group(self):
        self.exercise_child(ClockSample(119.8, 119.8, 1119.8), 'timeout')

    def test_overshoot_is_not_clipped(self):
        self.exercise_child(ClockSample(125, 125, 1125), 'timeout')

    def test_suspension_is_invalid_not_timeout(self):
        self.exercise_child(ClockSample(1000, 1, 2000), 'invalid-clock')

    def test_existing_receipts_refuse_launch(self):
        with tempfile.TemporaryDirectory() as directory:
            out = Path(directory); (out / 'samples.jsonl').write_text('existing')
            with patch.object(matrix, 'OUT', out), patch.object(matrix.subprocess, 'Popen') as spawn:
                with self.assertRaisesRegex(RuntimeError, 'refusing retry'):
                    matrix.main()
                spawn.assert_not_called()

if __name__ == '__main__':
    unittest.main()
