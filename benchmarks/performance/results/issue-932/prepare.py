"""Build independent frozen-main and local controls, plus ignored diagnostic copy."""
from pathlib import Path
import hashlib
import json
import subprocess
import tarfile
import io
import shutil

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[3]
def run(args):
    subprocess.run(args, cwd=ROOT, check=True)
# Actual archive revision recorded in host.json. Shared origin/main advanced
# after the initial fetch but before the first build; do not rewrite provenance.
revision = 'e1597e192c26a231dd576c668524d887b6e63844'
archive = subprocess.check_output(['git', 'archive', revision, 'packages/core/src'], cwd=ROOT)
for name in ['baseline-src', 'diagnostic-src']:
    directory = OUT / name
    if directory.exists():
        shutil.rmtree(directory)  # Only these two ignored generated trees.
    directory.mkdir(exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        tar.extractall(directory, filter='data')
    (directory / 'entry.mjs').write_text("export {simulate} from './packages/core/src/simulate.ts';\nexport {GilbertPeierlsSolver} from './packages/core/src/solver/gilbert-peierls.ts';\n")
solver = OUT / 'diagnostic-src/packages/core/src/solver/gilbert-peierls.ts'
source = solver.read_text()
changes = [
    ('  private readonly pivotThreshold = 0.1;', '  phase932 = { touchesMs: 0, triangularMs: 0, rowsMs: 0, touchesCpuUs: 0, triangularCpuUs: 0, rowsCpuUs: 0, calls: 0 };\n  private readonly pivotThreshold = 0.1;'),
    ('    // First touches, in the order applying column `first` alone would make them.', '    const phaseStart932 = performance.now(), cpuStart932 = process.cpuUsage();\n    // First touches, in the order applying column `first` alone would make them.'),
    ('    // Triangular part: U entries of the members and their mutual updates.', '    const triangularStart932 = performance.now(), cpuTri932 = process.cpuUsage();\n    this.phase932.touchesMs += triangularStart932 - phaseStart932;\n    this.phase932.touchesCpuUs += cpuTri932.user + cpuTri932.system - cpuStart932.user - cpuStart932.system;\n    // Triangular part: U entries of the members and their mutual updates.'),
    ('    // Rows below the supernode. Each row is one dependent chain of', '    const rowsStart932 = performance.now(), cpuRows932 = process.cpuUsage();\n    this.phase932.triangularMs += rowsStart932 - triangularStart932;\n    this.phase932.triangularCpuUs += cpuRows932.user + cpuRows932.system - cpuTri932.user - cpuTri932.system;\n    // Rows below the supernode. Each row is one dependent chain of'),
    ('    state[2] = activeCount;\n  }', '    state[2] = activeCount;\n    const cpuEnd932 = process.cpuUsage();\n    this.phase932.rowsMs += performance.now() - rowsStart932;\n    this.phase932.rowsCpuUs += cpuEnd932.user + cpuEnd932.system - cpuRows932.user - cpuRows932.system;\n    this.phase932.calls++;\n  }'),
]
for before, after in changes:
    assert source.count(before) == 1, before
    source = source.replace(before, after)
solver.write_text(source)
for name, entry in [('baseline','baseline-src/entry.mjs'), ('diagnostic','diagnostic-src/entry.mjs'), ('control','entry.mjs')]:
    run(['pnpm','-C','packages/core','exec','esbuild',str(OUT / entry),'--bundle','--platform=node','--format=esm','--target=es2022','--external:eecircuit-engine', '--outfile='+str(OUT / (name+'.mjs'))])
paths = [OUT / (name+'.mjs') for name in ['baseline','control','diagnostic']]
manifest = {'baselineRevision': revision, 'localRevision': subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(), 'solverSha256': hashlib.sha256((ROOT/'packages/core/src/solver/gilbert-peierls.ts').read_bytes()).hexdigest(), 'bundles': {p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}, 'instrumentation': changes}
(OUT/'build.json').write_text(json.dumps(manifest,indent=2)+'\n')
source_hashes = {}
differences = []
for frozen in sorted((OUT/'baseline-src/packages/core/src').rglob('*')):
    if not frozen.is_file():
        continue
    relative = frozen.relative_to(OUT/'baseline-src')
    local = ROOT/relative
    frozen_hash = hashlib.sha256(frozen.read_bytes()).hexdigest()
    local_hash = hashlib.sha256(local.read_bytes()).hexdigest() if local.exists() else None
    if frozen_hash != local_hash:
        differences.append({'path':str(relative),'baselineSha256':frozen_hash,'localSha256':local_hash})
    source_hashes[str(relative)] = frozen_hash
solver_path = 'packages/core/src/solver/gilbert-peierls.ts'
assert source_hashes[solver_path] == manifest['solverSha256']
(OUT/'source-identity.json').write_text(json.dumps({'baselineRevision':revision,'localRevision':manifest['localRevision'],'solverIdentical':True,'allCoreSourceFilesIdentical':not differences,'differences':differences,'baselineFiles':source_hashes},indent=2)+'\n')
