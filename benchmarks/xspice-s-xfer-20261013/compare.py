# SPDX-License-Identifier: MIT
"""One bounded matrix. Run with spice-heavy python3 benchmarks/xspice-s-xfer-20261013/compare.py."""
import bisect
import hashlib
import gzip
import json
import math
import os
from pathlib import Path
import platform
import signal
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent.parent
BASE = subprocess.check_output(['git', 'rev-parse', '541cb5f3'], cwd=REPO, text=True).strip()
RUN = ROOT / '.run'
RUN.mkdir(exist_ok=True)
(RUN / '.spiceinit').write_text('set filetype=ascii\n')
START = time.monotonic()
PRIOR_BUDGET_CHARGE = 300  # conservative upper bound for the aborted raw-grid alignment attempt

def run(command, cwd=REPO):
    if time.monotonic() - START + PRIOR_BUDGET_CHARGE >= 900:
        return {'status': 'not-run', 'error': '900s cumulative matrix budget exhausted'}
    start = time.monotonic()
    process = subprocess.Popen(command, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    try:
        out, err = process.communicate(timeout=min(30, 900 - PRIOR_BUDGET_CHARGE - (start - START)))
        status = 'success' if process.returncode == 0 else 'failed'
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        out, err = process.communicate()
        status = 'timeout'
    return {'status': status, 'exit': process.returncode, 'wallMs': (time.monotonic() - start) * 1000,
            'command': list(map(str, command)), 'stdout': out.decode(errors='replace'), 'stderr': err.decode(errors='replace')}

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

# Isolated baseline source snapshot, inside this reservation. No second worktree or shared checkout writes.
baseline = RUN / 'baseline'
if not baseline.exists():
    baseline.mkdir()
    archive = subprocess.check_output(['git', 'archive', BASE, 'packages/core/src'], cwd=REPO)
    subprocess.run(['tar', '-xf', '-', '-C', str(baseline)], input=archive, check=True)

cases = []
def control(name, params, analysis, source='dc 1 ac 1', options=''):
    path = ROOT / f'{name}.cir'
    path.write_text('\n'.join(['s_xfer bounded contract', f'v1 in 0 {source}', 'a1 in out f',
                               f'.model f s_xfer({params})', 'r1 out 0 1k', options, analysis, '.end', '']))
    cases.append({'name': name, 'path': str(path), 'kind': 'MIT reduction'})

lp = 'num_coeff=[1] den_coeff=[1 1.414214 1] denormalized_freq=628'
control('op-ic', 'num_coeff=[2 3] den_coeff=[2 4 6] int_ic=[5 7] gain=3', '.op')
control('dc-zero', lp, '.dc v1 -1 1 0.5')
control('ac-lowpass', lp, '.ac dec 10 10 1000')
control('ac-bandpass', 'num_coeff=[1 0] den_coeff=[1 1e3 1e7] gain=1000', '.ac dec 10 10 10000')
control('tran-first', 'num_coeff=[1] den_coeff=[1 1] denormalized_freq=1000', '.tran 10u 1m', 'dc 1')
control('tran-second', lp, '.tran 10u 2m', 'dc 1')
control('tran-gear', lp, '.tran 10u 2m', 'dc 1', '.options method=gear')
control('tran-ic', 'num_coeff=[1] den_coeff=[1 1.414214 1] int_ic=[0.001 0.002] denormalized_freq=628', '.tran 10u 2m', 'dc 1')
manifest = json.loads((REPO / 'benchmarks/corpus/corpus-f/manifest.json').read_text())
historical = json.loads((REPO / 'benchmarks/corpus/corpus-f/outcomes.json').read_text())
selected = [r for r in manifest['circuits'] if 'analog_models2_' in r['sourcePath'] or r['sourcePath'].endswith('/various/x_fer.cir')]
assert len(selected) == 5
for row in selected:
    path = REPO / row['localPath']
    assert digest(path) == row['sha256']
    old = next(r for r in historical['fixtures'] if r['id'] == row['id'])
    cases.append({'name': row['id'], 'path': str(path), 'kind': 'unchanged original', 'manifest': row,
                  'historicalNgspice': old['ngspice']})

# Single ASCII raw plot, used only by the dot-analysis reductions. Original control plots stay unclaimed.
def samples(text):
    header, values = text.split('Values:\n', 1)
    count = int(header.split('No. Variables:')[1].splitlines()[0])
    variables = [line.split()[1] for line in header.split('Variables:\n')[1].splitlines() if line.strip()]
    out_index = variables.index('v(out)')
    tokens = [line.split()[-1] for line in values.splitlines() if line.strip()]
    complex_plot = 'Flags: complex' in header
    rows = [tokens[i:i+count] for i in range(0, len(tokens), count)]
    parse = lambda s: complex(*map(float, s.split(','))) if complex_plot else float(s)
    return [(parse(row[0]).real, parse(row[out_index])) for row in rows]

def errors(native, reference):
    sample = native.get('samples')
    if not sample or not reference: return None
    x, y = sample['x'], sample['y']
    assert len(x) == len(y)
    deviations, relative = [], []
    for t, expected in reference:
        if sample['kind'] == 'op': actual = y[0]
        else:
            if (t < x[0] and not math.isclose(t, x[0], rel_tol=1e-10, abs_tol=1e-15)) or (t > x[-1] and not math.isclose(t, x[-1], rel_tol=1e-10, abs_tol=1e-15)): continue
            i = min(bisect.bisect_left(x, t), len(x) - 1)
            if sample['kind'] == 'ac':
                i = min({i, max(0, i - 1)}, key=lambda j: abs(x[j] - t))
                assert math.isclose(x[i], t, rel_tol=1e-10)
                actual = complex(*y[i])
            elif i == 0 or math.isclose(x[i], t, rel_tol=1e-12, abs_tol=1e-18): actual = y[i]
            else: actual = y[i-1] + (y[i] - y[i-1]) * (t - x[i-1]) / (x[i] - x[i-1])
        deviations.append(abs(actual - expected))
        relative.append(abs(actual - expected) / max(abs(expected), 1e-12))
    if not deviations: return None
    return {'matchedPoints': len(deviations), 'referencePoints': len(reference),
            'maxAbsolute': max(deviations), 'rmsAbsolute': math.sqrt(sum(e*e for e in deviations)/len(deviations)),
            'maxRelative': max(relative), 'rmsRelative': math.sqrt(sum(e*e for e in relative)/len(relative)),
            'alignment': 'AC/DC exact coordinates; transient linear interpolation at reference times; relative floor 1e-12'}

def archive_references(report):
    directory = ROOT / 'reference'
    directory.mkdir(exist_ok=True)
    for row in report['fixtures']:
        raw = RUN / f"{row['name']}.raw"
        if raw.exists():
            row['reference']['rawSha256'] = digest(raw)
            (directory / f"{row['name']}.raw.gz").write_bytes(gzip.compress(raw.read_bytes(), mtime=0))
        else:
            row['reference']['rawSha256'] = None
            row['reference']['rawStatus'] = 'not exported; original .control analyses have no raw vectors from -r'
    report['sourceHashes'] = {path.name: digest(path) for path in (ROOT / 'source').iterdir() if path.is_file()}
    (ROOT / 'receipt.json').write_text(json.dumps(report, indent=2) + '\n')

if '--archive' in sys.argv:
    archive_references(json.loads((ROOT / 'receipt.json').read_text()))
    sys.exit(0)

if '--recompare' in sys.argv:
    report = json.loads((ROOT / 'receipt.json').read_text())
    for row in report['fixtures']:
        if row['kind'] == 'MIT reduction':
            reference = samples((RUN / f"{row['name']}.raw").read_text())
            for label in ['before', 'after']:
                row[label]['errors'] = errors(row[label].get('native', {}), reference)
    report['offlineRecomparison'] = 'nearest AC coordinate within 1e-10 relative tolerance, including rounded endpoints; no simulator rerun'
    (ROOT / 'receipt.json').write_text(json.dumps(report, indent=2) + '\n')
    sys.exit(0)

if '--repair-original-extraction' in sys.argv:
    report = json.loads((ROOT / 'receipt.json').read_text())
    row = next(row for row in report['fixtures'] if row['name'].endswith('x-fer-cir'))
    row['priorAfterExtractionFailure'] = row['after']
    receipt = run(['pnpm', 'exec', 'tsx', str(ROOT / 'worker.mts'), str(REPO / 'packages/core/src/simulate.ts'), row['path'], 'node2'])
    if receipt['status'] == 'success': receipt['native'] = json.loads(receipt['stdout'].splitlines()[-1])
    receipt['errors'] = None
    row['after'] = receipt
    report['extractionRepairWallSeconds'] = time.monotonic() - START
    report['extractionRepair'] = 'original has node2, not reduction node out; reference not rerun; original control comparison remains null'
    (ROOT / 'receipt.json').write_text(json.dumps(report, indent=2) + '\n')
    print(receipt)
    sys.exit(0)

receipts = []
for case in cases:
    path = Path(case['path'])
    before_hash = digest(path)
    raw = RUN / f"{case['name']}.raw"
    reference = run(['ngspice', '-b', '-r', str(raw), str(path)], RUN)
    reference_samples = None
    if case['kind'] == 'MIT reduction' and reference['status'] == 'success':
        reference_samples = samples(raw.read_text())
    engines = {}
    for label, module in [('before', baseline / 'packages/core/src/simulate.ts'), ('after', REPO / 'packages/core/src/simulate.ts')]:
        node = 'node2' if case['name'].endswith('x-fer-cir') else 'out'
        receipt = run(['pnpm', 'exec', 'tsx', str(ROOT / 'worker.mts'), str(module), str(path), node])
        if receipt['status'] == 'success':
            try: receipt['native'] = json.loads(receipt['stdout'].splitlines()[-1])
            except (ValueError, IndexError): receipt['status'] = 'failed'
        receipt['errors'] = errors(receipt.get('native', {}), reference_samples)
        engines[label] = receipt
    assert digest(path) == before_hash
    row = {**case, 'inputSha256Before': before_hash, 'inputSha256After': digest(path), 'reference': reference, **engines}
    receipts.append(row)
    (ROOT / 'partial.json').write_text(json.dumps(receipts, indent=2) + '\n')
    print(case['name'], reference['status'], engines['before'].get('native', {}).get('status'),
          engines['after'].get('native', {}).get('status'), engines['after']['errors'], flush=True)
report = {'baselineSha': BASE, 'sourcePin': '3ef069fb1f04177a153f342a32d941fc20ff047e',
          'limits': {'childSeconds': 30, 'matrixSeconds': 900, 'timeoutCleanup': 'SIGKILL own process group only'},
          'host': platform.platform(), 'ngspice': subprocess.check_output(['ngspice', '--version'], text=True),
          'node': subprocess.check_output(['node', '--version'], text=True).strip(),
          'matrixWallSeconds': time.monotonic() - START, 'extractionRepairWallSeconds': 0,
          'priorAbortedAttemptBudgetChargeSeconds': PRIOR_BUDGET_CHARGE,
          'priorAbortedAttempt': 'two completed reductions and AC alignment assertion before remaining cases; comparator bisect rounding, not simulator failure',
          'fixtures': receipts}
archive_references(report)
assert len([r for r in receipts if r['kind'] == 'unchanged original']) == 5
