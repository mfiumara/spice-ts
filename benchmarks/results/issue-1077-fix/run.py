"""Five cold processes per deck/engine/build, interleaved. Use spice-heavy.
Usage: run.py <phase> [baseline index.js]. With baseline, measure before/after.
"""
import hashlib
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
PHASES = {'before': sys.argv[2], 'after': str(ROOT / 'packages/core/dist/index.js')} if len(sys.argv) > 2 else {
    sys.argv[1]: str(ROOT / 'packages/core/dist/index.js'),
}
FIXTURES = {
    'ngspice': ROOT / 'benchmarks/corpus/ngspice/fixtures/tests/general/mosamp.cir',
    'classic': ROOT / 'benchmarks/corpus/classic/fixtures/spice3f5/mosamp2.cir',
}
receipts = {phase: [] for phase in PHASES}
for phase, core in PHASES.items():
    out = HERE / phase
    out.mkdir(parents=True, exist_ok=True)
    core_dir = Path(core).parent
    (out / 'host.json').write_text(json.dumps({
        'platform': platform.platform(), 'machine': platform.machine(),
        'node': subprocess.check_output(['node', '--version'], text=True).strip(),
        'ngspice': subprocess.check_output(['ngspice', '--version'], text=True).strip(),
        'base': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
        'diff': subprocess.check_output(['git', 'diff', '--', 'packages/core/src'], text=True) if phase != 'before' else '',
        'core': core,
        'buildHashes': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(core_dir.glob('*.js'))},
        'inputs': {key: hashlib.sha256(path.read_bytes()).hexdigest() for key, path in FIXTURES.items()},
    }, indent=2) + '\n')
for run in range(5):
    for key, deck in FIXTURES.items():
        phases = list(PHASES) if run % 2 == 0 else list(reversed(PHASES))
        for phase in phases:
            out = HERE / phase
            engines = ['spice-ts', 'ngspice'] if run % 2 == 0 else ['ngspice', 'spice-ts']
            for engine in engines:
                name = f'{key}-{engine}-{run}'
                command = (['node', str(HERE / 'worker.mjs'), str(deck), str(out / (name + '.json'))]
                           if engine == 'spice-ts' else
                           ['ngspice', '-n', '-b', '-r', str(out / (name + '.raw')), str(deck)])
                env = dict(os.environ, CORE1077=PHASES[phase])
                start = time.perf_counter()
                result = subprocess.run(command, cwd=ROOT, env=env, capture_output=True, timeout=180)
                wall = (time.perf_counter() - start) * 1000
                (out / (name + '.log')).write_bytes(result.stdout + result.stderr)
                if result.returncode:
                    raise RuntimeError((command, result.returncode, name))
                receipts[phase].append(dict(fixture=key, engine=engine, run=run, wallMs=wall,
                                           command=command, core=PHASES[phase], exitCode=result.returncode))
                (out / 'wall.json').write_text(json.dumps(receipts[phase], indent=2) + '\n')
                print(phase, name, wall, flush=True)
                if engine == 'ngspice':
                    (out / (name + '.raw')).unlink()
for phase, core in PHASES.items():
    for key, deck in FIXTURES.items():
        destination = HERE / phase / (key + '-profile.json')
        subprocess.run(['node', str(HERE / 'worker.mjs'), str(deck), str(destination), 'profile'],
                       cwd=ROOT, env=dict(os.environ, CORE1077=core), check=True, capture_output=True, timeout=180)
print('Completed', sum(map(len, receipts.values())), 'cold wall receipts and profiles.')
