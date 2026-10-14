"""Fixed ten-round cold linear attribution. Run only via spice-heavy.
Row = cell + clock envelope + worker receipt + status; no retries/filtering.
"""
import argparse
from dataclasses import asdict
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
from typing import Any
sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'benchmarks/performance/results/elapsed-controls-951'))
from controls import ContinuousClock, Budget, clock_error, node_error, CHILD_SECONDS, RUN_SECONDS


def plan(comparison=False):
    modes = ('control', 'candidate', 'ngspice') if comparison else ('control', 'instrumented', 'ngspice')
    return [dict(round=r + 1, circuit=c, size=s, mode=m)
            for r in range(10) for s in ((1000, 10000, 50000) if comparison else (10000,))
            for c in ('rc-ladder-tran', 'resistor-mesh-op')
            for m in (modes[r % 3:] + modes[:r % 3])]


def stop_reason(budget, child_start, previous, now):
    return clock_error(previous, now) or clock_error(budget.start, now) or budget.check(now, child_start)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('out', type=Path)
    parser.add_argument('--parse', action='store_true', help='attribute parser instead of solver phases')
    parser.add_argument('--before', type=Path, help='compare archived control against current uninstrumented build at 1k/10k/50k')
    args = parser.parse_args()
    out = args.out.resolve()
    if (out / 'receipts.jsonl').exists():
        raise RuntimeError('immutable attempted matrix; no retries')
    subprocess.run(['node', str(ROOT / 'benchmarks/performance/linear-10k-prepare.mjs'), str(out)] + (['--parse'] if args.parse else []) + (['--before', str(args.before)] if args.before else []), cwd=ROOT, check=True)
    clock = ContinuousClock()
    start = clock.read()
    budget = Budget(start)
    cells = plan(bool(args.before))
    host = dict(baseSha=json.loads((out / 'prepared.json').read_text())['baseSha'],
                node=subprocess.check_output(['node', '--version'], text=True).strip(),
                ngspice=subprocess.check_output(['ngspice', '--version'], text=True),
                uname=list(os.uname()), clock=clock.name, childSeconds=CHILD_SECONDS,
                runSeconds=RUN_SECONDS, planned=len(cells), nativePlanned=len(cells)//3,
                order='rotating control/' + ('candidate' if args.before else 'instrumented') + '/ngspice, serial cold children', start=asdict(start))
    (out / 'host.json').write_text(json.dumps(host, indent=2) + '\n')
    previous = start
    stop = None
    rows = []
    child = None
    def interrupted(signum, frame):
        raise InterruptedError(f'parent-signal-{signum}')
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    with (out / 'receipts.jsonl').open('x') as journal:
        for cell in cells:
            id = f"{cell['round']:02d}-{cell['circuit']}-{cell['size']}-{cell['mode']}"
            row: dict[str, Any] = dict(cell, id=id, status='censored')
            now = clock.read()
            stop = stop or clock_error(previous, now) or clock_error(start, now)
            if not stop and budget.elapsed(now, start) + CHILD_SECONDS + 0.25 >= RUN_SECONDS:
                stop = 'insufficient-run-budget'
            if not stop:
                row.update(start=asdict(now), before=dict(loadavg=os.getloadavg(), processCount=len(subprocess.check_output(['ps', '-A', '-o', 'pid='], text=True).splitlines())))
                child_start = now
                argv = ['node', str(ROOT / 'benchmarks/performance/linear-10k-worker.mjs'), cell['mode'], str(out), id, cell['circuit'], str(cell['size'])]
                reason = None
                with (out / (id + '.worker.stdout.txt')).open('x') as stdout, (out / (id + '.worker.stderr.txt')).open('x') as stderr:
                    try:
                        child = subprocess.Popen(argv, cwd=ROOT, stdout=stdout, stderr=stderr, start_new_session=True)
                        row.update(pid=child.pid, command=argv)
                        with (out / 'ownership.jsonl').open('a') as owned:
                            owned.write(json.dumps(dict(id=id, pid=child.pid, argv=argv)) + '\n'); owned.flush(); os.fsync(owned.fileno())
                        previous = child_start
                        while True:
                            now = clock.read()
                            reason = stop_reason(budget, child_start, previous, now)
                            if reason or child.poll() is not None:
                                break
                            if budget.elapsed(now, child_start) >= CHILD_SECONDS - 0.25:
                                reason = 'deadline-reserve'; break
                            previous = now
                            time.sleep(0.01)
                    except BaseException as exc:
                        reason = 'controller-exception'; row['error'] = repr(exc)
                    finally:
                        if child is not None:
                            if child.poll() is None:
                                os.killpg(child.pid, signal.SIGKILL)
                            child.wait(); row['code'] = child.returncode
                            try:
                                os.killpg(child.pid, 0)
                            except ProcessLookupError:
                                row['processGroupGone'] = True
                            else:
                                os.killpg(child.pid, signal.SIGKILL); row['processGroupGone'] = False
                                reason = reason or 'surviving-process-group'
                        child = None
                        now = clock.read()
                        reason = reason or stop_reason(budget, child_start, previous, now)
                        row.update(end=asdict(now), boundaries=dict(wall=budget.elapsed(now, child_start)*1000), after=dict(loadavg=os.getloadavg()))
                try:
                    receipt = json.loads((out / (id + '.worker.stdout.txt')).read_text())
                    row['worker'] = receipt
                    row['boundaries'].update(receipt['boundaries'])
                    epoch = 'continuous' if sys.platform == 'darwin' else 'monotonic'
                    row['boundaries']['spawnFirstUserCode'] = int(receipt['firstNs'])/1e6 - getattr(child_start, epoch)*1000
                    row['boundaries']['exit'] = getattr(now, epoch)*1000 - int(receipt['doneNs'])/1e6
                    reason = reason or node_error(row['boundaries']['wall']/1000, receipt['lifetime'], [])
                    if min(row['boundaries']['spawnFirstUserCode'], row['boundaries']['exit']) < 0:
                        reason = reason or 'hrtime-epoch-disagreement'
                    if row['code'] != 0 or receipt['status'] != 'ok':
                        reason = reason or 'worker-failure'
                except (ValueError, KeyError, OSError) as exc:
                    reason = reason or 'invalid-worker-receipt'; row['error'] = repr(exc)
                stop = reason
                row['status'] = 'ok' if not reason else 'stopped'
            row['stopReason'] = stop
            rows.append(row)
            journal.write(json.dumps(row, allow_nan=False) + '\n'); journal.flush(); os.fsync(journal.fileno())
            previous = now
            print(id, row['status'], row.get('boundaries', {}).get('wall'), stop, flush=True)
    end = clock.read()
    stop = stop or clock_error(previous, end) or clock_error(start, end)
    receipt = dict(planned=len(cells), started=sum('pid' in r for r in rows), completed=sum(r['status']=='ok' for r in rows),
                   nativeAttempted=len(list(out.glob('*.native.started.json'))), stopReason=stop,
                   actualRunSeconds=budget.elapsed(end, start), sumChildActualSeconds=sum(r.get('boundaries',{}).get('wall',0) for r in rows)/1000,
                   deadlineAndBudgetCertified=not stop, start=asdict(start), end=asdict(end))
    (out / 'budget.json').write_text(json.dumps(receipt, indent=2) + '\n')
    return 2 if stop else 0


if __name__ == '__main__':
    raise SystemExit(main())
