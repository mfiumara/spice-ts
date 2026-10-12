#!/usr/bin/env tsx
/**
 * #774 before/after: every corpus-f/corpus-g fixture whose spice-ts run declares or produces a
 * `noise` analysis runs once through ngspice-47 and spice-ts (identical bytes, corpus-f runner).
 * Both metrics are scored on the SAME two executions, so the delta is the metric change alone:
 *   before = normalised by the first ngspice plot of the analysis type (pre-#774 lookup)
 *   after  = normalised by the ngspice plot the signal was compared in (pairedReferenceSeries)
 *
 * Usage (repository root, after `pnpm build`):
 *   spice-heavy pnpm exec tsx benchmarks/results/issue-774/measure.ts
 */
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { compareExecutions } from '../../aggregate-report.js';
import type { CorpusFCircuit } from '../../corpus/corpus-f/ingest.js';
import { MATCH_THRESHOLD, normalizedSignalErrors, outcome, pairedReferenceSeries, sig3 } from '../../corpus/corpus-f/lib.js';
import { runBoundedSimulate, runFixture, runNgspice } from '../../corpus/corpus-f/outcomes.js';

interface Row { id: string; sourcePath: string; analyses: string[]; unmappedAnalyses?: string[]; localPath: string }

async function rows(corpus: 'corpus-f' | 'corpus-g'): Promise<Array<{ corpus: string; circuit: CorpusFCircuit; committed: Record<string, unknown> }>> {
  const manifest = JSON.parse(await readFile(`benchmarks/corpus/${corpus}/manifest.json`, 'utf8')) as { circuits: Row[] };
  const outcomes = JSON.parse(await readFile(`benchmarks/corpus/${corpus}/outcomes.json`, 'utf8')) as { fixtures: Array<Record<string, unknown> & { id: string }> };
  const picked = [];
  for (const fixture of outcomes.fixtures) {
    if (!JSON.stringify([fixture.analyses, fixture.unmappedAnalyses, (fixture.spiceTs as { analyses?: unknown }).analyses]).includes('noise')) continue;
    const circuit = manifest.circuits.find(candidate => candidate.id === fixture.id);
    if (!circuit) throw new Error(`${corpus}: ${fixture.id} not in manifest`);
    picked.push({ corpus, circuit: { ...circuit, unmappedAnalyses: circuit.unmappedAnalyses ?? [], sameNameAs: [] } as unknown as CorpusFCircuit, committed: fixture });
  }
  return picked;
}

function score(comparisons: ReturnType<typeof compareExecutions>, lookup: Parameters<typeof normalizedSignalErrors>[1]) {
  const { errors, missing } = normalizedSignalErrors(comparisons, lookup);
  const worst = errors.reduce<typeof errors[number] | null>((current, error) => current === null || error.normalized > current.normalized ? error : current, null);
  return { errors, missing, worst };
}

async function main(): Promise<void> {
  const results = [];
  for (const { corpus, circuit, committed } of [...await rows('corpus-f'), ...await rows('corpus-g')]) {
    const input = await readFile(circuit.localPath);
    // Same ClassicCircuit view runFixture hands the bounded spice-ts child (outcomes.ts asClassic).
    const spiceTs = await runBoundedSimulate(input, {
      id: circuit.id, category: 'corpus-f', analyses: circuit.analyses as never, sourcePath: circuit.sourcePath,
      sourceUrl: circuit.sourceUrl, localPath: circuit.localPath, sha256: circuit.sha256,
      ngspice: { expectedStatus: 'pass' }, spiceTs: { expectedStatus: 'pass' },
    });
    const ngspice = await runNgspice(input, circuit);
    // The published runner (what writes outcomes.json), on a separate run, after the fix.
    const runner = await runFixture(circuit);
    const base = { corpus, id: circuit.id, sourcePath: circuit.sourcePath, committedOutcome: committed.outcome, committedWorst: committed.worstNormalizedError, committedWorstSignal: committed.worstSignal, ngspice: ngspice.status, spiceTs: spiceTs.status, runFixture: { outcome: runner.outcome, worst: runner.worstNormalizedError, worstSignal: runner.worstSignal, comparedSignals: runner.comparedSignals } };
    if (ngspice.status !== 'success' || spiceTs.status !== 'success') {
      results.push({ ...base, note: 'not scored (an engine did not succeed): metric change cannot apply', spiceTsError: spiceTs.error?.split('\n')[0]?.slice(0, 200) });
      continue;
    }
    const comparisons = compareExecutions(spiceTs, ngspice.execution);
    const outcomeOf = (worst: number | null, missing: number) => outcome({
      ngspice: 'success', spiceTs: 'success', comparedAnalyses: comparisons.length,
      spiceTsAnalyses: new Set(spiceTs.analyses.map(analysis => analysis.type)).size, worstNormalized: worst, missingSignals: missing,
    });
    const before = score(comparisons, analysis => ngspice.execution.analyses.find(candidate => candidate.type === analysis)?.series);
    const after = score(comparisons, pairedReferenceSeries(spiceTs, ngspice.execution));
    const changed = after.errors.flatMap((error, index) => {
      const old = before.errors[index];
      return old.normalized === error.normalized ? [] : [{
        signal: `${error.analysis} ${error.signal}`, absoluteMax: sig3(error.absoluteMax),
        before: { ngspicePeak: old.ngspicePeak, normalized: sig3(old.normalized) },
        after: { ngspicePeak: sig3(error.ngspicePeak), normalized: sig3(error.normalized) },
      }];
    });
    results.push({
      ...base,
      comparedSignals: after.errors.length,
      before: { worst: before.worst && sig3(before.worst.normalized), worstSignal: before.worst && `${before.worst.analysis} ${before.worst.signal}`, outcome: outcomeOf(before.worst?.normalized ?? null, before.missing) },
      after: { worst: after.worst && sig3(after.worst.normalized), worstSignal: after.worst && `${after.worst.analysis} ${after.worst.signal}`, outcome: outcomeOf(after.worst?.normalized ?? null, after.missing) },
      changedSignals: changed,
    });
    console.error(`${corpus} ${circuit.id}: before ${results.at(-1)?.['before' as never]?.['worst' as never]} after ${results.at(-1)?.['after' as never]?.['worst' as never]}`);
  }
  const report = {
    issue: 'https://github.com/mfiumara/spice-ts/issues/774',
    matchThreshold: MATCH_THRESHOLD,
    ngspice: execFileSync('ngspice', ['--version'], { encoding: 'utf8' }).match(/ngspice-\d+(?:\.\d+)*/i)?.[0] ?? 'unknown',
    head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    selection: 'every corpus-f/corpus-g fixture whose declared, unmapped or committed spice-ts analyses mention noise (the only analysis type for which ngspice emits two plots)',
    results,
  };
  await writeFile('benchmarks/results/issue-774/before-after.json', `${JSON.stringify(report, null, 2)}\n`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
