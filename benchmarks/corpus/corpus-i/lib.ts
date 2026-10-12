/**
 * Pure helpers for corpus-i (#834): self-contained SPICE decks from public repositories that no
 * earlier corpus draws on (FOSSEE eSim examples, VACASK simulator benchmarks, KiCad simulation
 * demos, two small ngspice example repositories) and that ngspice-47 runs unchanged.
 *
 * Deck classification (analyses, companion files, host commands, third-party notices) is the
 * corpus-f/corpus-g definition, and the exclusion reasons, probe record and gap rules are corpus-h's,
 * all imported unchanged. Nothing here runs an engine or touches the filesystem.
 */
import { type EngineStatus, fixtureId } from '../corpus-f/lib.js';
import {
  type Candidate,
  capDirectory,
  gapBucket as corpusHGapBucket,
  type CorpusHExclusion,
  EXCLUSION_ORDER,
  type ExclusionReason,
  type ExistingCorpora,
  type ProbeRecord,
  type StaticVerdict,
  staticVerdict,
  stripTerminalNewline,
} from '../corpus-h/lib.js';

export { capDirectory, EXCLUSION_ORDER, staticVerdict, stripTerminalNewline };
export type { Candidate, ExclusionReason, ExistingCorpora, ProbeRecord, StaticVerdict };
export type CorpusIExclusion = CorpusHExclusion;

export const CORPUS_ROOT = 'benchmarks/corpus/corpus-i';
/**
 * Netlist extensions considered: the corpus-h set plus `.sim` (VACASK benchmark and demo decks) and
 * `.cir.out` (the ngspice-ready deck eSim's KiCad-to-ngspice converter writes next to each `.cir`).
 */
export const DECK_EXTENSIONS = /\.(cir|sp|net|ckt|spi|deck|cki|spice|sim|cir\.out)$/i;
/** Wall-clock bound for the ngspice selection probe (same as corpus-g and corpus-h). */
export const PROBE_TIMEOUT_MS = 60_000;
/** At most this many decks per upstream directory (per source), in path order (same as corpus-h). */
export const PER_DIRECTORY_CAP = 16;

/** SPDX identifiers of the source licences admitted to corpus-i. */
export type Licence = 'MIT' | 'GPL-3.0-only' | 'AGPL-3.0-only' | 'CC-BY-SA-4.0';

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
 * The sources of this batch. Revisions are the default-branch heads on 2026-10-12 (KiCad: the
 * corpus-h revision). Every source is a public repository whose licence grants redistribution of
 * its files; decks carrying their own copyright or licence notice are excluded by the shared
 * `licence` rule. No "or later" grant is stated by any GPL/AGPL source, so the "-only" form is
 * recorded.
 */
