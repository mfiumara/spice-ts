#!/usr/bin/env tsx
/** Reference-only selection. Launch native corpus execution through spice-heavy. */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { RELATIVE_ZERO_THRESHOLD, type ComparisonMetrics } from '../comparison-harness.js';
import { loadCorpus } from './compare.js';
import { runCandidates } from './subset-runner.js';
import { sha256 } from './expanded.js';

type Candidate = ReturnType<typeof loadCorpus>[number];
type Row = {
  key: string; originalSha256: string; canonicalSha256: string; canonicalPath: string;
  eligibility: string; limitations: string[]; losses: string[];
  projections: Array<{ analysis: string; ngspice: { status: string; failureKind?: string; error?: string }; xyce: { status: string; failureKind?: string; error?: string } }>;
  comparisons: Array<{ ordinal: number; analysis: string; metrics: ComparisonMetrics }>;
};

export function loadCandidates(): Candidate[] {
  // A=ngspice, B=classic, C=xyce, D/E keep original (not -spice3) decks.
  const rows = loadCorpus();
  for (const corpus of ['corpus-f', 'corpus-g', 'corpus-h', 'corpus-i', 'corpus-j']) {
    const manifest = JSON.parse(readFileSync(`benchmarks/corpus/${corpus}/manifest.json`, 'utf8')) as { circuits: Candidate['circuit'][] };
    for (const circuit of manifest.circuits) {
      const input = readFileSync(circuit.localPath);
      if (sha256(input) !== circuit.sha256) throw new Error(`Fixture hash mismatch: ${circuit.localPath}`);
      rows.push({ key: `${corpus}/${circuit.id}`, circuit, input });
    }
  }
  if (new Set(rows.map(row => row.key)).size !== rows.length) throw new Error('Duplicate fixture ids');
  return rows;
}

export function selectSubset<T extends { eligibility: string }>(rows: T[], target = 100): T[] {
  return rows.filter(row => row.eligibility === 'comparable').slice(0, target);
}

export function bucketMetrics(metrics: ComparisonMetrics[]): string {
  const signals = metrics.flatMap(metric => Object.values(metric.signals));
  if (!signals.length || signals.some(signal => signal.status !== 'compared' || !signal.sampleCount)) return 'no-aligned-numeric-comparison';
  const compared = signals.filter(signal => signal.status === 'compared');
  if (compared.every(signal => signal.absoluteError.max <= 1e-9)) return 'absolute-at-most-1e-9';
  const material = compared.filter(signal => signal.absoluteError.max > 1e-9);
  if (material.some(signal => signal.relativeError.max === null)) return 'absolute-only-disagreement';
  return material.every(signal => signal.relativeError.max! <= 1e-3) ? 'relative-at-most-1e-3' : 'relative-above-1e-3';
}

