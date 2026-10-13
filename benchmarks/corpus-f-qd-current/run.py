"""Run sequential bounded parse/native diagnosis (not a waveform comparison).
Invoke through spice-heavy. No fresh ngspice is run by this script.
"""
import collections
import json
import os
import pathlib
import platform
import resource
import signal
import subprocess
import tempfile
import time

ROOT = pathlib.Path(__file__).resolve().parent
REPO = ROOT.parents[1]
BASE = 'd4b1ce04b70f98986d825d1daee64fabcfc7ae61'


def limits():
    resource.setrlimit(resource.RLIMIT_FSIZE, (65536, 65536))
    resource.setrlimit(resource.RLIMIT_CPU, (12, 12))


def run(mode, path, timeout):
    command = ['node', '--max-old-space-size=256', '--import', 'tsx', str(ROOT / 'child.mts'), mode, str(path)]
    started = time.monotonic()
    with tempfile.TemporaryFile(dir=ROOT) as out, tempfile.TemporaryFile(dir=ROOT) as err:
        p = subprocess.Popen(command, cwd=REPO, stdout=out, stderr=err, start_new_session=True, preexec_fn=limits)
        timed_out = False
        try:
            p.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            timed_out = True
            os.killpg(p.pid, signal.SIGKILL)
            p.wait()
        out.seek(0)
        err.seek(0)
        stdout = out.read(65536).decode('utf8', errors='replace')
        stderr = err.read(65536).decode('utf8', errors='replace')
    try:
        result = json.loads(stdout.splitlines()[-1]) if p.returncode == 0 else {'status': 'failed', 'error': stderr[:4096]}
    except (ValueError, IndexError):
        result = {'status': 'failed', 'error': 'No structured child output'}
    if timed_out:
        result = {'status': 'timeout', 'error': '12s wall budget exceeded'}
    return {**result, 'command': command, 'exit': p.returncode, 'elapsedSeconds': time.monotonic() - started, 'stderr': stderr}


def main():
    assert subprocess.check_output(['git', 'rev-parse', BASE], cwd=REPO).decode().strip() == BASE
    assert not subprocess.check_output(['git', 'diff', BASE, '--', 'packages/core'], cwd=REPO), 'Core must equal the frozen base'
    selection = json.loads((ROOT / 'selection.json').read_text())
    started = time.monotonic()
    rows = []
    for fixture in selection['fixtures']:
        row = {'id': fixture['id'], 'sha256': fixture['sha256'], 'historicalReference': fixture['historical']['ngspice'],
               'freshReference': None, 'freshComparison': None, 'maxAbsoluteError': None, 'rmsRelativeError': None}
        for mode in ['parse', 'native']:
            remaining = 600 - (time.monotonic() - started)
            row[mode] = run(mode, ROOT / fixture['localPath'], min(12, remaining)) if remaining > 0 else {'status': 'not-run', 'error': '600s total budget exhausted'}
        rows.append(row)
        (ROOT / 'progress.json').write_text(json.dumps(rows, indent=2) + '\n')
        print(row['id'], row['parse']['status'], row['native']['status'], (row['native'].get('error') or '')[:160], flush=True)
    receipt = {'baseSha': BASE, 'temp924AtKickoff': 'OPEN; not imported', 'historicalSourceCommit': selection['sourceCommit'],
               'node': subprocess.check_output(['node', '--version']).decode().strip(), 'platform': platform.platform(),
               'machine': platform.machine(), 'cpu': subprocess.check_output(['sysctl', '-n', 'machdep.cpu.brand_string']).decode().strip(),
               'spiceTsPackageVersion': json.loads((REPO / 'packages/core/package.json').read_text())['version'],
               'limits': {'perChildSeconds': 12, 'totalSeconds': 600, 'heapMiB': 256, 'outputBytesPerStream': 65536, 'concurrency': 1},
               'elapsedSeconds': time.monotonic() - started, 'freshNgspiceVersion': None,
               'totals': {mode: dict(collections.Counter(r[mode]['status'] for r in rows)) for mode in ['parse', 'native']}, 'fixtures': rows}
    (ROOT / 'diagnosis.json').write_text(json.dumps(receipt, indent=2) + '\n')
    (ROOT / 'progress.json').unlink()
    print(json.dumps(receipt['totals']))

if __name__ == '__main__':
    main()
