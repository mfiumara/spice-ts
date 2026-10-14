"""Replay distinct production-core trees chronologically under spice-heavy.

All extraction/build writes stay inside this task's ignored node_modules cache.
The current identical-input adapter and ngspice cache are fixed across commits.
No checkout, remote write, or reference-number edits occur.
"""
import io
import json
import pathlib
import shutil
import subprocess
import tarfile
import time

ROOT = pathlib.Path(__file__).resolve().parents[2]
CACHE = ROOT / 'node_modules/.cache/aggregate-refresh-855'
SNAPSHOT = CACHE / 'snapshot'
OUTPUT = CACHE / 'replay.jsonl'
BASE = '4632b7b7ec7840f3ecdb89b53b56e0b5d521d55e'
HEAD = 'd3901ec1355519e582dc068b4dec5cc033e22de8'

def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)

CACHE.mkdir(parents=True, exist_ok=True)
commits = [BASE] + git('rev-list', '--reverse', f'{BASE}..{HEAD}', '--', 'packages/core/src').decode().splitlines() + [HEAD]
completed = {json.loads(line)['commit'] for line in OUTPUT.read_text().splitlines()} if OUTPUT.exists() else set()
previous_tree = None
schedule = []
for commit in commits:
    files = git('ls-tree', '-r', commit, 'packages/core/src').decode().splitlines()
    production = [line for line in files if '.test.' not in line and '.bench.' not in line]
    if production == previous_tree and commit != HEAD:
        continue
    previous_tree = production
    schedule.append({'commit': commit, 'subject': git('show', '-s', '--format=%s', commit).decode().strip()})
(CACHE / 'schedule.json').write_text(json.dumps(schedule, indent=2) + '\n')
for index, entry in enumerate(schedule):
    commit = entry['commit']
    if commit in completed:
        continue
    started = time.monotonic()
    if SNAPSHOT.exists():
        shutil.rmtree(SNAPSHOT)
    SNAPSHOT.mkdir()
    archive = git('archive', commit, 'packages/core')
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        # git archive contains tracked relative paths from this repository only.
        tar.extractall(SNAPSHOT)
    build = ['pnpm', '-C', 'packages/core', 'exec', 'esbuild', str(SNAPSHOT / 'packages/core/src/index.ts'), '--bundle', '--platform=node', '--format=esm', '--target=es2022', '--external:eecircuit-engine', f'--outfile={SNAPSHOT}/packages/core/dist/index.js']
    subprocess.run(build, cwd=ROOT, check=True)
    subprocess.run(['pnpm', 'exec', 'tsx', 'benchmarks/aggregate-refresh-855/replay.ts', str(ROOT), str(SNAPSHOT), str(OUTPUT), commit], cwd=ROOT, check=True)
    print(f'{index + 1}/{len(schedule)} {commit[:8]} {entry["subject"]} elapsed={time.monotonic()-started:.1f}s', flush=True)
