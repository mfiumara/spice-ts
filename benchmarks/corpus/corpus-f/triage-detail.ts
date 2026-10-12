#!/usr/bin/env tsx
/**
 * Per-signal detail for one corpus-f fixture (#511 triage): runs the byte-identical deck through
 * ngspice-47 and spice-ts exactly as outcomes.ts does, then prints every compared signal's
 * normalised error (same metric and threshold as the published table). A separate diagnostic
 * locates the plain-linear-interpolation maximum; it does not apply breakpoint alignment.
 *
 * Usage (from the repository root, after `pnpm build`):
 *   pnpm exec tsx benchmarks/corpus/corpus-f/triage-detail.ts <fixture-id> [--top N] [--tmax <seconds>] [--deck <variant.cir>] [--reference-tmax <seconds> [--candidate ngspice]]
 */
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { compareExecutions } from '../../aggregate-report.js';
import type { CorpusFManifest } from './ingest.js';
import { CORPUS_ROOT, MATCH_THRESHOLD, normalizedSignalErrors, sig3 } from './lib.js';
import { runBoundedSimulate, runNgspice } from './outcomes.js';

interface Sample { re: number; im?: number }
interface Series { grid: number[]; signals: Record<string, Sample[]> }

function magnitude(sample: Sample): number {
  return Math.hypot(sample.re, sample.im ?? 0);
}

function monotonic(grid: number[]): boolean {
  for (let i = 1; i < grid.length; i += 1) if (grid[i] < grid[i - 1]) return false;
  return true;
}

/** Rewrites every `.tran tstep tstop [tstart [tmax]] [uic]` card to carry the given tmax. */
export function withTmax(deck: string, tmax: string): string {
  return deck.replace(/^([ \t]*\.tran)[ \t]+(\S+)[ \t]+(\S+)(?:[ \t]+(?!uic\b)(\S+))?(?:[ \t]+(?!uic\b)(\S+))?([ \t]+uic)?[ \t]*$/gim,
    (_line, card: string, step: string, stop: string, start: string | undefined, _max: string | undefined, uic: string | undefined) =>
      `${card} ${step} ${stop} ${start ?? '0'} ${tmax}${uic ?? ''}`);
}

