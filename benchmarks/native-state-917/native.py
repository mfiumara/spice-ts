#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Run through spice-heavy. Retain numeric diode observations, not vendor logs."""
import gzip
import hashlib
import json
import os
import platform
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
WORK = HERE / '.work'
SOURCE = WORK / 'ngspice'
VENDOR = ROOT / 'benchmarks/corpus/ngspice-bugs/fetched/795'
RUN = WORK / 'run'
RUN.mkdir(exist_ok=True)
if not (RUN / 'spice_lib').exists():
    (RUN / 'spice_lib').symlink_to(VENDOR / 'spice_lib', target_is_directory=True)
config = 'set filetype=ascii\n' + '\n'.join(f'codemodel {p}' for p in sorted((SOURCE / 'src/xspice/icm').glob('*/*.cm'))) + '\n'
(RUN / '.spiceinit').write_text(config)
receipts = []
pins = {'base': 'd9310705e01c9ead00f033a7418e3c9cc5e5badc4699081fa0841f89031373a5',
        'variant': 'fb1a6f8645a33268ab5a614a10b42d358b99f500d6d38b9add4c3cfd11d71562'}
hashfile = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
include_pins = json.loads((ROOT/'benchmarks/ticket795-singular-917/receipt.json').read_text())['receipts'][0]['includes']
for path, digest in include_pins.items():
    assert hashfile(VENDOR/path) == digest
for label, path in [('base', VENDOR / 'base_37.local.cir'), ('variant', VENDOR / 'variant_37.local.cir'), ('island', HERE / 'island.cir')]:
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if label in pins:
        assert digest == pins[label]
    raw = RUN / f'{label}.raw'
    raw.unlink(missing_ok=True)
    cmd = [str(SOURCE / 'src/ngspice'), '-b', '-r', str(raw), str(path)]
    child = subprocess.run(cmd, cwd=RUN, env={**os.environ, 'TRACE917':'1'}, text=True, capture_output=True, timeout=120)
    observed_raw = raw.read_text() if raw.exists() else ''
    observed_values = observed_raw.split('Values:',1)[1] if 'Values:' in observed_raw else None
    raw.unlink(missing_ok=True)
    control = subprocess.run(cmd, cwd=RUN, env={k:v for k,v in os.environ.items() if k!='TRACE917'}, text=True, capture_output=True, timeout=120)
    control_raw = raw.read_text() if raw.exists() else ''
    control_values = control_raw.split('Values:',1)[1] if 'Values:' in control_raw else None
    assert child.returncode == control.returncode and observed_values == control_values, label
    (RUN/f'{label}-observed-values.txt').write_text(observed_values or '')
    (RUN/f'{label}-control-values.txt').write_text(control_values or '')
    (RUN / f'{label}.log').write_text(child.stdout + child.stderr)
    trace = [json.loads(line[5:]) for line in child.stderr.splitlines() if line.startswith('N917 ')]
    attempts = [json.loads(line[5:]) for line in child.stderr.splitlines() if line.startswith('O917 ')]
    with gzip.GzipFile(HERE / f'{label}-optran-attempts.json.gz', 'wb', mtime=0) as f:
        f.write((json.dumps(attempts,separators=(',', ':'))+'\n').encode())
    with gzip.GzipFile(HERE / f'{label}-native.json.gz', 'wb', mtime=0) as f:
        f.write((json.dumps(trace, separators=(',', ':'))+'\n').encode())
    summary = [line for line in (child.stdout+child.stderr).splitlines() if not line.startswith(('N917 ', 'O917 ')) and any(word in line.lower() for word in ['stepping', 'transient op', 'timestep too small', 'no. of data rows', 'error'])]
    assert hashlib.sha256(path.read_bytes()).hexdigest() == digest
    receipts.append(dict(label=label, sha256=digest, exitCode=child.returncode, controlExitCode=control.returncode,
        observationNeutral=observed_values == control_values, observations=len(trace), summary=summary))
for path, digest in include_pins.items():
    assert hashfile(VENDOR/path) == digest
(HERE/'source.json').write_text(json.dumps(dict(origin='https://git.code.sf.net/p/ngspice/ngspice',
    revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=SOURCE,text=True).strip(),
    licence='modified BSD; native code referenced, not redistributed',includes=include_pins,
    binarySha256=hashfile(SOURCE/'src/ngspice'),configuration=config.replace(str(SOURCE),'<source>'),
    host=dict(system=platform.system(),release=platform.release(),machine=platform.machine()),
    node=subprocess.check_output(['node','--version'],text=True).strip(),
    files={p:hashfile(SOURCE/p) for p in ['src/maths/ni/niiter.c','src/spicelib/analysis/cktop.c','src/spicelib/analysis/optran.c','src/spicelib/devices/dio/dioload.c']}
),indent=2)+'\n')
(HERE/'native-receipt.json').write_text(json.dumps(receipts,indent=2)+'\n')
print(json.dumps(receipts,indent=2))
