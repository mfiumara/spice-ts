"""Reduce native traces and verify original ngspice reference equivalence offline."""
import gzip
import json
from pathlib import Path

root = Path('evidence/1002')
fields = ['qgs', 'qgd', 'qgb', 'qbs', 'qbd', 'cqgs', 'cqgd', 'cqgb', 'cqbs', 'cqbd', 'vgs', 'vds', 'vbs', 'capgs', 'capgd', 'capgb']
steps, lte, loads = [], [], []
for line in (root/'.run/native.stderr.txt').read_text().splitlines():
    v = line.split()
    if not v:
        continue
    if v[0] == 'STEPTRACE':
        steps.append(dict(time=float(v[1]), dt=float(v[2]), order=int(v[3]), iterations=int(v[4]), returnCode=int(v[5])))
    elif v[0] == 'LTETRACE':
        lte.append(dict(time=float(v[1]), order=int(v[2]), bound=float(v[3])))
    elif v[0] == 'MOS2TRACE':
        loads.append(dict(time=float(v[1]), device=v[2], mode=int(v[3]), **dict(zip(fields, map(float, v[4:])))))
assert len(steps) == 1007 and all(s['returnCode'] == 0 for s in steps)
(root/'native-trace.json.gz').write_bytes(gzip.compress(json.dumps(dict(steps=steps, lte=lte, loads=loads)).encode(), mtime=0))

raw = (root/'.run/native.raw').read_text()
header, values = raw.split('Values:\n')
variables = [line.split()[1] for line in header.split('Variables:\n')[1].splitlines() if line.strip()]
lines = values.splitlines()
rows = [[float(line.split()[-1]) for line in lines[i:i+len(variables)]] for i in range(0, len(lines), len(variables))]
reference = json.loads(gzip.decompress(Path('evidence/996/runs/k-10-original.json.gz').read_bytes()))['ngspice']['execution']['analyses'][0]['series']
assert len(rows) == len(reference['grid']) == 1008
errors = {}
for j, name in enumerate(variables[1:], 1):
    expected = [v['re'] for v in reference['signals'][name]]
    errors[name] = max(abs(row[j]-value) for row, value in zip(rows, expected))
assert max(abs(row[0]-t) for row, t in zip(rows, reference['grid'])) < 1e-21
assert max(errors.values()) < 1e-10, errors
before = json.loads(gzip.decompress((root/'before-trace.json.gz').read_bytes()))
after = json.loads(gzip.decompress((root/'after-trace.json.gz').read_bytes()))
assert all(c['charge'] == c['loadedCharge'] for c in after['charges'])
first = next(c for c in before['charges'] if c['charge'] != c['loadedCharge'])
window = {label: [c for c in run['charges'] if c['device']=='md1' and 482e-9 < c['time'] < 483e-9][0] for label,run in [('before',before),('after',after)]}
summary = dict(nativeReferenceMaxAbs=errors, points=1008, firstChangedHistory=first, window482ns=window,
    integrationConfound=dict(beforeFallbacks=before['fallbacks'], afterFallbacks=after['fallbacks'],
        interpretation='Direct history effects and retry-induced permanent Euler fallback are not separated.'),
    nativeWindowSteps=[s for s in steps if 480e-9 < s['time'] < 484e-9],
    beforeWindowSteps=[s for s in before['steps'] if 480e-9 < s['time'] < 484e-9],
    afterWindowSteps=[s for s in after['steps'] if 480e-9 < s['time'] < 484e-9],
    sourceArchiveSha256='894e649651f1838a14095e5a5439e7d3aa63e87ede14d283173fda4fcdef675f')
(root/'localization.json').write_text(json.dumps(summary, indent=2)+'\n')
print(json.dumps(summary, indent=2))
