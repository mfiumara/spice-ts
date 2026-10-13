# /poteto-mode evidence

Read CHARTER.md and the installed pstack poteto-mode, how, architect and bug-fix playbooks from this profile's plugin directory. The skill loader did not resolve the plugin-qualified name; direct file reads supplied the actual installed playbooks.

Problem traced to immutable issue-938/run.py communicate(timeout=45) and time.monotonic() accounting. Seven recorded Node phase totals exceed parent elapsed in issue-938/summary.json. This proves disagreement, not its cause.

Data shapes first: ClockSample(continuous, monotonic, realtime) in seconds; elapsed delta checks return a fail-closed reason. Child receipt contains PID/argv, start/end samples, actual continuous elapsed, exit/status, phase records and independent Node lifetime performance/realtime deltas. Run receipt contains the fixed 18-child plan, all started receipts and explicit censored remainder.

Design alternatives: realtime deadlines alone are vulnerable to clock steps; a suspend-inclusive native monotonic clock is authoritative, with realtime and ordinary monotonic clocks as corruption/suspension cross-checks. Choose the second. macOS mach_continuous_time with mach_timebase_info, Linux CLOCK_BOOTTIME only. No unsafe fallback. Reject suspension/disagreement instead of silently repairing or certifying anomalous measurements. OS scheduling prevents a promise of SIGKILL exactly at 30s while the host is asleep; measure overshoot, invalidate the bound and stop after resume.

Sequence: offline deterministic RED tests; implement clock/budget seam; GREEN tests; freeze current-main source and local byte-identical control; one serial unprofiled baseline/control pair per existing family/size, with mesh factor isolation in those same children; stop at first disagreement or budget/deadline failure; report every censored point. No optimizer, profiler or fresh ngspice claim. Self-review before conventional commit and exact-head independent review.
