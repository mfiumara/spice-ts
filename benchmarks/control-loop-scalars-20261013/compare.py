"""Fresh identical-deck runs, serial process groups. Use spice-heavy python3 .../compare.py."""
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import re
import signal
import subprocess
import time

ROOT = Path('benchmarks/control-loop-scalars-20261013')
CORPUS = Path('benchmarks/corpus/corpus-f/fixtures/examples/loops')
total = 0.0
receipt = {'baseSha': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
           'candidatePatchSha256': hashlib.sha256(subprocess.check_output(['git', 'diff', '--', 'packages/core/src/parser'])).hexdigest(),
           'ngspiceVersion': subprocess.check_output(['ngspice', '--version'], text=True),
           'nodeVersion': subprocess.check_output(['node', '--version'], text=True).strip(),
           'host': platform.platform(), 'childCapSeconds': 12, 'totalChildCapSeconds': 600,
           'metric': 'abs(native-reference)/abs(reference), matched by loop index and r2val; voltage n1',
           'fixtures': []}


def run(label, command, stdin=None):
    global total
    cap = min(12, 600 - total)
    if cap <= 0:
        return {'status': 'not-run', 'reason': 'total actual-child-wall budget exhausted'}, ''
    start = time.monotonic()
    env = dict(os.environ)
    env.pop('DISPLAY', None)
    child = subprocess.Popen(command, stdin=subprocess.PIPE if stdin else subprocess.DEVNULL,
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True, env=env)
    timed_out = False
    try:
        stdout, stderr = child.communicate(stdin.encode() if stdin else None, timeout=cap)
    except subprocess.TimeoutExpired:
        timed_out = True
        os.killpg(child.pid, signal.SIGKILL)
        stdout, stderr = child.communicate()
    wall = time.monotonic() - start
    total += wall
    for suffix, data in [('stdout', stdout), ('stderr', stderr)]:
        (ROOT / f'after-{label}.{suffix}.log').write_bytes(data)
    if stdin:
        (ROOT / f'after-{label}.stdin.txt').write_text(stdin)
    return {'status': 'timeout' if timed_out else 'completed' if child.returncode == 0 else 'failed',
            'exitCode': child.returncode, 'wallSeconds': wall, 'command': command}, stdout.decode(errors='replace')


for path in [ROOT / 'minimal.cir', ROOT / 'namespace.cir', *[CORPUS / name for name in
             ['instance-loop.cir', 'loop-instance.cir', 'loop-model.cir']]]:
    row = {'path': str(path), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
           'maxRelativeError': None, 'rmsRelativeError': None, 'matchedPoints': 0}
    row['ngspice'], reference = run(f'{path.stem}-ngspice', ['ngspice', '-b', str(path.resolve())])
    row['referenceOpRows'] = reference.count('No. of Data Rows : 1')
    row['spiceTs'], native = run(f'{path.stem}-spiceTs',
        ['node', '--import', 'tsx', str((ROOT / 'native.mts').resolve()), str(path.resolve())])
    row['nativeResult'] = json.loads(native) if native.strip() else None
    row['outcome'] = 'not-compared' if row['spiceTs']['status'] == 'completed' else 'spice-ts-loss'
    if path.parent == CORPUS:
        # Batch mode is headless. Source the unchanged original, then read out its
        # existing output vectors without editing any netlist or simulated value.
        stdin = f'readout wrapper\n.control\nset nomoremode\nset numdgt=17\nsource {path.resolve()}\nprint vnode2 r2val\nquit\n.endc\n.end\n'
        row['readout'], output = run(f'{path.stem}-readout', ['ngspice', '-b'], stdin)
        values = []
        resistances = []
        for match in re.finditer(r'^\s*(\d+)\s+([+-]?[\d.]+e[+-]?\d+)\s+([+-]?[\d.]+e[+-]?\d+)\s*$', output, re.M | re.I):
            index, voltage, resistance = match.groups()
            assert int(index) == len(values), 'nonsequential reference loop index'
            values.append(float(voltage))
            resistances.append(float(resistance))
        row['referenceN1'] = values
        row['referenceR2'] = resistances
        if row['nativeResult'] and row['nativeResult']['status'] == 'success' and len(values) == 19:
            actual = row['nativeResult']['n1']
            assert len(actual) == len(values)
            assert resistances == list(range(1000, 99, -50)), 'reference loop coordinates changed'
            errors = [abs(a - b) / abs(b) for a, b in zip(actual, values)]
            row.update(matchedPoints=len(errors), maxRelativeError=max(errors),
                       rmsRelativeError=math.sqrt(sum(e * e for e in errors) / len(errors)), outcome='compared')
    receipt['fixtures'].append(row)
    receipt['totalActualChildWallSeconds'] = total
    (ROOT / 'after.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt, indent=2))
