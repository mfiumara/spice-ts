/**
 * Pure helpers for corpus-g (#711): Xyce Regression Suite decks that ngspice-47 runs unchanged.
 *
 * Deck classification (analyses, companion files, host commands, third-party notices) reuses the
 * corpus-f rules unchanged, so both batches apply one definition of "self-contained deck".
 * Nothing here runs an engine or touches the filesystem.
 */
import {
  companionReferences,
  declaredAnalyses,
  type EngineStatus,
  fixtureId,
  gapBucket as corpusFGapBucket,
  hostCommand,
  needsExternalInput,
  thirdPartyNotice,
} from '../corpus-f/lib.js';

export const CORPUS_ROOT = 'benchmarks/corpus/corpus-g';
export const XYCE_REPOSITORY = 'https://github.com/Xyce/Xyce_Regression';
/** Same revision as corpus C (`benchmarks/corpus/xyce`) and xyce-spice3. */
export const XYCE_REVISION = '7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2';
export const UPSTREAM_ROOT = 'Netlists';
/** Netlist extensions used in the suite. Output baselines (.prn, .out) and model libraries are not decks. */
export const DECK_EXTENSIONS = /\.(cir|sp|net|ckt|spi)$/i;
/** Wall-clock bound for the ngspice selection probe. The outcome run uses corpus-f's wider bound. */
export const PROBE_TIMEOUT_MS = 60_000;
/**
 * At most this many decks per suite directory (`Netlists/<suite>`, subdirectories included), in
 * path order. Many suites hold dozens of variants of one circuit (parameter sweeps of one test);
 * the cap spreads the batch over distinct test suites. Chosen from the probe counts only (963
 * reference decks over 128 suites): spice-ts never runs during selection.
 */
export const PER_DIRECTORY_CAP = 1;

export function sourceUrl(sourcePath: string, revision = XYCE_REVISION): string {
  return `${XYCE_REPOSITORY}/blob/${revision}/${sourcePath}`;
}

export type ExclusionReason =
  | 'already-in-corpus'
  | 'duplicate-content'
  | 'licence'
  | 'not-utf8'
  | 'host-command'
  | 'not-self-contained'
  | 'no-analysis'
  | 'ngspice-no-reference'
  | 'directory-cap';

export const EXCLUSION_ORDER: readonly ExclusionReason[] = [
  'already-in-corpus',
  'duplicate-content',
  'licence',
  'not-utf8',
  'host-command',
  'not-self-contained',
  'no-analysis',
  'ngspice-no-reference',
  'directory-cap',
];

export const SELECTION_RULES = [
  `Candidates: every git-tracked file under ${UPSTREAM_ROOT}/ at the pinned revision whose name ends in .cir, .sp, .net, .ckt or .spi.`,
  'already-in-corpus: the upstream path is already a source of another corpus manifest (corpus C `xyce`, `xyce-spice3`), or the bytes (or the bytes without a terminal newline) hash-match any fixture of an existing public corpus (classic, ngspice, xyce, corpus-d/e/f and the SPICE3 translations).',
  'duplicate-content: the bytes hash-match an earlier candidate (paths sorted); the first path is kept.',
  'licence: the deck carries a copyright or licence notice (vendor model text and similar) that the suite-wide GPL-3.0-or-later grant cannot be assumed to cover. Not committed.',
  'not-utf8: the bytes are not lossless UTF-8, so spice-ts cannot receive the identical deck through its string API.',
  'host-command: the deck runs shell or gnuplot commands on the host.',
  'not-self-contained: the deck loads another file (.include/.lib/OSDI) or names a sibling upstream file, so it cannot run unchanged in an isolated directory.',
  'no-analysis: no analysis card or control-block analysis command.',
  `ngspice-no-reference: ngspice-47 run on the identical bytes (batch mode, ${PROBE_TIMEOUT_MS / 1000} s bound) did not exit 0 with at least one op/dc/ac/tran/pz/noise/disto plot in its raw file, so there is no reference to compare against. The probe result and ngspice's first error line are recorded in ngspice-probe.json. spice-ts is not run during selection.`,
  `directory-cap: at most ${PER_DIRECTORY_CAP} deck(s) per suite directory (Netlists/<suite>, subdirectories included), first in path order, among decks that passed every rule above. Capped decks are listed below for later batches.`,
];

/** Hashes and upstream paths already covered by the committed public corpora (excluding corpus-g). */
export interface ExistingCorpora {
  hashes: Set<string>;
  /** Xyce_Regression paths already used as a source by another corpus manifest. */
  xycePaths: Set<string>;
  /** Lower-case file name -> repository paths of existing fixtures with that name. */
  names: Map<string, string[]>;
}

