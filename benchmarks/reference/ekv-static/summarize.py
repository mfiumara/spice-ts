#!/usr/bin/env python3
"""Offline evidence table, including every sweep and signal (no selection)."""
import gzip
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent
reports = [json.loads(gzip.decompress((ROOT / f'{phase}-identical.json.gz').read_bytes()))
           for phase in ('before', 'after')]
rows = []
lines = ['# EKV 2.6 static slice measured errors', '',
         'Reference: xyce-7.10. Relative errors are fractions, not percentages. '
         'Absolute units are A for current and V for voltage. '
         'The shared harness excludes reference magnitude <=1e-15; no denominator floor. '
         'All remaining near-zero relative losses are retained.', '',
         '| Fixture / sweep | Signal | Before max abs | Before RMS abs | Before max rel | Before RMS rel | After max abs | After RMS abs | After max rel | After RMS rel |',
         '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |']
fmt = lambda v: 'null' if v is None else f'{v:.9g}'
for before, after in zip(reports[0]['fixtures'], reports[1]['fixtures']):
    assert before['key'] == after['key']
    assert before['spiceTsInputSha256'] == before['xyceInputSha256'] == after['spiceTsInputSha256'] == after['xyceInputSha256']
    comparisons = [('all', before['spiceTsVsXyce'], after['spiceTsVsXyce'])]
    comparisons += [(str(i), b['spiceTsVsXyce'], a['spiceTsVsXyce'])
                    for i, (b, a) in enumerate(zip(before['perSweep'], after['perSweep']))]
    for sweep, b, a in comparisons:
        for signal in b['signals']:
            bm, am = b['signals'][signal], a['signals'][signal]
            rows.append({'fixture': before['key'], 'sweep': sweep, 'signal': signal,
                         'before': bm, 'after': am})
            values = [m[k][stat] for m in (bm, am) for k in ('absoluteError', 'relativeError') for stat in ('max', 'rms')]
            lines.append(f"| {before['key']} / {sweep} | {signal} | " + ' | '.join(map(fmt, values)) + ' |')
lines += ['', '## Corpus-g expected ngspice divergence', '',
          'ngspice-lacks-model (MOS1 fallback). Do not interpret this as an EKV parity failure against a real ngspice EKV implementation.', '',
          '| Signal | Before max abs | Before RMS abs | After max abs | After RMS abs | After max rel | After RMS rel |',
          '| --- | ---: | ---: | ---: | ---: | ---: | ---: |']
b, a = reports[0]['fixtures'][-1], reports[1]['fixtures'][-1]
for signal in a['spiceTsVsNgspice']['signals']:
    bm, am = b['spiceTsVsNgspice']['signals'][signal], a['spiceTsVsNgspice']['signals'][signal]
    values = [bm['absoluteError']['max'], bm['absoluteError']['rms'], am['absoluteError']['max'], am['absoluteError']['rms'], am['relativeError']['max'], am['relativeError']['rms']]
    lines.append(f'| {signal} | ' + ' | '.join(map(fmt, values)) + ' |')
(ROOT / 'metrics.md').write_text('\n'.join(lines) + '\n')
(ROOT / 'metrics.json').write_text(json.dumps(rows, indent=2) + '\n')
print(f'Verified {len(reports[1]["fixtures"])} fixture receipts and {len(rows)} per-signal/sweep rows; wrote metrics.md and metrics.json')
