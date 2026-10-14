"""Verify and summarize actual run receipts. Works before/after gzip compaction."""
from collections import Counter
import gzip
import hashlib
import json
from pathlib import Path
import re
from statistics import median

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[2]
FIXTURES = {'ngspice': 'benchmarks/corpus/ngspice/fixtures/tests/general/mosamp.cir',
            'classic': 'benchmarks/corpus/classic/fixtures/spice3f5/mosamp2.cir'}

def text(name):
    path = OUT / name
    return path.read_text() if path.exists() else gzip.decompress(Path(str(path) + '.gz').read_bytes()).decode()

def data(name):
    return json.loads(text(name))

def acct(name):
    source = text(name)
    fields = ['Transient iterations', 'Accepted timepoints', 'Rejected timepoints',
              'Transient timepoints', 'Transient analysis time', 'Transient load time',
              'Transient factor time', 'Transient solve time', 'Transient trunc time']
    result = {}
    for field in fields:
        match = re.search(re.escape(field) + r'(?: \(seconds\))? = ([\d.Ee+-]+)', source)
        assert match, (name, field)
        result[field] = float(match[1])
    return result

wall = data('wall.json')
assert len(wall) == 32
summary = {}
for key in ['ngspice', 'classic']:
    cold = data(f'{key}-spice-ts-cold-0.json')[0]
    assert hashlib.sha256((ROOT / FIXTURES[key]).read_bytes()).hexdigest() == cold['inputSha256']
    telemetry = cold['telemetry']['transient']
    for run in range(5):
        row = data(f'{key}-spice-ts-cold-{run}.json')[0]
        assert row['inputSha256'] == cold['inputSha256']
        assert row['telemetry'] == cold['telemetry']
        assert row['points'] == 2429
    warm = data(f'{key}-spice-ts-warm.json')[1:]
    assert len(warm) == 5
    assert all(row['telemetry'] == cold['telemetry'] for row in warm)
    native = acct(f'{key}-acct.log')
    assert native['Accepted timepoints'] == cold['points']
    assert native['Rejected timepoints'] == telemetry['rejectedSteps']
    # ngspice rusage counters accumulate across repeated run commands.
    previous = acct(f'{key}-ngspice-warm-0.log')
    for run in range(1, 6):
        current = acct(f'{key}-ngspice-warm-{run}.log')
        assert current['Transient iterations'] - previous['Transient iterations'] == native['Transient iterations']
        assert current['Accepted timepoints'] - previous['Accepted timepoints'] == native['Accepted timepoints']
        previous = current
    profile = data(key + '-profile.json.cpuprofile')
    nodes = {node['id']: node['callFrame'] for node in profile['nodes']}
    frames = Counter()
    for node, delta in zip(profile['samples'], profile['timeDeltas']):
        frame = nodes[node]
        label = (frame['functionName'], frame['lineNumber'], frame['columnNumber'])
        frames[label] += delta
    total = sum(frames.values())
    modes = {}
    for engine in ['spice-ts', 'ngspice']:
        rows = [row for row in wall if row['fixture'] == key and row['engine'] == engine and row['mode'] == 'cold-process']
        assert len(rows) == 5
        modes[engine + 'ColdProcessMs'] = median(row['wallMs'] for row in rows)
    native_warm = [row['wallMs'] for row in wall if row['fixture'] == key and row['engine'] == 'ngspice' and row['mode'] == 'warm-control-run' and row['run'] > 0]
    assert len(native_warm) == 5 and min(native_warm) > 100
    modes['spiceTsWarmApiMs'] = median(row['wallMs'] for row in warm)
    modes['ngspiceWarmControlMs'] = median(native_warm)
    modes['spiceTsColdApiMs'] = median(data(f'{key}-spice-ts-cold-{run}.json')[0]['wallMs'] for run in range(5))
    modes['spiceTsColdParseMs'] = median(data(f'{key}-spice-ts-cold-{run}.json')[0]['parseMs'] for run in range(5))
    modes['spiceTsWarmParseMs'] = median(row['parseMs'] for row in warm)
    split_rows = data(key + '-split.json')[2:]
    assert len(split_rows) == 5
    assert all(row['telemetry'] == cold['telemetry'] for row in split_rows)
    split = {field: median(row[field] for row in split_rows)
             for field in ['parseMs', 'compileDcSetupMs', 'transientWithStepMapsMs']}
    summary[key] = dict(inputSha256=cold['inputSha256'], medians=modes,
        spiceTsTelemetry=cold['telemetry'], nativeAccounting=native,
        warmWallRatio=modes['spiceTsWarmApiMs']/modes['ngspiceWarmControlMs'],
        coldWallRatio=modes['spice-tsColdProcessMs']/modes['ngspiceColdProcessMs'],
        spiceTsWarmWallUsPerTransientNr=modes['spiceTsWarmApiMs']*1000/telemetry['newtonIterations'],
        ngspiceAcctTransientCpuUsPerNr=native['Transient analysis time']*1e6/native['Transient iterations'],
        setupDiagnostic=split,
        topSelfFrames=[dict(function=k[0], bundledLineZeroBased=k[1], bundledColumn=k[2], microseconds=v, percent=100*v/total) for k,v in frames.most_common(15)])
(OUT / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps(summary, indent=2))