export type StaticVerdict =
  | { reason: Exclude<ExclusionReason, 'already-in-corpus' | 'duplicate-content' | 'ngspice-no-reference' | 'directory-cap'>; detail: string }
  | { reason: null; analyses: string[]; unmappedAnalyses: string[] };

/** Static (engine-free) eligibility of one candidate deck, using the corpus-f rules unchanged. */
export function staticVerdict(bytes: Buffer, sourcePath: string, upstreamFiles: ReadonlySet<string>): StaticVerdict {
  const text = bytes.toString('utf8');
  const notice = thirdPartyNotice(text);
  if (notice) return { reason: 'licence', detail: notice };
  if (!Buffer.from(text, 'utf8').equals(bytes)) return { reason: 'not-utf8', detail: 'bytes are not lossless UTF-8' };
  const host = hostCommand(text);
  if (host) return { reason: 'host-command', detail: host };
  const external = needsExternalInput(text);
  const companions = companionReferences(text, sourcePath, upstreamFiles);
  if (external || companions.length > 0) {
    return { reason: 'not-self-contained', detail: [external, ...companions.map(path => `references ${path}`)].filter(Boolean).join('; ') };
  }
  const analyses = declaredAnalyses(text);
  if (analyses.mapped.length === 0 && analyses.unmapped.length === 0) {
    return { reason: 'no-analysis', detail: 'no analysis card or control-block analysis command' };
  }
  return { reason: null, analyses: analyses.mapped, unmappedAnalyses: analyses.unmapped };
}

export function stripTerminalNewline(bytes: Buffer): Buffer {
  let end = bytes.length;
  if (end > 0 && bytes[end - 1] === 0x0a) end -= 1;
  if (end > 0 && bytes[end - 1] === 0x0d) end -= 1;
  return bytes.subarray(0, end);
}

export interface ProbeRecord {
  sourcePath: string;
  sha256: string;
  /** success = exit 0 and at least one mapped plot in the raw file. */
  status: 'success' | 'failed' | 'unsupported';
  plots: string[];
  firstErrorLine?: string;
}

export interface CorpusGCircuit {
  id: string;
  sourcePath: string;
  sourceUrl: string;
  localPath: string;
  sha256: string;
  bytes: number;
  licence: 'GPL-3.0-or-later';
  analyses: string[];
  unmappedAnalyses: string[];
  sameNameAs: string[];
}

export interface CorpusGExclusion {
  sourcePath: string;
  sha256: string;
  reason: ExclusionReason;
  detail: string;
}

export interface Candidate {
  sourcePath: string;
  sha256: string;
  /** Hash of the bytes without a terminal newline. */
  sha256Trimmed: string;
  bytes: number;
  verdict: StaticVerdict;
}

/** First pass: identity and static rules. Returns the decks that need an ngspice probe. */
export function staticSelection(candidates: ReadonlyArray<Candidate>, existing: ExistingCorpora): {
  eligible: Candidate[];
  exclusions: CorpusGExclusion[];
} {
  const eligible: Candidate[] = [];
  const exclusions: CorpusGExclusion[] = [];
  const seen = new Map<string, string>();
  for (const candidate of [...candidates].sort((left, right) => left.sourcePath.localeCompare(right.sourcePath))) {
    const exclude = (reason: ExclusionReason, detail: string): void => {
      exclusions.push({ sourcePath: candidate.sourcePath, sha256: candidate.sha256, reason, detail });
    };
    if (existing.xycePaths.has(candidate.sourcePath)) { exclude('already-in-corpus', 'upstream path is already a source of another corpus manifest'); continue; }
    if (existing.hashes.has(candidate.sha256) || existing.hashes.has(candidate.sha256Trimmed)) {
      exclude('already-in-corpus', 'content hash matches an existing public-corpus fixture');
      continue;
    }
    const earlier = seen.get(candidate.sha256);
    if (earlier) { exclude('duplicate-content', `identical bytes to ${earlier}`); continue; }
    seen.set(candidate.sha256, candidate.sourcePath);
    if (candidate.verdict.reason !== null) { exclude(candidate.verdict.reason, candidate.verdict.detail); continue; }
    eligible.push(candidate);
  }
  return { eligible, exclusions };
}

/** Suite directory of a deck: `Netlists/MEASURE_AC/sub/x.cir` -> `Netlists/MEASURE_AC`. */
export function suiteDirectory(sourcePath: string): string {
  return sourcePath.split('/').slice(0, 2).join('/');
}

/**
 * Second pass: keep eligible decks that have an ngspice reference, at most PER_DIRECTORY_CAP per
 * suite directory in path order. Only the ngspice probe is consulted, never spice-ts.
 */
