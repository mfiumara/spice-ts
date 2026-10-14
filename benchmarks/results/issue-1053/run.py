"""Serial ten-round engine matrix and separate diagnostic runs. Use spice-heavy."""
import gzip
import json
import os
from pathlib import Path
import subprocess
import sys
import time

out = Path(sys.argv[1]).resolve()
root = Path.cwd()
subprocess.run(['node', 'benchmarks/results/issue-1053/prepare.mjs', str(out)], check=True)
cells = [(d['circuit'], d['size']) for d in json.loads((out / 'prepared.json').read_text())['decks']]
plan = [(r + 1, c, s, m) for r in range(10) for c, s in cells for m in (['control', 'ngspice'] if r % 2 == 0 else ['ngspice', 'control'])]
plan += [(0, 'cmos-inverter-chain-tran', s, 'instrumented') for s in [1000, 10000]]
host = dict(node=subprocess.check_output(['node', '--version'], text=True).strip(), ngspice=subprocess.check_output(['ngspice', '--version'], text=True), uname=list(os.uname()), planned=len(plan))
(out / 'host.json').write_text(json.dumps(host, indent=2) + '\n')
with (out / 'receipts.jsonl').open('x') as journal:
    for r, c, s, mode in plan:
        id = f'{r:02d}-{c}-{s}-{mode}'
        start = time.monotonic_ns()
        before = os.getloadavg()
        child = subprocess.run(['node', 'benchmarks/results/issue-1053/worker.mjs', mode, str(out), id, c, str(s)], capture_output=True, text=True, timeout=120, env={**os.environ, 'HOME': str(out)})
        row = dict(id=id, round=r, elapsedMs=(time.monotonic_ns() - start) / 1e6, beforeLoad=before, afterLoad=os.getloadavg(), code=child.returncode)
        (out / (id + '.worker.stdout.gz')).write_bytes(gzip.compress(child.stdout.encode(), mtime=0))
        (out / (id + '.worker.stderr.gz')).write_bytes(gzip.compress(child.stderr.encode(), mtime=0))
        if child.returncode != 0:
            journal.write(json.dumps(row) + '\n'); journal.flush()
            raise RuntimeError(id + ': ' + child.stderr)
        row['worker'] = json.loads(child.stdout)
        journal.write(json.dumps(row) + '\n'); journal.flush(); os.fsync(journal.fileno())
        for suffix in ['stdout.txt', 'stderr.txt', 'raw']:
            file = out / (id + '.' + suffix)
            if file.exists():
                (out / (id + '.' + suffix + '.gz')).write_bytes(gzip.compress(file.read_bytes(), mtime=0))
                file.unlink()
        print(id, row['elapsedMs'], flush=True)
(out / 'completed.json').write_text(json.dumps({'completed': len(plan)}) + '\n')
