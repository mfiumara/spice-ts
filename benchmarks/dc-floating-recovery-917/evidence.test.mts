// SPDX-License-Identifier: MIT
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const read = (name:string) => JSON.parse(readFileSync(new URL(name,import.meta.url),'utf8'));
const comparison = read('comparison.json');
const summary = read('summary.json');

test('same-byte comparisons and complete receipt counts',()=> {
  assert.equal(comparison.receipts.length,5);
  assert.equal(summary.receipts.length,5);
  assert.equal(comparison.sourceHashes.afterDC, createHash('sha256').update(readFileSync(new URL('../../packages/core/src/analysis/dc.ts',import.meta.url))).digest('hex'));
  for (const r of comparison.receipts) {
    assert.equal(r.deckHashBefore,r.deckHashAfter);
    assert.deepEqual(r.includesBefore,r.includesAfter);
    assert.equal(r.native.before.exit,0);
    assert.equal(r.native.after.exit,0);
    assert.notEqual(r.native.before.status,'process-failure');
    assert.notEqual(r.native.after.status,'process-failure');
    assert.equal(r.reference.exit,0);
  }
});
test('reduction RED to GREEN with all 31 AC rows and 93 complex voltage comparisons',()=> {
  const r = comparison.receipts.find((r:any)=>r.name==='reduction');
  assert.match(r.native.before.error,/column 1/);
  assert.equal(r.native.after.status,'success');
  assert.equal(r.reference.acRows,31);
  assert.equal(r.native.after.ac.frequencies.length,31);
  assert.equal(r.comparedValues,93);
  assert.equal(typeof r.maxError,'number');
  assert.equal(typeof r.rmsError,'number');
  assert.ok(Number.isFinite(r.maxError));
  assert.ok(Number.isFinite(r.rmsError));
  assert.ok(r.maxError<1e-10);
  assert.ok(r.rmsError<1e-10);
});
test('original vendor losses remain explicit, with null unavailable metrics',()=> {
  for(const name of ['base','variant']) {
    const r=comparison.receipts.find((r:any)=>r.name===name);
    assert.equal(r.native.before.status,'failure');
    assert.equal(r.native.after.status,'failure');
    assert.equal(r.reference.acRows,141);
    assert.equal(r.maxError,null);
    assert.equal(r.rmsError,null);
  }
  const trace=read('trace.json');
  assert.equal(trace.length,2);
  for(const [i,pivot] of [229,232].entries()) {
    assert.equal(trace[i].factors.length,33);
    assert.equal(trace[i].factors.filter((f:any)=>f.error.includes(`column ${pivot} `)).length,9);
    assert.ok(trace[i].factors.every((f:any)=>f.nonfinite===0));
  }
});
test('ordinary DC values unchanged and inconsistent topology still rejected',()=> {
  const r=comparison.receipts.find((r:any)=>r.name==='divider');
  assert.deepEqual(r.native.before.dc,r.native.after.dc);
  assert.deepEqual(r.native.after.dc,{in:3,out:2});
  const bad=comparison.receipts.find((r:any)=>r.name==='inconsistent');
  assert.equal(bad.native.before.status,'failure');
  assert.equal(bad.native.after.status,'failure');
  // ngspice finite-time OPtran accepts this too; explicitly retained policy loss.
  assert.equal(bad.reference.acRows,31);
});
test('finite-time zero-charge common mode agrees with pinned reference probes',()=> {
  assert.equal(summary.probeDeltas.length,2);
  for(const r of summary.probeDeltas) {
    assert.equal(r.steps,107);
    assert.equal(r.time,1e-5);
    assert.ok(r.maxAbsoluteError<3e-9);
  }
  assert.equal(read('source.json').revision,'a80f6e3e95d51534905b1f23410a951802666656');
});
