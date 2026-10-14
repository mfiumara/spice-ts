"""Retain native startup loads and verify instrumented ngspice equals the reference."""
import gzip
import json
from pathlib import Path

root = Path('evidence/1003')
fields = ['qgs', 'qgd', 'qgb', 'qbs', 'qbd', 'cqgs', 'cqgd', 'cqgb', 'cqbs', 'cqbd', 'vgs', 'vds', 'vbs', 'capgs', 'capgd', 'capgb']
steps, loads, predictions = [], [], []
for line in (root/'.run/native.stderr.txt').read_text().splitlines():
    v = line.split()
    if not v:
        continue
    if v[0] == 'STEPTRACE':
        steps.append(dict(time=float(v[1]), dt=float(v[2]), order=int(v[3]), iterations=int(v[4]), returnCode=int(v[5])))
    elif v[0] == 'PREDTRACE':
        predictions.append(dict(time=float(v[1]), device=v[2], mode=int(v[3]), terminals=list(map(float, v[4:]))))
    elif v[0] == 'MOS2TRACE':
        loads.append(dict(time=float(v[1]), device=v[2], mode=int(v[3]), **dict(zip(fields, map(float, v[4:])))))
raw = (root/'.run/native.raw').read_text()
header, values = raw.split('Values:\n')
variables = [line.split()[1] for line in header.split('Variables:\n')[1].splitlines() if line.strip()]
lines = [line for line in values.splitlines() if line.strip()]
rows = [[float(line.split()[-1]) for line in lines[i:i+len(variables)]] for i in range(0, len(lines), len(variables))]
reference = json.loads(gzip.decompress(Path('evidence/996/runs/k-15-original.json.gz').read_bytes()))['ngspice']['execution']['analyses'][0]['series']
assert len(rows) == len(reference['grid']) == 1010
errors = {}
for j, name in enumerate(variables[1:], 1):
    if name not in reference['signals']:
        continue
    errors[name] = max(abs(row[j]-value['re']) for row, value in zip(rows, reference['signals'][name]))
assert len(errors) == 19
assert max(abs(row[0]-t) for row, t in zip(rows, reference['grid'])) < 1e-21
assert max(errors.values()) < 1e-10, errors
(root/'native-trace.json.gz').write_bytes(gzip.compress(json.dumps(dict(steps=steps, loads=loads, predictions=predictions, variables=variables, rows=rows)).encode(), mtime=0))
window = {}
second_timepoint = {}
for label in ['before', 'after']:
    trace = json.loads(gzip.decompress((root/f'{label}-trace.json.gz').read_bytes()))
    selected = [v for v in trace['loads'] if v['device'] == 'mn11' and 2.9e-9 < v['time'] < 3e-9]
    window[label] = dict(firstLoad=selected[0], lastLoad=selected[-1], count=len(selected), steps=[s for s in trace['steps'] if 2.9e-9 < s['time'] < 3e-9])
    second_timepoint[label] = next(v for v in trace['loads'] if v['device'] == 'mn11' and 1.5e-12 < v['time'] < 2.5e-12)
selected = [v for v in predictions if v['device'] == 'mn11' and 2.9e-9 < v['time'] < 3e-9]
second_timepoint['native'] = next(v for v in predictions if v['device'] == 'mn11' and 1.5e-12 < v['time'] < 2.5e-12)
summary = dict(nativeReferenceMaxAbs=errors, points=len(rows), window=window, secondTimepoint=second_timepoint,
    nativeFirstWindowLoad=selected[0], nativeWindowSteps=[s for s in steps if 2.9e-9 < s['time'] < 3e-9],
    nativeInitialSteps=steps[:4], sourceArchiveSha256='894e649651f1838a14095e5a5439e7d3aa63e87ede14d283173fda4fcdef675f')
assert window['before']['firstLoad']['predicted'] is False
assert window['after']['firstLoad']['predicted'] is True
(root/'localization.json').write_text(json.dumps(summary, indent=2)+'\n')
print(json.dumps(summary, indent=2))
