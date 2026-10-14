"""Decode the native log and retain each accepted load, with TS brackets."""
import bisect
import gzip
import json
from pathlib import Path

ROOT = Path(__file__).parent
STATE_FIELDS = ['vbd', 'vbs', 'vgs', 'vds', 'capgs', 'qgs', 'cqgs',
                'capgd', 'qgd', 'cqgd', 'capgb', 'qgb', 'cqgb']


def decode(name):
    ts = json.loads(gzip.decompress((ROOT / f'{name}-ts.json.gz').read_bytes()))
    lines = gzip.decompress((ROOT / f'{name}-native.txt.gz').read_bytes()).decode().splitlines()
    loads = {}
    inputs = {}
    accepts = []
    trials = []
    rejects = []
    for line in lines:
        p = line.split()
        if not p:
            continue
        if p[0] == 'INPUT':
            key = (float(p[1]), p[2].removeprefix('m.'))
            inputs.setdefault(key, []).append(dict(mode=int(p[3]), xfact=float(p[4]), vgs=float(p[5]), vds=float(p[6]), vbs=float(p[7])))
        elif p[0] == 'LOAD':
            time, device = float(p[1]), p[2].removeprefix('m.')
            states = [dict(zip(STATE_FIELDS, map(float, p[12 + h * 13:25 + h * 13]))) for h in range(3)]
            loads.setdefault((time, device), []).append(dict(order=int(p[3]), mode=int(p[4]), dt=float(p[5]), xfact=float(p[6]),
                bypass=bool(int(p[7])), check=int(p[8]), effectiveCapacitance=list(map(float, p[9:12])), states=states))
        elif p[0] == 'TRIAL':
            trials.append(dict(time=float(p[1]), order=int(p[2]), dt=float(p[3]), nonconvergence=int(p[4])))
        elif p[0] == 'REJECT':
            rejects.append(dict(time=float(p[1]), dt=float(p[2]), newDt=float(p[3])))
        elif p[0] == 'ACCEPT':
            time = float(p[1])
            at = {device: dict(finalLoad=ls[-1], firstLoad=ls[0], iterations=len(ls),
                      firstInput=inputs.get((t, device), [None])[0], lastInput=inputs.get((t, device), [None])[-1])
                  for (t, device), ls in loads.items() if t == time}
            if at:
                accepts.append(dict(time=time, nextOrder=int(p[2]), dt=float(p[3]), nextDt=float(p[4]), devices=at))
    accepted_times = sorted({r['time'] for r in ts if r['kind'] == 'accept'})
    accepted = {(r['time'], r['name']): r for r in ts if r['kind'] == 'accept'}
    tsloads = {}
    for r in ts:
        if r['kind'] == 'load':
            tsloads.setdefault((r['time'], r['name']), []).append(r)
    # Every accepted TS step has its final charge stamp and committed charge history.
    tssteps = [dict(time=time, devices={device: dict(accepted=r, firstLoad=tsloads.get((t, device), [None])[0],
                        finalLoad=tsloads.get((t, device), [None])[-1], iterations=len(tsloads.get((t, device), [])))
                     for (t, device), r in accepted.items() if t == time}) for time in accepted_times]
    output = dict(name=name, stateFields=STATE_FIELDS, nativeAccepted=accepts, tsAccepted=tssteps,
                  nativeTrials=trials, nativeExplicitRejects=rejects,
                  nativeNonconvergence=[r for r in trials if r['nonconvergence']],
                  note='native nextOrder/nextDt are AFTER truncation, solved order/dt are in finalLoad; Check alone is not a limiter flag, especially on bypass')
    (ROOT / f'{name}-steps.json.gz').write_bytes(gzip.compress(json.dumps(output).encode()))
    all_loads = [r for ls in loads.values() for r in ls]
    limited = []
    for key, ls in loads.items():
        ins = inputs.get(key, [])
        for load, raw in zip(ls, ins):
            if load['bypass']:
                continue
            final = load['states'][0]
            if any(abs(raw[s] - final[s]) > 1e-12 for s in ['vgs', 'vds', 'vbs']):
                limited.append(dict(time=key[0], name=key[1], raw=raw, limited={s: final[s] for s in ['vgs', 'vds', 'vbs']}))
    divergences = json.loads((ROOT / 'divergences.json').read_text())
    first = next(r['firstMaterial'] for r in divergences if r['name'] == name)
    ti = bisect.bisect_left(accepted_times, first['time'])
    nearest_ts = tssteps[min(ti, len(tssteps) - 1)]
    native_times = [r['time'] for r in accepts]
    ni = bisect.bisect_left(native_times, first['time'])
    native_bracket = accepts[max(0, ni - 1):min(len(accepts), ni + 1)]
    selected = ['mp1', 'mn1', 'mp2', 'mn2'] if name == 'pair' else ['mp1', 'mn1'] if name == 'gm19' else ['m$578', 'm$568', 'm$562']
    focus = dict(name=name, firstMaterial=first, nativeWindowSteps=len(accepts), tsWindowSteps=len(tssteps),
                 nativeLoads=len(all_loads), nativeBypasses=sum(r['bypass'] for r in all_loads), nativeLimitedIterations=len(limited),
                 nativeLimiterExamples=limited[:5],
                 tsAtOrAfter=dict(time=nearest_ts['time'], devices={d: nearest_ts['devices'][d] for d in selected if d in nearest_ts['devices']}),
                 nativeBracket=[dict(time=r['time'], dt=r['dt'], nextDt=r['nextDt'], devices={d: r['devices'][d] for d in selected if d in r['devices']}) for r in native_bracket])
    (ROOT / f'{name}-focus.json').write_text(json.dumps(focus, indent=2) + '\n')
    print(json.dumps({k: v for k, v in focus.items() if k not in ['tsAtOrAfter', 'nativeBracket', 'nativeLimiterExamples']}))


for name in ['pair', 'gm19', 'arom']:
    decode(name)
