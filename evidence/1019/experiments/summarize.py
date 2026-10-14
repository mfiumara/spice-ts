"""Deterministic receipt reduction. No solver or scoring changes.
First-grid diagnostic resolution is 1 as; first state voltage diagnostic is 1 nV.
"""
import bisect
import gzip
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent

def load(name):
    return json.loads((ROOT/name).read_text())

def zipped(name):
    return json.loads(gzip.decompress((ROOT/name).read_bytes()))

def series(wave, engine):
    return wave[engine]['analyses'][0]['series']

def first_grid(actual, native):
    return next((dict(index=i, spiceTs=a, native=b, deltaSeconds=a-b)
                 for i, (a, b) in enumerate(zip(actual['grid'], native['grid']))
                 if abs(a-b) > 1e-18), None)

def localization(actual, native, name='i(vnin)'):
    reference = [s['re'] for s in native['signals'][name]]
    peak = max(map(abs, reference))
    shared = set(actual['grid']) & set(native['grid'])
    errors = []
    for t, sample in zip(actual['grid'], actual['signals'][name]):
        j = max(1, min(len(reference)-1, bisect.bisect_left(native['grid'], t)))
        f = (t-native['grid'][j-1])/(native['grid'][j]-native['grid'][j-1])
        expected = reference[j-1]+f*(reference[j]-reference[j-1])
        error = abs(sample['re']-expected)
        if t not in native['grid'] and native['grid'][j-1] in shared:
            right = reference[j] if j+1 == len(reference) else reference[j]+(t-native['grid'][j])/(native['grid'][j+1]-native['grid'][j])*(reference[j+1]-reference[j])
            error = min(error, abs(sample['re']-right))
        errors.append(error)
    worst = max(range(len(errors)), key=errors.__getitem__)
    first = next((i for i, e in enumerate(errors) if e > 0.01*peak), None)
    early = [(t, e) for t, e in zip(actual['grid'], errors) if 15.2e-9 < t < 15.3e-9]
    return dict(peak=peak, maxAbs=errors[worst], normalized=errors[worst]/peak,
                worstTime=actual['grid'][worst], firstOnePercent=None if first is None else
                dict(index=first, time=actual['grid'][first], error=errors[first]),
                early15_2nsMaxAbs=max(e for t, e in early))

def guards(waves, rows):
    mosamp = series(waves['mosamp2'], 'spiceTs')
    amp_error = abs(mosamp['signals']['v(5)'][-1]['re']-9.46397521)
    result: dict[str, Any] = dict(mosamp2=dict(maxAbsAtStop=amp_error, bound=5e-6, passed=amp_error <= 5e-6, points=len(mosamp['grid'])))
    for id in ['k-10', 'k-15']:
        # Keep the exact historical linear guard convention from evidence/1002/run.ts.
        a, n = series(waves[id], 'spiceTs'), series(waves[id], 'ngspice')
        values = {}
        for name, samples in n['signals'].items():
            ref = [s['re'] for s in samples]
            peak = max(max(map(abs, ref)), 1e-4 if name.startswith('v(') else 1e-10)
            error, cursor = 0, 1
            for t, value in zip(a['grid'], a['signals'][name]):
                if t < n['grid'][0] or t > n['grid'][-1]:
                    continue
                while cursor < len(ref)-1 and n['grid'][cursor] < t:
                    cursor += 1
                f = (t-n['grid'][cursor-1])/(n['grid'][cursor]-n['grid'][cursor-1])
                expected = ref[cursor-1]+f*(ref[cursor]-ref[cursor-1])
                error = max(error, abs(value['re']-expected))
            values[name] = error/peak
        result[id] = dict(normalized=max(values.values()), signals=values, points=len(a['grid']), sharedScorer=rows[id]['worstNormalizedError'])
    result['maxordRC'] = {id: dict(outcome=row['outcome'], normalized=row['worstNormalizedError'], points=row['spiceTs']['analyses'])
                          for id, row in rows.items() if id.startswith('rc-')}
    return result

