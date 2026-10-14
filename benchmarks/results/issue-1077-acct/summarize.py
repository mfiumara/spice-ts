"""Regenerate summary and validate raw receipts; no simulator execution."""
import collections
import gzip
import hashlib
import json
from pathlib import Path
import re
import statistics

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[2]

def load(name):
    return json.loads((OUT / name).read_text())

def distribution(values):
    values = sorted(values)
    q = statistics.quantiles(values, n=4, method='inclusive')
    return dict(n=len(values), medianMs=statistics.median(values), q1Ms=q[0], q3Ms=q[2], iqrMs=q[2]-q[0], samplesMs=values)

def summarize():
    host = load('host.json')
    walls = load('wall.json')
    assert len(walls) == 20
    result: dict = dict(decision='evidence-only; no candidate, no before/after speedup or regression gate claimed', fixtures={})
    for key, provenance in host['inputs'].items():
        original = (ROOT / provenance['path']).read_bytes()
        acct = (OUT / (key + '-acct.cir')).read_bytes()
        assert hashlib.sha256(original).hexdigest() == provenance['originalSha256']
        assert original.replace(b'noacct', b'acct') == acct
        assert hashlib.sha256(acct).hexdigest() == provenance['accountingSha256']
        cold = [load(f'{key}-js-cold-{i}.json')[0] for i in range(5)]
        instrumented = [load(f'{key}-diagnostic-instrumented-{i}.json')[0] for i in range(5)]
        controls = [load(f'{key}-diagnostic-cold-{i}.json')[0] for i in range(5)]
        diagnostics = [load(f'{key}-{mode}.json')[0] for mode in ['cold', 'profile']] + instrumented + controls
        warm = load(f'{key}-warm.json')
        assert len(warm) == 6
        reference = cold[0]
        for row in cold + diagnostics + warm:
            assert row['convergence'] == reference['convergence']
            assert row['waveforms'] == reference['waveforms']
            assert row['points'] == 2429
        for row in diagnostics + warm:
            assert row['inputSha256'] == provenance['accountingSha256']
        for row in cold:
            assert row['inputSha256'] == provenance['originalSha256']
        log = gzip.open(OUT / (key + '-acct.log.gz'), 'rt').read()
        def number(label):
            m = re.search(r'^' + re.escape(label) + r'\s*=\s*([\d.Ee+-]+)', log, re.M)
            assert m, label
            return float(m[1])
        native = {label: number(label) for label in ['Accepted timepoints', 'Rejected timepoints', 'Transient timepoints',
            'Transient iterations', 'Total iterations', 'Transient analysis time', 'Transient load time',
            'Transient factor time', 'Transient solve time', 'Transient trunc time']}
        native_warm = load(key + '-native-warm.json')
        assert [r['run'] for r in native_warm] == list(range(6))
        previous = {label: 0 for label in ['Accepted timepoints', 'Rejected timepoints', 'Transient iterations']}
        for i in range(6):
            warm_log = gzip.open(OUT / f'{key}-native-warm-{i}.log.gz', 'rt').read()
            for label in previous:
                match = re.search(r'^' + label + r'\s*=\s*([\d.Ee+-]+)', warm_log, re.M)
                assert match, label
                value = int(match[1])
                assert value - previous[label] == native[label]
                previous[label] = value
        t = reference['convergence']['transient']
        assert native['Accepted timepoints'] == t['acceptedSteps'] + 1
        assert native['Rejected timepoints'] == t['rejectedSteps']
        inst = sorted(instrumented, key=lambda row: row['inclusiveMs']['transient'])[2]
        inc = inst['inclusiveMs']
        calls = inst['calls']
        assert calls['attempt'] == t['acceptedSteps'] + t['rejectedSteps']
        for bucket in ['factor', 'solve', 'loadStamp', 'deviceStaticDynamic', 'deviceCharge']:
            assert calls[bucket] == t['newtonIterations']
        # Mutually exclusive scopes. Restamp occurs once during constructor setup,
        # so use whole transient, not advance, to avoid a nested-scope mismatch.
        exclusive = dict(deviceStaticDynamic=inc['deviceStaticDynamic'], deviceCharge=inc['deviceCharge'],
            companionAssembly=inc['loadStamp']-inc['deviceStaticDynamic']-inc['deviceCharge'],
            factor=inc['factor'], solve=inc['solve'],
            newtonControl=inc['attempt']-inc['loadStamp']-inc['factor']-inc['solve'],
            historyRestamp=inc['historyRestamp'], output=inc['output'])
        exclusive['stepControlSetupResidual'] = inc['transient'] - sum(exclusive.values())
        assert all(x >= 0 for x in exclusive.values()), exclusive
        assert abs(sum(exclusive.values())-inc['transient']) < 1e-6
        prof = json.loads(gzip.open(OUT / (key + '-profile.json.cpuprofile.gz'), 'rt').read())
        nodes = {n['id']: n['callFrame'] for n in prof['nodes']}
        frames = collections.Counter()
        for sample, delta in zip(prof['samples'], prof['timeDeltas']):
            frame = nodes[sample]
            frames[(frame['functionName'], frame['lineNumber']+1, frame['columnNumber']+1)] += delta
        total = sum(frames.values())
        top = [dict(function=f[0], line=f[1], column=f[2], selfPercent=100*us/total) for f, us in frames.most_common(20)]
        groups = {}
        for engine in ['js', 'native']:
            rows = [r for r in walls if r['fixture'] == key and r['engine'] == engine]
            assert sorted(r['run'] for r in rows) == list(range(5))
            groups[engine] = distribution([r['wallMs'] for r in rows])
        result['fixtures'][key] = dict(coldWall=groups, warmJsApi=distribution([r['apiMs'] for r in warm[1:]]),
            warmNativeMarkerWall=distribution([r['wallMs'] for r in native_warm[1:]]),
            coldJsApi=distribution([r['apiMs'] for r in cold]),
            nativeAccounting=native, jsCounters=reference['convergence'],
            diagnosticApi=distribution([r['apiMs'] for r in instrumented]),
            diagnosticControlApi=distribution([r['apiMs'] for r in controls]),
            diagnosticRepresentativeRun=inst['run'],
            diagnosticRepresentativeFile=next(f'{key}-diagnostic-instrumented-{i}.json' for i, row in enumerate(instrumented) if row is inst),
            diagnosticApiMs=inst['apiMs'], uninstrumentedAccountingApiMs=diagnostics[0]['apiMs'],
            diagnosticTransientMs=inc['transient'], exclusiveDiagnosticMs=exclusive,
            exclusivePercent={k: 100*v/inc['transient'] for k, v in exclusive.items()}, profileTop=top,
            coldRatio=groups['js']['medianMs']/groups['native']['medianMs'])
    return result

if __name__ == '__main__':
    result = summarize()
    (OUT / 'summary.json').write_text(json.dumps(result, indent=2) + '\n')
    for key, row in result['fixtures'].items():
        print(key, json.dumps({k: row[k] for k in ['coldWall', 'warmJsApi', 'exclusiveDiagnosticMs', 'exclusivePercent', 'coldRatio']}))
    print('Validated 20 cold walls, shared bytes, exact waveforms/counters, and disjoint diagnostic buckets.')
