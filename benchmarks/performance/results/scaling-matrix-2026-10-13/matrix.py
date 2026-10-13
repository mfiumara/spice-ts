"""Fixed cold matrix + one selected profile. Run only through spice-heavy."""
from dataclasses import asdict
from pathlib import Path
import gzip
import hashlib
import json
import os
import platform
import shutil
import signal
import subprocess
import sys
import time
from typing import Any

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[3]
sys.path.insert(0, str(OUT.parent / 'elapsed-controls-951'))
import controls
# The card explicitly authorizes these larger limits. Archived #951 is unchanged.
controls.CHILD_SECONDS = 120.0
controls.RUN_SECONDS = 900.0
from controls import ContinuousClock, Budget, clock_error, node_error


def classify(reason, exit_code):
    if reason in ('deadline-reserve', 'child-deadline'):
        return 'timeout'
    if reason:
        return 'invalid-clock' if 'clock' in reason or 'disagreement' in reason else 'stopped'
    return 'ok' if exit_code == 0 else 'failed'


def can_start(elapsed):
    return elapsed + 120.25 < 900


def top_cell(rows):
    pairs = {}
    for row in rows:
        pairs.setdefault((row['circuit'], row['size']), {})[row['engine']] = row
    ranked = []
    for key, pair in pairs.items():
        spice, ng = pair.get('spice-ts'), pair.get('ngspice')
        if spice and spice['status'] == 'timeout':
            ranked.append((float('inf'), key))
        elif spice and ng and spice['status'] == ng['status'] == 'ok':
            ranked.append((spice['wallMs'] / ng['wallMs'], key))
    return max(ranked)[1] if ranked else None


def run_child(cell, argv, clock, budget, journal):
    key = cell['key']
    prefix = OUT / 'logs' / key
    previous = start = clock.read()
    row: dict[str, Any] = dict(cell, argv=argv, start=asdict(start), loadBefore=list(os.getloadavg()))
    reason = clock_error(budget.start, start)
    if reason or not can_start(budget.elapsed(start, budget.start)):
        row.update(status='censored', reason=reason or 'insufficient-run-budget')
    else:
        child = None
        try:
            with open(str(prefix) + '.stdout.txt', 'x') as stdout, open(str(prefix) + '.stderr.txt', 'x') as stderr:
                child = subprocess.Popen(argv, cwd=OUT, env=dict(os.environ, HOME=str(OUT)), stdout=stdout, stderr=stderr, start_new_session=True)
                row['pid'] = child.pid
                with (OUT / 'ownership.jsonl').open('a') as owned:
                    owned.write(json.dumps(dict(pid=child.pid, argv=argv, key=key)) + '\n')
                    owned.flush(); os.fsync(owned.fileno())
                while True:
                    now = clock.read()
                    reason = clock_error(previous, now) or clock_error(start, now) or clock_error(budget.start, now) or budget.check(now, start)
                    if reason or child.poll() is not None:
                        break
                    if budget.elapsed(now, start) >= 119.75:
                        reason = 'deadline-reserve'
                        break
                    previous = now
                    time.sleep(0.01)
        except BaseException as exc:
            reason = 'controller-exception'
            row['error'] = repr(exc)
        finally:
            if child:
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
            end = clock.read()
            reason = reason or clock_error(start, end) or clock_error(budget.start, end)
            row.update(end=asdict(end), wallMs=budget.elapsed(end, start) * 1000,
                       loadAfter=list(os.getloadavg()), reason=reason)
            row['status'] = classify(reason, row.get('exit'))
        result_path = Path(str(prefix) + '.result.json')
        if row['status'] == 'ok' and cell['engine'] == 'spice-ts':
            if not result_path.exists():
                row.update(status='failed', reason='missing-result')
            else:
                result = json.loads(result_path.read_text())
                error = node_error(row['wallMs'] / 1000, result['lifetime'], [{'simulateMs': result['parseMs'] + result['simulateMs']}])
                if error:
                    row.update(status='invalid-clock', reason=error)
                row['result'] = result
        for stream in ('stdout', 'stderr'):
            path = Path(str(prefix) + '.' + stream + '.txt')
            if path.exists():
                data = path.read_bytes()
                row[stream + 'Sha256'] = hashlib.sha256(data).hexdigest()
                Path(str(path) + '.gz').write_bytes(gzip.compress(data, mtime=0))
                path.unlink()
    journal.write(json.dumps(row, allow_nan=False) + '\n'); journal.flush(); os.fsync(journal.fileno())
    print(key, row['status'], row.get('wallMs'), row.get('reason'), flush=True)
    return row


