/**
 * Fine-timestep ngspice reference column for transient parity rows (#592).
 *
 * The headline metric compares spice-ts with ngspice's default run on the byte-identical deck and
 * stays the only input to every status (matched/mismatch, success/failed). Where ngspice's default
 * output grid is coarse, that metric charges ngspice's own truncation and interpolation error to
 * spice-ts. This module adds a second, diagnostic column: both default runs are scored against one
 * ngspice reference run with a smaller `.tran` TMAX, chosen by ONE corpus-wide rule that reads
 * only the deck's own `.tran` card. Nothing here is tuned per circuit.
 *
 * A single fine reference is not a convergence proof: it is one more discretisation of the same
 * circuit by the same engine, so neither column supports a claim that one engine is more accurate.
 */
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, resolve } from 'node:path';
import { alignAndMeasure, type ComparisonMetrics, type ComplexValue } from './comparison-harness.js';
import { analysisType, type EngineAnalysis, type EngineExecution, findMatchingAnalysis } from './corpus/classic/report.js';
import { firstNgspiceErrorLine, normalizedSignalErrors, pairedReferenceSeries, scrub, sig3 } from './corpus/corpus-f/lib.js';
import { type PackedColumn, readNgspiceRawFilePacked } from './corpus/corpus-f/raw-stream.js';

/** The fine TMAX is the ngspice-47 default step ceiling of the card divided by this. */
export const FINE_REFERENCE_DIVISOR = 10;
/** A fine reference that would need more than this many TMAX steps over TSTOP is not generated. */
export const FINE_REFERENCE_MAX_STEPS = 1_000_000;
/** Wall-clock bound of one fine ngspice run (the corpus-f ngspice bound). */
export const FINE_REFERENCE_TIMEOUT_MS = 600_000;
/**
 * Two time points closer than this fraction of the reference run's TMAX are the same breakpoint:
 * ngspice-47's own breakpoint merge distance, CKTminBreak = 5e-5 x CKTmaxStep (traninit.c).
 */
export const FINE_REFERENCE_BREAK_FRACTION = 5e-5;

export const FINE_REFERENCE_RULE = `Fine-step reference (#592): ngspice-47 runs the same deck with every active .tran card rewritten to TMAX_fine = min(TSTEP, (TSTOP - TSTART)/50, deck TMAX if given) / ${FINE_REFERENCE_DIVISOR}, i.e. the ngspice default step ceiling divided by ${FINE_REFERENCE_DIVISOR}; TSTEP, TSTOP, TSTART, UIC and every other card are unchanged. The rule is the same for every transient fixture. No reference is generated when the deck has no parsable .tran card outside .control, or when TSTOP/TMAX_fine exceeds ${FINE_REFERENCE_MAX_STEPS} steps; the ngspice run is bounded at ${FINE_REFERENCE_TIMEOUT_MS / 1000} s. Each default run (spice-ts, ngspice) is scored by the same procedure: at the reference's output points, with the default run linearly interpolated onto them, over the transient signals of the headline comparison, normalised by the reference peak with the same per-quantity floors. The headline's one-sided breakpoint alignment applies at every default-run time point within ngspice's breakpoint merge distance (CKTminBreak = ${FINE_REFERENCE_BREAK_FRACTION} x TMAX_fine) of a reference time point; the headline matches breakpoints bit for bit, which here would favour ngspice, whose default run lands on its own reference's breakpoint times exactly while spice-ts's land a few ulps away. This charges each engine for its own published waveform, so a coarse output grid counts against whichever engine produced it. Status (matched/mismatch) is defined by the headline column only. One fine reference is not a convergence proof, and neither column is an accuracy ranking of the engines.`;

export const FINE_REFERENCE_CAVEAT = 'One fine reference is not a convergence proof: it is one more discretisation of the same circuit by the same engine. These columns are diagnostics of grid sensitivity, not an accuracy ranking and not a claim that either engine is more accurate. Status stays defined by the headline column.';

export interface WorstSignal {
  /** Worst absolute error divided by the reference peak of that signal (floored), 3 significant digits. */
  worst: number;
  signal: string;
}

