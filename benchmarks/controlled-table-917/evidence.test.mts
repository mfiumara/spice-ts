// SPDX-License-Identifier: MIT
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const load = (name: string) => JSON.parse(readFileSync(join(here, name), 'utf8'));

test('both MIT cases preserve bytes and retain complete finite ngspice-47 sweeps', () => {
  const before = load('before.json');
  const after = load('after.json');
  assert.match(after.ngspiceVersion, /ngspice-47/);
  assert.equal(after.cases.length, 2);
  for (const [index, row] of after.cases.entries()) {
    assert.equal(row.sha256, createHash('sha256').update(readFileSync(join(here, row.name))).digest('hex'));
    assert.equal(row.sha256, before.cases[index].sha256);
    assert.equal(row.identicalBytes, true);
    assert.equal(row.ngspice.exit, 0);
    assert.equal(row.ngspice.grid.length, 81);
    assert.equal(row.ngspice.values.length, 81);
    assert.ok(row.ngspice.values.every(Number.isFinite));
    assert.equal(row.spiceTs.status, 'unsupported');
    assert.equal(row.maxError, null);
    assert.equal(row.rmsError, null);
  }
});

test('reference includes end clamping and smoothing, not just hard interpolation', () => {
  const [e, g] = load('after.json').cases;
  const expected = [[0, -2], [20, -1.95], [40, 0.025], [50, 1.5], [60, 2.925], [80, 3]];
  for (const [index, value] of expected) {
    assert.ok(Math.abs(e.ngspice.values[index] - value) < 1e-12);
    assert.ok(Math.abs(g.ngspice.values[index] + value) < 1e-12);
  }
  assert.equal(g.spiceTs.tableUnsupported, true);
  // Top-level E is already rejected by numparam, before the TABLE tokenizer.
  assert.equal(e.spiceTs.tableUnsupported, false);
});

test('vendor failure becomes explicit unsupported TABLE on unchanged input, not parity', () => {
  const before = load('vendor-before.json').receipts;
  const after = load('vendor-after.json').receipts;
  assert.equal(after.length, 2);
  for (const [index, row] of after.entries()) {
    assert.equal(row.name, before[index].name);
    assert.equal(row.inputHashBefore, row.inputHashAfter);
    assert.equal(row.inputHashBefore, before[index].inputHashBefore);
    assert.deepEqual(row.includes, before[index].includes);
    assert.equal(before[index].native.status, 'failure');
    assert.equal(before[index].native.terminalPivot, 2);
    assert.equal(row.native.status, 'unsupported');
    assert.equal(row.native.errorName, 'ParseError');
    assert.equal(row.native.tableUnsupported, true);
    assert.equal(row.native.process.exit, 0);
    assert.equal(row.reference.process.exit, 0);
    assert.equal(row.reference.acRows, 141);
    assert.equal(row.maxError, null);
    assert.equal(row.rmsError, null);
    assert.ok(!('message' in row.native));
    assert.ok(!('context' in row.native));
  }
});
