"""Run via spice-heavy python3 benchmarks/altermod-alias-930/compare.py before|after.
Serial owned groups, <=12s each, <=300s cumulative across both phases.
"""
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import re
import signal
import subprocess
import sys
import time

ROOT = Path('benchmarks/altermod-alias-930')
CORPUS = Path('benchmarks/corpus/corpus-f/fixtures/examples/loops')
phase = sys.argv[1]
assert phase in ('before', 'after')
previous = ROOT / 'before.json'
failed_total = json.loads((ROOT / 'failed-runner/after.json').read_text())['totalActualChildWallSeconds']
total = json.loads(previous.read_text())['totalActualChildWallSeconds'] if phase == 'after' else failed_total
if (ROOT / 'targets.json').exists():
    total = max(total, json.loads((ROOT / 'targets.json').read_text())['totalActualChildWallSeconds'])
version = subprocess.check_output(['ngspice', '--version'], text=True)
assert 'ngspice-47' in version
receipt = {'baseSha': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
           'candidatePatchSha256': hashlib.sha256(subprocess.check_output(['git', 'diff', '--', 'packages/core/src/circuit.ts'])).hexdigest(),
           'ngspiceVersion': version, 'host': platform.platform(),
           'nodeVersion': subprocess.check_output(['node', '--version'], text=True).strip(),
           'childCapSeconds': 12, 'totalChildCapSeconds': 300, 'fixtures': []}


def run(label, command, stdin=None):
    global total
    cap = min(12, 300 - total)
    if cap <= 0:
        return {'status': 'not-run', 'reason': 'cumulative actual-child-wall budget exhausted'}, ''
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
        (ROOT / f'{phase}-{label}.{suffix}.log').write_bytes(data)
    if stdin:
        (ROOT / f'{phase}-{label}.stdin.txt').write_text(stdin)
    return {'status': 'timeout' if timed_out else 'completed' if child.returncode == 0 else 'failed',
            'exitCode': child.returncode, 'wallSeconds': wall, 'command': command}, stdout.decode(errors='replace')


for path in [ROOT / 'minimal.cir', *[CORPUS / name for name in
             ['instance-loop.cir', 'loop-instance.cir', 'loop-model.cir']]]:
    row = {'path': str(path), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
           'maxRelativeError': None, 'rmsRelativeError': None, 'matchedPoints': 0}
    row['ngspice'], reference = run(f'{path.stem}-ngspice', ['ngspice', '-b', str(path.resolve())])
    row['referenceOpRows'] = reference.count('No. of Data Rows : 1')
    row['spiceTs'], native = run(f'{path.stem}-spiceTs',
        ['node', '--import', 'tsx', str((ROOT / 'native.mts').resolve()), str(path.resolve())])
    row['nativeResult'] = json.loads(native) if native.strip() else None
    row['outcome'] = 'not-compared' if row['spiceTs']['status'] == 'completed' else 'spice-ts-loss'
    values = []
    if path.parent == CORPUS:
        stdin = f'readout wrapper\n.control\nset nomoremode\nset numdgt=17\nsource {path.resolve()}\nprint vnode2 r2val\nquit\n.endc\n.end\n'
        row['readout'], output = run(f'{path.stem}-readout', ['ngspice', '-b'], stdin)
        resistances = []
        for match in re.finditer(r'^\s*(\d+)\s+([+-]?[\d.]+e[+-]?\d+)\s+([+-]?[\d.]+e[+-]?\d+)\s*$', output, re.M | re.I):
            index, voltage, resistance = match.groups()
            assert int(index) == len(values), 'nonsequential reference index'
            values.append(float(voltage))
            resistances.append(float(resistance))
        row['referenceN1'] = values
        row['referenceR2'] = resistances
        assert len(values) == 19
        assert resistances == list(range(1000, 99, -50))
        actual = [run['n1'] for run in row['nativeResult'].get('runs', [])] if row['nativeResult'] else []
    else:
        values = [float(value) for value in re.findall(r'^v\([ab]\)\s*=\s*([+-]?[\d.]+e[+-]?\d+)', reference, re.M | re.I)]
        assert len(values) == 2
        actual = [row['nativeResult']['runs'][0][node] for node in ['a', 'b']] if row['nativeResult'] and row['nativeResult']['status'] == 'success' else []
    if row['nativeResult'] and row['nativeResult']['status'] == 'success':
        assert len(actual) == len(values)
        errors = [abs(a - b) / abs(b) for a, b in zip(actual, values)]
        row.update(matchedPoints=len(errors), maxRelativeError=max(errors),
                   rmsRelativeError=math.sqrt(sum(e * e for e in errors) / len(errors)), outcome='compared')
    receipt['fixtures'].append(row)
    receipt['totalActualChildWallSeconds'] = total
    (ROOT / f'{phase}.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt, indent=2))
