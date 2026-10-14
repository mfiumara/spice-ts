#!/usr/bin/env python3
"""Validate receipts and render every signal, including native zeros and losses."""
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
r = json.loads((HERE / 'after.json').read_text())
assert len(r['fixtures']) == 4
assert [x['after'] for x in r['fixtures']] == ['compared', 'unsupported', 'unsupported', 'unsupported']
lines = ['# BSIM4 static slice measured errors', '',
         'Generated from after.json. Max-abs/RMS units are V for voltage/scale vectors and A for branch currents; grid Id is A and conductances are S.', '',
         'Shared relative denominator max(abs(native), 1e-18). Large relative errors near native zero are retained, not filtered. No fitted tolerances.', '',
         '## Bias grid (six supported cards, 648 points, 2592 comparisons)', '',
         '| Card | Signal | Points | Max abs | RMS abs | Max relative | RMS relative |',
         '| --- | --- | ---: | ---: | ---: | ---: | ---: |']
checks = 0
for case in r['grid']:
    if case['signals'] is None:
        lines.append(f"| {case['name']} | all quantities unsupported (4.3) | 0 | null | null | null | null |")
        continue
    for signal, m in case['signals'].items():
        assert m['samples'] == 108 and m['maxRelativeError'] < 1e-8
        checks += m['samples']
        lines.append(f"| {case['name']} | {signal} | {m['samples']} | {m['maxAbsError']:.9e} | {m['rmsError']:.9e} | {m['maxRelativeError']:.9e} | {m['rmsRelativeError']:.9e} |")
assert checks == 2592
lines += ['', '## Original corpus fixtures', '', '| Path | Before | After | Native exit / diagnostics |', '| --- | --- | --- | --- |']
for fixture in r['fixtures']:
    diagnostic = '; '.join(fixture['diagnostics']) or 'none'
    lines.append(f"| `{fixture['path']}` | {fixture['before']['errorCode']} | {fixture['after']} | {fixture['exitCode']} / {diagnostic} |")
    if fixture['after'] == 'unsupported':
        assert fixture['comparedSignals'] == 0 and fixture['maxAbsError'] is None and fixture['rmsError'] is None
        assert fixture['errorCode'] == 'UNSUPPORTED_MODEL_PARAMETER'
lines += ['', '## All six BSIM482 plots, every native solution vector', '',
          '1236 matched points. Each plot has 17 signals including its scale. No interpolation or plot reuse. Inner and outer coordinates are checked.', '']
analyses = r['fixtures'][0]['analyses']
assert len(analyses) == 6 and sum(a['points'] for a in analyses) == 1236
for index, a in enumerate(analyses, 1):
    assert len(a['signals']) == 17
    assert a['coordinates']['maxAbsError'] <= 1e-12
    lines += [f"### Plot {index}: `{a['command']}` ({a['points']} points)", '',
              '| Signal | Max abs | RMS abs | Max relative | RMS relative |', '| --- | ---: | ---: | ---: | ---: |']
    for signal, m in a['signals'].items():
        assert m['samples'] == a['points']
        assert all(math.isfinite(m[key]) for key in ['maxAbsError', 'rmsError', 'maxRelativeError', 'rmsRelativeError'])
        lines.append(f"| {signal} | {m['maxAbsError']:.9e} | {m['rmsError']:.9e} | {m['maxRelativeError']:.9e} | {m['rmsRelativeError']:.9e} |")
    lines.append('')
lines += ['## Unsupported losses', '',
          'Binning-1: all four native node voltages v(1)..v(4) have null max-abs/RMS because no spice-ts OP exists. Unbinned device-card parity is not bin-selection parity.', '',
          'Gain-stage: no spice-ts AC vectors exist. Every AC signal is unavailable, max-abs/RMS null, not zero. Native original completes without error diagnostics.', '',
          'G sensitivity transient: no spice-ts transient vectors exist. Every TRAN/sensitivity output is unavailable, max-abs/RMS null. Native original exits 0 but emits `Error: no function as { with that arity.`; exit status alone is not valid all-output parity.', '',
          'All three losses now have typed UnsupportedModelParameterError. Full model-bin selection, 4.3-family AC and transient charge remain outside this slice.', '']
(HERE / 'TABLES.md').write_text('\n'.join(lines))
print('PASS: four fixtures, six DC plots, 102 per-signal plot metrics, 1236 matched points; 648 bias points / 2592 quantity comparisons; three typed losses retain null metrics')
