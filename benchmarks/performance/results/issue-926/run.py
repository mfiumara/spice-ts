"""One bounded matrix. Run only via spice-heavy; never launch wrapper children."""
import hashlib
import json
import os
from pathlib import Path
import platform
import signal
import subprocess
import time

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[3]
BUDGET = 900.0
DEADLINE = 45.0

def command(args):
    return subprocess.check_output(args, cwd=ROOT, text=True).strip()

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

# Generate byte-identical decks using the published MIT fixture, no tuning.
js = """import {m2Netlist,M2_CIRCUITS} from './benchmarks/performance/scaling-m2-fixture.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
const out=process.argv[1]; mkdirSync(out,{recursive:true});
for(const circuit of M2_CIRCUITS) for(const size of [1000,10000,50000]) {
const f=m2Netlist(circuit,size); writeFileSync(`${out}/${circuit}-${size}.cir`,f.netlist);
writeFileSync(`${out}/${circuit}-${size}.json`,JSON.stringify({probe:f.probe,actualNodes:f.actualNodes}));}
"""
subprocess.run(['node', '--input-type=module', '-e', js, str(OUT / 'decks')], cwd=ROOT, check=True)
node = command(['which', 'node'])
manifest = {variant: {p.name: sha(p) for p in sorted((OUT / variant).glob('*.js'))} for variant in ['baseline', 'candidate']}
(OUT / 'host.json').write_text(json.dumps({'baselineRevision': command(['git','rev-parse','HEAD']), 'node': command(['node','--version']), 'os': platform.platform(), 'cpu': command(['sysctl','-n','machdep.cpu.brand_string']), 'ramBytes': command(['sysctl','-n','hw.memsize']), 'loadStart': command(['uptime']), 'deadlineSeconds': DEADLINE, 'totalChildWallBudgetSeconds': BUDGET, 'bundles': manifest}, indent=2))
(OUT / 'logs').mkdir(exist_ok=True)
used = 0.0
planned = 0
with (OUT / 'samples.jsonl').open('w') as journal:
    for repeat in range(3):
        for size in [1000, 10000, 50000]:
            for circuit in ['rc-ladder-tran','resistor-mesh-op','cmos-inverter-chain-tran']:
                for mode in ['cold', 'warm']:
                    variants = ['baseline','candidate'] if repeat % 2 == 0 else ['candidate','baseline']
                    for variant in variants:
                        planned += 1
                        key = f'{circuit}-{size}-{mode}-{repeat}-{variant}'
                        deck = OUT / 'decks' / f'{circuit}-{size}.cir'
                        row = {'variant': variant, 'repeat': repeat, 'circuit': circuit, 'size': size, 'mode': mode, 'deckSha256': sha(deck), **json.loads(deck.with_suffix('.json').read_text())}
                        argv = [node, str(OUT / 'worker.mjs'), str(OUT / variant / 'index.js'), str(deck), mode]
                        row['argv'] = argv
                        # Reserve a full deadline plus termination overhead. Skips are not samples.
                        if used + DEADLINE + 1 > BUDGET:
                            row.update(status='budget-skipped', childWallMs=0)
                        else:
                            start = time.monotonic()
                            child = subprocess.Popen(argv, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True)
                            row['pid'] = child.pid
                            try:
                                stdout, stderr = child.communicate(timeout=DEADLINE)
                                row['status'] = 'ok' if child.returncode == 0 else 'failed'
                            except subprocess.TimeoutExpired:
                                os.killpg(child.pid, signal.SIGKILL)
                                stdout, stderr = child.communicate()
                                row['status'] = 'timeout'
                            elapsed = time.monotonic() - start
                            used += elapsed
                            row.update(childWallMs=elapsed * 1000, exit=child.returncode, cumulativeChildWallSeconds=used)
                            try:
                                os.killpg(child.pid, 0)
                            except ProcessLookupError:
                                row['processGroupGone'] = True
                            else:
                                os.killpg(child.pid, signal.SIGKILL)
                                raise RuntimeError('surviving process group after child exit')
                            (OUT / 'logs' / (key + '.stdout.txt')).write_text(stdout)
                            (OUT / 'logs' / (key + '.stderr.txt')).write_text(stderr)
                            if row['status'] == 'ok':
                                row.update(json.loads(stdout.splitlines()[-1]))
                        journal.write(json.dumps(row) + '\n')
                        journal.flush()
                        print(key, row['status'], row.get('simulateMs'), 'budget used', round(used, 3), flush=True)
assert planned == 108
assert used <= BUDGET
(OUT / 'budget.json').write_text(json.dumps({'planned': planned, 'totalChildWallSeconds': used, 'limitSeconds': BUDGET, 'loadEnd': command(['uptime']), 'allStartedProcessGroupsGone': True}, indent=2))