export interface FineReference {
  status: 'compared' | 'unavailable';
  /** Fine TMAX written into each active `.tran` card, in deck order. Empty when no card was parsed. */
  tmax: string[];
  reason?: string;
  /** Headline metric (spice-ts vs ngspice default) restricted to the transient signals. */
  headline: WorstSignal | null;
  /** spice-ts default run vs the fine ngspice reference. */
  spiceTsVsFine: WorstSignal | null;
  /** ngspice default run vs the same fine reference, for context. */
  ngspiceDefaultVsFine: WorstSignal | null;
}

const SCALE: ReadonlyArray<[string, number]> = [
  ['meg', 1e6], ['mil', 25.4e-6], ['t', 1e12], ['g', 1e9], ['k', 1e3],
  ['m', 1e-3], ['u', 1e-6], ['µ', 1e-6], ['n', 1e-9], ['p', 1e-12], ['f', 1e-15],
];

/** ngspice number syntax: a decimal with optional exponent, an optional scale suffix, then ignored unit letters. */
export function parseSpiceNumber(token: string): number | undefined {
  const match = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)([a-zµ]*)$/i.exec(token.trim());
  if (!match) return undefined;
  const value = Number(match[1]);
  const suffix = match[2].toLowerCase();
  const scale = SCALE.find(([name]) => suffix.startsWith(name))?.[1] ?? 1;
  return Number.isFinite(value) ? value * scale : undefined;
}

/** Shortest round-trip text of a TMAX value at 6 significant digits (ngspice reads `1e-11`). */
function formatSeconds(value: number): string {
  return String(Number(value.toPrecision(6)));
}

export type FineReferencePlan =
  | { status: 'ready'; deck: string; tmax: string[]; steps: number }
  | { status: 'unavailable'; tmax: string[]; reason: string };

/**
 * Applies the corpus-wide fine-TMAX rule to every active `.tran` card of a deck (title line and
 * `.control` blocks excluded; `+` continuation lines are folded into the card). Pure.
 */
export function fineReferenceDeck(deck: string): FineReferencePlan {
  const newline = deck.includes('\r\n') ? '\r\n' : '\n';
  const lines = deck.split(/\r?\n/);
  const tmax: string[] = [];
  let inControl = false;
  let cards = 0;
  let steps = 0;
  for (let index = 1; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (/^\.control\b/i.test(trimmed)) { inControl = true; continue; }
    if (/^\.endc\b/i.test(trimmed)) { inControl = false; continue; }
    if (inControl) continue;
    const card = /^(\s*\.tran)\b(.*)$/i.exec(lines[index]);
    if (!card) continue;
    let body = card[2];
    let last = index;
    while (last + 1 < lines.length && /^\s*\+/.test(lines[last + 1])) {
      last += 1;
      body += ` ${lines[last].replace(/^\s*\+/, '')}`;
    }
    body = body.replace(/(?:^|\s)[;$].*$/, '');
    const tokens = body.split(/[\s,]+/).filter(Boolean);
    const uic = tokens.length > 0 && /^uic$/i.test(tokens.at(-1)!) ? tokens.pop() : undefined;
    const values = tokens.map(parseSpiceNumber);
    if (tokens.length < 2 || tokens.length > 4 || values.some(value => value === undefined)) {
      return { status: 'unavailable', tmax, reason: `unparsed .tran card: ${scrub(lines[index])}` };
    }
    const [tstep, tstop, tstart = 0, deckTmax] = values as number[];
    const span = tstop - tstart;
    if (!(tstep > 0) || !(span > 0)) {
      return { status: 'unavailable', tmax, reason: `.tran card without a positive TSTEP and TSTOP - TSTART: ${scrub(lines[index])}` };
    }
    const ceiling = Math.min(tstep, span / 50, deckTmax !== undefined && deckTmax > 0 ? deckTmax : Infinity);
    const fine = Number((ceiling / FINE_REFERENCE_DIVISOR).toPrecision(6));
    steps = Math.max(steps, Math.ceil(tstop / fine));
    tmax.push(formatSeconds(fine));
    const start = tokens[2] ?? '0';
    lines[index] = `${card[1]} ${tokens[0]} ${tokens[1]} ${start} ${formatSeconds(fine)}${uic ? ` ${uic}` : ''}`;
    for (let continuation = index + 1; continuation <= last; continuation += 1) lines[continuation] = '*';
    index = last;
    cards += 1;
  }
  if (cards === 0) return { status: 'unavailable', tmax, reason: 'no .tran card outside .control' };
  if (steps > FINE_REFERENCE_MAX_STEPS) {
    return { status: 'unavailable', tmax, reason: `TSTOP/TMAX_fine = ${steps} steps exceeds the ${FINE_REFERENCE_MAX_STEPS}-step budget` };
  }
  return { status: 'ready', deck: lines.join(newline), tmax, steps };
}

