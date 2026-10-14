// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parse } from '../../packages/core/src/parser/index.js';
import { simulate } from '../../packages/core/src/simulate.js';
import { MNAAssembler } from '../../packages/core/src/mna/assembler.js';
import { SingularMatrixError } from '../../packages/core/src/errors.js';

const deck = readFileSync(new URL('floating-diode.cir', import.meta.url), 'utf8');
const evidence = JSON.parse(readFileSync(new URL('receipt.json', import.meta.url), 'utf8'));

test('MIT reduction preserves native OP execution loss (RED expects ngspice success)', async () => {
  if (process.env.EXPECT_SUCCESS === '1') {
    const result = await simulate(deck);
    assert.ok(result.dc);
  } else {
    await assert.rejects(simulate(deck), SingularMatrixError);
  }
});

test('diode conductance, including junction gmin, leaves common mode undetermined', () => {
  const compiled = parse(deck).compile();
  const assembler = new MNAAssembler(compiled.nodeCount, compiled.branchCount);
  const ctx = assembler.getStampContext();
  for (const device of compiled.devices) device.stamp(ctx);
  const a = compiled.nodeNames.indexOf('a');
  const k = compiled.nodeNames.indexOf('k');
  const g = assembler.G.get(a, a);
  assert.ok(g > 1e-12);
  assert.equal(assembler.G.get(k, k), g);
  assert.equal(assembler.G.get(a, k), -g);
  assert.equal(assembler.G.get(k, a), -g);
  for (let row = 0; row < assembler.systemSize; row++) {
    assert.equal(assembler.G.get(row, a) + assembler.G.get(row, k), 0);
  }
  // G*[0,1,1,0] = 0. C provides a ground reference only in a dynamic load.
  for (const device of compiled.devices) device.stampDynamic?.(ctx);
  assert.equal(assembler.C.get(a, a), 3);
  assert.equal(assembler.C.get(k, k), 4);
  assert.equal(assembler.C.get(a, k), 0);
});

test('archived vendor first loads isolate the same three-node D183 island', () => {
  assert.equal(evidence.receipts.length, 3);
  const [base, variant] = evidence.receipts;
  assert.equal(base.sha256, 'd9310705e01c9ead00f033a7418e3c9cc5e5badc4699081fa0841f89031373a5');
  assert.equal(variant.sha256, 'fb1a6f8645a33268ab5a614a10b42d358b99f500d6d38b9add4c3cfd11d71562');
  assert.deepEqual(base.includes, variant.includes);
  assert.equal(Object.keys(base.includes).length, 7);
  assert.deepEqual(base.spiceTs.first.rows, variant.spiceTs.first.rows);
  for (const r of [base, variant]) {
    assert.match(r.spiceTs.error, /column 10.*Net-_D183-K_/);
    assert.equal(r.spiceTs.first.nonfinite, 0);
    assert.equal(r.spiceTs.first.deviceGmin, 1e-12);
    assert.equal(r.spiceTs.first.sourceScale, 1);
    assert.equal(r.spiceTs.maxError, null);
    assert.equal(r.spiceTs.rmsError, null);
    assert.deepEqual(new Set(r.attached.map((d: {type: string}) => d.type)), new Set(['Capacitor', 'Resistor', 'Diode']));
    assert.equal(r.spiceTs.first.rows.length, 7);
    for (const node of r.targets) {
      const row = r.spiceTs.first.rows.filter(([n]: [string, string, number]) => n === node);
      assert.ok(row.every(([, col]: [string, string, number]) => r.targets.includes(col)));
      assert.ok(row.some(([, col, value]: [string, string, number]) => col === node && value > 0));
      const sum = row.reduce((s: number, [, , v]: [string, string, number]) => s + v, 0);
      const scale = row.reduce((s: number, [, , v]: [string, string, number]) => s + Math.abs(v), 0);
      assert.ok(Math.abs(sum) <= Number.EPSILON * scale, 'mathematical row sum zero, within binary addition rounding');
    }
  }
});

test('same-byte ngspice outcomes distinguish base loss, shared variant failure and OPtran reduction', () => {
  const [base, variant, reduction] = evidence.receipts;
  assert.equal(reduction.sha256, createHash('sha256').update(deck).digest('hex'));
  for (const r of evidence.receipts) {
    assert.deepEqual(r.ngspice.map((n: {mode: string}) => n.mode), ['default', 'ltps', 'no-optran']);
    assert.ok(r.ngspice.every((n: {error: unknown}) => n.error === null));
  }
  for (const n of base.ngspice) {
    assert.equal(n.exitCode, 0);
    assert.match(n.summary.join('\n'), /No\. of Data Rows : 1/);
    assert.match(n.summary.join('\n'), /Source stepping completed/);
    assert.doesNotMatch(n.summary.join('\n'), /Transient op started/);
    assert.equal(n.plots.length, 1);
    assert.equal(n.plots[0].points, 1);
    assert.equal(n.plots[0].nonfinite, 0);
  }
  for (const n of variant.ngspice) assert.equal(n.exitCode, 1);
  assert.match(variant.ngspice[0].summary.join('\n'), /Transient op failed, timestep too small/);
  assert.match(variant.ngspice[0].summary.join('\n'), /m\.xq190\.m1/);
  for (const n of reduction.ngspice.slice(0, 2)) {
    assert.equal(n.exitCode, 0);
    assert.match(n.summary.join('\n'), /Transient op finished successfully/);
    assert.equal(n.plots[0].points, 1);
    assert.equal(n.plots[0].nonfinite, 0);
  }
  assert.equal(reduction.ngspice[2].exitCode, 1);
  assert.doesNotMatch(reduction.ngspice[2].summary.join('\n'), /Transient op started/);
});
