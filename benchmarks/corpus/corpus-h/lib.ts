/**
 * Pure helpers for corpus-h (#785): self-contained SPICE decks from public, non-Xyce, non-ngspice
 * repositories (SpiceSharpParser, PySpice, spicelib, ahkab, WRspice/XicTools, KiCad QA data,
 * xschem) that ngspice-47 runs unchanged.
 *
 * Deck classification (analyses, companion files, host commands, third-party notices) is the
 * corpus-f/corpus-g definition, imported unchanged. Nothing here runs an engine or touches the
 * filesystem.
 */
import { type EngineStatus, fixtureId } from '../corpus-f/lib.js';
import { gapBucket as corpusGGapBucket, type StaticVerdict, staticVerdict, stripTerminalNewline } from '../corpus-g/lib.js';

export { staticVerdict, stripTerminalNewline };
export type { StaticVerdict };

export const CORPUS_ROOT = 'benchmarks/corpus/corpus-h';
/** Netlist extensions considered. `.spice` covers KiCad and xschem netlists. */
export const DECK_EXTENSIONS = /\.(cir|sp|net|ckt|spi|deck|cki|spice)$/i;
/** Wall-clock bound for the ngspice selection probe (same as corpus-g). */
export const PROBE_TIMEOUT_MS = 60_000;
/**
 * At most this many decks per upstream directory (the deck's own directory, per source), in path
 * order, so one example folder cannot dominate a batch. Chosen from the ngspice probe counts only
 * (the largest directory has 13 decks with a reference): spice-ts never runs during selection.
 */
export const PER_DIRECTORY_CAP = 16;

/** SPDX identifiers of the source licences admitted to corpus-h. */
export type Licence = 'MIT' | 'Apache-2.0' | 'GPL-2.0-only' | 'GPL-2.0-or-later' | 'GPL-3.0-only' | 'GPL-3.0-or-later';

export interface UpstreamSource {
  /** Short key; also the first path segment under fixtures/ and licenses/. */
  key: string;
  name: string;
  repository: string;
  revision: string;
  licence: Licence;
  /** Upstream files (repository-relative) that state the licence; retained byte-identical under licenses/<key>/. */
  licenceFiles: string[];
  /** Why the licence covers the candidate decks and allows redistribution. */
  licenceBasis: string;
  /** Path prefixes searched for decks ('' = whole repository). */
  roots: string[];
  /** Path prefixes skipped before any rule, with the reason (recorded in SOURCES.md). */
  skippedPrefixes: Array<{ prefix: string; reason: string }>;
}

/**
 * The sources of this batch. Revisions are the default-branch heads on 2026-10-12. Every source is
 * a public repository whose top-level licence grants redistribution of its files; decks carrying
 * their own copyright or licence notice are excluded by the shared `licence` rule.
 */
