"""Waveform diagnostics only; unchanged harness score is in report.json."""
import bisect
import gzip
import json
from pathlib import Path
root = Path(__file__).parent
data = json.loads(gzip.decompress((root / 'waveforms.json.gz').read_bytes()))
native = data['ngspice']['analyses'][0]['series']
actual = data['spiceTs']['analyses'][0]['series']
result = {}
shared = set(native['grid']) & set(actual['grid'])
for name, values in actual['signals'].items():
    if name not in native['signals']:
        continue
    ref = [x['re'] for x in native['signals'][name]]
    peak = max(map(abs, ref))
    errors = []
    for i, time in enumerate(actual['grid']):
        j = max(1, min(len(ref)-1, bisect.bisect_left(native['grid'], time)))
        fraction = (time-native['grid'][j-1])/(native['grid'][j]-native['grid'][j-1])
        expected = ref[j-1]+fraction*(ref[j]-ref[j-1])
        error = abs(values[i]['re']-expected)
        if time not in native['grid'] and native['grid'][j-1] in shared:
            right = ref[j] if j+1 == len(ref) else ref[j]+(time-native['grid'][j])/(native['grid'][j+1]-native['grid'][j])*(ref[j+1]-ref[j])
            error = min(error, abs(values[i]['re']-right))
        errors.append(error)
    worst = max(range(len(errors)), key=errors.__getitem__)
    first = next((i for i, e in enumerate(errors) if e > 0.01*peak), None)
    result[name] = {'peak': peak, 'maxAbs': errors[worst], 'worstTime': actual['grid'][worst],
        'firstOnePercent': None if first is None else {'index': first, 'time': actual['grid'][first], 'error': errors[first]},
        'firstViolationWindow': [] if first is None else [{'index': i, 'time': actual['grid'][i], 'actual': values[i]['re'], 'error': errors[i]}
            for i in range(max(0, first-4), min(len(errors), first+5))]}
(root/'localization.json').write_text(json.dumps(result, indent=2)+'\n')
print(json.dumps(result, indent=2))
print('first grids', native['grid'][:15], actual['grid'][:15])
