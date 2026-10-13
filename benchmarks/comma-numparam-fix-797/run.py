# SPDX-License-Identifier: MIT
"""Fresh before/after runs, immutable inputs and shared cumulative child budget."""
import importlib.util
import json
import os
from pathlib import Path
import platform
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
DIAGNOSIS = ROOT / 'benchmarks/comma-numparam-797'
spec = importlib.util.spec_from_file_location('diagnosis', DIAGNOSIS / 'compare.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
phase = sys.argv[1]
assert phase in ('before', 'after', 'after-continuation')
output = HERE / (phase + '.json')
assert not output.exists(), 'Existing evidence retained, no silent reruns'
budget = HERE / 'budget.json'
runner.elapsed = json.loads(budget.read_text())['seconds'] if budget.exists() else 0.0
start_elapsed = runner.elapsed
run = HERE / '.run' / phase
run.mkdir(parents=True, exist_ok=True)
rows = []
metadata = dict(head=runner.child(['git', 'rev-parse', 'HEAD']),
                ngspiceVersion=runner.child(['ngspice', '--version']),
                nodeVersion=runner.child(['node', '--version']),
                host=dict(system=platform.system(), release=platform.release(), machine=platform.machine()),
                configuration='ngspice -n; SPICE_ASCIIRAWFILE=1; no compatibility mode')
assert 'ngspice-47' in metadata['ngspiceVersion']['stdout']
try:
    matrix = json.loads((DIAGNOSIS / 'matrix.json').read_text())
    assert len(matrix) == 20 and len({c['id'] for c in matrix}) == 20
    saved = json.loads((DIAGNOSIS / 'receipt.json').read_text())
    for case in matrix:
        deck = ROOT / case['path']
        digest = runner.sha(deck)
        assert digest == next(r['deckHashBefore'] for r in saved['rows'] if r['id'] == case['id'])
        raw = run / (case['id'] + '.raw')
        ref = runner.child(['ngspice', '-n', '-b', '-r', str(raw), str(deck)], cwd=run,
                           env=dict(os.environ, SPICE_ASCIIRAWFILE='1'))
        text = raw.read_text() if raw.exists() else None
        rv = runner.raw_values(text) if ref['exit'] == 0 and text else None
        native = runner.child(['node', '--import', 'tsx', str(DIAGNOSIS / 'native.mts'), str(deck)])
        try:
            payload = json.loads(native['stdout'])
            nv = payload['values'] if native['exit'] == 0 and payload['status'] == 'success' else None
            error = payload.get('error')
        except (ValueError, KeyError) as failure:
            nv, error = None, str(failure)
        assert digest == runner.sha(deck)
        rows.append(dict(**case, deckHashBefore=digest, deckHashAfter=runner.sha(deck),
                         reference=ref, referenceRaw=text, referenceValues=rv,
                         native=native, nativeValues=nv, nativeError=error, metrics=runner.metrics(rv, nv)))
        output.write_text(json.dumps(dict(metadata=metadata, source=saved['source'],
                          limits=dict(directChildSeconds=12, cumulativeChildSeconds=300),
                          phaseChildSeconds=runner.elapsed-start_elapsed,
                          cumulativeChildSeconds=runner.elapsed, rows=rows), indent=2, allow_nan=False)+'\n')
        budget.write_text(json.dumps(dict(seconds=runner.elapsed, lastPhase=phase, cases=len(rows)))+'\n')
        print(case['id'], 'reference', rv, 'native', nv or error, 'metrics', rows[-1]['metrics'], flush=True)
finally:
    budget.write_text(json.dumps(dict(seconds=runner.elapsed, lastPhase=phase, cases=len(rows)))+'\n')