export const SOURCES: readonly UpstreamSource[] = [
  {
    key: 'esim',
    name: 'FOSSEE eSim example circuits',
    repository: 'https://github.com/FOSSEE/eSim',
    revision: '1a25a46ce15e0ccc35296dd513f40249c089a5a7',
    licence: 'GPL-3.0-only',
    licenceFiles: ['LICENSE'],
    licenceBasis: 'Repository-wide GNU GPL v3 (`LICENSE`; README "eSim is licensed under the GNU General Public License v3.0"). The only nested licence file (`src/converter/LTSpiceToKiCadConverter/LICENSE`) is outside the `Examples/` root.',
    roots: ['Examples/'],
    skippedPrefixes: [],
  },
  {
    key: 'kicad',
    name: 'KiCad EDA simulation demos',
    repository: 'https://gitlab.com/kicad/code/kicad',
    revision: '240efadec4b408919fef7e79deb54ac7c1269597',
    licence: 'CC-BY-SA-4.0',
    licenceFiles: ['LICENSE.README', 'LICENSE.CC-BY-SA-4.0'],
    licenceBasis: '`LICENSE.README`: "Licensed under CC BY-SA 4.0: All the demo files provided in demos/*". CC BY-SA 4.0 permits verbatim redistribution with attribution; the licence text is retained. Only SPICE text committed upstream is a candidate: `.kicad_sch` schematics are not netlists, and a kicad-cli export would be an adaptation.',
    roots: ['demos/simulation/'],
    skippedPrefixes: [],
  },
  {
    key: 'ngspice-cmos',
    name: 'ngspice-cmos (NGSPICE simulation of CMOS circuits, FreePDK45)',
    repository: 'https://github.com/Teddy-van-Jerry/ngspice-cmos',
    revision: '9f470c6d2558dc3d63fc21681dbdc131a7fea095',
    licence: 'MIT',
    licenceFiles: ['LICENSE'],
    licenceBasis: 'Repository-wide MIT licence (`LICENSE`, "Copyright (c) 2023 Wuqiong Zhao (Teddy van Jerry)"; README "distributed by an MIT license"), retained as the MIT notice requires.',
    roots: [''],
    skippedPrefixes: [],
  },
  {
    key: 'rioslinares',
    name: 'ngspice-examples (gEDA/ngspice RC low-pass examples)',
    repository: 'https://github.com/danielrioslinares/ngspice-examples',
    revision: 'a8f956378acff356a071d974df894c70b37067b0',
    licence: 'GPL-3.0-only',
    licenceFiles: ['LICENSE'],
    licenceBasis: 'Repository-wide GNU GPL v3 (`LICENSE`, GitHub licence metadata gpl-3.0).',
    roots: [''],
    skippedPrefixes: [],
  },
  {
    key: 'vacask',
    name: 'VACASK simulator benchmarks and demos',
    repository: 'https://codeberg.org/arpadbuermen/VACASK',
    revision: 'fb8cc2055a4f10cff1de8017b554d22ea57ce448',
    licence: 'AGPL-3.0-only',
    licenceFiles: ['LICENSE'],
    licenceBasis: 'Repository-wide GNU AGPL v3 (`LICENSE`; README "free software released under the GNU Affero General Public License 3.0"). The `benchmark/<circuit>/ngspice*/` decks are VACASK\'s own ngspice reference netlists; the VACASK, Xyce and Gnucap variants are candidates too and are decided by the ngspice probe.',
    roots: [''],
    skippedPrefixes: [],
  },
];

export function sourceByKey(key: string): UpstreamSource {
  const source = SOURCES.find(candidate => candidate.key === key);
  if (!source) throw new Error(`unknown corpus-i source ${key}`);
  return source;
}

export function sourceUrl(source: UpstreamSource, upstreamPath: string): string {
  const path = upstreamPath.split('/').map(encodeURIComponent).join('/');
  if (source.repository.startsWith('https://gitlab.com/')) return `${source.repository}/-/blob/${source.revision}/${path}`;
  if (source.repository.startsWith('https://codeberg.org/')) return `${source.repository}/src/commit/${source.revision}/${path}`;
  return `${source.repository}/blob/${source.revision}/${path}`;
}

/** True if the upstream path is a candidate deck of this source (root and extension). */
export function isCandidatePath(source: UpstreamSource, upstreamPath: string): boolean {
  if (!DECK_EXTENSIONS.test(upstreamPath)) return false;
  return source.roots.some(root => upstreamPath.startsWith(root));
}

export function skippedPrefix(source: UpstreamSource, upstreamPath: string): string | undefined {
  return source.skippedPrefixes.find(entry => upstreamPath.startsWith(entry.prefix))?.reason;
}

