"""Offline scalar receipts: all #996 controls, losses and source hashes."""
import gzip
import hashlib
import json
from pathlib import Path

receipt = json.loads(Path('evidence/1001/receipt.json').read_text())
rows = {row['control']: row for row in receipt['rows']}
paths = sorted(Path('evidence/996/runs').glob('*.json.gz'))
assert len(rows) == len(receipt['rows']) == len(paths) == 21
for path in paths:
    original = json.loads(gzip.decompress(path.read_bytes()))
    row = rows[path.name.removesuffix('.json.gz')]
    assert row['deckSha256'] == hashlib.sha256(original['deck'].encode()).hexdigest()
    assert row['before']['spiceTsStatus'] == original['spiceTs']['status']
    assert row['before']['ngspiceStatus'] == original['ngspice']['execution']['status']
    for engine in ['before', 'after']:
        worst = row[engine]['worst']
        if row[engine]['matchedDiagnostic']:
            assert worst is not None and worst['normalized'] <= .01
latch = rows['k-5-latch-op']['after']
assert latch['matchedDiagnostic']
op = latch['opValues'][0]
assert abs(op['v(12)'] - 4.999999946096958) < 5e-7
assert abs(op['v(13)'] - 1.367762560720779e-8) < 5e-7
assert not rows['k-5-original']['after']['matchedDiagnostic']
assert not rows['k-5-op']['after']['matchedDiagnostic']
assert rows['k-5-op']['after']['worst']['normalized'] > rows['k-5-op']['before']['worst']['normalized']
assert rows['k-10-original']['after']['worst']['normalized'] == rows['k-10-original']['before']['worst']['normalized']
assert rows['k-5-tight']['after']['spiceTsStatus'] == 'failed'
assert rows['k-5-tight']['after']['ngspiceStatus'] == 'failed'
print('21 controls checked; latch matched, cram and original mosrect/ring losses retained; worsened cram OP retained')