export const SOURCES: readonly UpstreamSource[] = [
  {
    key: 'ahkab',
    name: 'ahkab circuit simulator test suite',
    repository: 'https://github.com/ahkab/ahkab',
    revision: '1e8939194b689909b8184ce7eba478b485ff9e3a',
    licence: 'GPL-2.0-only',
    licenceFiles: ['COPYING'],
    licenceBasis: 'Repository-wide GPL-2.0 (`COPYING`, README badge "GPL v2"), as recorded for corpus D at the same revision. Decks not already in corpus D are candidates.',
    roots: ['tests/'],
    skippedPrefixes: [],
  },
  {
    key: 'kicad',
    name: 'KiCad EDA (eeschema SPICE netlist exporter QA data)',
    repository: 'https://gitlab.com/kicad/code/kicad',
    revision: '240efadec4b408919fef7e79deb54ac7c1269597',
    licence: 'GPL-3.0-or-later',
    licenceFiles: ['LICENSE.README', 'LICENSE.GPLv3'],
    licenceBasis: '`LICENSE.README`: the majority of KiCad is GPLv3 or later; the listed exceptions are third-party code under thirdparty/ and libs/, and demos/ (CC BY-SA 4.0). No QA data path is listed as an exception.',
    roots: ['qa/data/eeschema/', 'utils/webview_test/server/data/spice/'],
    skippedPrefixes: [],
  },
  {
    key: 'pyspice',
    name: 'PySpice examples and parser tests',
    repository: 'https://github.com/PySpice-org/PySpice',
    revision: 'fe08718d5a1a9af94576b5aef1fa81910f09b037',
    licence: 'GPL-3.0-or-later',
    licenceFiles: ['LICENSE.txt'],
    licenceBasis: 'Repository-wide GPLv3 (`LICENSE.txt`); source headers grant "version 3 of the License, or (at your option) any later version".',
    roots: [''],
    skippedPrefixes: [],
  },
  {
    key: 'spicelib',
    name: 'spicelib example and test netlists',
    repository: 'https://github.com/nunobrum/spicelib',
    revision: 'd8f8ecceeb361741f1f660f03b03ac49697f8700',
    licence: 'GPL-3.0-only',
    licenceFiles: ['LICENSE'],
    licenceBasis: 'Repository-wide GPLv3 (`LICENSE`, pyproject `license = "GPL-3.0"`, README "GNU V3 License"); no "or later" grant is stated, so GPL-3.0-only is recorded.',
    roots: [''],
    skippedPrefixes: [
      { prefix: 'unittests/golden/', reason: 'expected outputs of spicelib\'s netlist-editor unit tests: machine-edited copies of the examples/testfiles decks, not independent circuits' },
    ],
  },
  {
    key: 'spicesharpparser',
    name: 'SpiceSharpParser example circuits',
    repository: 'https://github.com/SpiceSharp/SpiceSharpParser',
    revision: '8fc01560fe303eeebaeb5cbf5edfe77bf635e1c7',
    licence: 'MIT',
    licenceFiles: ['LICENSE'],
    licenceBasis: 'Repository-wide MIT licence (`LICENSE`, "Copyright (c) 2018-2026 SpiceSharp"), retained with the fixtures as the MIT notice requires.',
    roots: [''],
    skippedPrefixes: [],
  },
  {
    key: 'xictools',
    name: 'XicTools WRspice examples and device-library tests',
    repository: 'https://github.com/wrcad/xictools',
    revision: 'c1244c23a99118843db48cee9860218befe98753',
    licence: 'Apache-2.0',
    licenceFiles: ['license/LICENSE-2.0.txt', 'license/README', 'license/header'],
    licenceBasis: '`license/README`: the distribution is released under Apache-2.0; files derived from earlier work under other terms carry their own sub-header (such decks are excluded by the `licence` rule).',
    roots: ['wrspice/'],
    skippedPrefixes: [],
  },
  {
    key: 'xschem',
    name: 'xschem example netlists',
    repository: 'https://github.com/StefanSchippers/xschem',
    revision: 'ca3e6c9a3e43873d2c367fcfcb3394fd5bedbf41',
    licence: 'GPL-2.0-or-later',
    licenceFiles: ['LICENSE'],
    licenceBasis: '`LICENSE`: GNU GPL version 2 "or (at your option) any later version".',
    roots: [''],
    skippedPrefixes: [],
  },
];

export function sourceByKey(key: string): UpstreamSource {
  const source = SOURCES.find(candidate => candidate.key === key);
  if (!source) throw new Error(`unknown corpus-h source ${key}`);
  return source;
}

export function sourceUrl(source: UpstreamSource, upstreamPath: string): string {
  const path = upstreamPath.split('/').map(encodeURIComponent).join('/');
  if (source.repository.startsWith('https://gitlab.com/')) return `${source.repository}/-/blob/${source.revision}/${path}`;
  return `${source.repository}/blob/${source.revision}/${path}`;
}

/** True if the upstream path is a candidate deck of this source (root, extension, skipped prefixes). */
export function isCandidatePath(source: UpstreamSource, upstreamPath: string): boolean {
  if (!DECK_EXTENSIONS.test(upstreamPath)) return false;
  if (!source.roots.some(root => upstreamPath.startsWith(root))) return false;
  return true;
}

export function skippedPrefix(source: UpstreamSource, upstreamPath: string): string | undefined {
  return source.skippedPrefixes.find(entry => upstreamPath.startsWith(entry.prefix))?.reason;
}

