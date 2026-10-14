// Report is derived from immutable receipts, never hand-entered timings.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { statistics } from '../../rc1k-attribution-data.mjs';
const here = fileURLToPath(new URL('.', import.meta.url));
const json = name => JSON.parse(readFileSync(join(here, name)));
const lines = name => readFileSync(join(here, name), 'utf8').trim().split('\n').map(JSON.parse);
const stored = name => { try { return readFileSync(join(here, name)); } catch { return gunzipSync(readFileSync(join(here, name + '.gz'))); } };
const baseline = json('baseline/verification.json'), comparison = json('comparison/verification.json');
const cmos = lines('cmos-receipts.jsonl');
assert.equal(cmos.filter(r => r.kind === 'parse-only').length, 90);
assert.equal(cmos.filter(r => r.kind === 'full-wall').length, 8);
const profiles = {}, walls = {};
for (const size of [1000, 10000, 50000]) {
  const parsed = cmos.filter(r => r.size === size && r.kind === 'parse-only');
  assert.equal(new Set(parsed.map(r => JSON.parse(r.stdout).parseSha256)).size, 1);
  profiles[size] = {};
  for (const mode of ['control', 'instrumented', 'candidate']) {
    const group = parsed.filter(r => r.mode === mode);
    assert.equal(group.length, 10);
    assert.equal(new Set(group.map(r => r.round)).size, 10);
    assert(group.every(r => r.code === 0 && !r.stopReason && r.processGroupGone));
    const samples = group.map(r => JSON.parse(r.stdout));
    profiles[size][mode] = { parse: statistics(samples.map(r => r.parse)),
      totals: Object.fromEntries(Object.keys(samples[0].totals).map(key => [key, statistics(samples.map(r => r.totals[key]))])) };
  }
  walls[size] = {};
  for (const mode of ['control', 'candidate', ...(size < 50000 ? ['ngspice'] : [])]) {
    const row = cmos.find(r => r.kind === 'full-wall' && r.size === size && r.mode === mode);
    assert(row && row.code === 0 && !row.stopReason && row.processGroupGone);
    const worker = JSON.parse(row.stdout);
    assert.equal(worker.status, 'ok');
    if (mode === 'ngspice') {
      const id = `comparison/cmos-wall-${size}-ngspice`;
      let raw;
      try { raw = stored(id + '.raw'); } catch {
        raw = Buffer.concat([stored(id + '.header'), stored('comparison/native-payloads/' + worker.evidence.output.outputSha256 + '.bin')]);
      }
      const marker = raw.indexOf(Buffer.from('Binary:\n'));
      assert(marker >= 0);
      assert.equal(createHash('sha256').update(raw.subarray(marker + 8)).digest('hex'), worker.evidence.output.outputSha256);
    }
    walls[size][mode] = { wall: row.wall, ...worker.boundaries, evidence: worker.evidence };
  }
  assert.equal(walls[size].control.evidence.output.outputSha256, walls[size].candidate.evidence.output.outputSha256);
  assert.equal(walls[size].control.evidence.parseSha256, walls[size].candidate.evidence.parseSha256);
  assert.equal(walls[size].control.evidence.parseSha256, JSON.parse(parsed[0].stdout).parseSha256);
}
const f = s => `${s.median.toFixed(3)} / ${s.iqr.toFixed(3)}`;
const table = ['# Rejected copy-on-write auto-bracing experiment', '', 'Times ms, median / IQR. Linear rows have ten interleaved cold rounds.', '', '| Deck | Before parse | Candidate parse | Reduction | Before wall | Candidate wall | Native wall | Before/native | Candidate/native |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|'];
for (const [key, modes] of Object.entries(comparison.summary)) {
  const c = comparison.comparison[key];
  table.push(`| ${key} | ${f(modes.control.parse)} | ${f(modes.candidate.parse)} | ${(c.reduction*100).toFixed(3)}% | ${f(modes.control.wall)} | ${f(modes.candidate.wall)} | ${f(modes.ngspice.nativeWall)} | ${c.beforeWallLoss.toFixed(3)}x | ${c.candidateWallLoss.toFixed(3)}x |`);
}
table.push('', 'CMOS parse rows have ten interleaved cold parse-only rounds. Full-wall columns have ONE cold sample, not medians/IQRs. CMOS50k native was censored at 30s; no ratio/ranking is inferred.', '');
for (const size of [1000, 10000, 50000]) {
  const p = profiles[size], w = walls[size];
  table.push(`| cmos-inverter-chain-tran-${size} | ${f(p.control.parse)} | ${f(p.candidate.parse)} | ${((1-p.candidate.parse.median/p.control.parse.median)*100).toFixed(3)}% | ${w.control.wall.toFixed(3)} (n=1) | ${w.candidate.wall.toFixed(3)} (n=1) | ${w.ngspice ? w.ngspice.nativeWall.toFixed(3)+' (n=1)' : 'deadline 30s, no complete receipt'} | ${w.ngspice ? (w.control.wall/w.ngspice.nativeWall).toFixed(3)+'x' : 'censored'} | ${w.ngspice ? (w.candidate.wall/w.ngspice.nativeWall).toFixed(3)+'x' : 'censored'} |`);
}
table.push('', '## Newly split leaf attribution', '', 'Instrumented copies, not optimisation gate timings. Exclusive leaf clocks include per-call instrumentation overhead. Totals are not additive medians.', '', '| Deck | braceTokens | collectParamFrames | cardEnd | parseNumber | tokenizeLine |', '|---|---:|---:|---:|---:|---:|');
for (const [key, modes] of Object.entries(baseline.summary)) {
  const b = modes.instrumented;
  table.push(`| ${key} | ${f(b['numparam.braceTokens'])} | ${f(b['numparam.collectParamFrames'])} | ${f(b['numparam.cardEnd'])} | ${f(b['cardParse.parseNumber'])} | ${f(b['tokenize.tokenizeLine'])} |`);
}
for (const size of [1000, 10000, 50000]) {
  const b = profiles[size].instrumented.totals;
  table.push(`| cmos-inverter-chain-tran-${size} | ${f(b['numparam.braceTokens'])} | ${f(b['numparam.collectParamFrames'])} | ${f(b['numparam.cardEnd'])} | ${f(b['cardParse.parseNumber'])} | ${f(b['tokenize.tokenizeLine'])} |`);
}
const linearRows = [...lines('baseline/receipts.jsonl'), ...lines('comparison/receipts.jsonl')];
const loads = [...linearRows.map(r => r.before.loadavg[0]), ...cmos.map(r => r.beforeLoad[0])];
const result = { thresholdMet: comparison.thresholdMet, profiles, walls, load1min: statistics(loads), completeLinearCells: linearRows.length, cmosParseOnlyCells: 90, cmosFullWallCells: 8, censoredNative50k: json('censored-native.json') };
assert.equal(result.thresholdMet, false);
writeFileSync(join(here, 'summary.json'), JSON.stringify(result, null, 2)+'\n');
writeFileSync(join(here, 'table.md'), table.join('\n')+'\n');
console.log('Verified 360 linear cells, 90 CMOS parse profiles, 8 CMOS full-wall cells; all before/candidate hashes equal; gate rejected.');
