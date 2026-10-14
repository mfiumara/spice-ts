"""Check the post-#1021 closure without overwriting the rejected-candidate evidence."""
import gzip
import hashlib
import json
import math
from pathlib import Path

root = Path('evidence/1002')
rows = {}
for label in ['closure-before', 'closure-after']:
    wave = json.loads((root / f'{label}.json').read_text())
    trace = json.loads(gzip.decompress((root / f'{label}-trace.json.gz').read_bytes()))
    amp = json.loads((root / f'mosamp-{label}.json').read_text())
    scores = {}
    for circuit, count in [('k-10', 10), ('k-15', 19)]:
        signals = wave[circuit]['signals']
        assert len(signals) == count
        assert all(math.isfinite(s['normalized']) and s['normalized'] >= 0 for s in signals.values())
        scores[circuit] = max(s['normalized'] for s in signals.values())
        assert (scores[circuit] <= .01) == (label == 'closure-after')
    assert amp['maxAbsAtStop'] < amp['originalTestBound'] == 5e-6
    assert amp['inputSha256'] == 'd8b0e627f7742490ac6e841ffb176c9b02ffe6de1246bb57d1db793f58027469'
    window = [s for s in trace['steps'] if 482e-9 < s['time'] < 483e-9]
    assert len(window) == 1
    assert len(trace['steps']) == 1007
    if label == 'closure-before':
        assert len(trace['fallbacks']) == 1
        assert abs(trace['fallbacks'][0]['failedTrialTime'] - 438.28e-9) < 1e-20
        assert window[0]['method'] == 'euler' and window[0]['order'] == 1
    else:
        assert trace['fallbacks'] == []
        assert window[0]['method'] == 'trapezoidal' and window[0]['order'] == 2
    rows[label] = dict(worstNormalized=scores, mosamp2ErrorV=amp['maxAbsAtStop'], mosamp2Points=amp['points'], fallbacks=trace['fallbacks'], mosrect482ns=window[0])
native = json.loads((root / 'closure-native.json').read_text())
assert len(native['rows']) == 2
for row in native['rows']:
    assert row['maxAbs'] == row['maxTimeDelta'] == 0
assert native['mosamp2']['referenceRoundingDelta'] < 1e-9
assert native['mosamp2']['deckSha256'] == amp['inputSha256']
# Keep the historical rejected candidate and its guard violation visible.
rejected = json.loads((root / 'mosamp-candidate.json').read_text())
assert rejected['maxAbsAtStop'] > rejected['originalTestBound'] == 5e-6
receipt = dict(
    schema='spice-ts-1002-closure/v1',
    beforeSource='a521e9e221f4445639d899265589e5893a07e165',
    afterSource='169d683d89b77c8ccb5a9459bc3888c4ec0aba62',
    productionFix='1e4bd5f1afd62967c0371f50dc6258b6e26dabdc (#1021)',
    metric='Identical original decks; #996 linear interpolation and peak floors; no phase alignment or tuning',
    rows=rows, rejectedCandidateMosamp2ErrorV=rejected['maxAbsAtStop'],
    nativeVerification=native,
    hashes={p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(root.glob('*closure*.json*')) if p.name != 'closure-receipt.json'},
)
(root / 'closure-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(rows, indent=2))
print('PASS: original decks match after upstream #1021; unchanged mosamp2 guard preserved; historical rejection retained')
