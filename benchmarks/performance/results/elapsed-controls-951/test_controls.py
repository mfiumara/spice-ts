"""Deterministic offline checks. No Node children or sleeps."""
import math
import unittest
from controls import ClockSample, Budget, clock_error, node_error


class ControlsTest(unittest.TestCase):
    def test_normal_elapsed(self):
        a = ClockSample(10, 20, 1000)
        b = ClockSample(12, 22, 1002)
        self.assertIsNone(clock_error(a, b))
        budget = Budget(a)
        self.assertIsNone(budget.check(b, a))
        self.assertEqual(budget.elapsed(b, a), 2)

    def test_suspend_charged_and_rejected(self):
        a = ClockSample(10, 20, 1000)
        b = ClockSample(1010, 21, 2000)
        self.assertEqual(Budget(a).elapsed(b, a), 1000)
        self.assertEqual(clock_error(a, b), 'monotonic-disagreement')
        self.assertEqual(Budget(a).check(b, a), 'child-deadline')

    def test_realtime_forward_and_backward_steps(self):
        a = ClockSample(10, 20, 1000)
        for realtime in (1101, 901):
            self.assertEqual(clock_error(a, ClockSample(11, 21, realtime)), 'realtime-disagreement')

    def test_continuous_backwards_or_nonfinite(self):
        a = ClockSample(10, 20, 1000)
        self.assertEqual(clock_error(a, ClockSample(9, 21, 1001)), 'continuous-backwards')
        for value in (math.nan, math.inf, -math.inf):
            for sample in (ClockSample(value, 21, 1001), ClockSample(11, value, 1001), ClockSample(11, 21, value)):
                self.assertEqual(clock_error(a, sample), 'nonfinite-clock')

    def test_cumulative_includes_between_child_gaps(self):
        run = ClockSample(0, 0, 1000)
        child = ClockSample(299, 299, 1299)
        self.assertEqual(Budget(run).check(ClockSample(300, 300, 1300), child), 'run-budget')

    def test_deadline_is_inclusive(self):
        start = ClockSample(0, 0, 1000)
        self.assertEqual(Budget(start).check(ClockSample(30, 30, 1030), start), 'child-deadline')
        self.assertIsNone(Budget(start).check(ClockSample(29.9, 29.9, 1029.9), start))

    def test_node_lifetime_and_phases_contained(self):
        phases = [{'factorMs': 20, 'solveMs': 2}, {'simulateMs': 10}]
        self.assertIsNone(node_error(1, {'performanceMs': 900, 'realtimeMs': 900}, phases))
        self.assertEqual(node_error(1, {'performanceMs': 1000000, 'realtimeMs': 900}, phases), 'node-clock-disagreement')
        self.assertEqual(node_error(1, {'performanceMs': 2000, 'realtimeMs': 2000}, phases), 'node-outside-parent')
        self.assertEqual(node_error(1, {'performanceMs': 20, 'realtimeMs': 20}, [{'simulateMs': 1000}]), 'phases-outside-node')

    def test_negative_nonfinite_and_missing_node_receipts(self):
        for lifetime in ({}, {'performanceMs': -1, 'realtimeMs': 1}, {'performanceMs': math.nan, 'realtimeMs': 1}):
            self.assertEqual(node_error(1, lifetime, []), 'invalid-node-clock')
        for value in (-1, math.inf, math.nan):
            self.assertEqual(node_error(1, {'performanceMs': 900, 'realtimeMs': 900}, [{'simulateMs': value}]), 'invalid-phase-clock')

    def test_small_clock_read_skew_allowed(self):
        self.assertIsNone(clock_error(ClockSample(1, 2, 3), ClockSample(2, 3.001, 4.002)))


if __name__ == '__main__':
    unittest.main(verbosity=2)
