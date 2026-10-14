"""Offline evidence regression checks. A retained simulator mismatch is NOT a pass."""
import gzip
import hashlib
import json
from pathlib import Path
root = Path(__file__).parent
load = lambda name: json.loads((root/name).read_text())
receipt = load('receipt.json')
report = json.loads(Path('benchmarks/reference/maxord-983/report.json').read_text())
wave = json.loads(gzip.decompress((root/'waveforms.json.gz').read_bytes()))
assert receipt['productionFilesChanged'] == []
assert receipt['pump']['after'] == report['fixtures'][0]
assert receipt['pump']['before']['worstNormalizedError'] == 0.0585
assert report['fixtures'][0]['outcome'] == wave['row']['outcome'] == 'mismatch'
assert report['fixtures'][0]['worstNormalizedError'] == wave['row']['worstNormalizedError'] == 0.063
assert report['fixtures'][0]['ngspice']['analyses'] == ['tran:868']
assert report['fixtures'][0]['spiceTs']['analyses'] == ['tran:867']
assert all(row['outcome']=='matched' for row in report['fixtures'][1:])
assert receipt['guards']['mosamp2']['errorV'] < receipt['guards']['mosamp2']['boundV'] == 5e-6
assert all(row['worstNormalized'] < 0.01 for row in receipt['guards']['related'].values())
assert receipt['nativeVerification']['maxAbsDelta'] == receipt['nativeVerification']['maxTimeDelta'] == 0
assert receipt['nativeVerification']['points'] == 868
assert len(receipt['nativeVerification']['signals']) == 4
fixture = Path('benchmarks/corpus/corpus-k/fixtures/xyce/Netlists/CircuitSim90/MOS2/pump.cir')
assert hashlib.sha256(fixture.read_bytes()).hexdigest() == report['fixtures'][0]['sha256']
ts = json.loads(gzip.decompress((root/'ts-trace.json.gz').read_bytes()))
assert len(ts['steps']) == 866
assert all(row['integration']['method']=='euler' for row in ts['charges'] if 'integration' in row)
local = load('localization.json')
assert abs(local['i(vnin)']['maxAbs']/local['i(vnin)']['peak'] - 0.063) < 0.00005
assert local['i(vnin)']['firstOnePercent']['time'] == 1.5208922042773343e-8
assert all(local[name]['firstOnePercent'] is None for name in ['v(2)','v(5)','v(6)'])
print('PASS: retained pump loss, native identity, order-1 traces, unchanged hashes, all RC and MOS guards')
