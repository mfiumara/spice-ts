#!/usr/bin/env python3
"""Compare ordered setup to actual pinned C, not full simulator/transistor parity.

Usage: PYTHONDONTWRITEBYTECODE=1 python3 verify-setup.py PINNED_SOURCE_CHECKOUT
Requires clang/cc, node and installed workspace TypeScript. Temporary generated C
retains the upstream licence and notices. No source checkout or fixture changes.
"""
from pathlib import Path
import argparse
import importlib.util
import json
import os
import random
import re
import subprocess
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path)
args = parser.parse_args()
BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[4]
SOURCE = args.source.resolve()
spec = importlib.util.spec_from_file_location('generator', BASE / 'generate-setup.py')
assert spec is not None and spec.loader is not None
g = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)
outputs = g.generate(SOURCE)  # verifies source SHA and clean checkout
for name, text in outputs.items():
    assert (BASE / name).read_text() == text, f'Generated file drift: {name}'
names = re.findall(r"^  '([^']+)', //", outputs['params.ts'], re.M)
source = (SOURCE / 'src/spicelib/devices/bsim4/b4set.c').read_text()
body = ''.join(source.splitlines(keepends=True)[77:2304])
body = re.sub(r'/\*.*?\*/', lambda m: ''.join('\n' if c == '\n' else ' ' for c in m[0]), body, flags=re.S)
fields = sorted(set(re.findall(r'model->BSIM4(\w+)', body)))
field_names = {}
# Pair executable fields on the original and translated source line. This oracle
# executes original C conditions/assignments, not a second TS implementation.
translated_lines = outputs['model-defaults.ts'].splitlines()
for number, original in enumerate(body.splitlines(), 78):
    original_fields = re.findall(r'model->BSIM4(\w+)', original)
    original_fields = [f for f in original_fields if not f.endswith('Given')]
    if not original_fields:
        continue
    translated = next(x for x in translated_lines if x.endswith(f'// b4set.c:{number}'))
    candidates = re.findall(r'values\.(\w+)', translated)
    assert len(original_fields) == len(candidates), (number, original_fields, candidates)
    for old, new in zip(original_fields, candidates):
        assert old not in field_names or field_names[old] == new
        field_names[old] = new
assert all(field[:-5] in field_names if field.endswith('Given') else field in field_names for field in fields)
rng = random.Random(483)
cases = []
for i in range(65):
    values: dict[str, str | float] = {name: ('' if name == 'version' else 0) for name in names}
    given = set()
    if i:
        for name in names:
            if name not in ('version', 'v48intversion') and rng.random() < .2:
                values[name] = rng.choice([-1, 0, 1, 2, 3, .001, 1e-6, 19.25])
                given.add(name)
        values['type'] = rng.choice([-1, 1])
        given.add('type')
        values['version'] = rng.choice(['4.8.3', '4.8.2', '4.8.1', '4.8.0', '4.83', '4.82', 'unknown'])
        given.add('version')
    cases.append({'values': values, 'given': sorted(given), 'temperature': 290 + i})
with tempfile.TemporaryDirectory(prefix='bsim4-setup-oracle-', dir=os.environ.get('TMPDIR', str(ROOT))) as temporary:
    tmp = Path(temporary)
    declarations = '\n'.join(('char *' if field == 'version' else 'double ') + 'BSIM4' + field + ';' for field in fields)
    c = source[:source.index('#include')] + '\n#include <stdio.h>\n#include <string.h>\n#define NMOS 1\n#define PMOS -1\n#define copy(x) (x)\n'
    for n in (480, 481, 482, 483):
        c += f'#define BSIM4v48V{n} {n}\n'
    c += 'typedef struct {\n' + declarations + '\n} Model;\ntypedef struct {double CKTnomTemp;} Circuit;\n'
    c += 'void defaults(Model *model, Circuit *ckt) {\n' + body + '\n}\nint main(void) {\n'
    for case in cases:
        c += '{ Model m = {0}; Circuit c = {' + str(case['temperature']) + '};\n'
        for field, name in field_names.items():
            c += 'm.BSIM4' + field + ' = ' + json.dumps(case['values'][name]) + ';\n'
            if field + 'Given' in fields:
                c += f'm.BSIM4{field}Given = {int(name in case["given"])};\n'
        c += 'defaults(&m, &c);\nprintf("RESULT");\n'
        for field, name in field_names.items():
            c += f'printf("\\t%.17g", m.BSIM4{field});\n' if field != 'version' else f'printf("\\t%s", m.BSIM4{field});\n'
        c += 'printf("\\n"); }\n'
    c += 'return 0;}\n'
    (tmp / 'oracle.c').write_text(c)
    subprocess.run(['cc', '-O0', str(tmp / 'oracle.c'), '-o', str(tmp / 'oracle')], check=True)
    oracle = subprocess.check_output([str(tmp / 'oracle')], text=True)
    expected = [line.split('\t')[1:] for line in oracle.splitlines() if line.startswith('RESULT')]
    subprocess.run(['pnpm', '-C', str(ROOT / 'packages/core'), 'exec', 'tsc', '--skipLibCheck', '--strict', '--target', 'ES2022', '--module', 'commonjs', '--outDir', str(tmp), str(BASE / 'params.ts'), str(BASE / 'model-defaults.ts')], check=True)
    (tmp / 'cases.json').write_text(json.dumps(cases))
    js = 'const {applyModelDefaults}=require("./model-defaults.js");const cases=require("./cases.json");for(const c of cases)applyModelDefaults(c.values,new Set(c.given),c.temperature);console.log(JSON.stringify(cases.map(c=>c.values)));'
    (tmp / 'verify.cjs').write_text(js)
    actual = json.loads(subprocess.check_output(['node', str(tmp / 'verify.cjs')], text=True))
    assert len(expected) == len(actual) == len(cases)
    checks = 0
    for index, (want, got) in enumerate(zip(expected, actual)):
        assert len(want) == len(field_names)
        for (field, name), value in zip(field_names.items(), want):
            want_value = value if name == 'version' else float(value)
            assert want_value == got[name], (index, field, name, want_value, got[name])
            checks += 1
    print(f'PASS: {len(names)} schema fields; {len(cases)} C/TypeScript differential cases; {checks} exact field comparisons')
    assert 'k1' in names and 'k2' in names and actual[0]['k1'] == 0 and actual[0]['k2'] == 0
    print('PASS: k1/k2 zero-initialization, given dependencies and broad version-prefix parity')
