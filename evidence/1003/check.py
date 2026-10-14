"""Offline identical-input waveform scores; no phase alignment or fixture edits."""
import gzip
import json
import runpy
from pathlib import Path

root = Path('evidence/1003')
helpers = runpy.run_path('evidence/996/analyze.py')
summary = {}
for path in sorted((root/'runs').glob('*.json.gz')):
    run = json.loads(gzip.decompress(path.read_bytes()))
    assert run['spiceTs']['status'] == run['ngspice']['status'] == 'success'
    ts = helpers['analysis'](run['spiceTs'], 'tran')
    ng = helpers['analysis'](run['ngspice']['execution'], 'tran')
    row = helpers['compare'](ts, ng)
    row['points'] = dict(spiceTs=len(ts['grid']), ngspice=len(ng['grid']))
    if run['stages'] == 17:
        a, b = helpers['crossings'](ts, 'v(6)'), helpers['crossings'](ng, 'v(6)')
        assert len(a['edges']) == len(b['edges']) == 7
        offsets = [1e12*(y-x) for x, y in zip(a['edges'], b['edges'])]
        row['crossings'] = dict(spiceTs=a, ngspice=b, offsetsPs=offsets, meanOffsetPs=sum(offsets)/len(offsets))
    summary[path.name.removesuffix('.json.gz')] = row
assert summary['baseline-17']['first']['node'] == summary['baseline-15']['first']['node'] == 'v(13)'
assert summary['baseline-11']['first'] is None and summary['baseline-7']['first'] is None
assert summary['baseline-17']['worst']['normalized'] > .3
for stages in [17, 15, 11, 7]:
    assert summary[f'after-{stages}']['worst']['normalized'] <= .01
related = json.loads((root/'related.json').read_text())
assert related['circuits']['k-10']['worstNormalized'] <= .01
assert related['circuits']['k-15']['worstNormalized'] <= .01
assert abs(summary['after-17']['worst']['normalized'] - related['circuits']['k-15']['worstNormalized']) < 1e-12
assert related['mosamp']['absoluteError'] < related['mosamp']['bound'] == 5e-6
native = json.loads(gzip.decompress((root/'native-trace.json.gz').read_bytes()))
golden = json.loads(gzip.decompress(Path('evidence/996/runs/k-15-original.json.gz').read_bytes()))['ngspice']['execution']['analyses'][0]['series']
assert len(native['rows']) == len(golden['grid']) == 1010
assert [s['order'] for s in native['steps'][:4]] == [1, 1, 2, 2]
common = set(native['variables']) & set(golden['signals'])
assert len(common) == 19
for name in common:
    column = native['variables'].index(name)
    assert all(row[column] == value['re'] for row, value in zip(native['rows'], golden['signals'][name]))
assert max(abs(row[0]-t) for row, t in zip(native['rows'], golden['grid'])) < 1e-21
(root/'summary.json').write_text(json.dumps(summary, indent=2)+'\n')
for name, row in summary.items():
    print(name, row['worst']['normalized'], row['first'])
    if 'crossings' in row:
        print('mean offset (ps)', row['crossings']['meanOffsetPs'])
print('related', related)
