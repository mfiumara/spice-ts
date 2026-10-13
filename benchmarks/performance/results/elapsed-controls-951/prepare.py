"""Freeze literal current-main SHA, build source-identical uninstrumented controls."""
from pathlib import Path
import hashlib
import io
import json
import subprocess
import tarfile

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[3]
BASELINE = '45650391b788c91084b6b472dbe1fdcefbd52a19'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    if (OUT / 'build.json').exists():
        raise RuntimeError('preserve prepared artifact; no overwrite')
    archive = subprocess.check_output(['git', 'archive', BASELINE, 'packages/core/src'], cwd=ROOT)
    frozen = OUT / 'baseline-src'
    frozen.mkdir(exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        # Python 3.9 has no extraction filter. Only regular git source files
        # and relative directories are permitted, never links or traversal.
        for member in tar.getmembers():
            path = Path(member.name)
            assert not path.is_absolute() and '..' not in path.parts
            assert member.isfile() or member.isdir()
        tar.extractall(frozen)
    entry = "export {simulate} from './packages/core/src/simulate.ts';\nexport {GilbertPeierlsSolver} from './packages/core/src/solver/gilbert-peierls.ts';\n"
    (frozen / 'entry.mjs').write_text(entry)
    (OUT / 'entry.mjs').write_text("export {simulate} from '../../../../packages/core/src/simulate.ts';\nexport {GilbertPeierlsSolver} from '../../../../packages/core/src/solver/gilbert-peierls.ts';\n")
    hashes = {}
    for path in sorted((frozen / 'packages/core/src').rglob('*')):
        if path.is_file():
            relative = path.relative_to(frozen)
            assert path.read_bytes() == (ROOT / relative).read_bytes(), str(relative)
            hashes[str(relative)] = sha(path)
    for name, path in [('baseline', frozen / 'entry.mjs'), ('control', OUT / 'entry.mjs')]:
        subprocess.run(['pnpm', '-C', 'packages/core', 'exec', 'esbuild', str(path), '--bundle', '--platform=node', '--format=esm', '--target=es2022', '--external:eecircuit-engine', '--outfile=' + str(OUT / (name + '.mjs'))], cwd=ROOT, check=True)
    normalized = lambda name: '\n'.join(line for line in (OUT / name).read_text().splitlines() if not line.startswith('// '))
    assert normalized('baseline.mjs') == normalized('control.mjs')
    inputs = [ROOT / 'benchmarks/performance/scaling-m2-fixture.mjs', OUT.parent / 'issue-938/worker.mjs', OUT.parent / 'issue-938/build.json', *sorted((OUT.parent / 'issue-919/profiles').glob('*.matrix.gz'))]
    manifest = dict(baselineRevision=BASELINE, coreSourcesIdentical=True, sourceHashes=hashes,
                    bundles={name: sha(OUT / (name + '.mjs')) for name in ('baseline', 'control')},
                    immutableInputs={str(p.relative_to(ROOT)): sha(p) for p in inputs})
    (OUT / 'build.json').write_text(json.dumps(manifest, indent=2) + '\n')


if __name__ == '__main__':
    main()
