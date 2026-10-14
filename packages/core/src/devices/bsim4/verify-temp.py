#!/usr/bin/env python3
"""Execute original pinned C static slices against TS preprocessing, not circuit parity.
Usage: PYTHONDONTWRITEBYTECODE=1 python3 verify-temp.py PINNED_SOURCE_CHECKOUT
Requires cc, installed workspace pnpm/tsx. Fixed shared relative limit 2e-12.
"""
from pathlib import Path
import argparse
import importlib.util
import json
import math
import os
import re
import subprocess
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path)
args = parser.parse_args()
BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[4]
SOURCE = args.source.resolve()
spec = importlib.util.spec_from_file_location('generator', BASE / 'generate-temp.py')
assert spec and spec.loader
g = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)
assert (BASE / 'temperature-kernel.ts').read_text() == g.generate(SOURCE)
D = SOURCE / 'src/spicelib/devices/bsim4'
source = (D / 'b4temp.c').read_text()
lines = source.splitlines(keepends=True)
# Execute actual, unmodified statements, including warning/default branches.
body = ''.join(''.join(lines[first-1:last]) for first, last in g.RANGES)
body += ''.join(lines[1937:1940]) + ''.join(lines[1955:1981]) + ''.join(lines[1995:2040])
body += ''.join(lines[2106:2165]) + ''.join(lines[2166:2225])
body += '''here->BSIM4SourceSatCurrent = SourceSatCurrent;
here->BSIM4DrainSatCurrent = DrainSatCurrent;
here->BSIM4Nvtms = Nvtms; here->BSIM4Nvtmd = Nvtmd;
'''
uncommented = re.sub(r'/\*.*?\*/', '', body, flags=re.S)
model_fields = sorted(set(re.findall(r'model->BSIM4(\w+)', uncommented)))
size_fields = sorted(set(re.findall(r'pParam->BSIM4(\w+)', uncommented)))
here_fields = sorted(set(re.findall(r'here->BSIM4(\w+)', uncommented)))
# Independent join of canonical card names by C's own parameter IDs.
table = re.sub(r'/\*.*?\*/', '', (D / 'b4.c').read_text(), flags=re.S)
setter = re.sub(r'/\*.*?\*/', '', (D / 'b4mpar.c').read_text(), flags=re.S)
entries = {}
for name, identifier in re.findall(r'\b(?:IOP\w*|IP\w*)\(\s*"([^"]+)"\s*,\s*(BSIM4_MOD_\w+)', table):
    entries.setdefault(identifier, name)
mapping = {'type': 'type', 'v48intVersion': 'v48intversion'}
cases = list(re.finditer(r'\bcase\s+(BSIM4_MOD_\w+)\s*:', setter))
for index, case in enumerate(cases):
    block = setter[case.end():cases[index+1].start() if index+1 < len(cases) else len(setter)]
    fields = [f for f in re.findall(r'mod->BSIM4(\w+)\s*=(?!=)', block) if not f.endswith('Given')]
    if fields[0] != 'type':
        mapping[fields[0]] = entries[case[1]]
