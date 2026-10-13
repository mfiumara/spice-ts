# SPDX-License-Identifier: MIT
"""Offline verification of all failed/successful prototype evidence."""
import hashlib
import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
spec = importlib.util.spec_from_file_location('diagnosis', HERE.parent / 'comma-numparam-797/compare.py')
assert spec is not None and spec.loader is not None
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
original = json.loads((HERE.parent / 'comma-numparam-797/receipt.json').read_text())
phases = ('before', 'after', 'after-continuation', 'final')
cumulative = 0.0
for phase in phases:
    report = json.loads((HERE / (phase + '.json')).read_text())
    assert len(report['rows']) == 20
    assert {r['id'] for r in report['rows']} == {r['id'] for r in original['rows']}
    children = list(report['metadata'][k] for k in ('head', 'ngspiceVersion', 'nodeVersion'))
    for row in report['rows']:
        saved = next(r for r in original['rows'] if r['id'] == row['id'])
        digest = hashlib.sha256((ROOT / row['path']).read_bytes()).hexdigest()
        assert digest == saved['deckHashBefore'] == row['deckHashBefore'] == row['deckHashAfter']
        assert row['referenceValues'] == saved['referenceValues']
        if row['referenceValues'] is not None:
            assert runner.raw_values(row['referenceRaw']) == row['referenceValues']
        if row['nativeValues'] is not None:
            assert json.loads(row['native']['stdout'])['values'] == row['nativeValues']
        assert row['metrics'] == runner.metrics(row['referenceValues'], row['nativeValues'])
        children.extend((row['reference'], row['native']))
    seconds = sum(c['seconds'] for c in children)
    assert all(not c['timedOut'] and c['signal'] is None and c['seconds'] <= 12 for c in children)
    assert abs(seconds - report['phaseChildSeconds']) < 1e-9
    cumulative += seconds
    assert abs(cumulative - report['cumulativeChildSeconds']) < 1e-9
    assert cumulative <= 300
    for name in ('issue-1', 'issue-3', 'issue-5', 'unbraced-trailing'):
        row = next(r for r in report['rows'] if r['id'] == name)
        assert row['referenceValues'] is None and row['metrics'] is None
    print(phase, 'verified 20 unchanged cases')
assert abs(cumulative - json.loads((HERE / 'budget.json').read_text())['seconds']) < 1e-9
print('Verified cumulative owned child wall:', cumulative)