/**
 * Read-only view of packed raw columns: a signal's `{ re, im }` samples are built only when that
 * signal is read (a fresh array per read). A 1e6-point fine run of many signals then stays in
 * Float64Arrays instead of one heap object per sample (#839).
 */
function lazyTransient(plotName: string, grid: number[], columns: Record<string, PackedColumn>): EngineAnalysis {
  const signals: Record<string, ComplexValue[]> = {};
  for (const [name, column] of Object.entries(columns)) {
    Object.defineProperty(signals, name, {
      enumerable: true,
      get: () => Array.from(column.re, (re, index) => ({ re, im: column.im[index] })),
    });
  }
  return { type: 'tran', plotName, series: { grid, signals } };
}

/**
 * Runs ngspice-47 in batch mode on a deck and keeps only the transient vectors in `signals`
 * (streaming raw reader into packed columns, so a long fine run is held neither as one string nor
 * as one object per sample; values are the object reader's, bit for bit).
 */
export async function runFineNgspice(
  deck: string,
  fileName: string,
  signals: ReadonlySet<string>,
  timeoutMs = FINE_REFERENCE_TIMEOUT_MS,
): Promise<EngineExecution> {
  const directory = await mkdtemp(resolve(tmpdir(), 'spice-ts-fine-reference-'));
  const netlistPath = resolve(directory, basename(fileName));
  const rawPath = resolve(directory, 'output.raw');
  const failed = (error: string): EngineExecution => ({ status: 'failed', convergence: 'failed', analyses: [], error });
  try {
    await writeFile(netlistPath, deck);
    await writeFile(resolve(directory, '.spiceinit'), 'set filetype=ascii\n');
    const completed = spawnSync('ngspice', ['-b', '-r', basename(rawPath), basename(netlistPath)], {
      cwd: directory,
      encoding: 'utf8',
      env: { ...process.env, HOME: directory },
      timeout: timeoutMs,
      killSignal: 'SIGKILL',
      maxBuffer: 64 * 1024 * 1024,
    });
    if ((completed.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT') {
      return failed(`fine ngspice run exceeded the ${timeoutMs} ms bound`);
    }
    const output = `${completed.stdout ?? ''}\n${completed.stderr ?? ''}`;
    if (completed.error) return failed(scrub(completed.error.message, directory));
    if (completed.status !== 0) {
      return failed(firstNgspiceErrorLine(output, directory) ?? `fine ngspice run exited ${completed.status ?? completed.signal}`);
    }
    let plots;
    try {
      plots = await readNgspiceRawFilePacked(rawPath, (plotName, signal) => analysisType(plotName) === 'tran' && signals.has(signal));
    } catch {
      return failed('fine ngspice run produced no raw file');
    }
    const analyses = plots
      .filter(plot => analysisType(plot.plotName) === 'tran')
      .map(plot => lazyTransient(plot.plotName, plot.grid, plot.signals));
    if (analyses.length === 0) return failed(firstNgspiceErrorLine(output, directory) ?? 'fine ngspice run produced no transient plot');
    return { status: 'success', convergence: 'converged', analyses };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/**
 * Default-run time points that coincide with a reference time point within `tolerance`: the
 * breakpoints both runs landed on (t = 0, source corners, TSTOP). Both grids are transient, so
 * non-decreasing; a two-pointer merge.
 */
export function nearSharedPoints(candidate: readonly number[], reference: readonly number[], tolerance: number): Set<number> {
  const shared = new Set<number>();
  let j = 0;
  for (const point of candidate) {
    while (j < reference.length && reference[j] < point - tolerance) j += 1;
    if (j < reference.length && Math.abs(reference[j] - point) <= tolerance) shared.add(point);
  }
  return shared;
}

/**
 * Scores `candidate` against the fine `reference` on the reference's points: each transient plot of
 * the reference is paired with the candidate's plot (as the headline pairs plots), the candidate is
 * interpolated, and breakpoints are the near-shared points (see FINE_REFERENCE_RULE).
 *
 * `budget` bounds the samples (reference plus candidate points per signal) read per metric call: a
 * plot's sorted signals are measured in contiguous batches and the per-signal metrics merged in
 * that order. The metric is per signal and its grid summary does not depend on the signal list, so
 * the batch size changes no value and no key order (#839). Signals are listed without being read,
 * so a lazy execution (corpus-f's packed views) materialises one batch at a time.
 */
export function compareWithReference(
  reference: EngineExecution,
  candidate: EngineExecution,
  tolerance: number,
  budget = Number.POSITIVE_INFINITY,
): Array<{ analysis: string; metrics: ComparisonMetrics }> {
  const comparisons: Array<{ analysis: string; metrics: ComparisonMetrics }> = [];
  for (const analysis of reference.analyses) {
    const paired = findMatchingAnalysis(candidate.analyses, analysis);
    if (!paired) continue;
    const signals = Object.keys(analysis.series.signals).filter(signal => Object.hasOwn(paired.series.signals, signal)).sort();
    if (signals.length === 0) continue;
    const referenceGrid = analysis.series.grid;
    const candidateGrid = paired.series.grid;
    const breakpoints = nearSharedPoints(candidateGrid, referenceGrid, tolerance);
    const perBatch = Math.max(1, Math.floor(budget / Math.max(1, referenceGrid.length + candidateGrid.length)));
    let merged: ComparisonMetrics | undefined;
    for (let start = 0; start < signals.length; start += perBatch) {
      const batch = signals.slice(start, start + perBatch);
      const pick = (source: Record<string, ComplexValue[]>) => Object.fromEntries(batch.map(signal => [signal, source[signal]]));
      const metrics = alignAndMeasure(
        { grid: referenceGrid, signals: pick(analysis.series.signals) },
        { grid: candidateGrid, signals: pick(paired.series.signals) },
        batch,
        { breakpoints },
      );
      merged = merged === undefined ? metrics : { grid: merged.grid, signals: { ...merged.signals, ...metrics.signals } };
    }
    if (merged) comparisons.push({ analysis: analysis.type, metrics: merged });
  }
  return comparisons;
}

/** The transient analyses of an execution, each restricted to `signals`. Values are forwarded, not read, so a lazy series (#839) stays lazy. */
function transientOnly(execution: EngineExecution, signals: ReadonlySet<string>): EngineExecution {
  return {
    ...execution,
    analyses: execution.analyses
      .filter(analysis => analysis.type === 'tran')
      .map(analysis => {
        const source = analysis.series.signals;
        const kept: Record<string, ComplexValue[]> = {};
        for (const name of Object.keys(source).filter(name => signals.has(name))) {
          Object.defineProperty(kept, name, { enumerable: true, get: () => source[name] });
        }
        return { ...analysis, series: { grid: analysis.series.grid, signals: kept } };
      }),
  };
}

/** Worst normalised signal; `gridOwner` is the execution whose points were compared, `reference` supplies the peaks. */
function worstOf(
  comparisons: ReadonlyArray<{ analysis: string; metrics: ComparisonMetrics }>,
  gridOwner: EngineExecution,
  reference: EngineExecution,
): { worst: WorstSignal | null; missing: number } {
  const { errors, missing } = normalizedSignalErrors(comparisons, pairedReferenceSeries(gridOwner, reference));
  const worst = errors.reduce<typeof errors[number] | null>((current, error) =>
    current === null || error.normalized > current.normalized ? error : current, null);
  return { worst: worst ? { worst: sig3(worst.normalized), signal: worst.signal } : null, missing };
}

/** Signals of the headline transient comparisons. */
export function headlineTransientSignals(comparisons: ReadonlyArray<{ analysis: string; signals?: readonly string[]; metrics: ComparisonMetrics }>): Set<string> {
  return new Set(comparisons
    .filter(comparison => comparison.analysis === 'tran')
    .flatMap(comparison => comparison.signals ?? Object.keys(comparison.metrics.signals)));
}

/**
 * Computes the fine-reference column for one fixture whose headline comparison includes a
 * transient. `headline` are the headline comparisons (spice-ts vs ngspice default).
 */
export async function fineReferenceColumn(input: {
  deck: string;
  fileName: string;
  spiceTs: EngineExecution;
  ngspice: EngineExecution;
  headline: ReadonlyArray<{ analysis: string; signals?: readonly string[]; metrics: ComparisonMetrics }>;
  run?: (deck: string, fileName: string, signals: ReadonlySet<string>) => Promise<EngineExecution>;
  /** Samples read per metric call (see compareWithReference); changes no result. */
  budget?: number;
}): Promise<FineReference> {
  const signals = headlineTransientSignals(input.headline);
  const headline = worstOf(input.headline.filter(comparison => comparison.analysis === 'tran'), input.spiceTs, input.ngspice).worst;
  const plan = fineReferenceDeck(input.deck);
  const unavailable = (tmax: string[], reason: string): FineReference => ({
    status: 'unavailable', tmax, reason, headline, spiceTsVsFine: null, ngspiceDefaultVsFine: null,
  });
  if (plan.status === 'unavailable') return unavailable(plan.tmax, plan.reason);
  const fine = await (input.run ?? runFineNgspice)(plan.deck, input.fileName, signals);
  if (fine.status !== 'success') return unavailable(plan.tmax, `fine ngspice run failed: ${fine.error ?? 'no result'}`);
  const spiceTs = transientOnly(input.spiceTs, signals);
  const ngspice = transientOnly(input.ngspice, signals);
  // Both default runs are interpolated onto the reference's points: the same procedure for each.
  const tolerance = FINE_REFERENCE_BREAK_FRACTION * Math.min(...plan.tmax.map(Number));
  const spiceTsVsFine = worstOf(compareWithReference(fine, spiceTs, tolerance, input.budget), fine, fine);
  const ngspiceVsFine = worstOf(compareWithReference(fine, ngspice, tolerance, input.budget), fine, fine);
  if (spiceTsVsFine.worst === null || ngspiceVsFine.worst === null) {
    return unavailable(plan.tmax, 'the fine reference has none of the headline transient signals');
  }
  const result: FineReference = {
    status: 'compared',
    tmax: plan.tmax,
    headline,
    spiceTsVsFine: spiceTsVsFine.worst,
    ngspiceDefaultVsFine: ngspiceVsFine.worst,
  };
  const missing = spiceTsVsFine.missing + ngspiceVsFine.missing;
  if (missing > 0) result.reason = `${missing} signal comparison(s) against the fine reference were out of range or missing`;
  return result;
}

function cell(value: WorstSignal | null): string {
  return value ? `${value.worst} (${value.signal.replace(/\|/g, '\\|')})` : '';
}

/**
 * Markdown section listing every transient row with its headline and fine-reference columns.
 * `rows` must already be in report order; only rows carrying a `fineReference` are listed.
 */
export function fineReferenceSection(
  rows: ReadonlyArray<{ label: string; status: string; fineReference?: FineReference }>,
  heading = '## Transient fine-step reference (#592)',
): string[] {
  const listed = rows.filter(row => row.fineReference);
  const compared = listed.filter(row => row.fineReference!.status === 'compared');
  const over = (pick: (fine: FineReference) => WorstSignal | null) =>
    compared.filter(row => (pick(row.fineReference!)?.worst ?? 0) > 0.01).length;
  return [
    heading,
    '',
    `- ${FINE_REFERENCE_RULE}`,
    `- ${FINE_REFERENCE_CAVEAT}`,
    `- Transient rows: ${listed.length}; fine reference compared for ${compared.length}, unavailable for ${listed.length - compared.length}. Above 0.01 among compared rows: headline (transient signals) ${over(fine => fine.headline)}, spice-ts vs fine ${over(fine => fine.spiceTsVsFine)}, ngspice default vs fine ${over(fine => fine.ngspiceDefaultVsFine)}.`,
    '',
    '| Fixture | Status (headline) | Headline tran worst (vs ngspice default) | spice-ts vs fine | ngspice default vs fine | Fine TMAX | Note |',
    '|---|---|---|---|---|---|---|',
    ...listed.map(row => {
      const fine = row.fineReference!;
      return `| ${row.label} | ${row.status} | ${cell(fine.headline)} | ${cell(fine.spiceTsVsFine)} | ${cell(fine.ngspiceDefaultVsFine)} | ${fine.tmax.join(', ')} | ${(fine.reason ?? '').replace(/\|/g, '\\|')} |`;
    }),
    '',
  ];
}