export function render(directory: string): void {
  const reportBytes = readFileSync(join(directory, 'report.json'));
  const report = JSON.parse(reportBytes.toString()) as { fixtures: Row[]; tools: object };
  const candidates = loadCandidates();
  if (report.fixtures.length !== candidates.length || report.fixtures.some((row, i) => row.key !== candidates[i].key || row.originalSha256 !== sha256(candidates[i].input))) throw new Error('Incomplete or out-of-order reference receipt');
  for (const row of report.fixtures) {
    if (sha256(readFileSync(row.canonicalPath)) !== row.canonicalSha256) throw new Error(`Canonical hash mismatch: ${row.key}`);
  }
  const selected = selectSubset(report.fixtures);
  const selectedKeys = new Set(selected.map(row => row.key));
  const manifest = {
    schemaVersion: 'spice-ts-mutual-reference-subset/v1', target: 100, count: selected.length,
    reportSha256: sha256(reportBytes), tools: report.tools,
    order: 'Original aggregate 100 in A..E manifest order, then F..J manifest order; SHA256 is the tie-breaker for identical manifest ordinals (none). Original decks only; no outcome-based sorting or spice-ts selection.',
    fixtures: selected.map(row => ({ key: row.key, originalSha256: row.originalSha256, canonicalSha256: row.canonicalSha256,
      analysisTypes: row.projections.map(p => p.analysis), canonicalPath: row.canonicalPath })),
    exclusions: report.fixtures.filter(row => !selectedKeys.has(row.key)).map(row => ({ key: row.key, originalSha256: row.originalSha256, canonicalSha256: row.canonicalSha256,
      reason: row.eligibility === 'comparable' ? 'target-already-reached' : row.eligibility,
      limitations: row.limitations, losses: row.losses,
      nativeFailures: row.projections.flatMap((p, ordinal) => (['ngspice', 'xyce'] as const).filter(engine => p[engine].status === 'failed').map(engine => ({ ordinal, engine, kind: p[engine].failureKind, error: p[engine].error }))) })),
  };
  writeFileSync(join(directory, 'subset-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const buckets: Record<string, number> = {};
  const table = ['| Fixture | Selected | Eligibility | Disagreement bucket | Max abs | RMS abs | Max rel | RMS rel |', '| --- | --- | --- | --- | ---: | ---: | ---: | ---: |'];
  const signalTable = ['| Fixture | Ordinal / analysis | Signal | Samples | Max abs | RMS abs | Max rel | RMS rel | Relative samples / zero excluded |', '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |'];
  for (const row of report.fixtures) {
    const bucket = row.eligibility === 'comparable' ? bucketMetrics(row.comparisons.map(c => c.metrics)) : row.eligibility;
    buckets[bucket] = (buckets[bucket] ?? 0) + 1;
    const signals = row.comparisons.flatMap(c => Object.entries(c.metrics.signals).map(([name, s]) => ({ c, name, s })));
    const measured = signals.filter(item => item.s.status === 'compared').map(item => item.s).filter(s => s.status === 'compared');
    const nAbs = measured.reduce((n, s) => n + s.sampleCount, 0);
    const nRel = measured.reduce((n, s) => n + s.relativeError.sampleCount, 0);
    const numbers = nAbs ? [Math.max(...measured.map(s => s.absoluteError.max)), Math.sqrt(measured.reduce((n, s) => n + s.sampleCount * s.absoluteError.rms ** 2, 0) / nAbs),
      nRel ? Math.max(...measured.map(s => s.relativeError.max ?? 0)) : null, nRel ? Math.sqrt(measured.reduce((n, s) => n + s.relativeError.sampleCount * (s.relativeError.rms ?? 0) ** 2, 0) / nRel) : null] : [null, null, null, null];
    table.push(`| ${row.key} | ${selectedKeys.has(row.key)} | ${row.eligibility} | ${bucket} | ${numbers.map(n => n === null ? 'n/a' : n.toExponential(6)).join(' | ')} |`);
    for (const { c, name, s } of signals) {
      if (s.status === 'compared') signalTable.push(`| ${row.key} | ${c.ordinal} / ${c.analysis} | ${name} | ${s.sampleCount} | ${s.absoluteError.max} | ${s.absoluteError.rms} | ${s.relativeError.max ?? 'n/a'} | ${s.relativeError.rms ?? 'n/a'} | ${s.relativeError.sampleCount} / ${s.relativeError.excludedZeroReferences} |`);
      else signalTable.push(`| ${row.key} | ${c.ordinal} / ${c.analysis} | ${name} | missing | n/a | n/a | n/a | n/a | ${s.missingFrom.join(',')} |`);
    }
  }
  const selectedBuckets: Record<string, number> = {};
  for (const row of selected) {
    const bucket = bucketMetrics(row.comparisons.map(c => c.metrics));
    selectedBuckets[bucket] = (selectedBuckets[bucket] ?? 0) + 1;
  }
  const summary = { attempted: report.fixtures.length, eligibleReferenceFixtures: report.fixtures.filter(row => row.eligibility === 'comparable').length, initialAccepted: selectSubset(report.fixtures.slice(0, 100)).length, finalAccepted: selected.length, target: 100, buckets, selectedBuckets };
  writeFileSync(join(directory, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  writeFileSync(join(directory, 'README.md'), `# Mutually accepted ngspice 47 / Xyce 7.10 references\n\n${summary.finalAccepted} fixtures selected (target 100); ${summary.eligibleReferenceFixtures} of ${summary.attempted} licensed originals are reference-eligible. The initial aggregate subset accepted ${summary.initialAccepted}. ${summary.finalAccepted < 100 ? 'All available original A..J fixtures exhausted; 100 is not reachable with this adapter.' : 'First 100 reference-eligible rows selected in deterministic order.'}\n\nSelection uses only both references exporting numeric data on every identical canonical analysis projection, without unsupported or ignored/lossy statements. It never uses spice-ts results. Xyce receives additional output-only .print directives. Original/canonical and projected engine hashes, transformations, every native warning and failure are retained in report.json and hash-manifest.json. Exclusions with per-fixture reasons are in subset-manifest.json. No aggregate ledger or scoring is changed.\n\nObserved reference disagreement is not proof of model equivalence or inequivalence, nor evidence that spice-ts is wrong. No spice-ts engine is executed in this report. Native execution/export/parse failures are separate from convergence evidence. Ignored-dot-line warnings remain in native logs and exclude a fixture.\n\nOrder is original aggregate A..E manifest order, followed by F..J original manifest order (hash tie-breaker on equal ordinals; no ties). Already-translated -spice3 decks are not additional original circuits. Every candidate is run, even if the target is reached, and every row retained.\n\nMetrics use the existing harness, target=ngspice and reference=Xyce despite legacy field names. Xyce is linearly interpolated onto the ngspice grid, nested sweep segments matched by ordinal; complex differences are Euclidean. Relative denominator is Xyce magnitude; reference magnitudes <=${RELATIVE_ZERO_THRESHOLD} are excluded from relative metrics and counted. Fixture absolute/relative RMS values pool the respective sample counts across all signals and analyses. Mixed voltage/current absolute envelopes are descriptive only; per-signal values below are authoritative. Missing/unmatched signals are never agreement. Partial comparisons on excluded rows remain in report.json, not in the eligible table.\n\nGlobal descriptive buckets (not parity scoring): all absolute errors <=1e-9; otherwise materially nonzero signals with relative maximum <=1e-3 or >1e-3; absolute-only when no nonzero denominator exists; missing/empty comparison is separate. Thresholds are uniform across circuits and do not change selection.\n\n## Execution provenance\n\nThe original run stopped after 632 saved fixtures when JSON.stringify of a large native diagnostic series exceeded V8 string size. Bounded 4096-sample serialization now hashes the identical JSON byte stream without dropping samples. The verified prefix was resumed with --resume. executionSegments in report.json retains both source-hash snapshots and ordinal ranges; the interrupted report is archived separately. This repair changes receipt serialization, not native adapter policy or numerical results.\n\n## Reproduction\n\nRun from repository root with the pinned Xyce serial executable:\n\n\`XYCE_BIN=$HOME/.hermes/cache/scratch/xyce-948/install/bin/Xyce spice-heavy pnpm exec tsx benchmarks/reference/subset.ts --output-dir benchmarks/reference/subset-rerun\`\n\nOffline render/hash check: \`pnpm exec tsx benchmarks/reference/subset.ts --render-only --output-dir benchmarks/reference/mutual-948\`.\n\n## Summary buckets (all attempted rows)\n\n${Object.entries(buckets).map(([key, count]) => `- ${key}: ${count}`).join('\n')}\n\n## Selected-subset disagreement buckets\n\n${Object.entries(selectedBuckets).map(([key, count]) => `- ${key}: ${count}`).join('\n')}\n\n## Per-fixture errors and retained exclusions\n\n${table.join('\n')}\n\n## Per-signal errors (all eligible reference rows)\n\n${signalTable.join('\n')}\n`);
  console.log(JSON.stringify(summary));
}

async function main(): Promise<void> {
  const flag = process.argv.indexOf('--output-dir');
  const directory = flag < 0 ? 'benchmarks/reference/mutual-948' : process.argv[flag + 1];
  if (!process.argv.includes('--render-only')) await runCandidates(loadCandidates(), directory, process.argv.includes('--resume'));
  render(directory);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error); process.exitCode = 1; });