def main():
    if (OUT / 'samples.jsonl').exists():
        raise RuntimeError('existing receipts; refusing retry')
    manifest = json.loads((OUT / 'decks.json').read_text())
    clock = ContinuousClock()
    host = dict(platform=platform.platform(), machine=platform.machine(), cpu=subprocess.check_output(['sysctl', '-n', 'machdep.cpu.brand_string'], text=True).strip(),
                ramBytes=int(subprocess.check_output(['sysctl', '-n', 'hw.memsize'], text=True)),
                revision=subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
                node=subprocess.check_output(['node', '--version'], text=True).strip(),
                ngspice=subprocess.check_output(['ngspice', '--version'], text=True),
                ngspicePath=shutil.which('ngspice'), ngspiceExecutableSha256=hashlib.sha256(Path(shutil.which('ngspice')).resolve().read_bytes()).hexdigest(),
                continuousClock=clock.name, childSeconds=120, totalSeconds=900, pollSeconds=0.01, killReserveSeconds=0.25,
                controlsSha256=hashlib.sha256((OUT.parent / 'elapsed-controls-951/controls.py').read_bytes()).hexdigest(),
                coreBundleSha256=hashlib.sha256((ROOT / 'packages/core/dist/index.js').read_bytes()).hexdigest())
    (OUT / 'host.json').write_text(json.dumps(host, indent=2) + '\n')
    (OUT / 'logs').mkdir(exist_ok=True)
    def interrupted(signum, frame):
        raise InterruptedError('parent-signal-' + str(signum))
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    start = clock.read(); budget = Budget(start)
    rows = []; stop = None
    with (OUT / 'samples.jsonl').open('x') as journal:
        for deck in manifest:
            for engine in ('spice-ts', 'ngspice'):
                key = deck['circuit'] + '-' + str(deck['size']) + '-' + engine
                cell = dict(deck, engine=engine, key=key)
                if stop:
                    row = dict(cell, status='censored', reason=stop)
                    journal.write(json.dumps(row) + '\n'); journal.flush()
                else:
                    argv = ([shutil.which('node'), str(OUT / 'worker.mjs'), str(OUT / deck['file']), deck['probe'], str(OUT / 'logs' / key)]
                            if engine == 'spice-ts' else [shutil.which('ngspice'), '-b', str(OUT / deck['file'])])
                    row = run_child(cell, argv, clock, budget, journal)
                    # A circuit timeout/failure is a published loss, not a reason to skip other circuits.
                    if row['status'] in ('invalid-clock', 'stopped', 'censored'):
                        stop = row.get('reason')
                rows.append(row)
        top = top_cell(rows)
        if top and not stop:
            deck = next(d for d in manifest if (d['circuit'], d['size']) == top)
            key = deck['circuit'] + '-' + str(deck['size']) + '-profile'
            argv = [shutil.which('node'), str(OUT / 'worker.mjs'), str(OUT / deck['file']), deck['probe'], str(OUT / 'logs' / key), '--profile']
            profile = run_child(dict(deck, key=key, engine='spice-ts', attributionOnly=True), argv, clock, budget, journal)
        else:
            profile = None
    end = clock.read()
    receipt = dict(start=asdict(start), end=asdict(end), actualRunSeconds=budget.elapsed(end, start),
                   clockError=clock_error(start, end), matrixStarted=sum('pid' in r for r in rows),
                   matrixCompleted=sum(r['status'] == 'ok' for r in rows), selected=top, profileStatus=profile and profile['status'],
                   observedBoundsSatisfied=budget.elapsed(end, start) < 900 and all(r.get('wallMs', 0) < 120000 for r in rows + ([profile] if profile else [])), stopReason=stop)
    (OUT / 'budget.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt, indent=2))

if __name__ == '__main__':
    main()