def native_records(variant):
    log = gzip.decompress((ROOT/f'{variant}-k-13.log.gz').read_bytes()).decode()
    records = {}
    for line in log.splitlines():
        parts = line.split()
        if parts and parts[0].endswith('TRACE'):
            records.setdefault(parts[0], []).append(parts[1:])
    return records

def state_first(traces, native, grid):
    fields = ['qgs', 'qgd', 'qgb', 'qbs', 'qbd', 'cqgs', 'cqgd', 'cqgb', 'cqbs', 'cqbd', 'vgs', 'vds', 'vbs', 'capgs', 'capgd', 'capgb']
    loads = {float(r[0]): dict(zip(fields, map(float, r[3:]))) for r in native['MOS2TRACE']}
    accepted = {r['time']: r for r in traces if r['event'] == 'accepted'}
    for t in grid:
        if t == 0 or t not in loads or t not in accepted:
            continue
        a, n = accepted[t], loads[t]
        if abs(a['voltage'][0]-n['vgs']) > 1e-9:
            return dict(time=t, spiceTsVgs=a['voltage'][0], nativeVgs=n['vgs'], deltaVgs=a['voltage'][0]-n['vgs'],
                        spiceTsQgb=a['charge'][2], nativeQgb=n['qgb'], deltaQgb=a['charge'][2]-n['qgb'])
    return None

