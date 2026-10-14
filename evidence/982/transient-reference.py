import json
import os
from pathlib import Path
import subprocess

root = Path(os.environ['TMPDIR']) / 'mos2-982-probes'
deck = (root / 'direct.cir').read_text().replace('VG g 0 DC 3 AC 1', 'VG g 0 PULSE(0 3 2n 1n 1n 3n 8n)').replace('.OP\n.AC LIN 1 1MEG 1MEG', '.TRAN 0.05n 10n')
input_path = root / 'transient.cir'
raw_path = root / 'transient.raw'
input_path.write_text(deck)
run = subprocess.run(['ngspice', '-b', '-r', str(raw_path), str(input_path)], env={**os.environ, 'SPICE_ASCIIRAWFILE': '1'}, capture_output=True, text=True)
raw = raw_path.read_text()
header, values = raw.split('Values:\n')
variables = [line.split()[1] for line in header.split('Variables:\n')[1].splitlines()]
lines = [line.split() for line in values.splitlines() if line.strip()]
points = [[float(lines[i][1]), *[float(line[0]) for line in lines[i+1:i+len(variables)]]] for i in range(0, len(lines), len(variables))]
samples = []
for at in [0, 2e-9, 2.5e-9, 3e-9, 4e-9, 6.5e-9, 8e-9, 10e-9]:
    for a, b in zip(points, points[1:]):
        if a[0] <= at <= b[0]:
            f = (at-a[0]) / (b[0]-a[0])
            samples.append(dict(zip(variables, [at, *[x+(y-x)*f for x,y in zip(a[1:],b[1:])]])))
            break
receipt = {'deck': deck, 'exitCode': run.returncode, 'stdout': run.stdout, 'stderr': run.stderr, 'points': len(points), 'samples': samples}
Path('evidence/982/ngspice-transient.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt, indent=2))
