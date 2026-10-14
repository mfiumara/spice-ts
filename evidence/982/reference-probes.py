"""Generate ngspice-47 receipts for the original unit-test probe bytes."""
import json
import os
from pathlib import Path
import subprocess

root = Path(os.environ['TMPDIR']) / 'mos2-982-probes'
root.mkdir(exist_ok=True)
cases = [
    ('direct', 'RD=50 RS=30 RSH=500', 'NRD=2 NRS=3 M=2'),
    ('sheet', 'RSH=50', 'NRD=2 NRS=3 M=2'),
    ('default-squares', 'RSH=50', ''),
    ('zero', 'RD=0 RS=0 RSH=0', ''),
    ('zero-squares', 'RSH=50', 'NRD=0 NRS=0'),
    ('open-drain', 'RD=0 RS=30 RSH=50', 'NRD=2 NRS=3'),
    ('open-source', 'RD=50 RS=0 RSH=50', 'NRD=2 NRS=3'),
]
receipts = []
for name, model, instance in cases:
    deck = f'''MOS2 series reference {name}
VDD vdd 0 5
VG g 0 DC 3 AC 1
RL vdd d 1k
M1 d g 0 0 N W=10u L=2u {instance}
.MODEL N NMOS (LEVEL=2 VTO=0.8 KP=50u GAMMA=0.5 PHI=0.6 LAMBDA=0.02 TOX=25n CGSO=1n CGDO=1n CBD=1p CBS=1p {model})
.OP
.AC LIN 1 1MEG 1MEG
.END
'''
    input_path = root / f'{name}.cir'
    raw_path = root / f'{name}.raw'
    input_path.write_text(deck)
    run = subprocess.run(['ngspice', '-b', '-r', str(raw_path), str(input_path)], env={**os.environ, 'SPICE_ASCIIRAWFILE': '1'}, capture_output=True, text=True)
    raw = raw_path.read_text() if raw_path.exists() else ''
    receipt = {'name': name, 'model': model, 'instance': instance, 'deck': deck, 'exitCode': run.returncode, 'stdout': run.stdout, 'stderr': run.stderr, 'raw': raw}
    receipts.append(receipt)
    print(name, run.returncode)
    print(raw)
Path('evidence/982/ngspice-probes.json').write_text(json.dumps(receipts, indent=2) + '\n')
