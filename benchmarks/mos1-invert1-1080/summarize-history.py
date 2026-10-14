"""Parse native trace; publish independent grids, not spurious iterate alignment."""
import gzip
import json
import struct
import sys
from pathlib import Path

root = Path('benchmarks/mos1-invert1-1080')
native = []
for line in Path(sys.argv[1]).read_text().splitlines():
    p = line.split()
    if not p or p[0] not in ('LOAD', 'ITER', 'LTE'):
        continue
    if p[0] == 'LOAD':
        assert len(p) == 26, (len(p), line)
        v = list(map(float, p[7:]))
        native.append(dict(kind='load', time=float(p[1]), dt=float(p[2]), order=int(p[3]), mode=int(p[4]), bypass=bool(int(p[5])), name=p[6], vgs=v[0], vds=v[1], vbs=v[2], charge=v[3:6], current=v[6:9], capacitance=v[9:12], predictorRatio=v[12], acceptedCharge=v[13:16], conductance=v[16:19]))
    elif p[0] == 'ITER':
        native.append(dict(kind='iteration', time=float(p[1]), dt=float(p[2]), order=int(p[3]), iteration=int(p[4]), mode=int(p[5])))
    else:
        native.append(dict(kind='lte', time=float(p[1]), dt=float(p[2]), order=int(p[3]), name=p[4], bound=float(p[5])))
raw = Path(sys.argv[2]).read_bytes()
header, binary = raw.split(b'Binary:\n', 1)
header = header.decode()
variables = [line.split()[1] for line in header.split('Variables:\n')[1].splitlines() if line.strip()]
count = int(next(line.split(':')[1] for line in header.splitlines() if line.startswith('No. Points:')))
assert len(binary) == count * len(variables) * 8
rows = [dict(zip(variables, values)) for values in struct.iter_unpack('<' + 'd' * len(variables), binary)]
accepted = [dict(time=r['time'], current=r['i(vdddev)'], output=r['v(vout)']) for r in rows if r['time'] <= 19.51e-6]
root.joinpath('native-history.json.gz').write_bytes(gzip.compress(json.dumps(dict(records=native, accepted=accepted)).encode(), mtime=0))
ts = json.loads(gzip.decompress(root.joinpath('ts-history.json.gz').read_bytes()))
window = lambda records: [r for r in records if 19.49e-6 <= r['time'] <= 19.51e-6]
# First unmatched accepted step. Close floating-point representations are the same grid point.
first_grid = next((dict(indexAfterOP=i, native=n, ts=t) for i, (n, t) in enumerate(zip([r for r in accepted if r['time'] > 0], ts['accepted'])) if abs(n['time'] - t['time']) > 1e-14), None)
corner = lambda records: [r for r in records if abs(r['time'] - 19.505e-6) < 1e-14]
first_loads = {}
for record in native:
    if record['kind'] == 'load' and record['time'] > 0:
        first_loads.setdefault((round(record['time'], 14), record['name']), record)
first_predictor = None
for record in ts['records']:
    if record['kind'] != 'load' or record.get('iteration') != 1:
        continue
    reference = first_loads.get((round(record['time'], 14), record['name'].lower()))
    if reference is None:
        continue
    polarity = -1 if record['name'].lower() == 'mp1' else 1
    error = max(abs(reference['current'][i] - polarity * record['entries'][j]['current']) for i, j in enumerate([1, 0, 2]))
    if error > 1e-9:
        first_predictor = dict(native=reference, ts=record, maxCurrentDifference=error, diagnosticCurrentFloor=1e-9)
        break
summary = dict(schema='spice-ts-mos1-history/v1', boundary='original identical deck; separate adaptive grids; TS charge order gd,gs,gb,bd,bs vs native gs,gd,gb; TS node-domain vs native polarity-domain',
    counts=dict(nativeRecords=len(native), tsRecords=len(ts['records']), nativeAccepted=len(accepted), tsAccepted=len(ts['accepted'])),
    firstGridDivergence=first_grid,
    firstPredictorCurrentDivergence=first_predictor,
    corner=dict(nativeAccepted=corner(accepted), tsAccepted=corner(ts['accepted']), native=corner(native), ts=corner(ts['records'])),
    window=dict(native=window(native), ts=window(ts['records'])))
root.joinpath('history-summary.json').write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps(dict(counts=summary['counts'], firstGridDivergence=first_grid, nativeCorner=corner(accepted), tsCorner=corner(ts['accepted'])), indent=2))
