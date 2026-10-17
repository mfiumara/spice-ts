/** #1217: identical-byte magnetic fixture comparison using the public corpus metric.
 * Run: spice-heavy pnpm exec tsx benchmarks/xspice-magnetic/compare.ts
 * Source/licence receipts remain in corpus-{f,i}/SOURCES.md and manifest.json.
 * Baseline means committed corpus receipts, not a fresh whole-corpus run.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runFixture, runBoundedSimulatePacked, runNgspicePacked, type FixtureOutcome } from '../corpus/corpus-f/outcomes.js';
import { compareInBatches, lazyExecution } from '../corpus/corpus-f/packed.js';
import { normalizedSignalErrors, pairedReferenceSeries } from '../corpus/corpus-f/lib.js';
import type { ClassicAnalysisType } from '../corpus/classic/report.js';
import type { CorpusFCircuit } from '../corpus/corpus-f/ingest.js';

async function main(): Promise<void> {
  for (const corpus of ['corpus-i', 'corpus-f']) {
    const root = `benchmarks/corpus/${corpus}`;
    const manifest = JSON.parse(readFileSync(`${root}/manifest.json`, 'utf8')) as { circuits: CorpusFCircuit[] };
    const baseline = JSON.parse(readFileSync(`${root}/outcomes.json`, 'utf8')) as { fixtures: FixtureOutcome[] };
    const selected = manifest.circuits.filter(c => corpus === 'corpus-i'
      ? c.sourcePath.endsWith('/Transformer/Transformer.cir.out')
      : /\/analog_models2_(ac|dc|swept_dc|transient)\.deck$/.test(c.sourcePath));
    if (selected.length !== (corpus === 'corpus-i' ? 1 : 4)) throw new Error('Unexpected fixture selection');
    const before: Record<string, number> = {};
    const after: Record<string, number> = {};
    for (const circuit of selected) {
      const bytes = readFileSync(circuit.localPath);
      if (createHash('sha256').update(bytes).digest('hex') !== circuit.sha256) throw new Error(`Fixture modified: ${circuit.localPath}`);
      const old = baseline.fixtures.find(f => f.id === circuit.id)!;
      const current = await runFixture(circuit, undefined, { fineReference: false });
      before[old.outcome] = (before[old.outcome] ?? 0) + 1;
      after[current.outcome] = (after[current.outcome] ?? 0) + 1;
      console.log(JSON.stringify({ corpus, baseline: old.spiceTs, ...current }));
      if (corpus === 'corpus-i') {
        const spice = await runBoundedSimulatePacked(bytes, {
          ...circuit, category: corpus, analyses: circuit.analyses as ClassicAnalysisType[],
          ngspice: { expectedStatus: 'pass' }, spiceTs: { expectedStatus: 'pass' },
        });
        const ng = await runNgspicePacked(bytes, circuit);
        const metrics = normalizedSignalErrors(compareInBatches(spice, ng.execution), pairedReferenceSeries(lazyExecution(spice), lazyExecution(ng.execution)));
        console.log(JSON.stringify({ corpus, id: circuit.id, metrics }));
      }
    }
    console.log(JSON.stringify({ corpus, selected: selected.length, before, after }));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
