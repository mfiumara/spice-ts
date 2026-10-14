"""Verify unchanged #828 bytes with explicitly selected ngspice-47 modes.
Run: spice-heavy python3 benchmarks/results/issue-812-ngbehavior/probe.py
Original MIT-licensed probe; ngspice source/deck bytes are not redistributed here.
"""
from pathlib import Path
import subprocess
import json
import hashlib

root = Path('scratch-ngbehavior/mode-probe').resolve()
root.mkdir(parents=True, exist_ok=True)
fixture = Path('benchmarks/corpus/ngspice-bugs/tickets/828/sqrt_neg_cards.cir').read_bytes()
rows = []
for mode in ('native', 'ps', 'lt'):
    work = root / mode
    work.mkdir(exist_ok=True)
    (work / 'input.cir').write_bytes(fixture)
    (work / '.spiceinit').write_text('' if mode == 'native' else f'set ngbehavior={mode}\n')
    command = ['ngspice', '-b', '-r', 'out.raw', 'input.cir']
    run = subprocess.run(command, cwd=work, capture_output=True, text=True, timeout=60)
    assert run.returncode == 1 and '-4 out of range for sqrt' in run.stderr
    if mode != 'native':
        assert f'Compatibility modes selected: {mode}' in run.stdout
    rows.append({'mode': mode, 'sha256': hashlib.sha256(fixture).hexdigest(), 'command': command, 'exitCode': run.returncode, 'stdout': run.stdout, 'stderr': run.stderr})
version = subprocess.run(['ngspice', '--version'], capture_output=True, text=True, check=True)
report = {'version': version.stdout, 'runs': rows}
(root / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
print(f'Verified {len(rows)} unchanged-byte sqrt rejections. Report in {root}')
