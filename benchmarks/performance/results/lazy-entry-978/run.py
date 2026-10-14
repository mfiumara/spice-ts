#!/usr/bin/env python3
"""spice-heavy python3 .../run.py OUT. 15 rotated cold rounds, no discarded samples."""
from dataclasses import asdict
import json
import os
from pathlib import Path
import signal
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[4]
HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / 'benchmarks/performance/results/elapsed-controls-951'))
from controls import ContinuousClock, clock_error  # noqa: E402


def host():
    return dict(loadavg=os.getloadavg(), processCount=len(subprocess.check_output(['ps', '-A', '-o', 'pid='], text=True).splitlines()))


def main():
    out = Path(sys.argv[1]).resolve()
    if (out / 'receipts.jsonl').exists() or (out / 'receipts.jsonl.gz').exists():
        raise RuntimeError('refusing to overwrite measured receipts; use a fresh directory')
    clock = ContinuousClock()
    start_run = clock.read()
    meta = dict(baseSha=subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
                node=subprocess.check_output(['node', '--version'], text=True).strip(),
                ngspice=subprocess.check_output(['ngspice', '--version'], text=True),
                uname=list(os.uname()), clock=clock.name, rounds=15,
                compileCache=os.environ.get('NODE_COMPILE_CACHE'), nodeOptions=os.environ.get('NODE_OPTIONS'),
                order='import alternating control/candidate; RC1k rotating control/candidate/ngspice; Mesh10k/CMOS1k alternating control/candidate',
                started=asdict(start_run))
    if meta['compileCache'] or meta['nodeOptions']:
        raise RuntimeError('unexpected Node cache/options environment')
    (out / 'host.json').write_text(json.dumps(meta, indent=2) + '\n')
    with (out / 'receipts.jsonl').open('x', buffering=1) as journal:
        def run(kind, mode, round_index, deck=None):
            id = f'{kind}-{round_index:02d}-{mode}' + (f'-{deck}' if deck else '')
            argv = (['node', str(ROOT / 'benchmarks/performance/rc1k-attribution-worker.mjs'), mode, str(out), id]
                    if kind == 'rc1k' else ['node', str(HERE / 'worker.mjs'), kind, str(out), mode] + ([deck] if deck else []))
            before = host()
            start = clock.read()
            child = subprocess.Popen(argv, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
            try:
                stdout, stderr = child.communicate(timeout=120)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL)
                stdout, stderr = child.communicate()
            end = clock.read()
            after = host()
            row = dict(id=id, kind=kind, mode=mode, round=round_index, deck=deck, command=argv, pid=child.pid,
                       before=before, after=after, start=asdict(start), end=asdict(end), wallMs=(end.continuous-start.continuous)*1000,
                       code=child.returncode, certificationError=clock_error(start, end) or clock_error(start_run, end))
            (out / (id + '.worker.stderr.txt')).write_bytes(stderr)
            (out / (id + '.worker.stdout.txt')).write_bytes(stdout)
            try:
                row['worker'] = json.loads(stdout)
            except ValueError:
                row['certificationError'] = row['certificationError'] or 'invalid-json'
            journal.write(json.dumps(row) + '\n')
            print(id, child.returncode, f'{row["wallMs"]:.3f} ms', flush=True)
            if child.returncode or row['certificationError'] or row['worker'].get('status', 'ok') != 'ok':
                raise RuntimeError(f'{id} failed; receipt retained')
        for index in range(15):
            modes = ['control', 'candidate'] if index % 2 == 0 else ['candidate', 'control']
            for mode in modes:
                run('import', mode, index + 1)
        for index in range(15):
            modes = ['control', 'candidate', 'ngspice']
            modes = modes[index % 3:] + modes[:index % 3]
            for mode in modes:
                run('rc1k', mode, index + 1)
        for deck in ['mesh10k', 'cmos1k']:
            for index in range(15):
                modes = ['control', 'candidate'] if index % 2 == 0 else ['candidate', 'control']
                for mode in modes:
                    run('cold', mode, index + 1, deck)
        for deck in ['rc1k', 'mesh10k', 'cmos1k', 'esm', 'cjs']:
            for mode in ['control', 'candidate']:
                run('parity', mode, 1, deck)
    subprocess.run(['node', str(HERE / 'worker.mjs'), 'summarize', str(out)], check=True, cwd=ROOT)


if __name__ == '__main__':
    main()
