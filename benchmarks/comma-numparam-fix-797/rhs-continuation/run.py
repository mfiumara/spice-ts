# SPDX-License-Identifier: MIT
"""New immutable continuation phase. Run under spice-heavy; never rewrite old receipts."""
import importlib.util
import json
import os
from pathlib import Path
import platform
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
DIAGNOSIS = ROOT / 'benchmarks/comma-numparam-797'
spec = importlib.util.spec_from_file_location('diagnosis', DIAGNOSIS / 'compare.py')
assert spec is not None and spec.loader is not None
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
phase = sys.argv[1]
assert phase in ('before', 'after')
output = HERE / f'{phase}.json'
assert not output.exists(), 'Receipt already exists'
assignments = {
    'numeric': 'alpha=\n+5',
    'bare': 'alpha=\n+seed*2',
    'braced': 'alpha={seed\n+*2}',
    'quoted': "alpha='seed\n+*2'",
    'comments': 'alpha= ; pending RHS\n* between lines\n\n+{seed\n+*2}',
}
cases = []
for nested in (False, True):
    for name, assignment in assignments.items():
        case_id = ('nested-' if nested else 'top-') + name
        call = f'Xchild o cell {assignment}'
        instance = f'.subckt caller o params: seed=2.5\n{call}\n.ends\nXouter o caller' if nested else call
        text = f'X-call continuation\n.param seed=2.5\n.subckt cell o params: alpha=1\nI1 0 o {{alpha}}\nR1 o 0 1\n.ends\n{instance}\n.op\n.end\n'
        deck = HERE / f'{case_id}.cir'
        if deck.exists():
            assert deck.read_text() == text
        else:
            deck.write_text(text)
        cases.append(dict(id=case_id, path=str(deck.relative_to(ROOT))))
if phase == 'after':
    cases += json.loads((DIAGNOSIS / 'matrix.json').read_text())
run = HERE / '.run' / phase
run.mkdir(parents=True, exist_ok=True)
metadata = dict(head=runner.child(['git', 'rev-parse', 'HEAD']),
                workingDiff=runner.child(['git', 'diff', '--', 'packages/core/src/parser/preprocessor.ts']),
                ngspiceVersion=runner.child(['ngspice', '--version']),
                nodeVersion=runner.child(['node', '--version']),
                host=dict(system=platform.system(), release=platform.release(), machine=platform.machine()),
                configuration='ngspice -n; SPICE_ASCIIRAWFILE=1; no compatibility mode')
assert 'ngspice-47' in metadata['ngspiceVersion']['stdout']
rows = []
for case in cases:
    deck = ROOT / case['path']
    digest = runner.sha(deck)
    raw = run / (case['id'] + '.raw')
    assert not raw.exists()
    ref = runner.child(['ngspice', '-n', '-b', '-r', str(raw), str(deck)], cwd=run,
                       env=dict(os.environ, SPICE_ASCIIRAWFILE='1'))
    text = raw.read_text() if raw.exists() else None
    rv = runner.raw_values(text) if ref['exit'] == 0 and text else None
    native = runner.child(['node', '--import', 'tsx', str(DIAGNOSIS / 'native.mts'), str(deck)])
    payload = json.loads(native['stdout'])
    nv = payload['values'] if native['exit'] == 0 and payload['status'] == 'success' else None
    assert digest == runner.sha(deck)
    rows.append(dict(**case, deckHashBefore=digest, deckHashAfter=runner.sha(deck), reference=ref,
                     referenceRaw=text, referenceValues=rv, native=native, nativeValues=nv,
                     nativeError=payload.get('error'), metrics=runner.metrics(rv, nv)))
    output.write_text(json.dumps(dict(metadata=metadata, phase=phase,
                      source=dict(url='https://github.com/mfiumara/spice-ts/issues/797', licence='MIT',
                                  description='Original project-authored continuation probes; legacy sources unchanged'),
                      limits=dict(directChildSeconds=12, cumulativeChildSeconds=300),
                      actualChildSeconds=runner.elapsed, rows=rows), indent=2, allow_nan=False) + '\n')
    print(case['id'], 'reference', rv, 'native', nv or payload.get('error'), flush=True)
