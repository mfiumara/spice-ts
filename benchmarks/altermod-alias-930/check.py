"""Offline verification of unchanged hashes, matched coordinates and numerical receipts."""
import hashlib
import json
import math
from pathlib import Path

root = Path('benchmarks/altermod-alias-930')
before = json.loads((root / 'before.json').read_text())
after = json.loads((root / 'after.json').read_text())
assert 'ngspice-47' in after['ngspiceVersion']
assert len(before['fixtures']) == len(after['fixtures']) == 4
for old, new in zip(before['fixtures'], after['fixtures']):
    assert old['path'] == new['path']
    assert old['sha256'] == new['sha256'] == hashlib.sha256(Path(new['path']).read_bytes()).hexdigest()
    assert new['spiceTs']['exitCode'] == new['ngspice']['exitCode'] == 0
    assert new['matchedPoints'] == (2 if new['path'].endswith('minimal.cir') else 19)
    assert new['outcome'] == 'compared'
    if 'referenceN1' in new:
        assert new['referenceR2'] == list(range(1000, 99, -50))
        actual = [run['n1'] for run in new['nativeResult']['runs']]
        errors = [abs(a - b) / abs(b) for a, b in zip(actual, new['referenceN1'])]
        assert max(errors) == new['maxRelativeError']
        assert math.sqrt(sum(e * e for e in errors) / len(errors)) == new['rmsRelativeError']
        assert new['maxRelativeError'] < 1e-12
    for engine in ['spiceTs', 'ngspice', 'readout']:
        if engine in new:
            assert new[engine]['wallSeconds'] < 12
assert before['fixtures'][0]['matchedPoints'] == before['fixtures'][3]['matchedPoints'] == 0
assert before['fixtures'][0]['maxRelativeError'] is None
assert before['fixtures'][3]['maxRelativeError'] is None
assert all(row['matchedPoints'] == 19 for row in before['fixtures'][1:3])
assert after['totalActualChildWallSeconds'] < 300
print('PASS: unchanged hashes, 57 matched original OP points, recomputed max/RMS, ngspice-47, and cumulative budget.')
