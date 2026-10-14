"""Offline plan/deadline tests. No subprocesses or benchmark workloads."""
import importlib.util
from pathlib import Path
import sys
import unittest
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('linear991', Path(__file__).with_name('linear-10k.py'))
assert spec is not None and spec.loader is not None
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
from controls import Budget, ClockSample


class RunnerTests(unittest.TestCase):
    def test_fixed_rotating_plan(self):
        cells = runner.plan()
        self.assertEqual(len(cells), 60)
        self.assertEqual(len({tuple(c.values()) for c in cells}), 60)
        self.assertEqual([c['mode'] for c in cells[:3]], ['control', 'instrumented', 'ngspice'])
        self.assertEqual([c['mode'] for c in cells[6:9]], ['instrumented', 'ngspice', 'control'])
        for circuit in ('rc-ladder-tran', 'resistor-mesh-op'):
            for mode in ('control', 'instrumented', 'ngspice'):
                self.assertEqual(sum(c['circuit'] == circuit and c['mode'] == mode for c in cells), 10)

    def test_suspend_stops(self):
        start = ClockSample(0, 0, 0)
        self.assertEqual(runner.stop_reason(Budget(start), start, start, ClockSample(1, 0, 1)), 'monotonic-disagreement')

    def test_realtime_jump_stops(self):
        start = ClockSample(0, 0, 0)
        self.assertEqual(runner.stop_reason(Budget(start), start, start, ClockSample(1, 1, 2)), 'realtime-disagreement')

    def test_actual_child_deadline(self):
        start = ClockSample(0, 0, 0)
        self.assertEqual(runner.stop_reason(Budget(start), start, start, ClockSample(30, 30, 30)), 'child-deadline')

    def test_cumulative_run_deadline(self):
        start, child = ClockSample(0, 0, 0), ClockSample(299, 299, 299)
        self.assertEqual(runner.stop_reason(Budget(start), child, child, ClockSample(300, 300, 300)), 'run-budget')


if __name__ == '__main__':
    unittest.main()
