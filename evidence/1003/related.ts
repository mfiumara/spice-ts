import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { simulate } from '../../packages/core/src/simulate.js';

async function main() {
  const circuits: Record<string, { scores: Record<string, number>; worstNormalized: number }> = {};
  for (const id of ['k-10', 'k-15']) {
  const receipt = JSON.parse(gunzipSync(readFileSync(`evidence/996/runs/${id}-original.json.gz`)).toString());
  const reference = receipt.ngspice.execution.analyses[0].series as { grid: number[]; signals: Record<string, { re: number }[]> };
  const result = (await simulate(receipt.deck)).transient!;
  const scores: Record<string, number> = {};
  for (const [name, samples] of Object.entries(reference.signals)) {
    const expected = samples.map(s => s.re);
    const actual = name.startsWith('v(') ? result.voltage(name.slice(2, -1)) : result.current(name.slice(2, -1));
    const peak = Math.max(...expected.map(Math.abs), name.startsWith('v(') ? 1e-4 : 1e-10);
    let cursor = 1, error = 0;
    for (let i = 0; i < result.time.length; i++) {
      const t = result.time[i];
      if (t < reference.grid[0] || t > reference.grid.at(-1)!) continue;
      while (cursor < reference.grid.length - 1 && reference.grid[cursor] < t) cursor++;
      const f = (t - reference.grid[cursor - 1]) / (reference.grid[cursor] - reference.grid[cursor - 1]);
      const value = expected[cursor - 1] + f * (expected[cursor] - expected[cursor - 1]);
      error = Math.max(error, Math.abs(actual[i] - value) / peak);
    }
    scores[name] = error;
  }
  circuits[id] = { scores, worstNormalized: Math.max(...Object.values(scores)) };
  }
  const mosamp = await simulate(readFileSync('benchmarks/corpus/classic/fixtures/spice3f5/mosamp2.cir', 'utf8'));
  const v5 = mosamp.transient!.voltage('5').at(-1)!;
  const report = { circuits, mosamp: { v5, reference: 9.46397521, absoluteError: Math.abs(v5 - 9.46397521), bound: 5e-6 } };
  writeFileSync('evidence/1003/related.json', JSON.stringify(report, null, 2) + '\n');
  console.log(report);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
