// Re-run all #996 controls without rewriting their historical evidence.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { arch, cpus, platform, release } from 'node:os';
import type { ClassicCircuit, EngineExecution } from '../../benchmarks/corpus/classic/report.js';
import { runNgspicePacked, runBoundedSimulatePacked } from '../../benchmarks/corpus/corpus-f/outcomes.js';
import { unpackExecution } from '../../benchmarks/corpus/corpus-f/packed.js';

interface HistoricalRun {
  id: string;
  variant: string;
  deck: string;
  spiceTs: EngineExecution;
  ngspice: { execution: EngineExecution };
}

// Exactly the offline #996 diagnostic metric: linear interpolation, no phase
// alignment, uniform 1e-4 V / 1e-10 A peak floors, unchanged 1% match threshold.
function summarize(ts: EngineExecution, ng: EngineExecution) {
  const results = ts.analyses.flatMap(a => {
    const b = ng.analyses.find(candidate => candidate.type === a.type);
    if (!b) return [];
    return Object.keys(a.series.signals).filter(name => name in b.series.signals).map(name => {
      const reference = b.series.signals[name].map(value => value.re);
      const peak = Math.max(...reference.map(Math.abs), name.startsWith('v(') ? 1e-4 : 1e-10);
      let cursor = 1;
      let maxAbs = 0;
      let initialAbs: number | undefined;
      for (let i = 0; i < a.series.grid.length; i++) {
        const t = a.series.grid[i];
        if (t < b.series.grid[0] || t > b.series.grid.at(-1)!) continue;
        while (cursor < b.series.grid.length - 1 && b.series.grid[cursor] <= t) cursor++;
        const low = b.series.grid[Math.max(0, cursor - 1)];
        const high = b.series.grid[cursor];
        const expected = reference.length === 1 ? reference[0]
          : high === low ? reference[cursor]
            : reference[cursor - 1] + (reference[cursor] - reference[cursor - 1]) * (t - low) / (high - low);
        const delta = Math.abs(a.series.signals[name][i].re - expected);
        initialAbs ??= delta;
        maxAbs = Math.max(maxAbs, delta);
      }
      return { type: a.type, name, maxAbs, normalized: maxAbs / peak, initialAbs };
    });
  });
  results.sort((a, b) => b.normalized - a.normalized || a.name.localeCompare(b.name));
  return {
    spiceTsStatus: ts.status, ngspiceStatus: ng.status,
    spiceTsPoints: ts.analyses.map(a => `${a.type}:${a.series.grid.length}`),
    ngspicePoints: ng.analyses.map(a => `${a.type}:${a.series.grid.length}`),
    worst: results[0] ?? null,
    matchedDiagnostic: ts.status === 'success' && ng.status === 'success' && results.length > 0 && results.every(row => row.normalized <= 0.01),
    opValues: ts.analyses.filter(a => a.type === 'op').map(a => Object.fromEntries(
      Object.entries(a.series.signals).map(([name, values]) => [name, values[0].re]),
    )),
  };
}

async function main() {
  const version = spawnSync('ngspice', ['--version'], { encoding: 'utf8' }).stdout;
  if (!/ngspice-47\b/.test(version)) throw new Error('ngspice-47 required');
  const names = (await readdir('evidence/996/runs')).filter(name => name.endsWith('.json.gz')).sort();
  const manifest = JSON.parse(await readFile('benchmarks/corpus/corpus-k/manifest.json', 'utf8'));
  const rows = [];
  for (const name of names) {
    if (process.argv[2] && name !== `${process.argv[2]}.json.gz`) continue;
    const historical: HistoricalRun = JSON.parse(gunzipSync(await readFile(`evidence/996/runs/${name}`)).toString());
    const circuit: ClassicCircuit = {
      ...manifest.circuits.find((candidate: { id: string }) => candidate.id === historical.id),
      category: 'corpus-k',
      analyses: [historical.variant.endsWith('op') ? 'op' : 'tran'],
      ngspice: { expectedStatus: 'pass' }, spiceTs: { expectedStatus: 'pass' },
    };
    const deck = Buffer.from(historical.deck);
    // The native adapter consumes analyses only; its corpus-f metadata type
    // narrows licence to BSD. Keep the real GPL corpus-k metadata unchanged.
    const native = await runNgspicePacked(deck, circuit as unknown as Parameters<typeof runNgspicePacked>[1]);
    const current = await runBoundedSimulatePacked(deck, circuit);
    const row = {
      control: name.replace('.json.gz', ''), deckSha256: createHash('sha256').update(deck).digest('hex'),
      before: summarize(historical.spiceTs, historical.ngspice.execution),
      after: summarize(unpackExecution(current), unpackExecution(native.execution)),
    };
    rows.push(row);
    await writeFile('evidence/1001/receipt.json', JSON.stringify({
      schema: 'spice-ts-1001-op-startup/v1',
      baseHead: spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim(),
      workingTreeCodePatchSha256: createHash('sha256').update(spawnSync('git', ['diff', '--', 'packages/core/src']).stdout).digest('hex'),
      historicalBaseline: 'evidence/996/runs (main 43aefef1)',
      environment: { arch: arch(), platform: platform(), release: release(), cpu: cpus()[0].model, node: process.version, ngspice: 47 },
      metric: 'Offline #996 diagnostic interpolation and uniform peak floors, not an aggregate refresh',
      rows,
    }, null, 2) + '\n');
    console.log(row.control, row.before.worst?.normalized, '->', row.after.worst?.normalized, row.after.spiceTsStatus, row.after.ngspiceStatus);
  }
  if (!process.argv[2] && rows.length !== 21) throw new Error(`Expected 21 controls, collected ${rows.length}`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