def build_summary():
    summary = {}
    base_waves = zipped('baseline-waveforms.json.gz')
    old = json.loads(gzip.decompress((ROOT.parent/'waveforms.json.gz').read_bytes()))
    for engine in ['ngspice', 'spiceTs']:
        assert series(base_waves['k-13'], engine) == old[engine]['analyses'][0]['series'], engine
    for v in ['baseline', 'e1', 'e2', 'e2-first', 'e3', 'e4']:
        report, waves = load(f'{v}.json'), zipped(f'{v}-waveforms.json.gz')
        a, n = series(waves['k-13'], 'spiceTs'), series(waves['k-13'], 'ngspice')
        source_variant = 'baseline' if v == 'e4' else v
        traces = zipped(f'{source_variant}-ts-trace.json.gz')['k-13']
        records = native_records('e1' if v == 'e1' else 'baseline')
        result = dict(command=report['command'], pump=dict(error=report['rows']['k-13']['worstNormalizedError'],
            points=dict(spiceTs=len(a['grid']), native=len(n['grid'])), firstGridDifferenceOver1as=first_grid(a, n),
            firstAcceptedVgsDifferenceOver1nV=state_first(traces, records, a['grid']), **localization(a, n)),
            guards=guards(waves, report['rows']))
        summary[v] = result
    e1 = summary['e1']
    e1.update(conclusion='does not attribute', exactChange='MOS2 bypass condition additionally requires MOS2_NO_BYPASS environment variable absent; e1 sets it to 1.',
              nativeConfiguredBypass=sorted({int(r[1]) for r in native_records('baseline')['CONFIGTRACE']}),
              forcedOffFlags=sorted({int(r[2]) for r in native_records('e1')['CONFIGTRACE']}),
              nativeWaveformExactlyUnchanged=all(series(base_waves[id], 'ngspice') == series(zipped('e1-waveforms.json.gz')[id], 'ngspice') for id in base_waves),
              tsEquivalentSkip='none in MOS2 stamp/stampTransientCharge or nonlinear transient solve; no TS skip to disable',
              nativeBypassHits={v: len(native_records(v).get('BYPASSTRACE', [])) for v in ['baseline', 'e1']})
    e2 = summary['e2']
    records = native_records('baseline')
    convs = [dict(time=float(r[0]), device=r[1], cdhat=float(r[2]), cd=float(r[3]), cbhat=float(r[4]), cb=float(r[5]),
                  drainTolerance=float(r[6]), bulkTolerance=float(r[7]), passed=abs(float(r[2])-float(r[3])) < float(r[6]) and abs(float(r[4])-float(r[5])) <= float(r[7])) for r in records['CONVTRACE']]
    raw, limited = records['RAWTRACE'], records['LIMITTRACE']
    assert len(raw) == len(limited)
    deltas: list[dict[str, Any]] = [dict(time=float(r[0]), raw=list(map(float, r[3:])), loaded=list(map(float, l[3:])), check=int(l[2])) for r, l in zip(raw, limited)]
    e2.update(conclusion='does not attribute', exactChange='Enable existing DC previous-load fetlim/limvds vector path during transient too. No pnjlim, node damping, tolerance, or convergence formula changes.',
              limitingComparison=dict(windowSeconds=[5e-9, 5.03e-9], nativeRawVsLoaded=deltas,
                  nativeMaxGateDelta=max(abs(r['raw'][0]-r['loaded'][0]) for r in deltas),
                  nativeMaxDrainDelta=max(abs(r['raw'][1]-r['loaded'][1]) for r in deltas),
                  nativeMaxBulkDelta=max(abs(r['raw'][2]-r['loaded'][2]) for r in deltas)),
              nativeNewtonIterations=records['NIITERTRACE'], nativeConvergenceTests=convs,
              tsConvergenceTests=[r for r in zipped('baseline-ts-trace.json.gz')['k-13'] if r['event'] == 'convergence'],
              formulaComparison='Same cdhat/cbhat, drain >= fails, bulk > fails, RELTOL*max+ABSTOL. Native skips NIconvTest on first iterate/noncon load; both short-circuit device tests after voltage convergence. The independent e2-first variant aligns the native first-iterate rule without changing limiting.',
              candidateGuardImpact='rejected: mosamp2 exceeds unchanged 5 uV bound; pump worse; ring increases; RC unchanged')
    summary['e2-first'].update(conclusion='does not attribute',
        exactChange='Require iter !== 0 before the transient convergence condition, matching native NIiter first-iterate noncon. No limiting or tolerance changes.',
        candidateGuardImpact='first-iterate gate tested independently; use measured guard numbers, not a blanket parity assumption')
    e2['independentFirstIterationExperiment'] = summary['e2-first']
    e3 = summary['e3']
    e3.update(conclusion='does not attribute', exactChange='Charge evaluation and branch voltage read lastLoad limited terminals instead of raw ctx; preserve predictor-charge logic, capacitance averaging, integration and acceptance.',
              scopeLimit='Tests raw-vs-loaded voltages only, not reusing static channel von/vdsat instead of reevaluating channel, or native arithmetic grouping.',
              nativeChargeVoltages='mos2load.c next2 stores loaded voltages; DEVqmeyer and gate increments read those loaded voltages.',
              candidateGuardImpact='mosamp2 passes; k-10/k-15/RC unchanged at published precision; pump residual remains')
    e4 = summary['e4']
    e4.update(conclusion='partially attributes', exactChange=load('e4.json')['change'], diagnosticOnly=True,
              interpretation='Relabel one retained TS grid corner to the native exact representation, no sample/trajectory change. Tests exact-breakpoint reconstruction sensitivity only, not scheduler or PWL evaluation. Full 45 ns loss remains.')
    return summary

def main():
    summary = build_summary()
    for v in ['e1', 'e2', 'e3', 'e4']:
        (ROOT/f'{v}-receipt.json').write_text(json.dumps(summary[v], indent=2)+'\n')
    (ROOT/'summary.json').write_text(json.dumps(summary, indent=2)+'\n')
    for v, r in summary.items():
        print(v, json.dumps(dict(pump=r['pump'], mosamp2=r['guards']['mosamp2'], k10=r['guards']['k-10']['normalized'], k15=r['guards']['k-15']['normalized'])))

if __name__ == '__main__':
    main()
