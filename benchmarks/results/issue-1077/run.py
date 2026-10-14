"""Sequential unchanged-input cold runs and persistent-process warm runs.
Run only through spice-heavy. Warm native runs use a headless PTY for flushing.
Receipt = fixture, engine, mode, run, elapsed wall ms, output path.
"""
import hashlib
import json
import os
from pathlib import Path
import platform
import pty
import select
import subprocess

import time

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
FIXTURES = {
    'ngspice': ROOT / 'benchmarks/corpus/ngspice/fixtures/tests/general/mosamp.cir',
    'classic': ROOT / 'benchmarks/corpus/classic/fixtures/spice3f5/mosamp2.cir',
}
receipts = []

def save():
    (OUT / 'wall.json').write_text(json.dumps(receipts, indent=2) + '\n')

def invoke(command, log):
    start = time.perf_counter()
    result = subprocess.run(command, cwd=ROOT, capture_output=True, timeout=180)
    wall = (time.perf_counter() - start) * 1000
    (OUT / log).write_bytes(result.stdout + result.stderr)
    if result.returncode:
        raise RuntimeError((command, result.returncode, log))
    return wall

(OUT / 'host.json').write_text(json.dumps({
    'platform': platform.platform(), 'machine': platform.machine(),
    'node': subprocess.check_output(['node', '--version'], text=True).strip(),
    'ngspice': subprocess.check_output(['ngspice', '--version'], text=True).strip(),
    'base': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
    'inputs': {key: hashlib.sha256(path.read_bytes()).hexdigest() for key, path in FIXTURES.items()},
}, indent=2) + '\n')
for run in range(5):
    for key, deck in FIXTURES.items():
        for engine in (['spice-ts', 'ngspice'] if run % 2 == 0 else ['ngspice', 'spice-ts']):
            name = f'{key}-{engine}-cold-{run}'
            if engine == 'spice-ts':
                command = ['node', str(OUT / 'worker.mjs'), str(deck), 'cold', str(OUT / (name + '.json'))]
            else:
                command = ['ngspice', '-n', '-b', '-r', str(OUT / (name + '.raw')), str(deck)]
            wall = invoke(command, name + '.log')
            receipts.append(dict(fixture=key, engine=engine, mode='cold-process', run=run,
                                 wallMs=wall, command=command, log=name + '.log'))
            save()
for key, deck in FIXTURES.items():
    name = f'{key}-spice-ts-warm'
    invoke(['node', str(OUT / 'worker.mjs'), str(deck), 'warm', str(OUT / (name + '.json'))], name + '.log')
    master, slave = pty.openpty()
    warm_deck = OUT / (key + '-warm.cir')
    control = '.control\nrepeat 6\necho START1077\nrun\necho STOP1077\nrusage all\necho ACCT1077\nend\nquit\n.endc\n'
    warm_deck.write_text(deck.read_text().replace('.end', control + '.end'))
    proc = subprocess.Popen(['ngspice', '-n', '-b', str(warm_deck)], stdout=slave, stderr=slave, cwd=ROOT)
    os.close(slave)
    buffer = b''
    def read_to(marker):
        global buffer
        deadline = time.perf_counter() + 180
        while marker not in buffer:
            if time.perf_counter() > deadline:
                raise TimeoutError(buffer.decode(errors='replace'))
            ready, _, _ = select.select([master], [], [], 1)
            if ready:
                buffer += os.read(master, 65536)
        output, buffer = buffer.split(marker, 1)
        return output + marker
    try:
        for run in range(6):
            prefix = read_to(b'START1077')
            start = time.perf_counter()
            output = read_to(b'STOP1077')
            wall = (time.perf_counter() - start) * 1000
            accounting = read_to(b'ACCT1077')
            name = f'{key}-ngspice-warm-{run}'
            (OUT / (name + '.log')).write_bytes(prefix + output + accounting)
            receipts.append(dict(fixture=key, engine='ngspice', mode='warm-control-run', run=run,
                                 wallMs=wall, log=name + '.log'))
            save()
    finally:
        proc.terminate()
        proc.wait(timeout=10)
        os.close(master)
    # Accounting-only control: only replace noacct with acct. Never headline timing.
    diag = OUT / (key + '-acct.cir')
    diag.write_text(deck.read_text().replace('noacct', 'acct'))
    invoke(['ngspice', '-n', '-b', '-r', str(OUT / (key + '-acct.raw')), str(diag)], key + '-acct.log')
    for mode in ['profile', 'split']:
        name = key + '-' + mode
        invoke(['node', str(OUT / 'worker.mjs'), str(deck), mode, str(OUT / (name + '.json'))], name + '.log')
print('Completed', len(receipts), 'wall receipts; warm JS rows live in separate JSON files.')
