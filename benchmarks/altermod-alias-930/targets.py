"""Run via spice-heavy python3 benchmarks/altermod-alias-930/targets.py."""
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import time

root = Path('benchmarks/altermod-alias-930')
prior = json.loads((root / 'after.json').read_text())['totalActualChildWallSeconds']
path = root / 'targets.cir'
command = ['ngspice', '-b', str(path.resolve())]
start = time.monotonic()
child = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
timed_out = False
try:
    stdout, stderr = child.communicate(timeout=min(12, 300 - prior))
except subprocess.TimeoutExpired:
    timed_out = True
    os.killpg(child.pid, signal.SIGKILL)
    stdout, stderr = child.communicate()
wall = time.monotonic() - start
(root / 'targets.stdout.log').write_bytes(stdout)
(root / 'targets.stderr.log').write_bytes(stderr)
receipt = {'command': command, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
           'exitCode': child.returncode, 'timeout': timed_out, 'wallSeconds': wall,
           'totalActualChildWallSeconds': prior + wall}
(root / 'targets.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(stdout.decode() + stderr.decode())
print(json.dumps(receipt, indent=2))
