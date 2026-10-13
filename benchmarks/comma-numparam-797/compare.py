# SPDX-License-Identifier: MIT
"""Serial same-byte OP diagnosis. Run under spice-heavy, no deck adaptation."""
from __future__ import annotations
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import signal
import subprocess
import time
from typing import TypedDict

class ChildReceipt(TypedDict):
    argv: list[str]
    cwd: str
    exit: int
    signal: int | None
    timedOut: bool
    seconds: float
    stdout: str
    stderr: str

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
RUN = HERE / '.run'
LIMIT = 12.0
BUDGET = 300.0
elapsed = 0.0

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def child(argv, cwd=ROOT, env=None) -> ChildReceipt:
    global elapsed
    remaining = BUDGET - elapsed
    if remaining <= 0:
        raise RuntimeError('Cumulative child budget exhausted')
    start = time.monotonic()
    proc = subprocess.Popen(argv, cwd=cwd, env=env, text=True,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    timed_out = False
    try:
        stdout, stderr = proc.communicate(timeout=min(LIMIT, remaining))
    except subprocess.TimeoutExpired:
        timed_out = True
        os.killpg(proc.pid, signal.SIGKILL)
        stdout, stderr = proc.communicate()
    seconds = time.monotonic() - start
    elapsed += seconds
    return dict(argv=[str(x) for x in argv], cwd=str(cwd), exit=proc.returncode,
                signal=-proc.returncode if proc.returncode < 0 else None,
                timedOut=timed_out, seconds=seconds, stdout=stdout, stderr=stderr)

def raw_values(text):
    assert 'Plotname: Operating Point' in text
    columns, data = text.split('Variables:\n')[1].split('Values:\n')
    names = [line.split()[1].lower() for line in columns.splitlines() if line.strip()]
    tokens = data.split()
    assert tokens.pop(0) == '0' and len(tokens) == len(names), 'Expected one OP point'
    values = dict(zip(names, map(float, tokens)))
    assert all(math.isfinite(v) for v in values.values())
    return {k: v for k, v in values.items() if k.startswith('v(')}

def metrics(reference, native):
    if reference is None or native is None:
        return None
    shared = sorted(set(reference) & set(native))
    assert shared, 'No shared nodes'
    absolute = [abs(native[k] - reference[k]) for k in shared]
    # Fixed zero policy: exact zero matches contribute 0; nonzero error at zero -> null relative aggregate.
    relative = [a / abs(reference[k]) if reference[k] else (0.0 if a == 0 else None)
                for k, a in zip(shared, absolute)]
    return dict(nodes=shared, count=len(shared), maxAbsolute=max(absolute),
                rmsAbsolute=math.sqrt(sum(a*a for a in absolute)/len(absolute)),
                maxRelative=None if None in relative else max(relative),
                rmsRelative=None if None in relative else math.sqrt(sum(r*r for r in relative)/len(relative)))

def main():
    RUN.mkdir(exist_ok=True)
    if (HERE / 'receipt.json').exists():
        raise RuntimeError('Existing receipt retained; do not rerun or reset the cumulative experiment budget')
    matrix = json.loads((HERE / 'matrix.json').read_text())
    assert len(matrix) <= 20 and len({c['id'] for c in matrix}) == len(matrix)
    source = json.loads((HERE / 'source.json').read_text())
    for entry in source['files']:
        assert sha(RUN / 'upstream' / entry['path']) == entry['sha256']
    metadata = dict(baseline=child(['git', 'rev-parse', 'HEAD']),
                    ngspiceVersion=child(['ngspice', '--version']),
                    nodeVersion=child(['node', '--version']), pnpmVersion=child(['pnpm', '--version']),
                    host=dict(system=platform.system(), release=platform.release(), machine=platform.machine()),
                    configuration='ngspice -n; SPICE_ASCIIRAWFILE=1; no compatibility mode',
                    runtimeBoundary='Owned direct process-group wall including startup. No speed claim.',
                    priorAttempts='Recovered WIP contained source downloads only, no simulation receipts or decks.')
    assert 'ngspice-47' in metadata['ngspiceVersion']['stdout']
    rows = []
    for case in matrix:
        deck = ROOT / case['path']
        before = sha(deck)
        raw = RUN / (case['id'] + '.raw')
        raw.unlink(missing_ok=True)
        ref = child(['ngspice', '-n', '-b', '-r', str(raw), str(deck)], cwd=RUN,
                    env=dict(os.environ, SPICE_ASCIIRAWFILE='1'))
        text = raw.read_text() if raw.exists() else None
        rv, re = None, None
        if ref['exit'] == 0 and text is not None:
            try:
                rv = raw_values(text)
            except Exception as error:
                re = str(error)
        elif ref['exit'] != 0 or text is None:
            re = ref['stderr'].strip() or 'No raw OP data'
        native = child(['node', '--import', 'tsx', str(HERE / 'native.mts'), str(deck)])
        nv, ne = None, None
        try:
            payload = json.loads(native['stdout'])
            ne = payload.get('error')
            if native['exit'] == 0 and payload['status'] == 'success':
                nv = payload['values']
        except (ValueError, KeyError) as error:
            ne = str(error)
        assert before == sha(deck)
        row = dict(**case, deckHashBefore=before, deckHashAfter=sha(deck), reference=ref,
                   referenceRaw=text, referenceValues=rv, referenceError=re, native=native,
                   nativeValues=nv, nativeError=ne, metrics=metrics(rv, nv))
        rows.append(row)
        # Checkpoint on every row so a reclaimed worker does not lose evidence or rerun silently.
        report = dict(metadata=metadata, source=source, limits=dict(cases=20, directChildSeconds=LIMIT,
                      cumulativeChildSeconds=BUDGET), actualChildSeconds=elapsed, rows=rows)
        (HERE / 'receipt.json').write_text(json.dumps(report, indent=2, allow_nan=False) + '\n')
        print(case['id'], rv, nv or ne, row['metrics'], flush=True)
    print(f'Recorded {len(rows)} cases, actual child wall {elapsed:.3f}s')

if __name__ == '__main__':
    main()
