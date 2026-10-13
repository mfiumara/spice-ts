# SPDX-License-Identifier: MIT
"""Offline, relocatable verification of the preserved same-byte before/after evidence."""
import hashlib
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
before, after, provisional = [json.loads((HERE / name).read_text()) for name in
                              ('before.json', 'after.json', 'provisional-receipt.json')]
matrix = json.loads((HERE / 'matrix.json').read_text())
ids = [case['id'] for case in matrix]
assert len(ids) == len(set(ids)) == 16
cumulative = 0.0
for report in (before, after):
    assert [row['id'] for row in report['rows']] == ids
    assert report['source'] == {**provisional['source'], 'revisionReceipt': report['source']['revisionReceipt']}
    assert 'ngspice-47' in report['metadata']['ngspiceVersion']['stdout']
    receipts = [report['metadata'][key] for key in ('baseline', 'ngspiceVersion', 'nodeVersion', 'pnpmVersion')]
    receipts.append(report['source']['revisionReceipt'])
    for case, row in zip(matrix, report['rows']):
        assert all(row[key] == value for key, value in case.items())
        deck = HERE / 'decks' / (row['id'] + '.cir')
        digest = hashlib.sha256(deck.read_bytes()).hexdigest()
        assert digest == row['deckHashBefore'] == row['deckHashAfter']
        ref, native = row['reference'], row['native']
        receipts.extend((ref, native))
        assert ref['exit'] == 0 and not ref['timedOut']
        assert ref['argv'][:4] == ['ngspice', '-n', '-b', '-r']
        assert ref['argv'][-1] == native['argv'][4]
        assert Path(ref['argv'][-1]).name == deck.name
        assert json.loads(native['argv'][5]) == case['observe']
        raw = row['referenceRaw'].split('Variables:\n', 1)[1].split('Values:\n', 1)
        columns = [line.split()[1].lower() for line in raw[0].splitlines() if line.strip()]
        values = [line.split() for line in raw[1].splitlines() if line.strip()]
        assert len(values) == len(columns) and 'Plotname: Operating Point' in row['referenceRaw']
        decoded = [float(values[0][1])] + [float(line[0]) for line in values[1:]]
        reference = {name: decoded[columns.index(name.lower())] for name in case['observe']}
        assert reference == row['referenceValues']
        payload = json.loads(native['stdout'])
        if row['nativeValues'] is None:
            assert native['exit'] != 0 and payload['status'] == 'failure'
            assert row['metrics'] is None
        else:
            actual = row['nativeValues']
            assert native['exit'] == 0 and payload['values'] == actual
            assert all(math.isfinite(v) for v in actual.values())
            absolute = [abs(actual[key] - value) for key, value in reference.items()]
            relative = [error / abs(value) for error, value in zip(absolute, reference.values())]
            expected = dict(maxAbsolute=max(absolute), rmsAbsolute=math.sqrt(sum(e*e for e in absolute)/len(absolute)),
                            maxRelative=max(relative), rmsRelative=math.sqrt(sum(e*e for e in relative)/len(relative)))
            assert expected == row['metrics']
    assert all(not receipt['timedOut'] and receipt['seconds'] <= 12 for receipt in receipts)
    assert math.isclose(sum(receipt['seconds'] for receipt in receipts), report['actualChildSeconds'])
    cumulative += report['actualChildSeconds']
assert cumulative <= 300
failed = [row for row in before['rows'] if row['nativeValues'] is None]
losses = [row for row in before['rows'] if row['metrics'] and row['metrics']['maxRelative'] > 1e-6]
assert len(failed) == 6 and len(losses) == 2
for old, new, original in zip(before['rows'], after['rows'], provisional['rows']):
    assert old['deckHashBefore'] == new['deckHashBefore'] == original['deckHashBefore']
    assert old['referenceValues'] == new['referenceValues'] == original['referenceValues']
    assert new['nativeValues'] is not None
    assert all(abs(new['nativeValues'][key] - value) <= max(1e-12, abs(value)*1e-6)
               for key, value in new['referenceValues'].items())
    if old not in failed and old not in losses:
        assert old['nativeValues'] == new['nativeValues']
        assert old['metrics'] == new['metrics']
print(f'PASS: 16 identical decks; six failures and two losses repaired; eight controls unchanged; {cumulative:.9f}s cumulative child wall')
