#!/usr/bin/env tsx
/**
 * Per-signal detail for one corpus-g fixture (#719 triage): runs the byte-identical deck through
 * ngspice-47 and spice-ts exactly as parity.ts does (corpus-f runner and metric, unchanged), then
 * prints every compared signal's normalised error. Diagnostic columns (plain-interpolation
 * locator, reverse-grid error at ngspice points) are not the published metric.
 *
 * Usage (from the repository root, after `pnpm build`):
 *   pnpm exec tsx benchmarks/corpus/corpus-g/triage-detail.ts <fixture-id> [--top N] [--tmax <seconds>] [--deck <variant.cir>]
 *     [--reference-tmax <seconds> [--candidate ngspice]] [--dump <file.json>]
 *
 * --tmax and --deck are diagnostic variants run by BOTH engines; they are never the published
 * comparison. --dump writes both engines' series for offline inspection.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { compareExecutions } from '../../aggregate-report.js';
import { MATCH_THRESHOLD, normalizedSignalErrors, pairedReferenceSeries, peakFloor, sig3 } from '../corpus-f/lib.js';
import { runBoundedSimulate, runNgspice } from '../corpus-f/outcomes.js';
import type { CorpusFCircuit } from '../corpus-f/ingest.js';
import type { CorpusGManifest } from './ingest.js';
import { CORPUS_ROOT } from './lib.js';

interface Sample { re: number; im?: number }
interface Series { grid: number[]; signals: Record<string, Sample[]> }

/** Rewrites every `.tran tstep tstop [tstart [tmax]] [uic]` card to carry the given tmax (as corpus-f/triage-detail.ts; not imported because that module runs main() under this file name). */
export function withTmax(deck: string, tmax: string): string {
  return deck.replace(/^([ \t]*\.tran)[ \t]+(\S+)[ \t]+(\S+)(?:[ \t]+(?!uic\b)(\S+))?(?:[ \t]+(?!uic\b)(\S+))?([ \t]+uic)?[ \t]*$/gim,
    (_line, card: string, step: string, stop: string, start: string | undefined, _max: string | undefined, uic: string | undefined) =>
      `${card} ${step} ${stop} ${start ?? '0'} ${tmax}${uic ?? ''}`);
}

function monotonic(grid: number[]): boolean {
  for (let i = 1; i < grid.length; i += 1) if (grid[i] < grid[i - 1]) return false;
  return true;
}

