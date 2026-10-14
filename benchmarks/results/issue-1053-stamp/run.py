"""Cold-process serial A/B, alternating order. Invoke only via spice-heavy."""
import gzip
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from typing import Any

out = Path(sys.argv[1]).resolve()
phase = sys.argv[2] if len(sys.argv) > 2 else 'ab'
if phase not in ('red', 'ab'):
    raise ValueError('unknown phase')
if (out / (phase + '-receipts.jsonl')).exists():
    raise ValueError('immutable journal; use a fresh output directory')
cells = json.loads((out / 'prepared.json').read_text())['decks']
plan = [(r + 1, d, m) for r in range(1 if phase == 'red' else 10) for d in cells for m in (['control'] if phase == 'red' else (['control', 'candidate'] if r % 2 == 0 else ['candidate', 'control']))]
(out / (phase + '-host.json')).write_text(json.dumps(dict(node=subprocess.check_output(['node', '--version'], text=True).strip(), uname=list(os.uname()), planned=len(plan)), indent=2) + '\n')
with (out / (phase + '-receipts.jsonl')).open('x') as journal:
    for r, d, mode in plan:
        ident = f"{phase}-{r:02d}-{d['circuit']}-{d['size']}-{mode}"
        start = time.monotonic_ns()
        before = os.getloadavg()
        child = subprocess.run(['node', 'benchmarks/results/issue-1053/worker.mjs', mode, str(out), ident, d['circuit'], str(d['size'])], capture_output=True, text=True, timeout=180)
        row: dict[str, Any] = dict(id=ident, round=r, elapsedMs=(time.monotonic_ns() - start) / 1e6, beforeLoad=before, afterLoad=os.getloadavg(), code=child.returncode)
        for suffix, text in [('stdout', child.stdout), ('stderr', child.stderr)]:
            (out / (ident + '.worker.' + suffix + '.gz')).write_bytes(gzip.compress(text.encode(), mtime=0))
        if child.returncode == 0:
            row['worker'] = json.loads(child.stdout)
        journal.write(json.dumps(row) + '\n'); journal.flush(); os.fsync(journal.fileno())
        if child.returncode != 0:
            raise RuntimeError(ident + ': ' + child.stderr)
        print(ident, row['worker']['phases']['api'], flush=True)
(out / (phase + '-completed.json')).write_text(json.dumps({'completed': len(plan)}) + '\n')
