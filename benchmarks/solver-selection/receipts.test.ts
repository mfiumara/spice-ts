import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';

const receipts = JSON.parse(gunzipSync(readFileSync(new URL('./receipts.json.gz', import.meta.url))).toString());
const manifest = JSON.parse(readFileSync(new URL('../corpus/ngspice-bugs/manifest.json', import.meta.url), 'utf8'));
const ids = [645, 690, 691, 718, 720, 725, 852];

test('all 14 before/after executions use matching existing pins', () => {
  for (const phase of ['before', 'after', 'exploratoryAfter']) {
    const rows = receipts[phase].slice(1);
    assert.equal(rows.length, 14);
    assert.equal(new Set(rows.map((row: { ticket: number; solver: string }) => `${row.ticket}/${row.solver}`)).size, 14);
    for (const ticket of ids) for (const solver of ['klu', 'sparse']) {
      const row = rows.find((item: { ticket: number; solver: string }) => item.ticket === ticket && item.solver === solver);
      const entry = manifest.tickets.find((item: { ticket: number }) => item.ticket === ticket);
      const pin = entry.uncommittedDecks.find((item: { name: string }) => item.name === `${solver}.cir`)
        ?? entry.committedDecks.find((item: { path: string }) => item.path.endsWith(`/${solver}.cir`));
      assert.equal(row.receipt.netlistSha256, pin.sha256);
    }
  }
});

test('solver variants have exactly equal native execution results; downstream gaps remain visible', () => {
  for (const ticket of ids) {
    const pair = receipts.after.slice(1).filter((row: { ticket: number }) => row.ticket === ticket);
    assert.deepEqual(pair[0].receipt.spiceTs, pair[1].receipt.spiceTs);
  }
  const before = receipts.before.slice(1);
  assert.ok(before.every((row: { receipt: { spiceTs: { error: string } } }) => /Unsupported \.options field/.test(row.receipt.spiceTs.error)));
  const after = receipts.after.slice(1);
  assert.equal(after.filter((row: { receipt: { spiceTs: { status: string } } }) => row.receipt.spiceTs.status === 'success').length, 8);
  assert.equal(after.filter((row: { receipt: { spiceTs: { status: string } } }) => row.receipt.spiceTs.status === 'failed').length, 4);
  assert.equal(after.filter((row: { receipt: { spiceTs: { status: string } } }) => row.receipt.spiceTs.status === 'unsupported').length, 2);
  const sparse852 = after.find((row: { ticket: number; solver: string }) => row.ticket === 852 && row.solver === 'sparse');
  assert.ok(sparse852.receipt.comparisons.some((item: { unmatched?: string }) => item.unmatched === 'spice-ts'));
  const sparse690 = after.find((row: { ticket: number; solver: string }) => row.ticket === 690 && row.solver === 'sparse');
  const signals = sparse690.receipt.spiceTs.analyses[0].series.signals;
  assert.deepEqual(Object.keys(signals), ['v(pole(1))']);
  assert.ok(Math.abs(signals['v(pole(1))'][0].re / (-1 / 1.5e-8) - 1) < 1e-12);
});
