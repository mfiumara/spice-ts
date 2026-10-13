"""Fixed 72-child diagnostic/control experiment. Invoke only through spice-heavy."""
from pathlib import Path
import hashlib
import json
import os
import platform
import signal
import subprocess
import time
from typing import Any

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[3]
DEADLINE = 45.0
BUDGET = 900.0

def command(args):
    return subprocess.check_output(args, cwd=ROOT, text=True).strip()
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    if (OUT / 'samples.jsonl').exists():
        raise RuntimeError('fixed experiment already has receipts; do not rerun/erase')
    (OUT / 'logs').mkdir(exist_ok=True)
    captures = sorted((OUT.parent / 'issue-919/profiles').glob('*.matrix.gz'))
    host = {'node': command(['node','--version']), 'pnpm':command(['pnpm','--version']),
      'os':platform.platform(), 'cpu':command(['sysctl','-n','machdep.cpu.brand_string']),
      'ramBytes':command(['sysctl','-n','hw.memsize']), 'loadStart':command(['uptime']),
      'baselineRevision':json.loads((OUT/'build.json').read_text())['baselineRevision'],
      'deadlineSeconds':DEADLINE, 'childWallBudgetSeconds':BUDGET,
      'captureHashes':{p.name:sha(p) for p in captures}}
    (OUT/'host.json').write_text(json.dumps(host,indent=2)+'\n')
    plan = []
    for repeat in range(3):
        for size in [1000,10000,50000]:
            for variant in (['baseline','diagnostic'] if repeat % 2 == 0 else ['diagnostic','baseline']):
                plan.append(('isolate','resistor-mesh-op',size,repeat,variant))
    for repeat in range(3):
        for size in [1000,10000,50000]:
            for circuit in ['rc-ladder-tran','resistor-mesh-op','cmos-inverter-chain-tran']:
                for variant in (['baseline','control'] if repeat % 2 == 0 else ['control','baseline']):
                    plan.append(('simulate',circuit,size,repeat,variant))
    assert len(plan) == 72
    used = 0.0
    with (OUT/'samples.jsonl').open('w') as journal:
        for mode,circuit,size,repeat,variant in plan:
            key = f'{mode}-{circuit}-{size}-{repeat}-{variant}'
            phasefile = OUT/'logs'/(key+'.jsonl')
            argv = [command(['which','node']),str(OUT/'worker.mjs'),mode,str(OUT/(variant+'.mjs')),circuit,str(size),str(phasefile)]
            row: dict[str, Any] = dict(mode=mode,circuit=circuit,size=size,repeat=repeat,variant=variant,argv=argv,phases=[])
            if used + DEADLINE + 1 > BUDGET:
                row.update(status='budget-skipped',childWallMs=0)
            else:
                start = time.monotonic()
                child = subprocess.Popen(argv,cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,start_new_session=True)
                row['pid'] = child.pid
                try:
                    stdout,stderr = child.communicate(timeout=DEADLINE)
                    row['status'] = 'ok' if child.returncode == 0 else 'failed'
                except subprocess.TimeoutExpired:
                    os.killpg(child.pid,signal.SIGKILL)
                    stdout,stderr = child.communicate()
                    row['status'] = 'timeout'
                elapsed = time.monotonic()-start
                used += elapsed
                row.update(childWallMs=elapsed*1000,exit=child.returncode,cumulativeChildWallSeconds=used)
                try:
                    os.killpg(child.pid,0)
                except ProcessLookupError:
                    row['processGroupGone'] = True
                else:
                    os.killpg(child.pid,signal.SIGKILL)
                    raise RuntimeError('surviving owned process group')
                (OUT/'logs'/(key+'.stdout.txt')).write_text(stdout)
                (OUT/'logs'/(key+'.stderr.txt')).write_text(stderr)
                if phasefile.exists():
                    row['phases'] = [json.loads(line) for line in phasefile.read_text().splitlines()]
            journal.write(json.dumps(row)+'\n'); journal.flush()
            print(key,row['status'],f'{used:.3f}s cumulative child wall',flush=True)
    assert used <= BUDGET
    (OUT/'budget.json').write_text(json.dumps({'planned':len(plan),'totalChildWallSeconds':used,'limitSeconds':BUDGET,'allStartedProcessGroupsGone':True,'loadEnd':command(['uptime'])},indent=2)+'\n')

if __name__ == '__main__':
    main()
