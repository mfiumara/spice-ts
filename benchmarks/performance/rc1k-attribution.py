#!/usr/bin/env python3
"""spice-heavy python3 benchmarks/performance/rc1k-attribution.py OUT [--rounds 15].
45 top-level workloads + 15 native grandchildren maximum. Diagnostic ps and
preparation/report commands are administrative, not timed engine workloads.
"""
import argparse
from dataclasses import asdict
import fcntl
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / 'benchmarks/performance/results/elapsed-controls-951'))
from controls import ContinuousClock, clock_error, node_error  # noqa: E402


def host():
    return dict(loadavg=os.getloadavg(), processCount=len(subprocess.check_output(
        ['ps', '-A', '-o', 'pid='], text=True).splitlines()))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('out', type=Path)
    parser.add_argument('--rounds', type=int, default=15, help='total rounds, including existing attempted rounds')
    args = parser.parse_args()
    if not 1 <= args.rounds <= 15:
        parser.error('rounds must be 1..15; no retries beyond 60 workloads')
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    if (out / 'SHA256SUMS').exists():
        raise RuntimeError('frozen archive; choose a fresh output directory')
    lock = (out / '.runner.lock').open('a')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    journal = out / 'receipts.jsonl'
    existing = [json.loads(line) for line in journal.read_text().splitlines()] if journal.exists() else []
    ids = {row['id'] for row in existing}
    if len(ids) != len(existing):
        raise RuntimeError('duplicate attempted workload')
    valid_ids = {f'{r:02d}-{m}' for r in range(1, 16) for m in ['control', 'instrumented', 'ngspice']}
    if not ids <= valid_ids:
        raise RuntimeError('journal contains workloads outside the 60-process budget')
    if not (out / 'prepared.json').exists():
        subprocess.run(['node', str(ROOT / 'benchmarks/performance/rc1k-attribution-prepare.mjs'), str(out)], cwd=ROOT, check=True)
    clock = ContinuousClock()
    run_start = clock.read()
    meta = dict(baseSha=subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
                node=subprocess.check_output(['node', '--version'], text=True).strip(),
                ngspice=subprocess.check_output(['ngspice', '--version'], text=True),
                platform=sys.platform, uname=list(os.uname()), continuousClock=clock.name,
                childSeconds=60, maxEngineWorkloads=60, psDiagnosticsOutsideTiming=True,
                order='rotating control/instrumented/ngspice by round', started=asdict(run_start))
    meta['nodeHrtimeEpoch'] = 'continuous' if sys.platform == 'darwin' else 'monotonic'
    (out / f'host-{len(existing):02d}.json').write_text(json.dumps(meta, indent=2) + '\n')
    stopped = False
    with journal.open('a', buffering=1) as log:
        for round_index in range(args.rounds):
            modes = ['control', 'instrumented', 'ngspice']
            modes = modes[round_index % 3:] + modes[:round_index % 3]
            for mode in modes:
                id = f'{round_index + 1:02d}-{mode}'
                if id in ids:
                    continue
                before = host()
                start = clock.read()
                pre_error = clock_error(run_start, start)
                if pre_error:
                    (out / 'stopped.json').write_text(json.dumps(dict(reason=pre_error, now=asdict(start))))
                    stopped = True
                    break
                start_ns = time.monotonic_ns()
                row: dict = dict(id=id, mode=mode, round=round_index + 1, before=before, start=asdict(start), startNs=str(start_ns))
                argv = ['node', str(ROOT / 'benchmarks/performance/rc1k-attribution-worker.mjs'), mode, str(out), id]
                child = subprocess.Popen(argv, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
                row.update(pid=child.pid, command=argv)
                timeout = False
                try:
                    stdout, stderr = child.communicate(timeout=60)
                except subprocess.TimeoutExpired:
                    timeout = True
                    os.killpg(child.pid, signal.SIGKILL)
                    stdout, stderr = child.communicate()
                end_ns = time.monotonic_ns()
                end = clock.read()
                after = host()
                wall_ms = (end.continuous - start.continuous) * 1000
                row.update(end=asdict(end), endNs=str(end_ns), after=after, code=child.returncode,
                           boundaries=dict(wall=wall_ms), status='timeout' if timeout or wall_ms >= 60000 else 'ok')
                (out / (id + '.worker.stdout.txt')).write_bytes(stdout)
                (out / (id + '.worker.stderr.txt')).write_bytes(stderr)
                error = clock_error(start, end) or clock_error(run_start, end)
                try:
                    receipt = json.loads(stdout)
                    row['worker'] = receipt
                    row['boundaries'].update(receipt['boundaries'])
                    epoch = 'continuous' if sys.platform == 'darwin' else 'monotonic'
                    row['nodeHrtimeEpoch'] = epoch
                    row['boundaries']['spawnFirstUserCode'] = int(receipt['firstNs']) / 1e6 - getattr(start, epoch) * 1000
                    row['boundaries']['exit'] = getattr(end, epoch) * 1000 - int(receipt['doneNs']) / 1e6
                    error = error or node_error(wall_ms / 1000, receipt['lifetime'], [])
                    if row['boundaries']['spawnFirstUserCode'] < 0 or row['boundaries']['exit'] < 0:
                        error = error or 'hrtime-epoch-disagreement'
                    if mode != 'ngspice' and receipt['evidence']['output']['outputSha256'] != '6a650522805562c8018777ab78a344668d2fb12038fd6e4fcfd7cc3302c4e8a7':
                        error = error or 'baseline-output-hash-mismatch'
                except (ValueError, KeyError, TypeError) as exc:
                    row['receiptError'] = str(exc)
                    row['status'] = 'failed'
                if child.returncode != 0:
                    row['status'] = 'failed'
                if error:
                    row.update(status='invalid', certificationError=error)
                    stopped = True
                row['certified'] = error is None and row['status'] == 'ok'
                log.write(json.dumps(row) + '\n')
                print(id, row['status'], f'{wall_ms:.3f} ms', flush=True)
                # A native ngspice child has its own receipt (nested workload #46..60).
                if mode == 'ngspice' and (out / (id + '.native.started.json')).exists():
                    native = row.get('worker', {}).get('evidence', {}).get('native',
                        dict(json.loads((out / (id + '.native.started.json')).read_text()), status='incomplete', after=after))
                    (out / (id + '.native.json')).write_text(json.dumps(dict(native, id=id + '-native',
                        continuousCertificationEnvelope=dict(start=asdict(start), end=asdict(end), error=error)), indent=2) + '\n')
                if stopped:
                    break
            if stopped:
                break
    final = [json.loads(line) for line in journal.read_text().splitlines()]
    native_count = len(list(out.glob('*.native.started.json')))
    (out / 'budget.json').write_text(json.dumps(dict(topLevelAttempted=len(final), nativeAttempted=native_count,
        totalEngineWorkloads=len(final) + native_count, max=60, stopped=stopped,
        runEnd=asdict(clock.read())), indent=2) + '\n')
    return 1 if stopped or any(r['status'] != 'ok' for r in final) else 0


if __name__ == '__main__':
    raise SystemExit(main())
