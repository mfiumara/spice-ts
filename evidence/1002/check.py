"""Offline receipt assertions, without ngspice or a corpus replay."""
import gzip
import json
from pathlib import Path

root = Path(__file__).parent
def read(name):
    data = (root/name).read_bytes()
    return json.loads(gzip.decompress(data) if name.endswith('.gz') else data)

before, after = read('before.json'), read('after.json')
assert before['k-10']['signals']['i(vdd)']['normalized'] == 0.015832540193349596
assert max(s['normalized'] for s in after['k-10']['signals'].values()) < .01
assert before['k-15']['signals']['v(6)']['normalized'] > .32
assert after['k-15']['signals']['v(6)']['normalized'] > .32
baseline, fixed, native = read('before-trace.json.gz'), read('after-trace.json.gz'), read('native-trace.json.gz')
assert len(baseline['steps']) == len(fixed['steps']) == len(native['steps']) == 1007
assert len(baseline['charges']) == len(fixed['charges']) == 32
assert any(c['charge'] != c['loadedCharge'] for c in baseline['charges'])
assert all(c['charge'] == c['loadedCharge'] for c in fixed['charges'])
assert all(s['returnCode'] == 0 for s in native['steps'])
assert baseline['convergence']['transient']['rejectedSteps'] == 1
assert fixed['convergence']['transient']['rejectedSteps'] == 0
for trace in [baseline, fixed]:
    assert max(abs(t['time']-n['time']) for t,n in zip(trace['steps'],native['steps'])) < 1e-21
    assert all(s['iterations'] == 3 for s in trace['steps'] if 480e-9 < s['time'] < 484e-9)
assert all(s['order'] == 2 and s['iterations'] == 3 for s in native['steps'] if 480e-9 < s['time'] < 484e-9)
assert all(v == 0 for v in read('localization.json')['nativeReferenceMaxAbs'].values())
print('PASS original-input scores, 1007 matched steps, charge-history semantics, native equivalence, retained ring loss')
