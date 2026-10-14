"""Offline evidence checks; no simulator run, vendor files or third-party deps."""
import json
import gzip
import hashlib
from decimal import Decimal, localcontext
from pathlib import Path

receipt = json.loads(gzip.decompress(Path(__file__).with_name('receipt.json.gz').read_bytes()))
for source, digest in receipt['sources'].items():
    assert hashlib.sha256(Path(source).read_bytes()).hexdigest() == digest
rest, control = receipt['rows']
assert [rest['id'], control['id']] == ['rest', 'nanosecond-control']
for row in (rest, control):
    assert row['native']['exitCode'] == 0
    assert row['native']['points'] == 108
    for mode in ('before', 'candidate'):
        run = row[mode]
        assert run['convergence']['transient']['lteRetries'] == 0
        assert all(not check['limited'] for check in run['checks'])
        assert len(run['solves']) == len(run['checks'])
assert rest['before']['error'] == rest['candidate']['error'] == 'TimestepTooSmallError'
assert len(rest['before']['points']) == 1
assert len(rest['candidate']['points']) == 0
for mode in ('before', 'candidate'):
    assert control[mode]['error'] is None
    assert len(control[mode]['points']) == 107
    assert control[mode]['convergence']['transient']['nrRetries'] == 0

first = rest['before']['solves'][0]
assert first == rest['candidate']['solves'][0]
assert first['direct'] != first['centered']
# Decimal.from_float preserves the exact binary64 inputs. This examines the
# ALREADY ROUNDED matrix and RHS, not the exact physical circuit equations.
with localcontext() as ctx:
    ctx.prec = 100
    residual = [Decimal.from_float(x) for x in first['rhs']]
    matrix = first['matrix']
    for col, anchor in enumerate(first['anchor']):
        for k in range(matrix['colPtr'][col], matrix['colPtr'][col + 1]):
            residual[matrix['rowIdx'][k]] -= Decimal.from_float(matrix['values'][k]) * Decimal.from_float(anchor)
    assert any(x != 0 for x in residual)
    print('Exact residual of rounded A,b at DC anchor:', [str(x) for x in residual])
    print('Binary64 post-assembly residual:', first['residual'])

native = rest['native']['firstPoints']
assert native[0]['signals']['v(@q1[vbc])'] == rest['before']['checks'][0]['load']['vBC']
# Native .save junction values are accepted-device state, not every Newton
# iterate. Only compare the first common accepted time, with no interpolation.
point = rest['before']['points'][0]
assert point['time'] == native[1]['time']
c, b, e = rest['before']['nodes']
vbe = point['solution'][b] - (point['solution'][e] if e >= 0 else 0)
vbc = point['solution'][b] - point['solution'][c]
print('First common accepted time:', point['time'])
print('vbe TS/native/difference:', vbe, native[1]['signals']['v(@q1[vbe])'], vbe - native[1]['signals']['v(@q1[vbe])'])
print('vbc TS/native/difference:', vbc, native[1]['signals']['v(@q1[vbc])'], vbc - native[1]['signals']['v(@q1[vbc])'])
for mode in ('before', 'candidate'):
    first_check = rest[mode]['checks'][0]
    assert first_check['baseError'] > first_check['baseTolerance']
    print(mode, 'first base error/tolerance:', first_check['baseError'], first_check['baseTolerance'])
print('PASS: 2 identical-byte native completions, rejected centered candidate, controls, first-point and rounded-residual localization')