here_map = {'sourceArea': 'as', 'drainArea': 'ad', 'sourcePerimeter': 'ps', 'drainPerimeter': 'pd'}
bin_fields = re.findall(r'pParam->BSIM4(\w+)\s*=\s*model->BSIM4\w+\s*\+\s*model->BSIM4\w+\s*\*\s*Inv_L', uncommented)
bin_names = [mapping[field] for field in bin_fields if field not in ('kvth0we', 'k2we', 'ku0we')]
with tempfile.TemporaryDirectory(prefix='bsim4-temp-oracle-', dir=os.environ.get('TMPDIR', str(ROOT))) as temporary:
    tmp = Path(temporary)
    js = f'''import {{setupBsim4Model,setupBsim4Instance}} from {json.dumps(str(BASE / 'setup.ts'))};
import {{preprocessBsim4}} from {json.dumps(str(BASE / 'temp.ts'))};
const cases=[];
for(const type of [1,-1]) for(const temperature of [250,300.15,360.15,400])
for(const nf of [1,2,3,4,2.5]) for(const min of [0,1]) for(const specified of [false,true]) for(const binned of [false,true]) {{
 const card={{type,tnom:27,toxe:2e-9,ndep:1e17,nsd:1e20,u0:500,ute:-1.5,
 ua1:2e-9,ub1:2e-19,uc1:-2e-11,prt:20,at:2e4,wr:1,
 jss:1e-4,jsd:2e-4,jsws:1e-10,jswd:2e-10,jswgs:3e-10,jswgd:4e-10,
 njs:1,njd:1.2,xtis:3,xtid:2,pbs:0.9,pbd:0.8,tpb:1e-3,
 lint:1e-8,wint:2e-8,dwj:1e-8,dmcg:1e-7,dmci:2e-7,
 dvtp2:0.002,dvtp3:0.1,dvtp5:0.001,lvth0:0.04,wvth0:0.08,pvth0:0.16,
 ...(specified ? {{vth0:type*0.7,k1:0.5,k2:-0.02}} : {{}})}};
 if(binned) {{
   const defaults=setupBsim4Model(card).values;
   for(const name of {json.dumps(bin_names)}) {{
     const base=defaults[name];
     card['l'+name]=base*0.0001;
     card['w'+name]=base*0.0002;
     card['p'+name]=base*0.0003;
   }}
 }}
 const model=setupBsim4Model(card);
 const instance=setupBsim4Instance(model,{{l:1.02e-6,w:2.04e-6*nf,nf,min,mulu0:1.3,delvto:0.03,
 ...(specified?{{as:2e-12,ad:3e-12,ps:8e-6,pd:9e-6}}:{{}})}},{{d:1,g:2,s:0,b:0}});
 cases.push({{model: model.values,given:[...model.given],instance:instance.values,instanceGiven:[...instance.given],temperature,
 output:preprocessBsim4(model,instance,temperature)}});
}}
console.log(JSON.stringify(cases));
'''
    (tmp / 'run.ts').write_text(js)
    data = json.loads(subprocess.check_output(['pnpm', 'exec', 'tsx', str(tmp / 'run.ts')], cwd=ROOT, text=True))
    def structure(name, fields):
        return 'typedef struct {\n' + ''.join(f'{"int" if f == "dioMod" else "double"} BSIM4{f};\n' for f in fields) + '} ' + name + ';\n'
    c = source[:source.index('#include')] + '\n#include <stdio.h>\n#include <math.h>\n'
    c += '#define NMOS 1\n#define PMOS -1\n#define MAX(a,b) ((a)>(b)?(a):(b))\n'
    c += ''.join(lines[31:50])
    c += 'const double CONSTvt0 = 1.38064852e-23 * 300.15 / 1.6021766208e-19, CONSTroot2=1.4142135623730951;\n'
    c += structure('Model', model_fields) + structure('Size', size_fields) + structure('Instance', here_fields)
    c += 'typedef struct { double CKTtemp; } Circuit;\n'
    geo = (D / 'b4geo.c').read_text().splitlines(keepends=True)
    c += ''.join(geo[27:154])
    c += ''.join(lines[51:65])
    c += 'void run(Model *model, Instance *here, Size *pParam, Circuit *ckt) {\n'
    c += ''.join(lines[75:90]) + 'Temp = ckt->CKTtemp; delTemp = Temp - model->BSIM4tnom;\n' + body
    c += '\nprintf("RESULT");\n'
    targets = []
    for obj, fields in [('model', model_fields), ('pParam', size_fields), ('here', here_fields)]:
        for field in fields:
            if not field.endswith('Given'):
                c += f'printf("\\t%.17g", (double){obj}->BSIM4{field});\n'
                targets.append((obj, field))
    c += 'printf("\\n"); }\nint main(void) {\n'
    for case in data:
        c += '{ Model m={0}; Instance h={0}; Size p={0}; Circuit c={' + str(case['temperature']) + '};\n'
        for field in model_fields:
            if field.endswith('Given'):
                value = int(mapping[field[:-5]] in case['given'])
            else:
                value = case['model'].get(mapping.get(field, field), 0)
            c += f'm.BSIM4{field}={float(value)!r};\n'
        for field in here_fields:
            if field.endswith('Given'):
                value = int(here_map.get(field[:-5], field[:-5]) in case['instanceGiven'])
            else:
                value = case['instance'].get(here_map.get(field, field), 0)
            c += f'h.BSIM4{field}={float(value)!r};\n'
        c += 'run(&m,&h,&p,&c); }\n'
    c += 'return 0;}\n'
    (tmp / 'oracle.c').write_text(c)
    subprocess.run(['cc', '-O0', str(tmp / 'oracle.c'), '-o', str(tmp / 'oracle')], check=True)
    output = subprocess.check_output([str(tmp / 'oracle')], text=True)
    expected = [list(map(float, line.split('\t')[1:])) for line in output.splitlines() if line.startswith('RESULT')]
    assert len(expected) == len(data)
    maximum = 0
    checks = 0
    for index, (want, case) in enumerate(zip(expected, data)):
        for (obj, field), value in zip(targets, want):
            if obj == 'model':
                got = case['output']['model'].get(mapping.get(field, field), 0)
            elif obj == 'here':
                got = case['output']['instance'].get(here_map.get(field, field), 0)
            else:
                got = case['output']['size'][field]
            assert math.isfinite(value) and math.isfinite(got), (index, obj, field, value, got)
            error = abs(value-got) / max(abs(value), 1e-30)
            assert error <= 2e-12, (index, obj, field, value, got, error)
            maximum = max(maximum, error)
            checks += 1
    print(f'PASS: {len(data)} original-C cases; {checks} numeric comparisons; maximum relative error {maximum:.17g}; shared limit 2e-12')
