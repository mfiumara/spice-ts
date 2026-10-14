"""First >1% native-peak waveform divergence on either accepted grid."""
import bisect
import gzip
import json
from pathlib import Path

ROOT = Path(__file__).parent


def interpolate(grid, values, time):
    i = max(1, min(len(grid) - 1, bisect.bisect_right(grid, time)))
    f = (time - grid[i - 1]) / (grid[i] - grid[i - 1])
    return values[i - 1]['re'] + f * (values[i]['re'] - values[i - 1]['re'])


rows = []
for name in ['pair', 'gm19', 'arom']:
    path = ROOT / f'{name}-waveforms.json.gz'
    if not path.exists():
        continue
    capture = json.loads(gzip.decompress(path.read_bytes()))
    a, b = capture['actual'], capture['reference']
    shared = a['signals'].keys() & b['signals'].keys()
    peaks = {s: max(1e-10 if s.startswith('i(') else 1e-4,
                    max(abs(v['re']) for v in b['signals'][s])) for s in shared}
    first = None
    worst = None
    for time in sorted(set(a['grid']) | set(b['grid'])):
        if time < max(a['grid'][0], b['grid'][0]) or time > min(a['grid'][-1], b['grid'][-1]):
            continue
        for signal in sorted(shared):
            ts = interpolate(a['grid'], a['signals'][signal], time)
            ng = interpolate(b['grid'], b['signals'][signal], time)
            error = abs(ts - ng) / peaks[signal]
            entry = dict(time=time, signal=signal, ts=ts, native=ng, normalized=error,
                         peak=peaks[signal], tsAccepted=time in a['grid'], nativeAccepted=time in b['grid'])
            if error > 0.01 and first is None:
                first = entry
            if worst is None or error > worst['normalized']:
                worst = entry
    row = dict(name=name, sha256=capture['sha256'], tsPoints=len(a['grid']),
               nativePoints=len(b['grid']), firstMaterial=first, worst=worst)
    rows.append(row)
print(json.dumps(rows, indent=2))
(ROOT / 'divergences.json').write_text(json.dumps(rows, indent=2) + '\n')
