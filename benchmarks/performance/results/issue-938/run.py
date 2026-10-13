"""One fixed 72-child matrix. Invoke only through spice-heavy. No retries."""
from pathlib import Path
import hashlib
import json
import os
import platform
import signal
import subprocess
import time

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[3]
DEADLINE = 45.0
BUDGET = 900.0

def command(args):
    return subprocess.check_output(args, cwd=ROOT, text=True).strip()

def main():
    if (OUT / 'samples.jsonl').exists():
        raise RuntimeError('experiment already has receipts; no rerun or erasure')
    (OUT / 'logs').mkdir(exist_ok=True)
    captures = sorted((OUT.parent / 'issue-919/profiles').glob('*.matrix.gz'))
    host = {'node': command(['node', '--version']), 'pnpm': command(['pnpm', '--version']),
      'os': platform.platform(), 'cpu': command(['sysctl', '-n', 'machdep.cpu.brand_string']),
      'ramBytes': command(['sysctl', '-n', 'hw.memsize']), 'loadStart': command(['uptime']),
      'baselineRevision': json.loads((OUT / 'build.json').read_text())['baselineRevision'],
      'deadlineSeconds': DEADLINE, 'childWallBudgetSeconds': BUDGET,
      'priorRecovery': 'No prior issue-938 receipts or WIP found. Previous reclaimed runs have no available measured child wall; not asserted as zero.',
      'captureHashes': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in captures}}
    (OUT / 'host.json').write_text(json.dumps(host, indent=2) + '\n')
    plan = []
    for repeat in range(3):
        for size in [1000, 10000, 50000]:
            for variant in (['baseline', 'sampled'] if repeat % 2 == 0 else ['sampled', 'baseline']):
                plan.append(('isolate', 'resistor-mesh-op', size, repeat, variant))
    for repeat in range(3):
        for size in [1000, 10000, 50000]:
            for circuit in ['rc-ladder-tran', 'resistor-mesh-op', 'cmos-inverter-chain-tran']:
                for variant in (['baseline', 'control'] if repeat % 2 == 0 else ['control', 'baseline']):
                    plan.append(('simulate', circuit, size, repeat, variant))
    assert len(plan) == 72
    used = 0.0
    child = None
    def interrupted(signum, frame):
        if child is not None and child.poll() is None:
            os.killpg(child.pid, signal.SIGKILL)
            child.wait()
        raise SystemExit(128 + signum)
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    with (OUT / 'samples.jsonl').open('x') as journal:
        for mode, circuit, size, repeat, variant in plan:
            key = f'{mode}-{circuit}-{size}-{repeat}-{variant}'
            phasefile = OUT / 'logs' / (key + '.jsonl')
            bundle = 'baseline' if variant == 'sampled' else variant
            argv = [command(['which', 'node']), str(OUT / 'worker.mjs'), mode, str(OUT / (bundle + '.mjs')), circuit, str(size), str(phasefile), variant]
            row = dict(mode=mode, circuit=circuit, size=size, repeat=repeat, variant=variant, argv=argv, phases=[])
            if used + DEADLINE + 1 > BUDGET:
                row.update(status='budget-skipped', childWallMs=0)
            else:
                start = time.monotonic()
                child = subprocess.Popen(argv, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True)
                # Durable ownership before waiting, including an interrupted parent.
                with (OUT / 'ownership.jsonl').open('a') as ownership:
                    ownership.write(json.dumps({'key': key, 'pid': child.pid, 'argv': argv}) + '\n')
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
                    raise RuntimeError('surviving owned process group')
                (OUT / 'logs' / (key + '.stdout.txt')).write_text(stdout)
                (OUT / 'logs' / (key + '.stderr.txt')).write_text(stderr)
                if phasefile.exists():
                    row['phases'] = [json.loads(line) for line in phasefile.read_text().splitlines()]
                child = None
            journal.write(json.dumps(row) + '\n'); journal.flush()
            print(key, row['status'], f'{used:.3f}s cumulative child wall', flush=True)
    assert used <= BUDGET
    (OUT / 'budget.json').write_text(json.dumps({'planned': len(plan), 'totalChildWallSeconds': used, 'limitSeconds': BUDGET, 'allStartedProcessGroupsGone': True, 'loadEnd': command(['uptime'])}, indent=2) + '\n')

if __name__ == '__main__':
    main()
