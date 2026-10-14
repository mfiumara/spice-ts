// Fresh identical-input ngspice-47 verification of the retained #996 goldens.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { runNgspicePacked } from '../../benchmarks/corpus/corpus-f/outcomes.js';
import { unpackExecution } from '../../benchmarks/corpus/corpus-f/packed.js';
import type { ClassicCircuit } from '../../benchmarks/corpus/classic/report.js';

async function main() {
  const version = spawnSync('ngspice', ['--version'], { encoding: 'utf8' }).stdout;
  if (!/ngspice-47\b/.test(version)) throw new Error('ngspice-47 required');
  const manifest = JSON.parse(readFileSync('benchmarks/corpus/corpus-k/manifest.json', 'utf8'));
  const rows = [];
  for (const id of ['k-10', 'k-15']) {
    const historical = JSON.parse(gunzipSync(readFileSync(`evidence/996/runs/${id}-original.json.gz`)).toString());
    const circuit: ClassicCircuit = { ...manifest.circuits.find((c: ClassicCircuit) => c.id === id), category: 'corpus-k', analyses: ['tran'] };
    const deck = Buffer.from(historical.deck);
    // Adapter's metadata type narrows licence to BSD; real GPL metadata is unchanged.
    const native = unpackExecution((await runNgspicePacked(deck, circuit as unknown as Parameters<typeof runNgspicePacked>[1])).execution);
    if (native.status !== 'success') throw new Error(JSON.stringify(native));
    const actual = native.analyses.find(a => a.type === 'tran')!.series;
    const expected = historical.ngspice.execution.analyses.find((a: { type: string }) => a.type === 'tran').series;
    const names = Object.keys(expected.signals);
    if (actual.grid.length !== expected.grid.length) throw new Error(`${id}: grid count changed`);
    let maxAbs = 0, maxTimeDelta = 0;
    for (let i = 0; i < actual.grid.length; i++) {
      maxTimeDelta = Math.max(maxTimeDelta, Math.abs(actual.grid[i] - expected.grid[i]));
      for (const name of names) maxAbs = Math.max(maxAbs, Math.abs(actual.signals[name][i].re - expected.signals[name][i].re));
    }
    if (maxAbs !== 0 || maxTimeDelta > 1e-21) throw new Error(`${id}: golden changed ${maxAbs}, ${maxTimeDelta}`);
    rows.push({ id, deckSha256: createHash('sha256').update(deck).digest('hex'), points: actual.grid.length, signals: names.length, maxAbs, maxTimeDelta });
  }
  const classic = JSON.parse(readFileSync('benchmarks/corpus/classic/manifest.json', 'utf8'));
  const circuit = classic.circuits.find((c: ClassicCircuit) => c.localPath.endsWith('/mosamp2.cir')) as ClassicCircuit;
  if (!circuit) throw new Error('Missing mosamp2 manifest entry');
  const deck = readFileSync('benchmarks/corpus/classic/fixtures/spice3f5/mosamp2.cir');
  const native = unpackExecution((await runNgspicePacked(deck, circuit as unknown as Parameters<typeof runNgspicePacked>[1])).execution);
  if (native.status !== 'success') throw new Error(JSON.stringify(native));
  const series = native.analyses.find(a => a.type === 'tran')!.series;
  const v5 = series.signals['v(5)'].at(-1)!.re;
  const report = { version, rows, mosamp2: { deckSha256: createHash('sha256').update(deck).digest('hex'), points: series.grid.length, lastTime: series.grid.at(-1), v5, retainedGuardReference: 9.46397521, referenceRoundingDelta: Math.abs(v5 - 9.46397521) } };
  writeFileSync('evidence/1002/closure-native.json', JSON.stringify(report, null, 2) + '\n');
  console.log(report);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
