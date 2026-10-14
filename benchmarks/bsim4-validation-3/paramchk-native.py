"""Original MIT regression probes for PR999; run under spice-heavy.
Output-only print instrumentation; both engines use the returned identical deck.
"""
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent
CASES = [
    ('source', 'NJS=0.05 NJD=1 PARAMCHK=1'),
    ('drain', 'NJS=1 NJD=0.05 PARAMCHK=1'),
    ('inherited-drain', 'NJS=0.05 PARAMCHK=1'),
    ('default-paramchk', 'NJS=0.05 NJD=1'),
    ('source-boundary', 'NJS=0.1 NJD=1 PARAMCHK=1'),
    ('drain-boundary', 'NJS=1 NJD=0.1 PARAMCHK=1'),
    ('inherited-boundary', 'NJS=0.1 PARAMCHK=1'),
    ('source-unchecked', 'NJS=0.05 NJD=1 PARAMCHK=0'),
    ('drain-unchecked', 'NJS=1 NJD=0.05 PARAMCHK=0'),
    ('inherited-unchecked', 'NJS=0.05 PARAMCHK=0'),
]
rows = []
version = subprocess.check_output(['ngspice', '--version'], text=True).strip()
with tempfile.TemporaryDirectory(dir=os.environ.get('TMPDIR')) as tmp:
    for name, parameters in CASES:
        deck = f'''BSIM4 PARAMCHK regression
.model DUT NMOS LEVEL=54 {parameters}
M1 d g 0 b DUT L=1u W=2u AS=1p AD=1p
Vd d 0 0.5
Vg g 0 1
Vb b 0 0.02
.temp 27
.options gmin=1e-12
.op
.control
set numdgt=17
op
print @m1[gbs] @m1[gbd] i(Vb)
.endc
.end
'''
        path = Path(tmp) / f'{name}.cir'
        path.write_text(deck)
        run = subprocess.run(['ngspice', '-n', '-b', str(path)], cwd=tmp,
                             capture_output=True, text=True, check=True)
        text = run.stdout + run.stderr
        values = {}
        for vector in ['@m1[gbs]', '@m1[gbd]', 'i(vb)']:
            match = re.search(re.escape(vector) + r'\s*=\s*([-+\deE.]+)', text, re.I)
            if not match:
                raise ValueError(f'Missing {vector} in {name}')
            values[vector] = float(match.group(1))
        warnings = [line.strip() for line in text.splitlines()
                    if 'Setting Njs to 0.1' in line or 'Setting Njd to 0.1' in line]
        rows.append(dict(name=name, deck=deck, native=values, warnings=warnings, exitCode=run.returncode))
(ROOT / 'paramchk-reference.json').write_text(json.dumps(dict(version=version, cases=rows), indent=2) + '\n')
print(f'Captured {len(rows)} native PARAMCHK cases')