export type ExclusionReason =
  | 'skipped-path'
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
  'skipped-path',
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
  'Candidates: every git-tracked file at the pinned revision of each source, under the listed roots, whose name ends in .cir, .sp, .net, .ckt, .spi, .deck, .cki or .spice.',
  'skipped-path: the path is under a prefix the source table skips, with the reason given there.',
  'already-in-corpus: the bytes (or the bytes without a terminal newline) hash-match a fixture of an existing public corpus (classic, ngspice, xyce, corpus-d/e/f/g and the SPICE3 translations).',
  'duplicate-content: the bytes hash-match an earlier candidate (sources in key order, paths sorted); the first is kept.',
  'licence: the deck carries a copyright or licence notice that the repository-wide licence cannot be assumed to cover (corpus-f rule, unchanged). Not committed.',
  'not-utf8: the bytes are not lossless UTF-8, so spice-ts cannot receive the identical deck through its string API.',
  'host-command: the deck runs shell or gnuplot commands on the host.',
  'not-self-contained: the deck loads another file (.include/.lib/OSDI/source) or names a sibling upstream file, so it cannot run unchanged in an isolated directory.',
  'no-analysis: no analysis card or control-block analysis command.',
  `ngspice-no-reference: ngspice-47 run on the identical bytes (batch mode, ${PROBE_TIMEOUT_MS / 1000} s bound) did not exit 0 with at least one op/dc/ac/tran/pz/noise/disto plot in its raw file, so there is no reference to compare against. The probe result and ngspice's first error line are recorded in ngspice-probe.json. spice-ts is not run during selection.`,
  `directory-cap: at most ${PER_DIRECTORY_CAP} decks per upstream directory (per source), first in path order, among decks that passed every rule above. Capped decks are listed below for later batches.`,
];

/** Hashes already covered by the committed public corpora (excluding corpus-h). */
export interface ExistingCorpora {
  hashes: Set<string>;
  /** Lower-case file name -> repository paths of existing fixtures with that name. */
  names: Map<string, string[]>;
}

export interface Candidate {
  source: string;
  upstreamPath: string;
  /** `<source>/<upstreamPath>`: unique across sources, and the path below fixtures/. */
  sourcePath: string;
  sha256: string;
  /** Hash of the bytes without a terminal newline. */
  sha256Trimmed: string;
  bytes: number;
  verdict: StaticVerdict;
}

export interface ProbeRecord {
  sourcePath: string;
  sha256: string;
  /** success = exit 0 and at least one mapped plot in the raw file. */
  status: 'success' | 'failed' | 'unsupported';
  plots: string[];
  firstErrorLine?: string;
}

export interface CorpusHCircuit {
  id: string;
  source: string;
  upstreamPath: string;
  sourcePath: string;
  sourceUrl: string;
  revision: string;
  localPath: string;
  sha256: string;
  bytes: number;
  licence: Licence;
  analyses: string[];
  unmappedAnalyses: string[];
  sameNameAs: string[];
}

export interface CorpusHExclusion {
  sourcePath: string;
  sha256: string;
  reason: ExclusionReason;
  detail: string;
}

function byPath(left: { sourcePath: string }, right: { sourcePath: string }): number {
  return left.sourcePath < right.sourcePath ? -1 : left.sourcePath > right.sourcePath ? 1 : 0;
}

/** First pass: skipped paths, identity and static rules. Returns the decks that need an ngspice probe. */
export function staticSelection(candidates: ReadonlyArray<Candidate>, existing: ExistingCorpora): {
  eligible: Candidate[];
  exclusions: CorpusHExclusion[];
} {
  const eligible: Candidate[] = [];
  const exclusions: CorpusHExclusion[] = [];
  const seen = new Map<string, string>();
  for (const candidate of [...candidates].sort(byPath)) {
    const exclude = (reason: ExclusionReason, detail: string): void => {
      exclusions.push({ sourcePath: candidate.sourcePath, sha256: candidate.sha256, reason, detail });
    };
    const skipped = skippedPrefix(sourceByKey(candidate.source), candidate.upstreamPath);
    if (skipped) { exclude('skipped-path', skipped); continue; }
    if (existing.hashes.has(candidate.sha256) || existing.hashes.has(candidate.sha256Trimmed)) {
      exclude('already-in-corpus', 'content hash matches an existing public-corpus fixture');
      continue;
    }
    const earlier = seen.get(candidate.sha256) ?? seen.get(candidate.sha256Trimmed);
    if (earlier) { exclude('duplicate-content', `identical bytes to ${earlier}`); continue; }
    seen.set(candidate.sha256, candidate.sourcePath);
    seen.set(candidate.sha256Trimmed, candidate.sourcePath);
    if (candidate.verdict.reason !== null) { exclude(candidate.verdict.reason, candidate.verdict.detail); continue; }
    eligible.push(candidate);
  }
  return { eligible, exclusions };
}

