// Authored diagnostic for #1098, repository MIT licence. Run with Node, ngspice-47 on PATH.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const version = spawnSync('ngspice', ['--version'], { encoding: 'utf8' }).stdout;
assert.match(version, /ngspice-47\b/);
const directory = mkdtempSync(join(tmpdir(), 'behavioral-cap-1098-'));
try {
  const deck = `behavioral capacitor native semantics
.param base=1u
Vdrive p n PWL(0 0 1m 1)
Voffset n 0 2
Vcontrol ctrl 0 PWL(0 0 1m 1)
Ctest p n C='base*(1+V(ctrl))'
.tran 10u 1m
.control
run
listing e
wrdata ramp.dat i(Vdrive)
quit
.endc
.end
`;
  writeFileSync(join(directory, 'ramp.cir'), deck);
  const run = spawnSync('ngspice', ['-b', 'ramp.cir'], { cwd: directory, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /gctest ctest_int1 0 n p 1e9/);
  const points = readFileSync(join(directory, 'ramp.dat'), 'utf8').trim().split('\n').map(line => line.trim().split(/\s+/).map(Number));
  const checked = points.filter(([time]) => time >= 0.0002 && time <= 0.0009);
  const maxAbsoluteError = Math.max(...checked.map(([time, current]) => Math.abs(current + 0.001 * (1 + 1000 * time))));
  assert(checked.length > 10);
  assert(maxAbsoluteError < 1e-10);
  console.log(JSON.stringify({ simulator: 'ngspice-47', totalPoints: points.length, checkedPoints: checked.length, maxAbsoluteError, semantics: 'C(control)*dV/dt, not d(C(control)*V)/dt', deck }, null, 2));
} finally {
  rmSync(directory, { recursive: true, force: true });
}
