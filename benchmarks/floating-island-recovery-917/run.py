#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Run rejected experiments in this isolated worktree; restore dc.ts in finally.
Invoke through spice-heavy because the existing probe executes native decks.
Vendor source preparation is documented in ticket795-singular-917/README.md.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
TARGET = ROOT / 'packages/core/src/analysis/dc.ts'
BASE_HASH = 'b47918b18b62b62e2c65847f5ecdc8925d21b711fcd12f119f35fa1f80a950fe'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('stage', choices=['baseline', 'source', 'optran'])
    args = parser.parse_args()
    original = TARGET.read_bytes()
    if hashlib.sha256(original).hexdigest() != BASE_HASH:
        raise SystemExit('Refusing to patch dc.ts: baseline source hash differs')
    patch = HERE / f'{args.stage}-candidate.patch'
    output = HERE / '.runs' / args.stage
    output.mkdir(parents=True, exist_ok=True)
    receipts = []
    try:
        if args.stage != 'baseline':
            subprocess.run(['git', 'apply', '--check', str(patch)], cwd=ROOT, check=True)
            subprocess.run(['git', 'apply', str(patch)], cwd=ROOT, check=True)
        commands = [
            ['pnpm', '-C', 'packages/core', 'exec', 'vitest', 'run',
             'src/analysis/dc-floating-diode-917.test.ts'],
            ['pnpm', 'exec', 'tsx', 'benchmarks/ticket795-singular-917/probe.mts',
             str(output / 'receipt.json')],
        ]
        for index, command in enumerate(commands):
            env = {**os.environ, 'EXPECT_FLOATING_DIODE_SUCCESS': '1'}
            with (output / f'{index}.stdout.log').open('w') as out, (output / f'{index}.stderr.log').open('w') as err:
                completed = subprocess.run(command, cwd=ROOT, env=env, stdout=out, stderr=err, timeout=600)
            receipts.append({'command': command, 'exitCode': completed.returncode})
    finally:
        TARGET.write_bytes(original)
        if TARGET.read_bytes() != original:
            raise RuntimeError('dc.ts restoration failed')
    (output / 'commands.json').write_text(json.dumps(receipts, indent=2) + '\n')
    print(json.dumps({'stage': args.stage, 'restored': True, 'receipts': receipts}, indent=2))
    # A probe exit0 means a valid measurement, not simulator success.
    expected_test = 0 if args.stage == 'optran' else 1
    if [r['exitCode'] for r in receipts] != [expected_test, 0]:
        raise SystemExit('Unexpected experimental outcome; inspect .runs logs')


if __name__ == '__main__':
    main()
