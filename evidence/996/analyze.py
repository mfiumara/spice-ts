"""Offline localization, linear interpolation on spice-ts grid; no benchmark edits."""
import bisect
import gzip
import json
from pathlib import Path

ROOT = Path('evidence/996')

def analysis(run, kind):
    return next(a['series'] for a in run['analyses'] if a['type'] == kind)

def values(series, name):
    return [v['re'] for v in series['signals'][name]]

def interp(x, y, at):
    i = min(max(bisect.bisect_right(x, at), 1), len(x)-1)
    if x[i] == x[i-1]:
        return y[i]
    return y[i-1] + (y[i]-y[i-1])*(at-x[i-1])/(x[i]-x[i-1])

def compare(ts, ng):
    rows = []
    for name in sorted(set(ts['signals']) & set(ng['signals'])):
        tv, nv = values(ts, name), values(ng, name)
        peak = max(max(map(abs, nv)), 1e-4 if name.startswith('v(') else 1e-10)
        diffs = [(t, a, interp(ng['grid'], nv, t)) for t, a in zip(ts['grid'], tv) if ng['grid'][0] <= t <= ng['grid'][-1]] if len(ng['grid']) > 1 else [(0, tv[0], nv[0])]
        worst = max(diffs, key=lambda r: abs(r[1]-r[2]))
        first = next((r for r in diffs if abs(r[1]-r[2]) > .01*peak), None)
        rows.append(dict(node=name, peak=peak, maxAbs=abs(worst[1]-worst[2]), normalized=abs(worst[1]-worst[2])/peak, worstTime=worst[0], initial=dict(t=diffs[0][0], spiceTs=diffs[0][1], ngspice=diffs[0][2], magnitude=abs(diffs[0][1]-diffs[0][2])), first=None if first is None else dict(t=first[0], spiceTs=first[1], ngspice=first[2], magnitude=abs(first[1]-first[2]))))
    return dict(worst=max(rows, key=lambda r: r['normalized']), first=min((dict(node=r['node'], **r['first']) for r in rows if r['first']), key=lambda r: (r['t'], r['node']), default=None), signals=rows)

def crossings(s, name):
    x, y = s['grid'], values(s, name)
    edges = [a+(b-a)*(1.5-u)/(v-u) for a,b,u,v in zip(x,x[1:],y,y[1:]) if u < 1.5 <= v and a > 20e-9]
    periods = [b-a for a,b in zip(edges, edges[1:])]
    return dict(edges=edges, periods=periods, meanPeriod=sum(periods)/len(periods) if periods else None)

if __name__ == '__main__':
    result = {}
    for path in sorted((ROOT/'runs').glob('*.json.gz')):
        run = json.loads(gzip.decompress(path.read_bytes()))
        key = path.name.removesuffix('.json.gz')
        if run['spiceTs']['status'] != 'success' or run['ngspice']['status'] != 'success':
            result[key] = dict(status='not-compared', spiceTs=run['spiceTs'], ngspice=run['ngspice'])
            continue
        kind = 'op' if run['variant'].endswith('op') else 'tran'
        ts, ng = analysis(run['spiceTs'], kind), analysis(run['ngspice']['execution'], kind)
        row = compare(ts, ng)
        row['points'] = dict(spiceTs=len(ts['grid']), ngspice=len(ng['grid']))
        if run['id'] == 'k-15' and kind == 'tran':
            row['crossingNode'] = 'v(6)' if 'v(6)' in ts['signals'] else 'v(2)'
            row['crossings'] = {engine: crossings(series, row['crossingNode']) for engine, series in [('spiceTs',ts),('ngspice',ng)]}
            if run['variant'] == 'original':
                a, b = row['crossings']['spiceTs'], row['crossings']['ngspice']
                offsets = [y-x for x,y in zip(a['edges'],b['edges'])]
                shift = sum(offsets)/len(offsets)
                tv, nv = values(ts,'v(6)'), values(ng,'v(6)')
                row['phaseDiagnostic'] = dict(offsets=offsets, meanShift=shift,
                    window=[20e-9,99e-9],
                    maxAbsRaw=max(abs(v-interp(ng['grid'],nv,t)) for t,v in zip(ts['grid'],tv) if 20e-9<t<99e-9),
                    maxAbsShifted=max(abs(v-interp(ng['grid'],nv,t+shift)) for t,v in zip(ts['grid'],tv) if 20e-9<t<99e-9),
                    periodRelativeDifference=(a['meanPeriod']-b['meanPeriod'])/b['meanPeriod'])
        result[key] = row
    (ROOT/'summary.json').write_text(json.dumps(result, indent=2)+'\n')
    for name, row in result.items():
        if row.get('status') == 'not-compared':
            print(name, row['status'], row['spiceTs'].get('error'), row['ngspice'].get('firstErrorLine'))
            continue
        print(name, 'points',row['points'], 'first', row['first'], 'worst',row['worst']['node'],row['worst']['normalized'])
        if 'crossings' in row:
            print('periods', {k:v['meanPeriod'] for k,v in row['crossings'].items()})