export function finalSelection(
  eligible: ReadonlyArray<Candidate>,
  probes: ReadonlyMap<string, ProbeRecord>,
  names: ReadonlyMap<string, string[]>,
  cap = PER_DIRECTORY_CAP,
): { circuits: CorpusGCircuit[]; exclusions: CorpusGExclusion[] } {
  const circuits: CorpusGCircuit[] = [];
  const exclusions: CorpusGExclusion[] = [];
  const perDirectory = new Map<string, string[]>();
  const ids = new Set<string>();
  for (const candidate of [...eligible].sort((left, right) => left.sourcePath.localeCompare(right.sourcePath))) {
    if (candidate.verdict.reason !== null) throw new Error(`${candidate.sourcePath}: not statically eligible`);
    const probe = probes.get(candidate.sourcePath);
    if (!probe || probe.sha256 !== candidate.sha256) throw new Error(`${candidate.sourcePath}: no ngspice probe for these bytes; rerun ingest.ts --probe`);
    const exclude = (reason: ExclusionReason, detail: string): void => {
      exclusions.push({ sourcePath: candidate.sourcePath, sha256: candidate.sha256, reason, detail });
    };
    if (probe.status !== 'success') {
      exclude('ngspice-no-reference', `ngspice ${probe.status}: ${probe.firstErrorLine ?? 'no raw analysis data produced'}`);
      continue;
    }
    const directory = suiteDirectory(candidate.sourcePath);
    const kept = perDirectory.get(directory) ?? [];
    if (kept.length >= cap) { exclude('directory-cap', `directory already contributes ${kept.join(', ')}`); continue; }
    perDirectory.set(directory, [...kept, candidate.sourcePath]);
    const id = fixtureId(candidate.sourcePath.replace(/^Netlists\//, ''));
    if (ids.has(id)) throw new Error(`fixture id collision: ${id}`);
    ids.add(id);
    const name = candidate.sourcePath.split('/').at(-1)!.toLowerCase();
    circuits.push({
      id,
      sourcePath: candidate.sourcePath,
      sourceUrl: sourceUrl(candidate.sourcePath),
      localPath: `${CORPUS_ROOT}/fixtures/${candidate.sourcePath.replace(/^Netlists\//, '')}`,
      sha256: candidate.sha256,
      bytes: candidate.bytes,
      licence: 'GPL-3.0-or-later',
      analyses: candidate.verdict.analyses,
      unmappedAnalyses: candidate.verdict.unmappedAnalyses,
      sameNameAs: names.get(name) ?? [],
    });
  }
  return { circuits, exclusions };
}

/**
 * Gap rules for failures the corpus-f rules do not name (or name with a closed corpus-f issue's
 * bucket although the cause differs). Applied before the corpus-f rules; like them they read only
 * spice-ts's own first error line, so no fixture is special-cased.
 */
const CORPUS_G_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/Unsupported \.options (?:\S+ )?field/i, 'directive: Xyce .options packages that ngspice ignores (DEVICE, NONLIN, TIMEINT, LINSOL, ...)'],
  [/(?:Unknown function|Undefined parameter) '[^']*' (?:\.print\b|\+)/i, 'output: expressions and output variables in .print lines'],
  [/uses unsupported model LEVEL=(?:3|9)\b/i, 'model: MOSFET LEVEL=3 (MOS3) and LEVEL=9 (MOS9)'],
  // LEVEL=14/54 falls through to corpus-f's BSIM4 rule (#3). PSP (102/103) and EKV (260) no longer
  // reach this error: like ngspice-47 INPfindLev, a level above 99 selects MOS1 (#747).
  [/uses unsupported model LEVEL=10\b/i, 'model: compact MOSFET model B3SOI (LEVEL=10)'],
  [/Unsupported source waveform '(?:EXP|SFFM|AM)'|Unsupported PWL source parameters/i, 'source: EXP/SFFM/AM waveforms and PWL TD='],
  [/JFET|'PJF'|Unsupported device card: 'J'/, 'device: JFET forms (PJF model type, instance TEMP=, J card)'],
  [/Unsupported BJT instance parameter: 'IC=/i, 'device: BJT instance IC= initial conditions'],
  [/branch current i\(\.\.\.\) references/i, 'expression: branch-current i() references in B-source expressions'],
  [/Unsupported lossless transmission line parameter/i, 'device: lossless T-line NL=/F= electrical-length form'],
  [/Circuit has no nodes/i, 'deck: element-free deck (ngspice runs an empty analysis)'],
];

/** corpus-g gap bucket: corpus-g rules first, then the corpus-f rules unchanged. */
export function gapBucket(error: string | undefined, status: EngineStatus): string | undefined {
  if (status === 'success') return undefined;
  for (const [pattern, bucket] of CORPUS_G_RULES) if (pattern.test(error ?? '')) return bucket;
  return corpusFGapBucket(error, status);
}
