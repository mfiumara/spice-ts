"""Offline validation of all cold samples and sampled CPU self frames."""
import gzip
import hashlib
import json
from pathlib import Path
import statistics
from collections import defaultdict
from typing import Any

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]

def read(path):
    if path.exists():
        return json.loads(path.read_text())
    return json.loads(gzip.decompress(Path(str(path) + '.gz').read_bytes()))

def profile(path):
    data = read(path)
    nodes = {node['id']: node['callFrame'] for node in data['nodes']}
    totals = defaultdict(int)
    for sample, delta in zip(data['samples'], data['timeDeltas']):
        frame = nodes[sample]
        totals[(frame['functionName'], frame['url'], frame['lineNumber'], frame['columnNumber'])] += delta
    total = sum(totals.values())
    return [dict(function=name, url=url, line=line + 1, column=column + 1,
                 selfPercent=100 * duration / total)
            for (name, url, line, column), duration in sorted(totals.items(), key=lambda item: -item[1])[:12]]

summary: dict[str, Any] = {'fixtures': {}, 'profiles': {}}
for phase in ['before', 'after']:
    host = read(HERE / phase / 'host.json')
    rows = read(HERE / phase / 'wall.json')
    assert len(rows) == 20
    assert 'ngspice-47' in host['ngspice']
    for key, fixture in [('ngspice', 'ngspice/fixtures/tests/general/mosamp.cir'),
                         ('classic', 'classic/fixtures/spice3f5/mosamp2.cir')]:
        assert host['inputs'][key] == hashlib.sha256((ROOT / 'benchmarks/corpus' / fixture).read_bytes()).hexdigest()
        entry = summary['fixtures'].setdefault(key, {})
        for engine in ['spice-ts', 'ngspice']:
            group = [row for row in rows if row['fixture'] == key and row['engine'] == engine]
            assert sorted(row['run'] for row in group) == list(range(5))
            assert all(row['exitCode'] == 0 for row in group)
            entry[f'{phase}-{engine}'] = dict(medianMs=statistics.median(row['wallMs'] for row in group),
                                              samplesMs=[row['wallMs'] for row in group])
        results = [read(HERE / phase / f'{key}-spice-ts-{run}.json') for run in range(5)]
        assert all(result['inputSha256'] == host['inputs'][key] for result in results)
        assert all(result['waveformSha256'] == results[0]['waveformSha256'] and
                   result['telemetry'] == results[0]['telemetry'] for result in results)
        assert results[0]['points'] == 2429
        entry[phase + '-waveformSha256'] = results[0]['waveformSha256']
        entry[phase + '-telemetry'] = results[0]['telemetry']
        summary['profiles'][phase + '-' + key] = profile(HERE / phase / (key + '-profile.json.cpuprofile'))
for key, entry in summary['fixtures'].items():
    assert entry['before-waveformSha256'] == entry['after-waveformSha256']
    assert entry['before-telemetry'] == entry['after-telemetry']
    entry['reductionPercent'] = 100 * (1 - entry['after-spice-ts']['medianMs'] / entry['before-spice-ts']['medianMs'])
    entry['remainingNativeRatio'] = entry['after-spice-ts']['medianMs'] / entry['after-ngspice']['medianMs']
summary['passes15PercentGate'] = all(entry['reductionPercent'] >= 15 for entry in summary['fixtures'].values())
(HERE / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps(summary, indent=2))
