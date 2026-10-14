"""Independent ngspice-47 disabled-Tj check, not a public-fixture adaptation."""
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

root = Path(__file__).parent
version = subprocess.check_output(['ngspice', '--version'], text=True)
assert 'ngspice-47' in version
rows = []
with tempfile.TemporaryDirectory(prefix='vdmos-1103-native-', dir=os.environ['TMPDIR']) as directory:
    for channel, sign in [('', 1), ('pchan', -1)]:
        for extra in ['', 's', '0', 'b']:
            deck = f'''disabled thermal node
m1 d g s {extra} n1 m=2 temp=50
.model n1 vdmos {channel} vto={sign} kp=2 rd=.1 rs=.1 rb=.2 rthjc=1 cgs=1n cgdmin=1p cgdmax=10p
vd d 0 {5 * sign} ac 1
vg g 0 {3 * sign}
vs s 0 0
vb b 0 100
.control
set numdgt=15
op
print i(vd) i(vs) i(vb) @m1[tempnode]
quit
.endc
.end
'''
            path = Path(directory) / 'point.cir'
            path.write_text(deck)
            run = subprocess.run(['ngspice', '-b', str(path)], cwd=directory,
                                 env={**os.environ, 'HOME': directory}, text=True, capture_output=True, check=True)
            quantities = {}
            for name in ['i(vd)', 'i(vs)', 'i(vb)', '@m1[tempnode]']:
                match = re.search(r'^' + re.escape(name) + r' = (\S+)$', run.stdout, re.M)
                assert match, (name, run.stdout, run.stderr)
                quantities[name] = float(match[1])
            assert quantities['i(vb)'] == 0
            assert quantities['@m1[tempnode]'] == 0
            rows.append({'channel': channel or 'nchan', 'fourthNode': extra or None,
                         'quantities': quantities, 'stdout': run.stdout, 'stderr': run.stderr})
for channel in ['nchan', 'pchan']:
    group = [r for r in rows if r['channel'] == channel]
    assert all(r['quantities'] == group[0]['quantities'] for r in group)
receipt = {'version': version, 'command': 'spice-heavy python3 benchmarks/vdmos-1103/native-check.py',
           'boundary': 'synthetic OP node-semantics check only; not corpus parity', 'rows': rows}
(root / 'native-check.json').write_text(json.dumps(receipt, indent=2) + '\n')
print('ngspice-47: eight synthetic OP runs, three/fourth-node currents identical; Tj disabled')