function interpolate(series: Series, signal: string, x: number): Sample | undefined {
  const values = series.signals[signal];
  const grid = series.grid;
  if (!values || grid.length === 0) return undefined;
  for (let i = 0; i + 1 < grid.length; i += 1) {
    const a = grid[i];
    const b = grid[i + 1];
    if (x < a || x > b) continue;
    const t = b === a ? 0 : (x - a) / (b - a);
    return { re: values[i].re + t * (values[i + 1].re - values[i].re), im: (values[i].im ?? 0) + t * ((values[i + 1].im ?? 0) - (values[i].im ?? 0)) };
  }
  return undefined;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const id = argv[0];
  const option = (name: string): string | undefined => (argv.indexOf(name) >= 0 ? argv[argv.indexOf(name) + 1] : undefined);
  const top = Number(option('--top') ?? 8);
  const manifest = JSON.parse(await readFile(resolve(CORPUS_ROOT, 'manifest.json'), 'utf8')) as CorpusGManifest;
  const found = manifest.circuits.find(candidate => candidate.id === id);
  if (!found) throw new Error(`unknown fixture ${id}`);
  const circuit: CorpusFCircuit = { ...found, licence: 'BSD-3-Clause' as const };
  const deck = option('--deck');
  const original = deck ? await readFile(resolve(deck)) : await readFile(resolve(circuit.localPath));
  if (deck) console.log(`DIAGNOSTIC VARIANT: both engines run ${deck} instead of the committed fixture`);
  const tmax = option('--tmax');
  const input = tmax ? Buffer.from(withTmax(original.toString('utf8'), tmax)) : original;
  if (tmax) console.log(`DIAGNOSTIC VARIANT: .tran TMAX forced to ${tmax} for both engines`);
  // --reference-tmax X [--candidate ngspice]: the reference is ngspice with TMAX forced to X, the
  // candidate (spice-ts, or ngspice itself) runs the unchanged deck on its own grid. A diagnostic
  // of which engine's default-step waveform is closer to a fine-step one; not a convergence proof.
  const referenceTmax = option('--reference-tmax');
  const candidateNgspice = option('--candidate') === 'ngspice';
  if (referenceTmax) console.log(`DIAGNOSTIC: reference = ngspice with .tran TMAX ${referenceTmax}; candidate = ${candidateNgspice ? 'ngspice' : 'spice-ts'} on the unchanged deck ("spice-ts" below means the candidate)`);
  const ngspice = await runNgspice(referenceTmax ? Buffer.from(withTmax(original.toString('utf8'), referenceTmax)) : input, circuit);
  const spiceTs = candidateNgspice ? (await runNgspice(input, circuit)).execution : await runBoundedSimulate(input, {
    id: circuit.id,
    category: 'corpus-g',
    analyses: circuit.analyses as never,
    sourcePath: circuit.sourcePath,
    sourceUrl: circuit.sourceUrl,
    localPath: circuit.localPath,
    sha256: circuit.sha256,
    ngspice: { expectedStatus: 'pass' },
    spiceTs: { expectedStatus: 'pass' },
  });
  console.log(`${circuit.sourcePath}: ngspice ${ngspice.status}, spice-ts ${spiceTs.status}${spiceTs.error ? ` (${spiceTs.error.slice(0, 200)})` : ''}`);
  if (ngspice.status !== 'success' || spiceTs.status !== 'success') return;
  const ngSeries = (analysis: string) => ngspice.execution.analyses.find(candidate => candidate.type === analysis)?.series as Series | undefined;
  const tsSeries = (analysis: string) => spiceTs.analyses.find(candidate => candidate.type === analysis)?.series as Series | undefined;
  const dump = option('--dump');
  if (dump) {
    await writeFile(dump, JSON.stringify({ ngspice: ngspice.execution.analyses, spiceTs: spiceTs.analyses }));
    console.log(`series written to ${dump}`);
  }
  const comparisons = compareExecutions(spiceTs, ngspice.execution);
  const paired = pairedReferenceSeries(spiceTs, ngspice.execution);
  const { errors } = normalizedSignalErrors(comparisons, paired);
  errors.sort((a, b) => b.normalized - a.normalized);
  for (const analysis of new Set(errors.map(error => error.analysis))) {
    const ng = ngSeries(analysis);
    const ts = tsSeries(analysis);
    console.log(`  ${analysis}: ngspice ${ng?.grid.length} points [${ng?.grid[0]} .. ${ng?.grid.at(-1)}], spice-ts ${ts?.grid.length} points [${ts?.grid[0]} .. ${ts?.grid.at(-1)}]`);
  }
  console.log(`  ${errors.length} signals compared, ${errors.filter(error => error.normalized > MATCH_THRESHOLD).length} over ${MATCH_THRESHOLD}`);
  for (const error of errors.slice(0, top)) {
    // The plots the signal was compared in: `.noise` totals live in the second noise plot (#774).
    const ts = spiceTs.analyses.find(candidate => candidate.type === error.analysis && Object.hasOwn(candidate.series.signals, error.signal))?.series as Series | undefined;
    const ng = paired(error.analysis, error.signal) as Series | undefined;
    let at = '';
    let reverse = '';
    if (ts && ng && monotonic(ng.grid) && monotonic(ts.grid)) {
      let worst = -1;
      let where = { x: NaN, ts: NaN, ng: NaN };
      ts.grid.forEach((x, i) => {
        const reference = interpolate(ng, error.signal, x);
        const value = ts.signals[error.signal]?.[i];
        if (!reference || !value) return;
        const diff = Math.hypot(value.re - reference.re, (value.im ?? 0) - (reference.im ?? 0));
        if (diff > worst) { worst = diff; where = { x, ts: value.re, ng: reference.re }; }
      });
      at = ` | plain-grid max near x=${sig3(where.x)}: spice-ts ${sig3(where.ts)} vs ngspice ${sig3(where.ng)}`;
      let back = 0;
      ng.grid.forEach((x, i) => {
        const value = interpolate(ts, error.signal, x);
        const reference = ng.signals[error.signal]?.[i];
        if (!value || !reference) return;
        back = Math.max(back, Math.hypot(value.re - reference.re, (value.im ?? 0) - (reference.im ?? 0)));
      });
      reverse = ` | at ngspice points: ${sig3(back / Math.max(error.ngspicePeak, peakFloor(error.analysis, error.signal)))}`;
    }
    console.log(`  ${sig3(error.normalized)}\t${error.analysis} ${error.signal}\tabs ${sig3(error.absoluteMax)} / peak ${sig3(error.ngspicePeak)}${at}${reverse}`);
  }
}

if (basename(process.argv[1] ?? '') === 'triage-detail.ts' && resolve(process.argv[1]).includes('corpus-g')) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
