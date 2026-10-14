import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { hashVectors, parseRaw, statistics } from '../../rc1k-attribution-data.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const read = name => existsSync(join(here, name)) ? readFileSync(join(here, name)) : gunzipSync(readFileSync(join(here, name + '.gz')));
const rows = read('receipts.jsonl').toString().trim().split('\n').map(JSON.parse);
const summary = JSON.parse(read('summary.json'));
const select = (kind, mode, deck) => rows.filter(r => r.kind === kind && r.mode === mode && (!deck || r.deck === deck));

test('all 145 cold-process receipts are successful and clock-certified; no discarded rounds', () => {
  assert.equal(rows.length, 145);
  assert.equal(new Set(rows.map(r => r.id)).size, 145);
  for (const row of rows) {
    assert.equal(row.code, 0);
    assert.equal(row.certificationError, null);
    assert.ok(Math.abs(row.wallMs - (row.end.continuous - row.start.continuous) * 1000) < 1e-6);
    for (const key of ['monotonic', 'realtime']) {
      assert.ok(Math.abs((row.end[key] - row.start[key]) - (row.end.continuous - row.start.continuous)) <= 0.1);
    }
    assert.ok(row.before.loadavg.length === 3 && row.after.loadavg.length === 3);
    assert.deepEqual(JSON.parse(read(row.id + '.worker.stdout.txt')), row.worker);
    assert.equal(read(row.id + '.worker.stderr.txt').length, 0);
  }
  for (let round = 1; round <= 15; round++) {
    const order = round % 2 ? ['control', 'candidate'] : ['candidate', 'control'];
    assert.deepEqual(rows.filter(r => r.kind === 'import' && r.round === round).map(r => r.mode), order);
    for (const deck of ['mesh10k', 'cmos1k']) {
      assert.deepEqual(rows.filter(r => r.kind === 'cold' && r.deck === deck && r.round === round).map(r => r.mode), order);
    }
    const modes = ['control', 'candidate', 'ngspice'];
    const offset = (round - 1) % 3;
    assert.deepEqual(rows.filter(r => r.kind === 'rc1k' && r.round === round).map(r => r.mode), [...modes.slice(offset), ...modes.slice(0, offset)]);
  }
});

test('rederive all median/IQR distributions and reject the candidate below 25%', () => {
  for (const mode of ['control', 'candidate']) {
    assert.deepEqual(summary.imports[mode], statistics(select('import', mode).map(r => r.worker.importMs)));
    for (const deck of ['mesh10k', 'cmos1k']) {
      assert.deepEqual(summary.coldDecks[deck][mode], statistics(select('cold', mode, deck).map(r => r.wallMs)));
    }
  }
  for (const mode of ['control', 'candidate', 'ngspice']) {
    assert.deepEqual(summary.cold[mode], statistics(select('rc1k', mode).map(r => mode === 'ngspice' ? r.worker.boundaries.nativeWall : r.wallMs)));
  }
  assert.equal(summary.reduction, 1 - summary.imports.candidate.median / summary.imports.control.median);
  assert.ok(summary.reduction < 0.25);
  assert.equal(summary.iqrsSeparate, false);
  assert.equal(summary.gatePassed, false);
  assert.deepEqual(summary.failures, []);
});

test('all 96 numerical spice-ts outputs match their full-vector baseline hashes', () => {
  let count = 0;
  for (const deck of ['rc1k', 'mesh10k', 'cmos1k']) {
    const expected = summary.parity[deck].receipts[0].output;
    assert.deepEqual(summary.parity[deck].receipts[1].output, expected);
    for (const row of rows.filter(r => r.kind === 'rc1k' && r.mode !== 'ngspice' && deck === 'rc1k'
      || r.kind === 'cold' && r.deck === deck
      || r.kind === 'parity' && r.deck === deck)) {
      assert.deepEqual(row.worker.output ?? row.worker.evidence.output, expected);
      count++;
    }
  }
  assert.equal(count, 96);
});

test('all native binary raw outputs independently rehash; native loss is not hidden', () => {
  const native = select('rc1k', 'ngspice');
  assert.equal(native.length, 15);
  for (const row of native) {
    assert.deepEqual(hashVectors(parseRaw(read(row.id + '.raw'))), row.worker.evidence.output);
    assert.equal(row.worker.evidence.native.code, 0);
    assert.match(read(row.id + '.stdout.txt').toString(), /Using KLU/);
  }
  assert.equal(summary.nativeVerified, true);
  assert.ok(summary.cold.control.median > summary.cold.ngspice.median);
  assert.ok(summary.cold.candidate.median > summary.cold.ngspice.median);
});

test('public ESM names and all error class names preserved; CJS function-name regression documented', () => {
  for (const format of ['esm', 'cjs']) {
    const [before, after] = summary.parity[format].receipts.map(r => r.api);
    assert.deepEqual(Object.keys(before), Object.keys(after));
    for (const key of Object.keys(before).filter(k => k.endsWith('Error'))) {
      assert.deepEqual(after[key], before[key]);
    }
    const changed = Object.keys(before).filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
    assert.deepEqual(changed, format === 'esm' ? [] : ['simulate', 'simulateStepStream', 'simulateStream']);
  }
});
