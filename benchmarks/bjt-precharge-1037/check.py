"""Offline source/term/whole-waveform checks, no dependencies or simulator."""
import bisect
import gzip
import hashlib
import json
import math
from decimal import Decimal, localcontext
from pathlib import Path

here = Path(__file__).parent
receipt = json.loads(gzip.decompress((here / 'receipt.json.gz').read_bytes()))
for path, digest in receipt['sources'].items():
    assert hashlib.sha256(Path(path).read_bytes()).hexdigest() == digest, path
assert 'ngspice-47' in receipt['environment']['ngspice']
assert [row['id'] for row in receipt['rows']] == ['rest', 'nanosecond-control', 'moving-control']


def compare(points, native):
    """Interpolate saved native junction states onto every accepted TS time.

    Also publish exact-time coverage. Endpoints differing only by binary64
    time rounding (relative 1e-12) use the endpoint; never extrapolate.
    Relative error is |TS-native|/|native|, no signal-floor normalization.
    """
    times = [point['time'] for point in native]
    exact = {point['time']: point for point in native}
    output: dict = {'points': len(points), 'exactTimeMatches': sum(p['time'] in exact for p in points), 'endpointRoundoffMatches': 0}
    errors = {'vbe': [], 'vbc': []}
    relative = {'vbe': [], 'vbc': []}
    for point in points:
        t = point['time']
        index = bisect.bisect_left(times, t)
        if t in exact:
            oracle = exact[t]
        elif index == len(times):
            assert math.isclose(t, times[-1], rel_tol=1e-12, abs_tol=0), (t, times[-1])
            oracle = native[-1]
            output['endpointRoundoffMatches'] += 1
        else:
            assert index > 0
            lo, hi = native[index - 1], native[index]
            fraction = (t - lo['time']) / (hi['time'] - lo['time'])
            oracle = {name: lo[name] + fraction * (hi[name] - lo[name]) for name in errors}
        for name in errors:
            error = abs(point[name] - oracle[name])
            errors[name].append(error)
            assert oracle[name] != 0  # These three decks have nonzero junction bias.
            relative[name].append(error / abs(oracle[name]))
    for name in errors:
        output[name] = {'maxAbsV': max(errors[name]), 'rmsAbsV': math.sqrt(sum(e * e for e in errors[name]) / len(points)), 'maxRelative': max(relative[name]), 'rmsRelative': math.sqrt(sum(e * e for e in relative[name]) / len(points))}
    return output


metrics = {}
for row in receipt['rows']:
    assert hashlib.sha256(row['deck'].encode()).hexdigest() == row['sha256']
    assert row['native']['exitCode'] == 0
    native = row['native']['points']
    for mode in ('before', 'candidate'):
        run = row[mode]
        assert run['convergence']['transient']['acceptedSteps'] == len(run['points'])
        assert run['convergence']['transient']['lteRetries'] == 0
    before, candidate = row['before'], row['candidate']
    assert candidate['error'] is None
    assert math.isclose(candidate['time'], native[-1]['time'], rel_tol=1e-12)
    assert candidate['convergence']['transient']['nrRetries'] == 0
    metrics[row['id']] = {'baselineStatus': before['error'], 'baselineAccepted': len(before['points']), 'nativeRowsIncludingDC': len(native), 'candidate': compare(candidate['points'], native)}
    if row['id'] == 'nanosecond-control':
        assert before['error'] is None
        assert len(before['points']) == len(candidate['points']) == len(native) - 1 == 107
        metrics[row['id']]['baseline'] = compare(before['points'], native)
    else:
        assert before['error'] == 'TimestepTooSmallError'
        assert len(before['points']) == 1
        assert before['rows'][0] == candidate['rows'][0]

rest = receipt['rows'][0]
assert len(rest['candidate']['points']) == len(rest['native']['points']) - 1 == 107
first = rest['before']['rows'][0]
assert first['beforeResidual'] == first['prechargeResidual'] == [0, 0, 0, 0]
assert first['afterResidual'] == [-1.4551915228366852e-11, 1.4551915228366852e-11, 0, 0]
assert all(branch['current'] == branch['centeredCurrent'] == 0 for branch in first['branches'])
qbc = next(branch for branch in first['branches'] if branch['name'] == 'qbc')
assert qbc['equivalent'] > 8e4
with localcontext() as ctx:
    ctx.prec = 100
    rounding = []
    for add in first['rhsAdds']:
        error = Decimal.from_float(add['after']) - Decimal.from_float(add['before']) - Decimal.from_float(add['value'])
        rounding.append(str(error))
    assert abs(Decimal(rounding[1])) > Decimal('1e-12')
    assert first['rhsAdds'][2]['after'] == first['rhsAdds'][2]['value']
    metrics['localization'] = {'qbcEquivalentA': qbc['equivalent'], 'qbcConductanceS': qbc['conductance'], 'rhsAddRoundingA': rounding, 'beforeResidualA': first['beforeResidual'], 'afterResidualA': first['afterResidual']}
assert any(branch['current'] != 0 for row in receipt['rows'][2]['candidate']['rows'] for branch in row['branches'])
# Loose observational guards, not production tolerances. Publish actual scores.
assert metrics['rest']['candidate']['vbe']['maxAbsV'] < 1e-12
assert metrics['rest']['candidate']['vbc']['maxAbsV'] < 1e-10
(here / 'metrics.json').write_text(json.dumps(metrics, indent=2) + '\n')
print(json.dumps(metrics, indent=2))
print('PASS: charge-boundary experiment, 3 native completions, exact RHS-add rounding, full accepted-point comparisons. NOT a production fix.')
