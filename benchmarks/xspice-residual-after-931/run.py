# SPDX-License-Identifier: MIT
"""Run under spice-heavy. Serial owned process groups, persistent actual-wall ledger."""
import bisect
import gzip
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import re
import shutil
import signal
import subprocess
import time

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent.parent
PIN = '3ef069fb1f04177a153f342a32d941fc20ff047e'
BASE = '8e32f51f555a2941a30ccfa9281a75f8ef2dbe30'


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


class Budget:
    def __init__(self, ledger):
        self.ledger = Path(ledger)
        self.entries = json.loads(self.ledger.read_text()) if self.ledger.exists() else []

    def run(self, command, cwd=REPO, stdin=None):
        remaining = 300 - sum(r['wallSeconds'] for r in self.entries)
        if remaining <= 0:
            return {'status': 'not-run', 'reason': '300s actual wall budget exhausted', 'command': command}
        start = time.monotonic()
        process = subprocess.Popen(command, cwd=cwd, stdin=subprocess.PIPE,
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True,
                                   env={**os.environ, 'SPICE_ASCIIRAWFILE': '1', 'DISPLAY': ''})
        try:
            out, err = process.communicate(stdin.encode() if stdin else None, timeout=min(15, remaining))
            status = 'success' if process.returncode == 0 else 'failed'
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            out, err = process.communicate()
            status = 'timeout'
        row = {'status': status, 'exit': process.returncode, 'wallSeconds': time.monotonic() - start,
               'command': list(map(str, command)), 'cwd': str(cwd), 'stdin': stdin,
               'stdout': out.decode(errors='replace'), 'stderr': err.decode(errors='replace')}
        self.entries.append(row)
        self.ledger.write_text(json.dumps(self.entries, indent=2) + '\n')
        return row


def raw_samples(text):
    header, values = text.split('Values:\n', 1)
    count = int(header.split('No. Variables:')[1].splitlines()[0])
    points = int(header.split('No. Points:')[1].splitlines()[0])
    variables = [line.split()[1] for line in header.split('Variables:\n')[1].splitlines() if line.strip()]
    tokens = [line.split()[-1] for line in values.splitlines() if line.strip()]
    assert len(tokens) == count * points
    parse = (lambda s: complex(*map(float, s.split(',')))) if 'Flags: complex' in header else float
    rows = [[parse(t) for t in tokens[i:i+count]] for i in range(0, len(tokens), count)]
    return {'x': [complex(row[0]).real for row in rows],
            'vectors': {name: [row[i] for row in rows] for i, name in enumerate(variables) if i > 0}}


def metrics(native, reference, kind):
    """No interpolation. Compare only matching coordinates, disclose unmatched points."""
    x = native['x']
    assert x == sorted(x)
    pairs = []
    for i, t in enumerate(reference['x']):
        j = bisect.bisect_left(x, t)
        candidates = [k for k in [j - 1, j] if 0 <= k < len(x)]
        if not candidates:
            continue
        k = min(candidates, key=lambda k: abs(x[k] - t))
        if math.isclose(x[k], t, rel_tol=1e-10, abs_tol=1e-15 if kind == 'tran' else 0):
            pairs.append((i, k))
    result = {'matchedPoints': len(pairs), 'referencePoints': len(reference['x']), 'nativePoints': len(x), 'vectors': {}}
    for name, expected in reference['vectors'].items():
        if name not in native['vectors']:
            continue
        actual = native['vectors'][name]
        absolute, relative = [], []
        for i, k in pairs:
            value = complex(*actual[k]) if isinstance(actual[k], list) else actual[k]
            error = abs(value - expected[i])
            assert math.isfinite(error)
            absolute.append(error)
            relative.append(error / max(abs(expected[i]), 1e-12))
        result['vectors'][name] = ({'maxAbsolute': max(absolute), 'rmsAbsolute': math.sqrt(sum(e*e for e in absolute)/len(absolute)),
                                    'maxRelative': max(relative), 'rmsRelative': math.sqrt(sum(e*e for e in relative)/len(relative))}
                                   if absolute else None)
    return result


