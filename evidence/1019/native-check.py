"""Retain native device/step observations and verify its waveform against ngspice-47."""
import gzip
import json
from pathlib import Path
root = Path(__file__).parent
wave = json.loads(gzip.decompress((root/'waveforms.json.gz').read_bytes()))
ref = wave['ngspice']['analyses'][0]['series']
raw = (root/'native-build/output.raw').read_text().split('Values:\n')[1].splitlines()
rows = []
for i in range(0, len(raw), 5):
    rows.append([float(raw[i].split()[-1])] + [float(v) for v in raw[i+1:i+5]])
names = ['v(5)', 'v(2)', 'v(6)', 'i(vnin)']
assert len(rows) == len(ref['grid'])
assert all(row[0] == ref['grid'][i] for i,row in enumerate(rows))
max_delta = max(abs(row[j+1]-ref['signals'][name][i]['re']) for i,row in enumerate(rows) for j,name in enumerate(names))
assert max_delta == 0, max_delta
fields = ['qgs','qgd','qgb','qbs','qbd','cqgs','cqgd','cqgb','cqbs','cqbd','vgs','vds','vbs','capgs','capgd','capgb']
loads, steps, lte = [], [], []
for line in (root/'native-build/trace.log').read_text().splitlines():
    tokens = line.split()
    if not tokens:
        continue
    if tokens[0] == 'MOS2TRACE':
        loads.append(dict(time=float(tokens[1]), device=tokens[2], mode=int(tokens[3]), **dict(zip(fields,map(float,tokens[4:])))))
    if tokens[0] == 'STEPTRACE':
        steps.append(dict(time=float(tokens[1]),dt=float(tokens[2]),order=int(tokens[3]),iterations=int(tokens[4]),converged=int(tokens[5])==0))
    if tokens[0] == 'LTETRACE':
        lte.append(dict(time=float(tokens[1]),order=int(tokens[2]),bound=float(tokens[3])))
(root/'native-trace.json.gz').write_bytes(gzip.compress((json.dumps(dict(loads=loads,steps=steps,lte=lte))+'\n').encode(),mtime=0))
ts = json.loads(gzip.decompress((root/'ts-trace.json.gz').read_bytes()))
accepted = [min(steps, key=lambda s: abs(s['time']-t)) for t in ref['grid'][1:]]
assert all(abs(s['time']-t) < 1e-21 for s,t in zip(accepted,ref['grid'][1:]))
first_grid = next(i for i,(a,b) in enumerate(zip(accepted,ts['steps'])) if abs(a['time']-b['time'])>1e-18)
first_iterations = next(i for i,(a,b) in enumerate(zip(accepted,ts['steps'])) if a['iterations']!=b['iterations'])
windows = {}
for label,index in [('firstGridDifferenceOver1as',first_grid),('firstIterationCountDifference',first_iterations),('firstRisingEdge',32)]:
    windows[label] = []
    for i in range(max(0,index-2),index+3):
        n = accepted[i]
        t = ts['steps'][i]
        windows[label].append(dict(index=i,native=n,spiceTs=t,
            nativeLastLoad=next(r for r in reversed(loads) if r['time']==n['time']),
            spiceTsAccepted=ts['charges'][i+1]))
report = dict(nativeWaveformVerification=dict(points=len(rows),signals=names,maxAbsDelta=max_delta,maxTimeDelta=0),
    nativeAcceptedOrders=sorted(set(s['order'] for s in accepted)),windows=windows)
(root/'state-localization.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
