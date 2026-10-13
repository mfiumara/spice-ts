"""Controller integration with fake clocks/processes, no actual children."""
import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import run
from controls import ClockSample


class FakeClock:
    name = 'offline-fake'

    def __init__(self, samples):
        self.samples = iter(samples)
        self.last = samples[-1]

    def read(self):
        return next(self.samples, self.last)


class FakeChild:
    pid = 12345
    returncode = None

    def poll(self):
        return self.returncode

    def wait(self):
        self.returncode = -9
        return -9


class RunnerTest(unittest.TestCase):
    def exercise(self, end, expected, before_launch=False):
        zero = ClockSample(0, 0, 1000)
        clock = FakeClock([zero, end, end] if before_launch else [zero, zero, end, end])
        calls = []
        child = FakeChild()

        def spawn(argv, **kwargs):
            calls.append(argv)
            return child

        def kill(pid, sig):
            self.assertEqual(pid, child.pid)
            if sig == 0:
                raise ProcessLookupError()

        with tempfile.TemporaryDirectory() as directory:
            out = Path(directory)
            (out / 'build.json').write_text('{"baselineRevision":"offline"}')
            with patch.object(run, 'OUT', out), patch.object(run, 'ContinuousClock', return_value=clock), patch.object(run.platform, 'platform', return_value='offline'), patch.object(run.subprocess, 'Popen', side_effect=spawn), patch.object(run.os, 'killpg', side_effect=kill), patch.object(run.signal, 'signal'), contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(run.main(), 2)
                # A second invocation must not launch any child or erase receipts.
                with self.assertRaisesRegex(RuntimeError, 'receipts exist'):
                    run.main()
            rows = [json.loads(line) for line in (out / 'samples.jsonl').read_text().splitlines()]
            budget = json.loads((out / 'budget.json').read_text())
            self.assertEqual(len(calls), 0 if before_launch else 1)
            self.assertEqual(len(rows), 18)
            self.assertEqual(rows[0]['stopReason'], expected)
            if not before_launch:
                self.assertTrue(rows[0]['processGroupGone'])
                self.assertEqual(rows[0]['exit'], -9)
            self.assertEqual(sum(r['status'] == 'censored' for r in rows), 18 if before_launch else 17)
            self.assertTrue(all(r['stopReason'] == expected for r in rows))
            self.assertFalse(budget['deadlineAndBudgetCertified'])
            self.assertEqual(budget['actualRunSeconds'], end.continuous)
            if before_launch:
                from verify import summarize
                result = summarize(rows, budget)
                self.assertEqual(result['started'], 0)
                self.assertEqual(result['censored'], 18)
                self.assertIsNone(result['maxChildSeconds'])

    def test_first_suspension_kills_owned_child_and_censors_all_remaining(self):
        self.exercise(ClockSample(1000, 1, 2000), 'monotonic-disagreement')

    def test_first_realtime_jump_stops(self):
        self.exercise(ClockSample(1, 1, 5000), 'realtime-disagreement')

    def test_clock_jump_before_first_launch_censors_without_children(self):
        self.exercise(ClockSample(1, 1, 5000), 'realtime-disagreement', before_launch=True)

    def test_actual_overshoot_is_reported_not_clipped(self):
        self.exercise(ClockSample(35, 35, 1035), 'child-deadline')

    def test_deadline_reserve_stops_before_hard_limit(self):
        self.exercise(ClockSample(29.8, 29.8, 1029.8), 'deadline-reserve')


if __name__ == '__main__':
    unittest.main(verbosity=2)
