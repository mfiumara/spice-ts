"""Offline scalar receipts: all #996 controls, losses and source hashes."""
import gzip
import hashlib
import json
from pathlib import Path

receipt = json.loads(Path('evidence/1001/receipt.json').read_text())
rows = {row['control']: row for row in receipt['rows']}
baseline = json.loads(Path('evidence/1001/continuation-before.json').read_text())
previous = {row['control']: row for row in baseline['rows']}
paths = sorted(Path('evidence/996/runs').glob('*.json.gz'))
assert len(rows) == len(receipt['rows']) == len(paths) == 21
assert len(previous) == len(baseline['rows']) == 21
assert baseline['baseHead'] == 'c97498eb5de80ba55ebc75744b2dba5ef31efc28'
for path in paths:
    original = json.loads(gzip.decompress(path.read_bytes()))
    row = rows[path.name.removesuffix('.json.gz')]
    assert row['deckSha256'] == hashlib.sha256(original['deck'].encode()).hexdigest()
    assert row['before']['spiceTsStatus'] == original['spiceTs']['status']
    assert row['before']['ngspiceStatus'] == original['ngspice']['execution']['status']
    assert row['deckSha256'] == previous[row['control']]['deckSha256']
    assert row['before'] == previous[row['control']]['before']
    for engine in ['before', 'after']:
        worst = row[engine]['worst']
        if row[engine]['matchedDiagnostic']:
            assert worst is not None and worst['normalized'] <= .01
latch = rows['k-5-latch-op']['after']
assert latch['matchedDiagnostic']
op = latch['opValues'][0]
assert abs(op['v(12)'] - 4.999999946096958) < 5e-7
assert abs(op['v(13)'] - 1.367762560720779e-8) < 5e-7
for control in ['k-5-original', 'k-5-op', 'k-5-fine', 'k-5-seeded']:
    assert not previous[control]['after']['matchedDiagnostic']
    assert rows[control]['after']['matchedDiagnostic']
    assert rows[control]['after']['worst']['normalized'] < previous[control]['after']['worst']['normalized']
remaining = {name for name, row in rows.items()
             if row['after']['spiceTsStatus'] == row['after']['ngspiceStatus'] == 'success'
             and not row['after']['matchedDiagnostic']}
assert remaining == {'k-10-original', 'k-10-reduced', 'k-15-original', 'k-15-stages-5'}
assert rows['k-10-original']['after']['worst']['normalized'] == rows['k-10-original']['before']['worst']['normalized']
assert rows['k-5-tight']['after']['spiceTsStatus'] == 'failed'
assert rows['k-5-tight']['after']['ngspiceStatus'] == 'failed'
print('21 controls checked; all successful cram controls match; four mosrect/ring losses retained; tight cram fails both engines')
