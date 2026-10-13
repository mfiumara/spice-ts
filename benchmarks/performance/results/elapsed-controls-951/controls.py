"""Suspend-inclusive accounting. Never substitute a suspend-excluding clock."""
from dataclasses import dataclass
import ctypes
import math
import sys
import time

SKEW_SECONDS = 0.1  # Fixed read/scheduling tolerance, not circuit-specific.
CHILD_SECONDS = 30.0
RUN_SECONDS = 300.0


@dataclass(frozen=True)
class ClockSample:
    continuous: float
    monotonic: float
    realtime: float


class ContinuousClock:
    def __init__(self):
        if sys.platform == 'darwin':
            class Timebase(ctypes.Structure):
                _fields_ = [('numer', ctypes.c_uint32), ('denom', ctypes.c_uint32)]
            self.library = ctypes.CDLL('/usr/lib/libSystem.B.dylib')
            self.library.mach_continuous_time.argtypes = []
            self.library.mach_continuous_time.restype = ctypes.c_uint64
            self.library.mach_timebase_info.argtypes = [ctypes.POINTER(Timebase)]
            self.library.mach_timebase_info.restype = ctypes.c_int
            info = Timebase()
            if self.library.mach_timebase_info(ctypes.byref(info)) != 0 or not info.numer or not info.denom:
                raise RuntimeError('invalid mach timebase')
            self.scale = info.numer / info.denom / 1e9
            self.name = 'mach_continuous_time'
        elif sys.platform.startswith('linux') and hasattr(time, 'CLOCK_BOOTTIME'):
            self.name = 'CLOCK_BOOTTIME'
        else:
            raise RuntimeError('no supported suspend-inclusive clock; refusing measurement')

    def read(self):
        continuous = (self.library.mach_continuous_time() * self.scale
                      if self.name == 'mach_continuous_time'
                      else time.clock_gettime(getattr(time, 'CLOCK_BOOTTIME')))
        return ClockSample(continuous, time.monotonic(), time.time())


def clock_error(start, end):
    if not all(math.isfinite(v) for sample in (start, end) for v in vars(sample).values()):
        return 'nonfinite-clock'
    actual = end.continuous - start.continuous
    if actual < 0:
        return 'continuous-backwards'
    if abs((end.monotonic - start.monotonic) - actual) > SKEW_SECONDS:
        return 'monotonic-disagreement'
    if abs((end.realtime - start.realtime) - actual) > SKEW_SECONDS:
        return 'realtime-disagreement'
    return None


@dataclass(frozen=True)
class Budget:
    start: ClockSample

    def elapsed(self, now, start):
        return now.continuous - start.continuous

    def check(self, now, child_start):
        if self.elapsed(now, child_start) >= CHILD_SECONDS:
            return 'child-deadline'
        if self.elapsed(now, self.start) >= RUN_SECONDS:
            return 'run-budget'
        return None


def node_error(parent_seconds, lifetime, phases):
    perf, wall = lifetime.get('performanceMs'), lifetime.get('realtimeMs')
    if not all(isinstance(v, (float, int)) and math.isfinite(v) and v >= 0 for v in (perf, wall)):
        return 'invalid-node-clock'
    tolerance = SKEW_SECONDS * 1000
    if abs(perf - wall) > tolerance:
        return 'node-clock-disagreement'
    if max(perf, wall) > parent_seconds * 1000 + tolerance:
        return 'node-outside-parent'
    durations = [p[key] for p in phases for key in ('factorMs', 'solveMs', 'simulateMs') if key in p]
    if not all(isinstance(v, (float, int)) and math.isfinite(v) and v >= 0 for v in durations):
        return 'invalid-phase-clock'
    if sum(durations) > perf + tolerance:
        return 'phases-outside-node'
    return None