/** Directory a deck counts against for the cap: `<source>/<upstream directory>`. */
export function capDirectory(sourcePath: string): string {
  return sourcePath.split('/').slice(0, -1).join('/');
}

/**
 * Second pass: keep eligible decks that have an ngspice reference, at most `cap` per upstream
 * directory in path order. Only the ngspice probe is consulted, never spice-ts.
 */
export function finalSelection(
  eligible: ReadonlyArray<Candidate>,
  probes: ReadonlyMap<string, ProbeRecord>,
  names: ReadonlyMap<string, string[]>,
  cap = PER_DIRECTORY_CAP,
): { circuits: CorpusHCircuit[]; exclusions: CorpusHExclusion[] } {
  const circuits: CorpusHCircuit[] = [];
  const exclusions: CorpusHExclusion[] = [];
  const perDirectory = new Map<string, string[]>();
  const ids = new Set<string>();
  for (const candidate of [...eligible].sort(byPath)) {
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
    const directory = capDirectory(candidate.sourcePath);
    const kept = perDirectory.get(directory) ?? [];
    if (kept.length >= cap) { exclude('directory-cap', `directory already contributes ${cap} decks`); continue; }
    perDirectory.set(directory, [...kept, candidate.sourcePath]);
    const id = fixtureId(candidate.sourcePath);
    if (ids.has(id)) throw new Error(`fixture id collision: ${id}`);
    ids.add(id);
    const source = sourceByKey(candidate.source);
    const name = candidate.sourcePath.split('/').at(-1)!.toLowerCase();
    circuits.push({
      id,
      source: source.key,
      upstreamPath: candidate.upstreamPath,
      sourcePath: candidate.sourcePath,
      sourceUrl: sourceUrl(source, candidate.upstreamPath),
      revision: source.revision,
      localPath: `${CORPUS_ROOT}/fixtures/${candidate.sourcePath}`,
      sha256: candidate.sha256,
      bytes: candidate.bytes,
      licence: source.licence,
      analyses: candidate.verdict.analyses,
      unmappedAnalyses: candidate.verdict.unmappedAnalyses,
      sameNameAs: names.get(name) ?? [],
    });
  }
  return { circuits, exclusions };
}

/**
 * Gap rules for failures the corpus-g and corpus-f rules do not name. Applied first; like them they
 * read only spice-ts's own first error line, so no fixture is special-cased.
 */
export const CORPUS_H_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/Unsupported \.control command '(?:edit|#\S*)'/i, 'control: edit command and # comment lines inside .control'],
  [/Control script error at line \d+: no such plot/i, 'control: failed setplot aborts the script (ngspice-47 continues)'],
  [/Unsupported \.options field/i, 'directive: other .options fields ngspice-47 accepts (INTERP, ysep, ...)'],
  [/Cannot parse number: '[A-Za-z_][A-Za-z0-9_]*'(?:\s|$)/, 'expression: bare parameter names as values (X-card R=R1, M = 10)'],
  [/Cannot read properties of (?:undefined|null)/, 'crash: uncaught TypeError instead of a structured error'],
  [/Unsupported empty \.probe/i, 'directive: bare .probe card'],
  [/Cannot parse number: '\('/, 'syntax: parenthesised node pairs on controlled-source cards'],
  [/Cannot parse number: '[-+]?[\d.]+[^\x00-\x7f]/, 'syntax: non-ASCII unit suffixes on numbers (27°C)'],
];

/** corpus-h gap bucket: corpus-h rules first, then the corpus-g rules and corpus-f rules unchanged. */
export function gapBucket(error: string | undefined, status: EngineStatus): string | undefined {
  if (status === 'success') return undefined;
  for (const [pattern, bucket] of CORPUS_H_RULES) if (pattern.test(error ?? '')) return bucket;
  return corpusGGapBucket(error, status);
}
