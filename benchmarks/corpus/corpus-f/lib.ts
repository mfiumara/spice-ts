/**
 * Pure helpers for corpus-f (#484): the full ngspice examples and regression-test decks.
 *
 * Shared by `ingest.ts` (selection, provenance), `report.ts` (identical-input runs of ngspice-47
 * and spice-ts) and `report.test.ts`. Nothing here runs an engine or touches the filesystem.
 */
import type { ClassicAnalysisType } from '../classic/report.js';
import type { ComparisonMetrics, SampleSeries } from '../../comparison-harness.js';

export const CORPUS_ROOT = 'benchmarks/corpus/corpus-f';
export const NGSPICE_REPOSITORY = 'https://sourceforge.net/p/ngspice/ngspice/ci/master/tree/';
export const NGSPICE_GIT_URL = 'https://git.code.sf.net/p/ngspice/ngspice';
export const NGSPICE_REVISION = '3ef069fb1f04177a153f342a32d941fc20ff047e';
/** Upstream directories ingested by batch 1. */
export const UPSTREAM_ROOTS = ['examples', 'tests'] as const;
/** File extensions treated as candidate decks. Model libraries (.lib, .mod), stimuli and reference outputs are not decks. */
export const DECK_EXTENSIONS = /\.(cir|sp|net|deck|spi|cki|ckt)$/i;
/** Uniform, corpus-wide parity threshold. Never tuned per circuit. */
export const MATCH_THRESHOLD = 0.01;
/** Floor for the normalising peak so that an all-zero reference signal does not divide by zero. */
export const PEAK_FLOOR = 1e-12;

export function sourceUrl(sourcePath: string, revision = NGSPICE_REVISION): string {
  return `https://sourceforge.net/p/ngspice/ngspice/ci/${revision}/tree/${sourcePath}`;
}

/** Analyses the shared corpus harness can map from both engines onto comparable series. */
const MAPPED_ANALYSES: readonly ClassicAnalysisType[] = ['op', 'dc', 'ac', 'tran', 'pz', 'noise', 'disto'];
/** Analyses that exist in ngspice but that the corpus harness does not map. */
const UNMAPPED_ANALYSES = ['sens', 'tf', 'pss', 'sp'] as const;
const ANALYSIS_WORDS = [...MAPPED_ANALYSES, ...UNMAPPED_ANALYSES].join('|');
const DOT_ANALYSIS = new RegExp(`^\\.(${ANALYSIS_WORDS})\\b`, 'i');
const CONTROL_ANALYSIS = new RegExp(`^(${ANALYSIS_WORDS})\\b`, 'i');

export interface DeclaredAnalyses {
  /** Mapped analyses, in first-seen order; handed to the shared spice-ts adapter. */
  mapped: ClassicAnalysisType[];
  /** ngspice analyses the harness does not compare (`.sens`, `.tf`, `.pss`, `.sp`). */
  unmapped: string[];
}

/**
 * Analyses requested by a deck: dot-card analyses outside `.control`, plus bare analysis commands
 * inside `.control` blocks (ngspice runs both). The title line (line 1) is never a card.
 */
export function declaredAnalyses(text: string): DeclaredAnalyses {
  const mapped: ClassicAnalysisType[] = [];
  const unmapped: string[] = [];
  let inControl = false;
  const lines = text.split(/\r?\n/);
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line || line.startsWith('*')) continue;
    const lower = line.toLowerCase();
    if (/^\.control\b/.test(lower)) { inControl = true; continue; }
    if (/^\.endc\b/.test(lower)) { inControl = false; continue; }
    const match = (inControl ? CONTROL_ANALYSIS : DOT_ANALYSIS).exec(line);
    if (!match) continue;
    const name = match[1].toLowerCase();
    if ((MAPPED_ANALYSES as readonly string[]).includes(name)) {
      if (!mapped.includes(name as ClassicAnalysisType)) mapped.push(name as ClassicAnalysisType);
    } else if (!unmapped.includes(name)) {
      unmapped.push(name);
    }
  }
  return { mapped, unmapped };
}

