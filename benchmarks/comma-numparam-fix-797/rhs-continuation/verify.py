# SPDX-License-Identifier: MIT
"""Offline check of continuation receipts and the complete legacy twenty-case table."""
import hashlib
import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
spec = importlib.util.spec_from_file_location('diagnosis', ROOT / 'benchmarks/comma-numparam-797/compare.py')
assert spec is not None and spec.loader is not None
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
before = json.loads((HERE / 'before.json').read_text())
after = json.loads((HERE / 'after.json').read_text())
assert len(before['rows']) == 10 and len(after['rows']) == 30
assert len({r['id'] for r in after['rows']}) == 30
for receipt in (before, after):
    assert receipt['actualChildSeconds'] < 300
    assert 'ngspice-47' in receipt['metadata']['ngspiceVersion']['stdout']
    for row in receipt['rows']:
        digest = hashlib.sha256((ROOT / row['path']).read_bytes()).hexdigest()
        assert row['deckHashBefore'] == row['deckHashAfter'] == digest
        for engine in ('reference', 'native'):
            assert not row[engine]['timedOut'] and row[engine]['signal'] is None
        raw = row['referenceRaw']
        rv = runner.raw_values(raw) if row['reference']['exit'] == 0 and raw else None
        payload = json.loads(row['native']['stdout'])
        nv = payload['values'] if row['native']['exit'] == 0 else None
        assert row['referenceValues'] == rv and row['nativeValues'] == nv
        assert row['metrics'] == runner.metrics(rv, nv)
legacy = json.loads((HERE.parent / 'final.json').read_text())
for baseline, fixed in zip(before['rows'], after['rows'][:10]):
    assert baseline['id'] == fixed['id']
    assert baseline['deckHashBefore'] == fixed['deckHashBefore']
    assert baseline['referenceValues']['v(o)'] == fixed['referenceValues']['v(o)'] == 5
    assert baseline['nativeValues'] is None
    assert fixed['nativeValues']['v(o)'] == 5
    assert fixed['metrics']['maxRelative'] == 0
    print(f"{fixed['id']}: before native failure; ngspice=5 V; after native=5 V")
counts = dict(agree=0, bothFailed=0, statusLoss=0, numericalLoss=0)
for baseline, fixed in zip(legacy['rows'], after['rows'][10:]):
    assert baseline['id'] == fixed['id'] and baseline['deckHashBefore'] == fixed['deckHashBefore']
    assert baseline['referenceValues'] == fixed['referenceValues']
    rv, nv = fixed['referenceValues'], fixed['nativeValues']
    if rv is None and nv is None:
        status = 'bothFailed'
    elif rv is None or nv is None:
        status = 'statusLoss'
    elif fixed['metrics']['maxRelative'] is not None and fixed['metrics']['maxRelative'] <= 1e-6:
        status = 'agree'
    else:
        status = 'numericalLoss'
    counts[status] += 1
    print(f"{fixed['id']}: {status}; metrics={fixed['metrics']}")
assert counts == dict(agree=15, bothFailed=4, statusLoss=1, numericalLoss=0), counts
print('Legacy twenty-case table:', counts)
print('Recorded child wall seconds:', before['actualChildSeconds'], after['actualChildSeconds'])
print('PASS: 40 fresh receipt rows; 10 continuation agreements; 20-case table unchanged')
