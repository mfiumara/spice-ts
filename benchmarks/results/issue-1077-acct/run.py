"""Run via spice-heavy. No aggregate refresh; no production candidate."""
import gzip
import hashlib
import json
from pathlib import Path
import platform
import subprocess
import time

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[2]
FIXTURES = {
    'ngspice': ROOT / 'benchmarks/corpus/ngspice/fixtures/tests/general/mosamp.cir',
    'classic': ROOT / 'benchmarks/corpus/classic/fixtures/spice3f5/mosamp2.cir',
}

def invoke(args, name):
    start = time.perf_counter()
    proc = subprocess.run(args, cwd=ROOT, capture_output=True, timeout=180)
    wall = (time.perf_counter() - start) * 1000
    (OUT / (name + '.log.gz')).write_bytes(gzip.compress(proc.stdout + proc.stderr, mtime=0))
    assert proc.returncode == 0, (name, proc.returncode)
    return wall

host: dict = dict(base=subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
            platform=platform.platform(), node=subprocess.check_output(['node', '--version'], text=True).strip(),
            ngspice=subprocess.check_output(['ngspice', '--version'], text=True).strip(), inputs={})
for key, path in FIXTURES.items():
    data = path.read_bytes()
    # Bookkeeping-only change, and exactly the SAME bytes to both engines.
    acct = data.replace(b'noacct', b'acct')
    (OUT / (key + '-acct.cir')).write_bytes(acct)
    host['inputs'][key] = dict(path=str(path.relative_to(ROOT)), originalSha256=hashlib.sha256(data).hexdigest(),
                               accountingSha256=hashlib.sha256(acct).hexdigest())
(OUT / 'host.json').write_text(json.dumps(host, indent=2) + '\n')
receipts = []
for run in range(5):
    for key, original in FIXTURES.items():
        for engine in (['js', 'native'] if run % 2 == 0 else ['native', 'js']):
            name = f'{key}-{engine}-cold-{run}'
            args = ['node', str(OUT / 'worker.mjs'), str(original), 'cold', str(OUT / (name + '.json'))] if engine == 'js' else ['ngspice', '-n', '-b', '-r', str(OUT / 'temporary.raw'), str(original)]
            wall = invoke(args, name)
            receipts.append(dict(fixture=key, engine=engine, run=run, wallMs=wall))
            (OUT / 'wall.json').write_text(json.dumps(receipts, indent=2) + '\n')
for key in FIXTURES:
    deck = OUT / (key + '-acct.cir')
    invoke(['ngspice', '-n', '-b', '-r', str(OUT / 'temporary.raw'), str(deck)], key + '-acct')
    for mode in ['cold', 'warm', 'profile']:
        name = f'{key}-{mode}'
        invoke(['node', str(OUT / 'worker.mjs'), str(deck), mode, str(OUT / (name + '.json'))], name)
        profile = OUT / (name + '.json.cpuprofile')
        if profile.exists():
            profile.with_suffix(profile.suffix + '.gz').write_bytes(gzip.compress(profile.read_bytes(), mtime=0))
            profile.unlink()
for run in range(5):
    for key in FIXTURES:
        deck = OUT / (key + '-acct.cir')
        for mode in (['cold', 'instrumented'] if run % 2 == 0 else ['instrumented', 'cold']):
            name = f'{key}-diagnostic-{mode}-{run}'
            invoke(['node', str(OUT / 'worker.mjs'), str(deck), mode, str(OUT / (name + '.json'))], name)
(OUT / 'temporary.raw').unlink(missing_ok=True)
print('Finished 20 interleaved cold walls; shared accounting diagnostics and warm JS controls.')
