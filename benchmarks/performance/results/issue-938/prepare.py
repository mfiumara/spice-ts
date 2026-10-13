"""Immutable baseline, byte-identical local control, no solver instrumentation."""
from pathlib import Path
import hashlib
import io
import json
import subprocess
import tarfile

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[3]
BASELINE = 'a58cfe6c2edb7ac5a408a07f77575b0c181b226f'

def main():
    if (OUT / 'build.json').exists():
        raise RuntimeError('preparation already exists; preserve immutable experiment')
    archive = subprocess.check_output(['git', 'archive', BASELINE, 'packages/core/src'], cwd=ROOT)
    directory = OUT / 'baseline-src'
    directory.mkdir(exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        tar.extractall(directory, filter='data')
    (directory / 'entry.mjs').write_text("export {simulate} from './packages/core/src/simulate.ts';\nexport {GilbertPeierlsSolver} from './packages/core/src/solver/gilbert-peierls.ts';\n")
    hashes = {}
    for frozen in sorted((directory / 'packages/core/src').rglob('*')):
        if frozen.is_file():
            relative = frozen.relative_to(directory)
            local = ROOT / relative
            assert frozen.read_bytes() == local.read_bytes(), str(relative)
            hashes[str(relative)] = hashlib.sha256(frozen.read_bytes()).hexdigest()
    for name, entry in [('baseline', directory / 'entry.mjs'), ('control', OUT / 'entry.mjs')]:
        subprocess.run(['pnpm', '-C', 'packages/core', 'exec', 'esbuild', str(entry), '--bundle', '--platform=node', '--format=esm', '--target=es2022', '--external:eecircuit-engine', '--outfile=' + str(OUT / (name + '.mjs'))], cwd=ROOT, check=True)
    # esbuild changes only the path comment between these two identical source trees.
    baseline = (OUT / 'baseline.mjs').read_text()
    control = (OUT / 'control.mjs').read_text()
    def without_comments(source):
        return '\n'.join(line for line in source.splitlines() if not line.startswith('// '))
    assert without_comments(baseline) == without_comments(control)
    start = baseline.index('  applySupernode(first, last, settled, dormant) {')
    end = baseline.index('  refactorWithPivots(', start)
    # Ranges are generated from exact executable anchors, not guessed source-map lines.
    anchors = [
        ('touches', '    let nonzeroCount = state[1];'),
        ('triangular', '    let up = state[0];'),
        ('rowSetup', '    let activeCount = state[2];'),
        ('groupSetup', '    for (; r + 4 <= below; r += 4) {'),
        ('checked', '      for (; t < count2; t++) {'),
        ('dense', '      if (allApplied) {'),
        ('rowWriteback', '      workspace[row0] = v0;'),
        ('tail', '    for (; r < below; r++) {'),
        ('finish', '    state[2] = activeCount;'),
    ]
    ranges = []
    for name, anchor in anchors:
        position = baseline.index(anchor, start, end)
        ranges.append({'name': name, 'firstLine': baseline.count('\n', 0, position) + 1})
    for i, region in enumerate(ranges):
        region['lastLine'] = ranges[i + 1]['firstLine'] - 1 if i + 1 < len(ranges) else baseline.count('\n', 0, end)
    manifest = {'baselineRevision': BASELINE, 'localRevisionAtPreparation': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(), 'coreSourcesIdentical': True, 'sourceHashes': hashes, 'bundles': {name: hashlib.sha256((OUT / (name + '.mjs')).read_bytes()).hexdigest() for name in ['baseline', 'control']}, 'samplingIntervalUs': 500, 'ranges': ranges, 'applySupernodeFirstLine': baseline.count('\n', 0, start) + 1, 'applySupernodeLastLine': baseline.count('\n', 0, end)}
    (OUT / 'build.json').write_text(json.dumps(manifest, indent=2) + '\n')

if __name__ == '__main__':
    main()