def main():
    run = ROOT / '.run'
    run.mkdir(exist_ok=True)
    budget = Budget(run / 'ledger.json')
    for tree in ['packages/core', 'pnpm-lock.yaml']:
        actual = subprocess.check_output(['git', 'rev-parse', f'HEAD:{tree}'], cwd=REPO)
        expected = subprocess.check_output(['git', 'rev-parse', f'{BASE}:{tree}'], cwd=REPO)
        assert actual == expected, 'production tree and dependency lock must match pinned baseline'
    manifest = json.loads((REPO / 'benchmarks/corpus/corpus-f/manifest.json').read_text())
    selected = [r for r in manifest['circuits'] if 'analog_models2_' in r['sourcePath'] or r['sourcePath'].endswith('/various/x_fer.cir')]
    assert len(selected) == 5
    report = {'baselineSha': BASE, 'sourcePin': PIN, 'host': platform.platform(),
              'limits': {'childSeconds': 15, 'totalSeconds': 300, 'cleanup': 'SIGKILL owned process group only'},
              'alignment': 'No interpolation; coordinates within rel 1e-10, transient abs 1e-15; relative denominator floor 1e-12. Partial matching is not parity.',
              'source': manifest['source'], 'fixtures': [], 'versions': {}}
    for executable, arguments in [('ngspice', ['--version']), ('node', ['--version']), ('pnpm', ['--version'])]:
        report['versions'][executable] = budget.run([executable, *arguments])
    binary = shutil.which('ngspice')
    assert binary is not None
    report['ngspiceBinary'] = {'path': str(Path(binary).resolve()), 'sha256': digest(binary)}
    report['childEnvironment'] = {'SPICE_ASCIIRAWFILE': '1', 'DISPLAY': '', 'ngspiceStartup': '-n (no personal startup file)'}
    assert 'ngspice-47' in report['versions']['ngspice']['stdout']
    reference = ROOT / 'reference'
    reference.mkdir(exist_ok=True)
    for row in selected:
        path = REPO / row['localPath']
        before = digest(path)
        assert before == row['sha256']
        includes = re.findall(r'^\s*\.(?:include|inc|lib)\b.*', path.read_text(), flags=re.I | re.M)
        assert not includes, 'include closure must be explicitly implemented before adding include-bearing cases'
        # The exact source-pinned bytes, independently checked against git, go to both engines.
        upstream = subprocess.check_output(['git', '-C', str(run / 'upstream'), 'show', f"{PIN}:{row['sourcePath']}"])
        assert hashlib.sha256(upstream).hexdigest() == before
        raw = run / (row['id'] + '.raw')
        raw.unlink(missing_ok=True)
        ref = budget.run(['ngspice', '-n', '-b', '-r', str(raw), str(path)], run)
        native = budget.run(['pnpm', 'exec', 'tsx', str(ROOT / 'native.mts'), str(path)])
        data = json.loads(native['stdout']) if native['status'] == 'success' else None
        if data:
            assert data['inputSha256'] == before
            (ROOT / (row['id'] + '.native.json.gz')).write_bytes(gzip.compress(json.dumps(data).encode(), mtime=0))
        item = {'manifest': row, 'inputHashes': {'upstream': before, 'ngspiceBefore': before, 'nativeRead': data['inputSha256'] if data else None,
                'after': digest(path)}, 'includeClosure': [], 'reference': ref, 'native': {**native, 'stdout': '(see compressed native artifact)' if data else native['stdout']},
                'nativeResult': {k: v for k, v in data.items() if k != 'plots'} if data else None, 'metrics': None}
        plots = []
        if raw.exists():
            item['referenceRawSha256'] = digest(raw)
            (reference / (row['id'] + '.raw.gz')).write_bytes(gzip.compress(raw.read_bytes(), mtime=0))
        if row['sourcePath'].endswith('/x_fer.cir'):
            # Read-only vector export after sourcing the UNCHANGED deck. -r alone does not export control plots.
            for kind in ['ac', 'tran']:
                (run / f'xfer-{kind}.raw').unlink(missing_ok=True)
            commands = f'* Read-only export driver, not a replacement circuit\n.control\nset filetype=ascii\nsource {path}\nsetplot ac1\nwrite {run / "xfer-ac.raw"} all\nsetplot tran1\nwrite {run / "xfer-tran.raw"} all\nquit\n.endc\n.end\n'
            item['referenceExtraction'] = budget.run(['ngspice', '-n', '-b'], run, commands)
            for kind in ['ac', 'tran']:
                exported = run / f'xfer-{kind}.raw'
                if item['referenceExtraction']['status'] == 'success' and exported.exists():
                    text = exported.read_text()
                    parsed = raw_samples(text)
                    (reference / f'xfer-{kind}.raw.gz').write_bytes(gzip.compress(exported.read_bytes(), mtime=0))
                    found = next((p for p in data['plots'] if p['kind'] == kind), None) if data else None
                    plots.append({'kind': kind, 'rawSha256': digest(exported), 'metrics': metrics(found, parsed, kind) if found else None})
            item['metrics'] = plots or None
        item['bucket'] = data['status'] if data else native['status']
        assert digest(path) == before
        report['fixtures'].append(item)
        (ROOT / 'receipt.json').write_text(json.dumps(report, indent=2) + '\n')
        print(row['sourcePath'], 'reference', ref['status'], 'native', item['bucket'], flush=True)
    report['budget'] = {'actualWallSeconds': sum(r['wallSeconds'] for r in budget.entries), 'children': len(budget.entries)}
    report['sourceHashes'] = {str(p.relative_to(ROOT)): digest(p) for p in (ROOT / 'source').rglob('*') if p.is_file()}
    report['counts'] = {bucket: sum(r['bucket'] == bucket for r in report['fixtures']) for bucket in ['success', 'unsupported', 'failed', 'timeout', 'not-run']}
    (ROOT / 'budget-ledger.json.gz').write_bytes(gzip.compress(json.dumps(budget.entries).encode(), mtime=0))
    (ROOT / 'receipt.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'counts': report['counts'], 'budget': report['budget']}))


if __name__ == '__main__':
    main()