export const SELECTION_RULES = [
  'Candidates: every git-tracked file at the pinned revision of each source, under the listed roots, whose name ends in .cir, .sp, .net, .ckt, .spi, .deck, .cki, .spice, .sim or .cir.out.',
  'skipped-path: the path is under a prefix the source table skips, with the reason given there.',
  'already-in-corpus: the bytes (or the bytes without a terminal newline) hash-match a fixture of an existing public corpus (every other directory under benchmarks/corpus, including corpus-h and ngspice-bugs).',
  'duplicate-content: the bytes hash-match an earlier candidate (sources in key order, paths sorted); the first is kept.',
  'licence: the deck carries a copyright or licence notice that the repository-wide licence cannot be assumed to cover (corpus-f rule, unchanged). Not committed.',
  'not-utf8: the bytes are not lossless UTF-8, so spice-ts cannot receive the identical deck through its string API.',
  'host-command: the deck runs shell or gnuplot commands on the host.',
  'not-self-contained: the deck loads another file (.include/.lib/OSDI/source) or names a sibling upstream file, so it cannot run unchanged in an isolated directory.',
  'no-analysis: no analysis card or control-block analysis command.',
  `ngspice-no-reference: ngspice-47 run on the identical bytes (batch mode, ${PROBE_TIMEOUT_MS / 1000} s bound) did not exit 0 with at least one op/dc/ac/tran/pz/noise/disto plot in its raw file, so there is no reference to compare against. The probe result and ngspice's first error line are recorded in ngspice-probe.json. spice-ts is not run during selection.`,
  `directory-cap: at most ${PER_DIRECTORY_CAP} decks per upstream directory (per source), first in path order, among decks that passed every rule above. Capped decks are listed below for later batches.`,
];

export interface CorpusICircuit {
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

function byPath(left: { sourcePath: string }, right: { sourcePath: string }): number {
  return left.sourcePath < right.sourcePath ? -1 : left.sourcePath > right.sourcePath ? 1 : 0;
}

/** First pass: skipped paths, identity and static rules. Returns the decks that need an ngspice probe. */
export function staticSelection(candidates: ReadonlyArray<Candidate>, existing: ExistingCorpora): {
  eligible: Candidate[];
  exclusions: CorpusIExclusion[];
} {
  const eligible: Candidate[] = [];
  const exclusions: CorpusIExclusion[] = [];
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

/**
 * Second pass: keep eligible decks that have an ngspice reference, at most `cap` per upstream
 * directory in path order. Only the ngspice probe is consulted, never spice-ts.
 */
export function finalSelection(
  eligible: ReadonlyArray<Candidate>,
  probes: ReadonlyMap<string, ProbeRecord>,
  names: ReadonlyMap<string, string[]>,
  cap = PER_DIRECTORY_CAP,
): { circuits: CorpusICircuit[]; exclusions: CorpusIExclusion[] } {
  const circuits: CorpusICircuit[] = [];
  const exclusions: CorpusIExclusion[] = [];
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
 * Gap rules for failures the corpus-h, corpus-g and corpus-f rules do not name. Applied first; like
 * them they read only spice-ts's own first error line, so no fixture is special-cased.
 */
export const CORPUS_I_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/XSPICE code model '[^']+' \(\.model '[^']+'\) is not supported/i, 'device: XSPICE code models not yet implemented (d_jkff, lcouple, zener, ...)'],
  [/XSPICE event-driven instance '[^']+' \([^)]+\) is supported in \.op and \.tran only, not \.ac/i, 'analysis: .ac with XSPICE event-driven digital instances'],
  [/^(?:Resistor|Capacitor|Inductor) '[^']+' references unknown model '[^']+'/, 'expression: bare .param names as R/C/L values (R1 a b rval)'],
  [/<--- Last few GCs --->|JavaScript heap out of memory/, 'harness: spice-ts child exhausts the V8 heap on a long transient'],
];

/** corpus-i gap bucket: corpus-i rules first, then the corpus-h (and through it corpus-g/f) rules unchanged. */
export function gapBucket(error: string | undefined, status: EngineStatus): string | undefined {
  if (status === 'success') return undefined;
  for (const [pattern, bucket] of CORPUS_I_RULES) if (pattern.test(error ?? '')) return bucket;
  return corpusHGapBucket(error, status);
}
