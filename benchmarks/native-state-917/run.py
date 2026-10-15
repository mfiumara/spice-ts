#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Compare production and the two previously rejected #1091 candidates.
Run only in an isolated worktree. Always restore production dc.ts.
"""
import gzip
import hashlib
import json
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
DC = ROOT / 'packages/core/src/analysis/dc.ts'
original = DC.read_bytes()
assert hashlib.sha256(original).hexdigest() == 'b47918b18b62b62e2c65847f5ecdc8925d21b711fcd12f119f35fa1f80a950fe'
receipts = []
try:
    for stage in ['baseline', 'source', 'optran']:
        DC.write_bytes(original)
        if stage != 'baseline':
            patch = ROOT / f'benchmarks/floating-island-recovery-917/{stage}-candidate.patch'
            subprocess.run(['git','apply','--check',str(patch)],cwd=ROOT,check=True)
            subprocess.run(['git','apply',str(patch)],cwd=ROOT,check=True)
        for label in ['base', 'variant', 'island']:
            output = HERE / '.work' / f'{label}-{stage}.json'
            cmd = ['pnpm','exec','tsx','benchmarks/native-state-917/probe.mts',label,str(output)]
            child = subprocess.run(cmd,cwd=ROOT,text=True,capture_output=True,timeout=240)
            (HERE/'.work'/f'{label}-{stage}.log').write_text(child.stdout+child.stderr)
            assert child.returncode == 0, child.stderr
            data = json.loads(output.read_text())
            with gzip.GzipFile(HERE/f'{label}-{stage}.json.gz','wb',mtime=0) as f:
                f.write(output.read_bytes())
            receipts.append(dict(stage=stage,label=label,command=cmd[:5]+['<receipt>'],exitCode=child.returncode,error=data['error'],factors=data['factors']))
finally:
    DC.write_bytes(original)
    assert DC.read_bytes() == original
(HERE/'ts-receipt.json').write_text(json.dumps(receipts,indent=2)+'\n')
print(json.dumps(receipts,indent=2))