/** Stable, path-derived fixture id: `examples/xspice/foo.cir` -> `examples-xspice-foo-cir`. */
export function fixtureId(sourcePath: string): string {
  return sourcePath.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Upstream files a deck references by name (companion models, stimuli, include files).
 * Such a deck is not self-contained: running it alone in a temporary directory would measure the
 * harness, not the simulator, so batch 1 defers it.
 */
export function companionReferences(text: string, sourcePath: string, upstreamFiles: ReadonlySet<string>): string[] {
  const directory = sourcePath.split('/').slice(0, -1);
  const references = new Set<string>();
  for (const token of text.match(/[A-Za-z0-9_./\\-]+\.[A-Za-z0-9_]+/g) ?? []) {
    const parts = [...directory];
    for (const segment of token.replace(/\\/g, '/').split('/')) {
      if (segment === '' || segment === '.') continue;
      if (segment === '..') parts.pop();
      else parts.push(segment);
    }
    const candidate = parts.join('/');
    if (candidate !== sourcePath && upstreamFiles.has(candidate)) references.add(candidate);
  }
  return [...references].sort();
}

export type ExclusionReason =
  | 'already-in-corpus'
  | 'duplicate-content'
  | 'licence'
  | 'not-utf8'
  | 'host-command'
  | 'not-self-contained'
  | 'no-analysis';

/**
 * Control-language commands that launch host programs (`shell`, `gnuplot`). Running such a deck
 * would execute host commands and open viewers, and their output is not a simulator result.
 */
export function hostCommand(text: string): string | undefined {
  const line = text.split(/\r?\n/).find(candidate => /^\s*(shell|gnuplot|system)\b/i.test(candidate));
  return line?.trim();
}

/**
 * Third-party licence or copyright notices that override the blanket ngspice Modified-BSD grant.
 * Copyright marks count too: `©` anywhere, and `(c)`/`(C)` as a standalone token (start of line,
 * after whitespace, `*` or punctuation, then whitespace, a digit or end of line), so a node probe
 * such as `v(c)` or an expression `(c)*2` is not mistaken for a notice.
 */
const COPYRIGHT_MARK = /©|(?:^|[\s*,;:])\(c\)(?=\s|\d|$)/i;

export function thirdPartyNotice(text: string): string | undefined {
  const line = text
    .split(/\r?\n/)
    .find(candidate => /copyright|licen[cs]e statement|all rights reserved|proprietary|confidential/i.test(candidate) || COPYRIGHT_MARK.test(candidate));
  return line?.trim().replace(/^\*+\s*/, '').replace(/\*+$/, '').trim();
}

/** Drop a deck-level `.include`/`.lib`/OSDI dependency check into one predicate. */
export function needsExternalInput(text: string): string | undefined {
  const include = /^\s*\.(include|inc|lib)\s+(\S+)/im.exec(text);
  if (include) return `.${include[1].toLowerCase()} ${include[2]}`;
  const osdi = /^\s*(pre_osdi|osdi)\s+(\S+)/im.exec(text);
  if (osdi) return `${osdi[1]} ${osdi[2]}`;
  const source = /^\s*source\s+(\S+)/im.exec(text);
  if (source) return `source ${source[1]}`;
  // In ngspice an N element is an OSDI (compiled Verilog-A) device; it needs a compiled .osdi library.
  let inControl = false;
  const osdiDevice = text.split(/\r?\n/).slice(1).find(line => {
    if (/^\s*\.control\b/i.test(line)) inControl = true;
    else if (/^\s*\.endc\b/i.test(line)) inControl = false;
    return !inControl && /^\s*n\S*\s+\S/i.test(line);
  });
  if (osdiDevice) return `OSDI device ${osdiDevice.trim().split(/\s+/)[0]} needs a compiled .osdi library`;
  return undefined;
}

export type EngineStatus = 'success' | 'failed' | 'unsupported';

/** First line of ngspice output that reports an error, with temporary paths removed. */
export function firstNgspiceErrorLine(output: string, temporaryDirectory?: string): string | undefined {
  const lines = output.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const line = lines.find(candidate => /^(error|fatal)\b|\berror\b.*:|^.*\bfatal\b|doAnalyses:|aborted|timestep too small|singular matrix|unknown device|could not find/i.test(candidate)
    && !/^warning\b/i.test(candidate));
  return line === undefined ? undefined : scrub(line, temporaryDirectory);
}

export function scrub(text: string, temporaryDirectory?: string): string {
  const withoutDirectory = temporaryDirectory ? text.split(temporaryDirectory).join('<tmp>') : text;
  return withoutDirectory.replace(/\/(?:private\/)?(?:var\/folders|tmp)\/[^\s'"]+/g, '<tmp>').replace(/\s+/g, ' ').trim().slice(0, 240);
}

/** ngspice failure kind from its own output; ngspice never needs the corpus manifest to decide. */
export function classifyNgspiceFailure(output: string): Exclude<EngineStatus, 'success'> {
  return /unknown device|unknown model|could not find a valid modelname|unknown subckt|not supported|unsupported|unimplemented|no such (?:function|command)|is not available|unknown parameter|undefined parameter|code ?model/i.test(output)
    ? 'unsupported'
    : 'failed';
}

/** First line of a spice-ts error, without temporary paths. */
export function firstSpiceTsErrorLine(error: string | undefined): string | undefined {
  if (!error) return undefined;
  return scrub(error.split(/\r?\n/).find(line => line.trim()) ?? error);
}

const DEVICE_BUCKETS: Record<string, string> = {
  A: 'device: XSPICE A-element code models',
  P: 'device: P/Y-element lossy multiconductor lines (CPL, TXL)',
  Y: 'device: P/Y-element lossy multiconductor lines (CPL, TXL)',
  S: 'device: S/W-element switches',
  W: 'device: S/W-element switches',
};

type GapRule = readonly [RegExp, string | ((match: RegExpExecArray) => string)];

/**
 * Ordered rules from a spice-ts error message to the missing capability it reports. The first
 * matching rule wins; the message text is spice-ts's own, so no fixture is special-cased.
 */
const GAP_RULES: readonly GapRule[] = [
  [/exceeded the \d+ ms aggregate execution bound/, 'timeout: spice-ts exceeded the 120 s bound'],
  [/Unsupported \.control command '(?:tran|dc|op|ac|noise|pz|tf|sens|disto|pss|sp)'/i, 'control: analysis commands inside .control (tran/dc/op/ac/...)'],
  [/Unsupported \.control command|Unexpected character '\$'/i, 'control: ngspice control-language scripting (set/let/save/foreach/meas/...)'],
  [/no spice-ts result for analyses|declares no runnable analysis/i, 'harness: analysis result not produced or not mapped'],
  [/Unsupported device card: '([A-Za-z])'/i, match => DEVICE_BUCKETS[match[1].toUpperCase()] ?? `device: ${match[1].toUpperCase()}-element`],
  [/Cannot parse number: '\[|\b(?:d_lut|d_osc)\b/i, 'device: XSPICE A-element code models'],
  [/\b(?:numd|numos|nbjt)\b/i, 'model: CIDER numerical device models (NUMD/NUMOS/NBJT)'],
  [/\bvdmos\b/i, 'model: VDMOS power MOSFET'],
  [/Cannot parse number: '\d+\.\d+\.\d+'/, 'model: VERSION= strings on BSIM model cards'],
  [/Unsupported (?:NMF|NHFET)|Unsupported Z-card|NMF model level/i, 'model: MESFET/HFET levels and parameters (NMF/NHFET, Z-card)'],
  [/Unsupported BJT Q-card form|VBIC polarity|Unsupported diode parameter/i, 'device: Q/D instance forms (AREA=/M= keywords, thermal nodes, VBIC PNP)'],
  [/Unsupported dot command: '\.(?:meas|measure)'/i, 'directive: .measure'],
  [/Unsupported dot command: '\.global'/i, 'directive: .global'],
  [/Unsupported dot command: '\.temp'|Unsupported \.options field: 'temp'/i, 'directive: .temp / .options temp'],
  [/Unsupported dot command: '\.(?:func|csparam|if|elseif|else|endif|param)'/i, 'directive: numparam extensions (.func, .csparam, .if, string/vector .param)'],
  [/Unsupported \.options field/i, 'directive: other .options fields (noinit, bypass, warn, ramptime, seedinfo)'],
  [/Unsupported dot command: '(\.[A-Za-z_]+)'/i, match => `directive: ${match[1].toLowerCase()}`],
  [/Unsupported source waveform '(?:TRNOISE|TRRANDOM|EXTERNAL)'/i, 'source: TRNOISE/EXTERNAL waveforms'],
  [/portnum|\bz0\b/i, 'source: RF port sources (portnum/z0)'],
  [/Unsupported (?:PWL|PULSE|SIN|SINE|EXP|SFFM|AM|AC) source parameters|Cannot parse number: '\)'|Unsupported source waveform/i, 'source: parenthesised and extended waveform syntax'],
  [/Unsupported behavioral source form|Unsupported behavioral expression/i, 'expression: B-source V= and expression functions/operators'],
  [/Unsupported resistor parameters|Cannot parse number: '(?:r=|rmod|myres|rtest)/i, 'device: R-card forms (r=, ac=, noisy=, resistor models)'],
  [/Cannot parse number: '[A-Za-z_]+' \.model/i, 'model: string-valued model parameters (MFG= and similar)'],
  [/Cannot parse number: '[{'"]|Unexpected character '''|Unexpected character '"'|Cannot parse number: '[^']*\{|Undefined parameter 'temper'|Unknown function/i, 'expression: quoted/brace expressions in values (TEMPER, functions)'],
  [/\.pz .*supports only/i, 'analysis: .pz beyond ideal R, L, C'],
  [/Unsupported \.sens form/i, 'analysis: .sens forms'],
  [/Cannot parse number: '[^']*µ/, 'syntax: µ (micro sign) scale suffix'],
  [/timestep|converg|singular|newton|gmin|source stepping/i, 'convergence'],
  [/No analysis command/i, 'deck: no analysis for spice-ts'],
];

/**
 * Gap bucket for a spice-ts failure. Buckets are derived only from the engine's own error text,
 * so a bucket groups fixtures that fail for the same missing capability.
 */
export function gapBucket(error: string | undefined, status: EngineStatus): string | undefined {
  if (status === 'success') return undefined;
  const text = error ?? '';
  for (const [pattern, bucket] of GAP_RULES) {
    const match = pattern.exec(text);
    if (match) return typeof bucket === 'string' ? bucket : bucket(match);
  }
  return status === 'unsupported' ? 'parse: other unsupported syntax' : 'execution: other failure';
}

function peak(values: ReadonlyArray<{ re: number; im: number }>): number {
  let max = 0;
  for (const value of values) max = Math.max(max, Math.hypot(value.re, value.im));
  return max;
}

export interface SignalError {
  analysis: string;
  signal: string;
  absoluteMax: number;
  ngspicePeak: number;
  /** absoluteMax / max(ngspicePeak, PEAK_FLOOR). */
  normalized: number;
}

/**
 * Per-signal error normalised to the ngspice full-scale value of that signal. One uniform
 * normalisation for every fixture: the threshold applied to it is MATCH_THRESHOLD.
 */
export function normalizedSignalErrors(
  comparisons: ReadonlyArray<{ analysis: string; metrics: ComparisonMetrics }>,
  ngspiceSeries: (analysis: string) => SampleSeries | undefined,
): { errors: SignalError[]; missing: number } {
  const errors: SignalError[] = [];
  let missing = 0;
  for (const comparison of comparisons) {
    const reference = ngspiceSeries(comparison.analysis);
    for (const [signal, metric] of Object.entries(comparison.metrics.signals)) {
      if (metric.status !== 'compared') { missing += 1; continue; }
      const ngspicePeak = reference?.signals[signal] ? peak(reference.signals[signal]) : 0;
      errors.push({
        analysis: comparison.analysis,
        signal,
        absoluteMax: metric.absoluteError.max,
        ngspicePeak,
        normalized: metric.absoluteError.max / Math.max(ngspicePeak, PEAK_FLOOR),
      });
    }
  }
  return { errors, missing };
}

/** Three significant digits: keeps the committed table stable against last-bit platform noise. */
export function sig3(value: number): number {
  return Number.isFinite(value) ? Number(value.toPrecision(3)) : value;
}

export type Outcome = 'matched' | 'mismatch' | 'not-compared' | 'spice-ts-loss' | 'ngspice-failed' | 'both-failed';

export function outcome(input: {
  ngspice: EngineStatus;
  spiceTs: EngineStatus;
  comparedAnalyses: number;
  spiceTsAnalyses: number;
  worstNormalized: number | null;
  missingSignals: number;
}): Outcome {
  if (input.ngspice !== 'success' && input.spiceTs !== 'success') return 'both-failed';
  if (input.ngspice !== 'success') return 'ngspice-failed';
  if (input.spiceTs !== 'success') return 'spice-ts-loss';
  if (input.comparedAnalyses === 0 || input.comparedAnalyses < input.spiceTsAnalyses || input.worstNormalized === null) {
    return 'not-compared';
  }
  return input.worstNormalized <= MATCH_THRESHOLD && input.missingSignals === 0 ? 'matched' : 'mismatch';
}
