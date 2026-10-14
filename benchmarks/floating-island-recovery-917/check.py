#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Offline receipt assertions. They prove rejected outcomes, not a simulator fix."""
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
STAGES = ['before', 'source-candidate', 'optran-candidate']
rows = {stage: json.loads((HERE / f'{stage}.json').read_text())['receipts'] for stage in STAGES}
names = ['base_37.local.cir', 'variant_37.local.cir', 'floating-diode.cir']
expected_factors = {
    'before': [173, 173, 40],
    'source-candidate': [203, 203, 40],
    'optran-candidate': [1903, 1903, 148],
}
summary = []
for stage, receipts in rows.items():
    assert [r['name'] for r in receipts] == names
    assert [r['spiceTs']['factorAttempts'] for r in receipts] == expected_factors[stage]
    for index, r in enumerate(receipts):
        original = rows['before'][index]
        assert r['sha256'] == original['sha256']
        assert r['includes'] == original['includes']
        assert r['ngspice'] == original['ngspice']
        recovered = stage == 'optran-candidate' and index == 2
        assert (r['spiceTs']['error'] is None) == recovered
        if not recovered:
            assert r['spiceTs']['error'].startswith('SingularMatrixError:')
        assert r['spiceTs']['maxError'] is None
        assert r['spiceTs']['rmsError'] is None
        summary.append({'stage': stage, 'name': r['name'], 'factorAttempts': r['spiceTs']['factorAttempts'],
                        'spiceTsSuccess': recovered, 'ngspiceDefaultExit': r['ngspice'][0]['exitCode'],
                        'maxError': None, 'rmsError': None})
trace = [json.loads(line) for line in (HERE / 'trace.jsonl').read_text().splitlines() if line.startswith('{')]
blocks = []
start = 0
for i, event in enumerate(trace):
    if event['experiment'] == 'optran':
        blocks.append(trace[start:i + 1])
        start = i + 1
assert len(blocks) == 3 and start == len(trace)
for index, block in enumerate(blocks):
    sources = block[:-1]
    assert sources[0]['scale'] == 0 and sources[0]['success'] is False
    bootstrap = [s for s in sources if s['diagonal'] > 0]
    assert len(bootstrap) == 11 and all(s['scale'] == 0 and s['success'] for s in bootstrap)
    assert sources[-2]['scale'] == .001 and sources[-2]['success'] is False
    assert sources[-1]['scale'] == 0 and sources[-1]['diagonal'] == 0 and sources[-1]['success'] is False
    optran = block[-1]
    if index < 2:
        assert optran['success'] is False and optran['time'] == 0
        assert optran['convergence']['transient']['acceptedSteps'] == 0
        assert optran['convergence']['transient']['nrRetries'] == 17
        assert optran['convergence']['transient']['newtonIterations'] == 1700
        assert optran['convergence']['transient']['failure'] == 'dt-floor'
    else:
        assert optran['success'] is True and optran['time'] == 1e-5
        assert optran['convergence']['transient']['acceptedSteps'] == 107
        assert optran['convergence']['transient']['rejectedSteps'] == 0
assert hashlib.sha256((ROOT / 'packages/core/src/analysis/dc.ts').read_bytes()).hexdigest() == 'b47918b18b62b62e2c65847f5ecdc8925d21b711fcd12f119f35fa1f80a950fe'
print(json.dumps({'verified': True, 'rows': summary}, indent=2))
