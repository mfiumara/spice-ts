"""Generate native baseline/E1 and isolated copies for TS patches. Run via spice-heavy."""
from pathlib import Path
import gzip
import hashlib
import json
import os
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[2]
WORK = ROOT / 'work'
WORK.mkdir(exist_ok=True)
manifest = json.loads((REPO/'benchmarks/corpus/corpus-k/manifest.json').read_text())
cases = {}
for id in ['k-13', 'k-10', 'k-15']:
    circuit = next(c for c in manifest['circuits'] if c['id'] == id)
    deck = (REPO/circuit['localPath']).read_bytes()
    assert hashlib.sha256(deck).hexdigest() == circuit['sha256']
    cases[id] = deck
cases['mosamp2'] = (REPO/'benchmarks/corpus/classic/fixtures/spice3f5/mosamp2.cir').read_bytes()
for method in ['trap', 'gear']:
    for order in [1, 2]:
        cases[f'rc-{method}-{order}'] = f'''MAXORD RC regression (project authored, MIT)
V1 in 0 PULSE(0 1 0 1n 1n 1m 2m)
R1 in out 1k
C1 out 0 1n
.options method={method} maxord={order}
.tran 20n 1u
.end
'''.encode()
for id, deck in cases.items():
    (WORK/f'{id}.cir').write_bytes(deck)
for variant, patch in [('e2', 'e2-local-limiting.patch'), ('e2-first', 'e2-first-iteration.patch'), ('e3', 'e3-loaded-charge.patch')]:
    dest = WORK/variant
    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(REPO/'packages/core/src', dest/'src')
    (dest/'package.json').write_text('{"type":"module"}\n')
    subprocess.run(['git', 'apply', '--unsafe-paths', str(ROOT/patch)], cwd=dest, check=True)
    changed_file = 'analysis/transient-step.ts' if variant == 'e2-first' else 'devices/mos2.ts'
    (ROOT/f'{variant}-patch-proof.json').write_text(json.dumps({
        'changedFileInPrivateCopy': changed_file,
        'originalSha256': hashlib.sha256((REPO/'packages/core/src'/changed_file).read_bytes()).hexdigest(),
        'patchedSha256': hashlib.sha256((dest/'src'/changed_file).read_bytes()).hexdigest(),
        'patchSha256': hashlib.sha256((ROOT/patch).read_bytes()).hexdigest(),
        'productionFilesEdited': False}, indent=2)+'\n')
if '--copies-only' in sys.argv:
    sys.exit(0)
home = WORK/'home'
home.mkdir(exist_ok=True)
(home/'.spiceinit').write_text('set filetype=ascii\n')
binary = REPO/'evidence/1019/native-build/src/ngspice'
assert binary.is_file()
for variant in ['baseline', 'e1']:
    env = dict(os.environ, HOME=str(home))
    env.pop('MOS2_NO_BYPASS', None)
    if variant == 'e1':
        env['MOS2_NO_BYPASS'] = '1'
    for id in cases:
        env.pop('MOS2_TRACE', None)
        if id == 'k-13':
            env['MOS2_TRACE'] = '1'
        prefix = WORK/f'{variant}-{id}'
        with prefix.with_suffix('.log').open('wb') as log:
            subprocess.run([str(binary), '-b', '-r', str(prefix.with_suffix('.raw')), str(WORK/f'{id}.cir')],
                           env=env, stdout=log, stderr=log, check=True)
        (ROOT/f'{variant}-{id}.raw.gz').write_bytes(gzip.compress(prefix.with_suffix('.raw').read_bytes(), mtime=0))
        (ROOT/f'{variant}-{id}.log.gz').write_bytes(gzip.compress(prefix.with_suffix('.log').read_bytes(), mtime=0))
        print(variant, id, flush=True)
(ROOT/'inputs.json').write_text(json.dumps({id: hashlib.sha256(deck).hexdigest() for id, deck in cases.items()}, indent=2)+'\n')
