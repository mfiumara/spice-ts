"""One fixed 18-child serial calibration. Invoke only through spice-heavy."""
from dataclasses import asdict
from pathlib import Path
import json
import os
import platform
import shutil
import signal
import subprocess
import time
from typing import Any
from controls import ContinuousClock, Budget, clock_error, node_error, CHILD_SECONDS, RUN_SECONDS

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[3]
POLL_SECONDS = 0.01
KILL_RESERVE_SECONDS = 0.25


def plan() -> list[dict[str, Any]]:
    return [dict(circuit=circuit, size=size, variant=variant)
            for size in (1000, 10000, 50000)
            for circuit in ('rc-ladder-tran', 'resistor-mesh-op', 'cmos-inverter-chain-tran')
            for variant in ('baseline', 'control')]


def stop_reason(budget, child_start, previous, now):
    # Always account the continuous delta, even when the other clocks disagree.
    return (clock_error(previous, now) or clock_error(budget.start, now)
            or budget.check(now, child_start))


def main():
    if (OUT / 'samples.jsonl').exists():
        raise RuntimeError('receipts exist; no retries, erasure or second matrix')
    clock = ContinuousClock()  # Fail before any child on an unsupported host.
    logs = OUT / 'logs'
    logs.mkdir(exist_ok=True)
    manifest = json.loads((OUT / 'build.json').read_text())
    host = dict(platform=platform.platform(), continuousClock=clock.name,
                baselineRevision=manifest['baselineRevision'], childLimitSeconds=CHILD_SECONDS,
                cumulativeLimitSeconds=RUN_SECONDS, pollSeconds=POLL_SECONDS,
                killReserveSeconds=KILL_RESERVE_SECONDS, plan=plan())
    (OUT / 'host.json').write_text(json.dumps(host, indent=2) + '\n')
    child = None

    def interrupted(signum, frame):
        raise InterruptedError(f'parent-signal-{signum}')

    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    run_start = clock.read()
    budget = Budget(run_start)
    previous = run_start
    stop = None
    rows = []
    with (OUT / 'samples.jsonl').open('x') as journal:
        for index, cell in enumerate(plan()):
            key = f"{index:02d}-{cell['circuit']}-{cell['size']}-{cell['variant']}"
            row: dict[str, Any] = dict(cell, key=key, status='censored', stopReason=stop, phases=[])
            now = clock.read()
            if not stop:
                stop = clock_error(previous, now) or clock_error(run_start, now)
                if not stop and budget.elapsed(now, run_start) + CHILD_SECONDS + KILL_RESERVE_SECONDS >= RUN_SECONDS:
                    stop = 'insufficient-run-budget'
            if stop:
                row['stopReason'] = stop
            else:
                base = logs / key
                argv = [shutil.which('node'), str(OUT / 'child.mjs'), str(OUT / (cell['variant'] + '.mjs')),
                        cell['circuit'], str(cell['size']), str(base), str(base) + '.lifetime.json']
                row.update(argv=argv, start=asdict(now))
                child_start = now
                reason = None
                error = None
                with open(str(base) + '.stdout.txt', 'x') as stdout, open(str(base) + '.stderr.txt', 'x') as stderr:
                    try:
                        child = subprocess.Popen(argv, cwd=ROOT, stdout=stdout, stderr=stderr, start_new_session=True)
                        row['pid'] = child.pid
                        with (OUT / 'ownership.jsonl').open('a') as owned:
                            owned.write(json.dumps(dict(key=key, pid=child.pid, argv=argv)) + '\n')
                            owned.flush(); os.fsync(owned.fileno())
                        previous = child_start
                        while True:
                            now = clock.read()
                            reason = stop_reason(budget, child_start, previous, now)
                            if reason:
                                row['stopObservation'] = dict(previous=asdict(previous), now=asdict(now))
                            if reason or child.poll() is not None:
                                break
                            if budget.elapsed(now, child_start) >= CHILD_SECONDS - KILL_RESERVE_SECONDS:
                                reason = 'deadline-reserve'
                                break
                            previous = now
                            time.sleep(POLL_SECONDS)
                    except BaseException as exc:
                        reason = 'controller-exception'
                        error = repr(exc)
                    finally:
                        if child is not None:
                            if child.poll() is None:
                                os.killpg(child.pid, signal.SIGKILL)
                            child.wait()
                            row['exit'] = child.returncode
                            try:
                                os.killpg(child.pid, 0)
                            except ProcessLookupError:
                                row['processGroupGone'] = True
                            else:
                                os.killpg(child.pid, signal.SIGKILL)
                                row['processGroupGone'] = False
                                reason = reason or 'surviving-process-group'
                        now = clock.read()
                        reason = reason or stop_reason(budget, child_start, previous, now)
                        row.update(end=asdict(now), actualElapsedSeconds=budget.elapsed(now, child_start),
                                   cumulativeActualSeconds=budget.elapsed(now, run_start), error=error)
                        child = None
                try:
                    for mode in ('isolate', 'simulate'):
                        path = Path(str(base) + '.' + mode)
                        if path.exists():
                            row['phases'].extend(dict(json.loads(line), mode=mode) for line in path.read_text().splitlines())
                    lifetime = Path(str(base) + '.lifetime.json')
                    if lifetime.exists():
                        row['nodeLifetime'] = json.loads(lifetime.read_text())
                        reason = reason or node_error(row['actualElapsedSeconds'], row['nodeLifetime'], row['phases'])
                    elif not reason:
                        reason = 'missing-node-lifetime'
                    if not reason and row.get('exit') != 0:
                        reason = 'child-failure'
                except (ValueError, OSError) as exc:
                    reason = reason or 'invalid-child-receipt'
                    row['error'] = repr(exc)
                row['status'] = 'ok' if not reason else 'stopped'
                row['stopReason'] = reason
                stop = reason
            rows.append(row)
            journal.write(json.dumps(row, allow_nan=False) + '\n'); journal.flush(); os.fsync(journal.fileno())
            previous = now
            print(key, row['status'], row['stopReason'], flush=True)
        end = clock.read()
        stop = stop or clock_error(previous, end) or clock_error(run_start, end)
        actual = budget.elapsed(end, run_start)
        if actual >= RUN_SECONDS:
            stop = stop or 'run-budget'
    receipt = dict(planned=len(rows), started=sum('pid' in r for r in rows),
                   completed=sum(r['status'] == 'ok' for r in rows),
                   censored=sum(r['status'] == 'censored' for r in rows), stopReason=stop,
                   start=asdict(run_start), end=asdict(end), actualRunSeconds=actual,
                   sumChildActualSeconds=sum(r.get('actualElapsedSeconds', 0) for r in rows),
                   deadlineAndBudgetCertified=not stop,
                   allStartedProcessGroupsGone=all(r.get('processGroupGone', False) for r in rows if 'pid' in r))
    (OUT / 'budget.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt, indent=2))
    return 0 if not stop else 2


if __name__ == '__main__':
    raise SystemExit(main())
