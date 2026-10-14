"""Compare the isolated DIOMOD=1 port with actual pinned C statement slices.

Project-authored verification script (repository MIT). Generated C retains
upstream ECL-2.0 notices and stays in TMPDIR. Not a full ngspice/transistor
parity test. Requires a clean ngspice-47 checkout, clang, pnpm and tsx.
Run from the repo root: python3 packages/core/src/devices/bsim4/verify-junction.py SOURCE_CHECKOUT
"""
import itertools
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

SHA = "a80f6e3e95d51534905b1f23410a951802666656"
source = Path(sys.argv[1]).resolve()
assert subprocess.check_output(["git", "-C", str(source), "rev-parse", "HEAD"], text=True).strip() == SHA
assert not subprocess.check_output(["git", "-C", str(source), "status", "--porcelain"], text=True).strip()
base = source / "src/spicelib/devices/bsim4"


def lines(name, start, end):
    return "\n".join((base / name).read_text().splitlines()[start - 1:end])


header = lines("b4temp.c", 1, 23)
helper = lines("b4temp.c", 52, 65)
temperature = lines("b4temp.c", 231, 276)
geometry = lines("b4ld.c", 701, 718)
forward = lines("b4temp.c", 2127, 2129)
load = lines("b4ld.c", 730, 747)
statements = temperature + geometry + forward + load
fields = {
    name: sorted(set(re.findall(rf"{name}->(\w+)", statements)))
    for name in ["model", "here", "pParam", "ckt"]
}
structs = "\n".join(
    f"struct {name}_data {{ double {', '.join(names)}; }} {name}_storage, *{name} = &{name}_storage;"
    for name, names in fields.items()
)
c = header + '\n/* Modified/extracted verification harness by spice-ts. */\n'
c += '#include <math.h>\n#include <stdio.h>\n#define EXP_THRESHOLD 34.0\n#define MIN_EXP 1.713908431e-15\n'
c += structs + "\n" + helper
c += """
int main(void) {
  double Temp, Tnom, n, xti, js, jsw, jswg, area, perim, edge, ijth, vbs_jct, gmin;
  while (scanf("%lf %lf %lf %lf %lf %lf %lf %lf %lf %lf %lf %lf %lf",
    &Temp, &Tnom, &n, &xti, &js, &jsw, &jswg, &area, &perim, &edge, &ijth, &vbs_jct, &gmin) == 13) {
    double T0, T1, T2, T3, evbs, SourceSatCurrent;
    double Vtm0 = 8.617087e-5 * Tnom;
    double Eg0 = 1.16 - 7.02e-4 * Tnom * Tnom / (Tnom + 1108.0);
    double Eg = 1.16 - 7.02e-4 * Temp * Temp / (Temp + 1108.0);
    model->BSIM4vtm = 8.617087e-5 * Temp;
    model->BSIM4SjctTempExponent = model->BSIM4DjctTempExponent = xti;
    model->BSIM4SjctEmissionCoeff = model->BSIM4DjctEmissionCoeff = n;
    model->BSIM4SjctSatCurDensity = model->BSIM4DjctSatCurDensity = js;
    model->BSIM4SjctSidewallSatCurDensity = model->BSIM4DjctSidewallSatCurDensity = jsw;
    model->BSIM4SjctGateSidewallSatCurDensity = model->BSIM4DjctGateSidewallSatCurDensity = jswg;
    model->BSIM4ijthsfwd = ijth <= 0 ? 0 : ijth;
    here->BSIM4Aseff = area;
    here->BSIM4Pseff = perim;
    here->BSIM4nf = 1;
    pParam->BSIM4weffCJ = edge;
    ckt->CKTgmin = gmin;
    double Nvtms;
"""
c += temperature + "\n" + geometry + "\n"
c += "else {\n" + forward + "\n" + load + "\n}\n"
c += 'printf("%.17g %.17g %.17g %.17g\\n", SourceSatCurrent, Nvtms, here->BSIM4cbs, here->BSIM4gbs);\n}\nreturn 0;\n}\n'

cases = []
native_input = []
parameters = [
    {},
    {"jss": 0.01, "jsws": 2e-7, "jswgs": 3e-7, "njs": 1.2, "xtis": 4, "ijthsfwd": 0.02},
    {"jss": -1, "jsws": -2},
]
for temp, terminal, p, voltage, zero_geometry in itertools.product(
    [-40, 27, 160], ["source", "drain"], parameters, [-2, -0.2, 0, 0.4, 0.9, 1.2], [False, True]
):
    area, perim, edge = (0, 0, 1e-6) if zero_geometry else (2e-12, 3e-6, 1e-6)
    args = {"temperatureC": temp, "terminal": terminal, "parameters": p,
            "geometry": {"area": area, "perimeter": perim, "gateEdge": edge}}
    cases.append({"input": args, "voltage": voltage})
    native_input.append(" ".join(map(str, [temp + 273.15, 300.15, p.get("njs", 1), p.get("xtis", 3),
        p.get("jss", 1e-4), p.get("jsws", 0), p.get("jswgs", 0), area, perim, edge,
        p.get("ijthsfwd", 0.1), voltage, 1e-12])))

with tempfile.TemporaryDirectory(prefix="bsim4-junction-", dir=os.environ["TMPDIR"]) as folder:
    directory = Path(folder)
    (directory / "probe.c").write_text(c)
    subprocess.run(["clang", "-O0", str(directory / "probe.c"), "-lm", "-o", str(directory / "probe")], check=True)
    native = subprocess.check_output([str(directory / "probe")], input="\n".join(native_input) + "\n", text=True)
    (directory / "cases.json").write_text(json.dumps(cases))
    expression = """
import { readFileSync } from 'node:fs';
import { setupBsim4Junction, evaluateBsim4Junction } from './packages/core/src/devices/bsim4-junction.ts';
const cases = JSON.parse(readFileSync(process.env.BSIM4_CASES, 'utf8'));
console.log(JSON.stringify(cases.map(c => {
  const m = setupBsim4Junction(c.input);
  const result = evaluateBsim4Junction(m, c.voltage, 1e-12);
  return [m.saturationCurrent, m.nvtm, result.current, result.conductance];
})));
"""
    ts = json.loads(subprocess.check_output(["pnpm", "exec", "tsx", "--eval", expression],
        env={**os.environ, "BSIM4_CASES": str(directory / "cases.json")}, text=True))
    oracle = [list(map(float, row.split())) for row in native.splitlines()]
    assert len(ts) == len(oracle) == len(cases)
    maxima = [0.0] * 4
    for index, (actual, expected) in enumerate(zip(ts, oracle)):
        for column, (a, e) in enumerate(zip(actual, expected)):
            assert math.isfinite(a) and math.isfinite(e)
            relative = abs(a - e) / max(abs(e), 1e-30)
            maxima[column] = max(maxima[column], relative)
            assert relative < 2e-12, (index, column, a, e, relative)
    print(json.dumps({"source_sha": SHA, "cases": len(cases),
        "signals": ["saturationCurrent", "nvtm", "current", "conductance"],
        "max_relative_error": maxima, "limit": 2e-12,
        "scope": "isolated DIOMOD=1 C statements only, not full-transistor ngspice parity"}, indent=2))
