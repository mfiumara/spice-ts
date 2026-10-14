"""Offline receipt checks. Run after generation; no simulator subprocesses."""
import importlib.util
import json
import gzip
import math
from pathlib import Path

ROOT = Path(__file__).parent
spec = importlib.util.spec_from_file_location('analyze', ROOT/'analyze.py')
assert spec is not None and spec.loader is not None
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
assert module.interp([0,1,2], [0,2,0], .5) == 1
assert module.interp([0,1,2], [0,2,0], 2) == 0
summary = json.loads((ROOT/'summary.json').read_text())
assert len(summary) == 21
assert len(list((ROOT/'runs').glob('*.json.gz'))) == 21
assert summary['k-5-tight']['status'] == 'not-compared'
for name, key in [('latch','k-5-latch-op'),('mosrect','k-10-reduced'),('ring','k-15-original')]:
    run = json.loads(gzip.decompress((ROOT/'runs'/f'{key}.json.gz').read_bytes()))
    assert (ROOT/'repro'/f'{name}.cir').read_text() == run['deck']
for id in ['k-5','k-10','k-15']:
    for variant in ['original','op','fine']:
        run = json.loads(gzip.decompress((ROOT/'runs'/f'{id}-{variant}.json.gz').read_bytes()))
        assert run['ngspice']['status'] == run['spiceTs']['status'] == 'success'
        for engine in [run['ngspice']['execution'], run['spiceTs']]:
            for analysis in engine['analyses']:
                series = analysis['series']
                assert all(math.isfinite(x) for x in series['grid'])
                assert all(len(v) == len(series['grid']) for v in series['signals'].values())
        assert summary[f'{id}-{variant}']['worst']['normalized'] >= 0
probes = json.loads((ROOT/'device-probes.json').read_text())
assert probes['exitCode'] == 0
assert len(probes['probes']) == 430
assert probes['qb']['available'] is False
assert 'no such parameter qb' in probes['stderr']
assert {p['id'] for p in probes['probes']} == {'k-5','k-10','k-15'}
for p in probes['probes']:
    assert set(p['spiceTs']) == set(p['ngspice'])
    assert all(math.isfinite(x) for x in p['ngspice'].values())
    for key in ['id','gm','gds']:
        assert abs(p['spiceTs'][key]-p['ngspice'][key]) < 1e-14
    for key in ['cgs','cgd','cgb','qbs','qbd']:
        assert abs(p['spiceTs'][key]-p['ngspice'][key]) < 1e-26
for id in ['k-10','k-15']:
    assert summary[f'{id}-original']['worst']['normalized'] > .01
    assert summary[f'{id}-fine']['worst']['normalized'] < .01
assert summary['k-5-original']['first']['t'] == 0
assert summary['k-5-original']['first']['magnitude'] > 4.99
phase = summary['k-15-original']['phaseDiagnostic']
assert 90e-12 < phase['meanShift'] < 100e-12
assert abs(phase['periodRelativeDifference']) < 5e-6
assert phase['maxAbsShifted'] < .1*phase['maxAbsRaw']
print('PASS: 21 runs retained (including one both-engine failure), baseline/fine/OP results complete, 430 matched-bias device probes agree, first-divergence and phase claims checked')
