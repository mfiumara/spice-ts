// Authored #1123 continuation diagnostics, repository MIT licence.
// Uses the exact same ramp decks as the parser/transient regression tests.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const version = spawnSync('ngspice', ['--version'], { encoding: 'utf8' }).stdout;
assert.match(version, /ngspice-47\b/);
const directory = mkdtempSync(join(tmpdir(), 'behavioral-cap-continuations-'));
const receipts = [];
try {
  for (const card of [
    'Ctest p n C={1u*\n+ (1+v(ctrl))}',
    'Ctest p n\n+ C={1u*(1+v(ctrl))}',
  ]) {
    const deck = `behavioral capacitor
.param base=1u
Vdrive p n PWL(0 0 1m 1)
Voffset n 0 2
Vcontrol ctrl 0 PWL(0 0 1m 1)
${card}
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
    receipts.push({ card, deck, totalPoints: points.length, checkedPoints: checked.length, maxAbsoluteError, stdout: run.stdout, stderr: run.stderr });
  }
  console.log(JSON.stringify({ simulator: 'ngspice-47', command: 'ngspice -b ramp.cir', receipts }, null, 2));
} finally {
  rmSync(directory, { recursive: true, force: true });
}
