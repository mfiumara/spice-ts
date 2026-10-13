"""Offline receipts check; python3 benchmarks/control-loop-scalars-20261013/check.py."""
import hashlib
import json
import math
from pathlib import Path

root = Path(__file__).parent
before = json.loads((root / 'diagnosis.json').read_text())
after = json.loads((root / 'after.json').read_text())
originals = ['instance-loop.cir', 'loop-instance.cir', 'loop-model.cir']
rows = {Path(row['path']).name: row for row in after['fixtures']}
assert len(after['fixtures']) == 5
for name in originals:
    old = next(row for row in before['fixtures'] if Path(row['path']).name == name)
    new = rows[name]
    assert old['sha256'] == new['sha256'] == hashlib.sha256(Path(new['path']).read_bytes()).hexdigest()
    assert old['spiceTs']['exitCode'] == 1 and old['matchedPoints'] == 0
    assert new['ngspice']['exitCode'] == new['readout']['exitCode'] == 0
    assert new['referenceOpRows'] == len(new['referenceN1']) == 19
    if name != 'loop-model.cir':
        assert new['spiceTs']['exitCode'] == 0
        assert new['matchedPoints'] == new['nativeResult']['runs'] == 19
        errors = [abs(a-b)/abs(b) for a,b in zip(new['nativeResult']['n1'], new['referenceN1'])]
        assert new['maxRelativeError'] == max(errors)
        assert new['rmsRelativeError'] == math.sqrt(sum(e*e for e in errors)/19)
        assert new['maxRelativeError'] < 1e-12
    else:
        assert new['spiceTs']['exitCode'] == 1 and new['outcome'] == 'spice-ts-loss'
        assert 'altermod' in new['nativeResult']['error'] and 'R2' in new['nativeResult']['error']
        assert new['matchedPoints'] == 0 and new['maxRelativeError'] is None and new['rmsRelativeError'] is None
assert rows['minimal.cir']['nativeResult']['output'] == ['bounds 1000 100 -50']
assert rows['namespace.cir']['nativeResult']['output'] == ['9 9', '9']
wall = sum(row[engine]['wallSeconds'] for row in after['fixtures']
           for engine in ['ngspice', 'spiceTs', 'readout'] if engine in row)
assert abs(wall - after['totalActualChildWallSeconds']) < 1e-9 and wall <= 600
assert all(row[engine]['wallSeconds'] <= 12 for row in after['fixtures']
           for engine in ['ngspice', 'spiceTs', 'readout'] if engine in row)
print('PASS: 3 unchanged originals; 2 compared x 19 points; 1 honest null-metric loss; 2 controls; bounded wall accounted')
