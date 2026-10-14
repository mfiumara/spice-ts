#!/usr/bin/env python3
"""Fresh four-original-deck executions and independent static-oracle regeneration.
Run under spice-heavy. No source netlist or committed oracle is overwritten.
"""
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent / 'native'
OUT.mkdir(exist_ok=True)
sys.path.insert(0, str(ROOT / 'packages/core/src/devices/__fixtures__/bsim4'))
sys.dont_write_bytecode = True
import generate

generate.generate(OUT / 'reference')
committed = json.loads((generate.HERE / 'reference/reference.json').read_text())
fresh = json.loads((OUT / 'reference/reference.json').read_text())
for field in ['cases', 'pairDc', 'binningOp']:
    assert committed[field] == fresh[field], field
paths = [
    'benchmarks/corpus/corpus-f/fixtures/examples/mos/nmos_pmos_BSIM482.sp',
    'benchmarks/corpus/corpus-f/fixtures/examples/various/gain_stage.cir',
    'benchmarks/corpus/corpus-f/fixtures/tests/regression/model/binning-1.cir',
    'benchmarks/corpus/corpus-g/fixtures/SENS/bsim4_issue694_FD.cir',
]
records = []
for i, path in enumerate(paths):
    work = OUT / str(i)
    work.mkdir(exist_ok=True)
    data = (ROOT / path).read_bytes()
    (work / 'input.cir').write_bytes(data)
    result = subprocess.run(['ngspice', '-n', '-b', 'input.cir'], cwd=work,
                            capture_output=True, text=True, timeout=60)
    log = result.stdout + result.stderr
    (work / 'original.log').write_text(log)
    diagnostics = [line.strip() for line in log.splitlines()
                   if 'error' in line.lower() or 'fatal' in line.lower()]
    records.append({'path': path, 'sha256': generate.hashlib.sha256(data).hexdigest(),
                    'command': 'ngspice -n -b input.cir', 'exitCode': result.returncode,
                    'diagnostics': diagnostics, 'log': f'native/{i}/original.log'})
(OUT / 'originals.json').write_text(json.dumps({'oracleRegeneration': 'exact numerical and deck hash match',
                                            'originals': records}, indent=2) + '\n')
print(json.dumps(records, indent=2))
