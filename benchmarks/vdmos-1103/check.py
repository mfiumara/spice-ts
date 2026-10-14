"""Offline receipt integrity and honest eight-deck outcome contract."""
from collections import Counter
import gzip
import hashlib
import json
from pathlib import Path

root = Path(__file__).parent
before = json.loads(gzip.decompress((root / 'before.json.gz').read_bytes()))
after = json.loads(gzip.decompress((root / 'after.json.gz').read_bytes()))
manifest = json.loads(Path('benchmarks/corpus/corpus-n/manifest.json').read_text())
selected = {c['id']: c for c in manifest['circuits'] if '/examples/vdmos/' in c['localPath']}
assert len(selected) == 8
assert before['manifestSha256'] == after['manifestSha256'] == hashlib.sha256(Path('benchmarks/corpus/corpus-n/manifest.json').read_bytes()).hexdigest()
assert before['policy'] == after['policy']
assert before['coreTree'] != after['coreTree']
for phase, receipt in [('before', before), ('after', after)]:
    assert len(receipt['fixtures']) == 8
    assert {r['id'] for r in receipt['fixtures']} == set(selected)
    for row in receipt['fixtures']:
        fixture = selected[row['id']]
        assert row['sha256'] == fixture['sha256'] == hashlib.sha256(Path(fixture['localPath']).read_bytes()).hexdigest()
        assert row['ngspice']['status'] == 'success'
        if phase == 'before':
            assert row['spiceTs']['status'] == 'failed'
            assert 'has 4 terminals' in row['spiceTs']['firstErrorLine']
        else:
            assert row['spiceTs']['status'] == 'success'
            if row['outcome'] == 'matched':
                assert row['comparedSignals'] > 0 and row['worstNormalizedError'] < 0.01
            else:
                assert row['outcome'] == 'not-compared'
                assert row['comparedSignals'] == 0 and row['worstNormalizedError'] is None
assert Counter(r['outcome'] for r in after['fixtures']) == {'matched': 2, 'not-compared': 6}
print('verified: 8 identical-input decks; before 8 rejections; after 8 successes, 2 matches, 6 not-compared')
