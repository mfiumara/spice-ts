"""Bounded serial diagnosis only; invoke with spice-heavy python3 .../probe.py."""
import hashlib
import json
import os
from pathlib import Path
import platform
import signal
import subprocess
import time

ROOT = Path('benchmarks/control-loop-scalars-20261013')
CORPUS = Path('benchmarks/corpus/corpus-f/fixtures/examples/loops')
receipt = {'baseSha': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
           'ngspiceVersion': subprocess.check_output(['ngspice', '--version'], text=True),
           'host': platform.platform(), 'childCapSeconds': 12, 'totalChildCapSeconds': 600,
           'fixtures': []}
total = 0
for path in [ROOT / 'minimal.cir', *[CORPUS / name for name in ['instance-loop.cir', 'loop-instance.cir', 'loop-model.cir']]]:
    row = {'path': str(path), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
           'maxRelativeError': None, 'rmsRelativeError': None, 'matchedPoints': 0}
    for engine, command in [('ngspice', ['ngspice', '-b', str(path.resolve())]),
                            ('spiceTs', ['node', '--import', 'tsx', str((ROOT / 'native.mts').resolve()), str(path.resolve())])]:
        cap = min(12, 600 - total)
        if cap <= 0:
            row[engine] = {'status': 'not-run', 'reason': 'total child budget exhausted'}
            continue
        start = time.monotonic()
        child = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
        timed_out = False
        try:
            stdout, stderr = child.communicate(timeout=cap)
        except subprocess.TimeoutExpired:
            timed_out = True
            os.killpg(child.pid, signal.SIGKILL)
            stdout, stderr = child.communicate()
        wall = time.monotonic() - start
        total += wall
        for suffix, data in [('stdout', stdout), ('stderr', stderr)]:
            (ROOT / f'{path.stem}-{engine}.{suffix}.log').write_bytes(data)
        text = (stdout + stderr).decode(errors='replace')
        status = 'timeout' if timed_out else 'failed' if engine == 'spiceTs' and child.returncode != 0 else 'completed'
        row[engine] = {'status': status, 'exitCode': child.returncode, 'wallSeconds': wall,
                       'command': command, 'plotBatchWarning': 'not available during batch simulation' in text}
    row['outcome'] = 'not-compared' if row['spiceTs']['status'] == 'completed' else 'spice-ts-loss'
    receipt['fixtures'].append(row)
    receipt['totalActualChildWallSeconds'] = total
    (ROOT / 'diagnosis.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt, indent=2))
