"""Offline receipt/hash check. Stdlib only; launches no engine workloads."""
import gzip
import hashlib
import json
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parent
rows = [json.loads(line) for line in (ROOT / 'baseline/receipts.jsonl').read_text().splitlines()]
assert len(rows) == 45
assert len({r['id'] for r in rows}) == 45
assert all(r['certified'] and r['status'] == 'ok' and r['code'] == 0 for r in rows)
expected = '6a650522805562c8018777ab78a344668d2fb12038fd6e4fcfd7cc3302c4e8a7'
for mode in ['control', 'instrumented', 'ngspice']:
    selected = [r for r in rows if r['mode'] == mode]
    assert len(selected) == 15
    for row in selected:
        evidence = row['worker']['evidence']
        assert evidence['deckSha256'] == '0944ed6b76f64f56c8e04b48919f1e12b9de19df4e5a08708c4be314fa7a91b7'
        assert evidence['output']['count'] == 120240
        assert evidence['output']['vectors'] == 1002
        if mode != 'ngspice':
            assert evidence['output']['outputSha256'] == expected
            assert evidence['convergence']['transient']['newtonIterations'] == 238
        else:
            raw = gzip.decompress((ROOT / 'baseline' / (row['id'] + '.raw.gz')).read_bytes())
            header, payload = raw.split(b'Binary:\n', 1)
            header = header.decode()
            assert re.search(r'^Flags:\s*real\s*$', header, re.M)
            variable_match = re.search(r'^No\. Variables:\s*(\d+)', header, re.M)
            point_match = re.search(r'^No\. Points:\s*(\d+)', header, re.M)
            assert variable_match is not None and point_match is not None
            variables = int(variable_match[1])
            points = int(point_match[1])
            names = []
            for name, kind in re.findall(r'^\s*\d+\s+(\S+)\s+(time|voltage|current)\s*$', header, re.M):
                names.append('time' if kind == 'time' else 'tran-v:' + re.sub(r'^v\((.*)\)$', r'\1', name, flags=re.I) if kind == 'voltage' else 'tran-i:' + re.sub(r'^i\((.*)\)$', r'\1', name, flags=re.I).upper())
            assert len(names) == variables
            assert len(payload) == variables * points * 8
            digest = hashlib.sha256()
            for column, name in enumerate(names):
                digest.update((name + '\0').encode())
                for point in range(points):
                    at = (point * variables + column) * 8
                    digest.update(payload[at:at + 8])
            assert digest.hexdigest() == evidence['output']['outputSha256']
            assert evidence['native']['code'] == 0
            assert evidence['native']['transientIterations'] == 238
controls = [r for r in rows if r['mode'] == 'control']
natives = [r for r in rows if r['mode'] == 'ngspice']
probe_errors = []
for control, native in zip(controls, natives):
    a = control['worker']['evidence']
    b = native['worker']['evidence']
    assert len(a['grid']) == len(b['grid'])
    grid_error = max(abs(x-y) for x,y in zip(a['grid'], b['grid']))
    assert grid_error < 1e-15
    errors = [x-y for x,y in zip(a['probe'], b['probe'])]
    scale = max(abs(v) for v in b['probe'])
    probe_errors.append(dict(maxTimeAbs=grid_error, maxAbs=max(abs(v) for v in errors),
        maxRelativeToPeak=max(abs(v) for v in errors)/scale,
        rmsRelativeToPeak=(sum(v*v for v in errors)/len(errors))**.5/scale))
print(json.dumps(dict(rows=45, nativeRawHashesVerified=15, unchangedSpiceHashes=30,
    probeErrors=probe_errors[0], allRoundsSameProbeError=all(p == probe_errors[0] for p in probe_errors)), indent=2))