/** Linear interpolation of the ngspice series onto x (real part and imaginary part separately). */
function interpolate(series: Series, signal: string, x: number): Sample | undefined {
  const values = series.signals[signal];
  const grid = series.grid;
  if (!values || grid.length === 0) return undefined;
  const increasing = grid[grid.length - 1] >= grid[0];
  for (let i = 0; i + 1 < grid.length; i += 1) {
    const a = grid[i];
    const b = grid[i + 1];
    const inside = increasing ? x >= a && x <= b : x <= a && x >= b;
    if (!inside) continue;
    const t = b === a ? 0 : (x - a) / (b - a);
    return { re: values[i].re + t * (values[i + 1].re - values[i].re), im: (values[i].im ?? 0) + t * ((values[i + 1].im ?? 0) - (values[i].im ?? 0)) };
  }
  return undefined;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const id = argv[0];
  const topIndex = argv.indexOf('--top');
  const top = topIndex >= 0 ? Number(argv[topIndex + 1]) : 8;
  const manifest = JSON.parse(await readFile(resolve(CORPUS_ROOT, 'manifest.json'), 'utf8')) as CorpusFManifest;
  const circuit = manifest.circuits.find(candidate => candidate.id === id);
  if (!circuit) throw new Error(`unknown fixture ${id}`);
  const deckIndex = argv.indexOf('--deck');
  const original = deckIndex >= 0 ? await readFile(resolve(argv[deckIndex + 1])) : await readFile(resolve(circuit.localPath));
  if (deckIndex >= 0) console.log(`DIAGNOSTIC VARIANT: both engines run ${argv[deckIndex + 1]} instead of the committed fixture`);
  // --tmax: diagnostic variant only (never the published comparison). Both engines get the same
  // rewritten deck with the .tran maximum step forced, to separate output-grid artefacts from
  // real waveform differences.
  const tmaxIndex = argv.indexOf('--tmax');
  const input = tmaxIndex >= 0 ? Buffer.from(withTmax(original.toString('utf8'), argv[tmaxIndex + 1])) : original;
  if (tmaxIndex >= 0) console.log(`DIAGNOSTIC VARIANT: .tran TMAX forced to ${argv[tmaxIndex + 1]} for both engines`);
  // --reference-tmax X: fine-step diagnostic, not proof of step convergence. The reference is
  // ngspice with TMAX forced to X; the candidate runs the unchanged deck. --candidate ngspice
  // changes the candidate and therefore the comparison grid and breakpoint alignment too.
  // These candidate-grid maxima must not be used as a common-grid engine accuracy ranking.
  const referenceIndex = argv.indexOf('--reference-tmax');
  const ngspiceInput = referenceIndex >= 0 ? Buffer.from(withTmax(original.toString('utf8'), argv[referenceIndex + 1])) : input;
  const candidateNgspice = argv.includes('--candidate') && argv[argv.indexOf('--candidate') + 1] === 'ngspice';
  if (referenceIndex >= 0) {
    console.log(`DIAGNOSTIC: reference = ngspice with .tran TMAX ${argv[referenceIndex + 1]}; candidate = ${candidateNgspice ? 'ngspice' : 'spice-ts'} on the unchanged deck ("spice-ts" below means the candidate)`);
  }
  const ngspice = await runNgspice(ngspiceInput, circuit);
  const spiceTs = candidateNgspice ? (await runNgspice(input, circuit)).execution : await runBoundedSimulate(input, {
    id: circuit.id,
    category: 'corpus-f',
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
  const comparisons = compareExecutions(spiceTs, ngspice.execution);
  const ngSeries = (analysis: string) => ngspice.execution.analyses.find(candidate => candidate.type === analysis)?.series as Series | undefined;
  const tsSeries = (analysis: string) => spiceTs.analyses.find(candidate => candidate.type === analysis)?.series as Series | undefined;
  const { errors } = normalizedSignalErrors(comparisons, ngSeries as never);
  errors.sort((a, b) => b.normalized - a.normalized);
  for (const analysis of new Set(errors.map(error => error.analysis))) {
    const ng = ngSeries(analysis);
    const ts = tsSeries(analysis);
    console.log(`  ${analysis}: ngspice ${ng?.grid.length} points [${ng?.grid[0]} .. ${ng?.grid.at(-1)}], spice-ts ${ts?.grid.length} points [${ts?.grid[0]} .. ${ts?.grid.at(-1)}]`);
  }
  const over = errors.filter(error => error.normalized > MATCH_THRESHOLD).length;
  console.log(`  ${errors.length} signals compared, ${over} over ${MATCH_THRESHOLD}`);
  for (const error of errors.slice(0, top)) {
    const ts = tsSeries(error.analysis);
    const ng = ngSeries(error.analysis);
    let at = '';
    if (ts && ng && monotonic(ng.grid)) {
      let worst = -1;
      let where = { x: NaN, ts: NaN, ng: NaN };
      ts.grid.forEach((x, i) => {
        const reference = interpolate(ng, error.signal, x);
        const value = ts.signals[error.signal]?.[i];
        if (!reference || !value) return;
        const diff = Math.hypot(value.re - reference.re, (value.im ?? 0) - (reference.im ?? 0));
        if (diff > worst) { worst = diff; where = { x, ts: magnitude(value) * Math.sign(value.re || 1), ng: magnitude(reference) * Math.sign(reference.re || 1) }; }
      });
      at = ` | plain-grid diagnostic max near x=${sig3(where.x)}: spice-ts ${sig3(where.ts)} vs ngspice ${sig3(where.ng)}`;
    }
    // Reverse direction (diagnostic only, not the published metric): spice-ts interpolated onto
    // ngspice's own points. A grid artefact (one engine's output grid too coarse for linear
    // interpolation) shows up as a large gap between the two directions.
    let reverse = '';
    if (ts && ng && monotonic(ts.grid) && monotonic(ng.grid)) {
      let worst = 0;
      ng.grid.forEach((x, i) => {
        const value = interpolate(ts, error.signal, x);
        const reference = ng.signals[error.signal]?.[i];
        if (!value || !reference) return;
        worst = Math.max(worst, Math.hypot(value.re - reference.re, (value.im ?? 0) - (reference.im ?? 0)));
      });
      reverse = ` | at ngspice points: ${sig3(worst / Math.max(error.ngspicePeak, 1e-12))}`;
    }
    console.log(`  ${sig3(error.normalized)}\t${error.analysis} ${error.signal}\tabs ${sig3(error.absoluteMax)} / peak ${sig3(error.ngspicePeak)}${at}${reverse}`);
  }
}

if (basename(process.argv[1] ?? '') === 'triage-detail.ts') {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
