#!/usr/bin/env tsx
/**
 * Corpus-h ingestion (#785): self-contained SPICE decks from public non-Xyce, non-ngspice
 * repositories that are not already in a public corpus and that ngspice-47 runs unchanged.
 * Fixtures are copied byte-for-byte; each source's licence files are retained byte-for-byte.
 *
 * Usage (from the repository root):
 *   # one clone per source, named by its key, e.g.
 *   git clone --filter=blob:none --no-checkout https://github.com/ahkab/ahkab <checkouts>/ahkab
 *   ...                                                         (keys and URLs: SOURCES in lib.ts)
 *   spice-heavy pnpm exec tsx benchmarks/corpus/corpus-h/ingest.ts <checkouts> --probe   # ngspice probe -> ngspice-probe.json
 *   pnpm exec tsx benchmarks/corpus/corpus-h/ingest.ts <checkouts>                       # select, copy, write manifest/SOURCES
 *   pnpm exec tsx benchmarks/corpus/corpus-h/ingest.ts <checkouts> --check               # verify, write nothing
 *
 * Every file is read with `git show <pinned revision>:<path>`, so the clones need not be checked
 * out. Selection is spice-ts-blind: only static rules and the recorded ngspice probe decide what is
 * committed.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { probeDeck } from '../corpus-g/ingest.js';
import {
  type Candidate,
  CORPUS_ROOT,
  type CorpusHCircuit,
  type CorpusHExclusion,
  DECK_EXTENSIONS,
  EXCLUSION_ORDER,
  type ExclusionReason,
  type ExistingCorpora,
  finalSelection,
  isCandidatePath,
  type Licence,
  PER_DIRECTORY_CAP,
  PROBE_TIMEOUT_MS,
  type ProbeRecord,
  SELECTION_RULES,
  SOURCES,
  sourceUrl,
  sourceByKey,
  staticSelection,
  staticVerdict,
  stripTerminalNewline,
} from './lib.js';

export interface ManifestSource {
  key: string;
  name: string;
  repository: string;
  revision: string;
  license: Licence;
  licenseBasis: string;
  licenseFiles: Array<{ sourcePath: string; sourceUrl: string; localPath: string; sha256: string }>;
  roots: string[];
  skippedPrefixes: Array<{ prefix: string; reason: string }>;
  candidates: number;
  selected: number;
}

export interface CorpusHManifest {
  schemaVersion: 1;
  issue: string;
  redistributionDecision: string;
  mechanicalAdaptation: string;
  sources: ManifestSource[];
  selection: {
    deckExtensions: string;
    perDirectoryCap: number;
    probe: { tool: string; timeoutMs: number; receipt: string; receiptSha256: string };
    candidates: number;
    selected: number;
    excluded: Record<ExclusionReason, number>;
    licences: Partial<Record<Licence, number>>;
    rules: string[];
  };
  circuits: CorpusHCircuit[];
  exclusions: CorpusHExclusion[];
}

export interface ProbeReceipt {
  schemaVersion: 'spice-ts-corpus-h-ngspice-probe/v1';
  revisions: Record<string, string>;
  ngspice: string;
  command: string;
  timeoutMs: number;
  probes: ProbeRecord[];
}

const PROBE_PATH = resolve(CORPUS_ROOT, 'ngspice-probe.json');
const MANIFEST_PATH = resolve(CORPUS_ROOT, 'manifest.json');
const SOURCES_PATH = resolve(CORPUS_ROOT, 'SOURCES.md');

export function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function filesBelow(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true });
  return entries.filter(entry => entry.isFile()).map(entry => resolve(entry.parentPath, entry.name));
}

/** Every fixture hash of every other public corpus (corpus-h itself excluded). */
export async function existingCorpusIdentity(root: string): Promise<ExistingCorpora> {
  const corpusDirectory = resolve(root, 'benchmarks/corpus');
  const hashes = new Set<string>();
  const names = new Map<string, string[]>();
  for (const corpus of (await readdir(corpusDirectory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
    if (!corpus.isDirectory() || corpus.name === 'corpus-h') continue;
    let files: string[] = [];
    try { files = await filesBelow(resolve(corpusDirectory, corpus.name, 'fixtures')); } catch { files = []; }
    for (const file of files.sort()) {
      const bytes = await readFile(file);
      hashes.add(sha256(bytes));
      hashes.add(sha256(stripTerminalNewline(bytes)));
      const name = basename(file).toLowerCase();
      names.set(name, [...(names.get(name) ?? []), relative(root, file)]);
    }
  }
  return { hashes, names };
}

function gitShow(checkout: string, revision: string, path: string): Buffer {
  return execFileSync('git', ['show', `${revision}:${path}`], { cwd: checkout, maxBuffer: 64 * 1024 * 1024 });
}

async function readCandidates(checkouts: string): Promise<{ candidates: Candidate[]; bytesByPath: Map<string, Buffer> }> {
  const bytesByPath = new Map<string, Buffer>();
  const candidates: Candidate[] = [];
  for (const source of SOURCES) {
    const checkout = resolve(checkouts, source.key);
    execFileSync('git', ['cat-file', '-e', `${source.revision}^{commit}`], { cwd: checkout });
    const tracked = execFileSync('git', ['ls-tree', '-r', '--name-only', '-z', source.revision], { cwd: checkout, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
      .split('\0').filter(Boolean);
    const upstreamFiles = new Set(tracked);
    for (const upstreamPath of tracked.filter(path => isCandidatePath(source, path))) {
      const bytes = gitShow(checkout, source.revision, upstreamPath);
      const sourcePath = `${source.key}/${upstreamPath}`;
      bytesByPath.set(sourcePath, bytes);
      candidates.push({
        source: source.key,
        upstreamPath,
        sourcePath,
        sha256: sha256(bytes),
        sha256Trimmed: sha256(stripTerminalNewline(bytes)),
        bytes: bytes.byteLength,
        verdict: staticVerdict(bytes, upstreamPath, upstreamFiles),
      });
    }
  }
  return { candidates, bytesByPath };
}

function ngspiceVersion(): string {
  try {
    return /ngspice-\d+(?:\.\d+)*/i.exec(execFileSync('ngspice', ['--version'], { encoding: 'utf8' }))?.[0] ?? 'unknown';
  } catch {
    return 'unavailable';
  }
}

async function runProbe(eligible: Candidate[], bytesByPath: Map<string, Buffer>, jobs: number): Promise<ProbeReceipt> {
  const probes = new Array<ProbeRecord>(eligible.length);
  let next = 0;
  let done = 0;
  const worker = async (): Promise<void> => {
    while (next < eligible.length) {
      const index = next;
      next += 1;
      probes[index] = await probeDeck(eligible[index].sourcePath, bytesByPath.get(eligible[index].sourcePath)!);
      done += 1;
      if (done % 25 === 0 || done === eligible.length) process.stderr.write(`corpus-h probe: ${done}/${eligible.length}\n`);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, jobs) }, worker));
  return {
    schemaVersion: 'spice-ts-corpus-h-ngspice-probe/v1',
    revisions: Object.fromEntries(SOURCES.map(source => [source.key, source.revision])),
    ngspice: ngspiceVersion(),
    command: 'ngspice -b -r <raw> <identical-deck> (HOME=<tmp> with .spiceinit "set filetype=ascii")',
    timeoutMs: PROBE_TIMEOUT_MS,
    probes: [...probes].sort((left, right) => (left.sourcePath < right.sourcePath ? -1 : 1)),
  };
}

/** Sources considered for this batch and not committed, with the reason (issue #785 asks for the list). */
export const SKIPPED_SOURCES: ReadonlyArray<{ source: string; reason: string }> = [
  {
    source: 'KiCad eeschema simulation demos (`demos/simulation`)',
    reason: 'Still skipped as in corpus-g: the demos are `.kicad_sch` schematics under CC BY-SA 4.0, so a netlist would be a kicad-cli-generated derivative, and most load vendor model libraries. The KiCad QA SPICE netlists (`qa/data/eeschema`, GPL-3.0-or-later) are committed upstream as SPICE text and are candidates here instead.',
  },
  {
    source: 'ISCAS-85/89 benchmark netlists',
    reason: 'Gate-level `.bench` files, not SPICE: running them needs a transistor-level translation with a chosen cell library (an adaptation). Not committed.',
  },
  {
    source: 'ngspice examples/tests decks that corpus-f deferred as not self-contained (204 decks)',
    reason: 'They need their companion model/stimulus files and a spice-ts include resolver in the runner; the corpus-f runner passes the deck as a string without one. Left for a dedicated batch so this one stays a pure identical-bytes, single-file comparison.',
  },
  {
    source: 'Openly licensed textbook circuits and vendor application notes / LTspice example circuits',
    reason: 'Textbook netlists are embedded in prose (extraction is an adaptation, per-book licence review needed); vendor and LTspice example terms do not grant redistribution. Not committed.',
  },
  {
    source: 'Gnucap regression tests beyond corpus E',
    reason: 'Mostly gnucap-native syntax; corpus E already holds the batch that ngspice can read. Not re-surveyed here.',
  },
  {
    source: 'Decks with their own copyright or licence notice in any source',
    reason: 'Listed below as `licence` exclusions and not committed.',
  },
];

function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/`/g, "'").replace(/\r?\n/g, ' ');
}

export function renderSources(manifest: CorpusHManifest): string {
  const { selection } = manifest;
  const exclusionUrl = (sourcePath: string): string => {
    const [key, ...rest] = sourcePath.split('/');
    return sourceUrl(sourceByKey(key), rest.join('/'));
  };
  const lines = [
    '# corpus-h sources: public non-Xyce SPICE decks that ngspice runs unchanged (#785)',
    '',
    'Generated by `pnpm exec tsx benchmarks/corpus/corpus-h/ingest.ts <checkouts>`; do not edit by hand.',
    '',
    `- Redistribution decision: ${manifest.redistributionDecision}`,
    `- Adaptation: ${manifest.mechanicalAdaptation}`,
    '',
    '## Sources',
    '',
    '| Key | Repository | Pinned revision | Licence | Basis | Retained licence files | Roots | Candidates | Selected |',
    '|---|---|---|---|---|---|---|---|---|',
    ...manifest.sources.map(source => `| \`${source.key}\` | [${source.name}](${source.repository}) | \`${source.revision}\` | ${source.license} | ${cell(source.licenseBasis)} | ${source.licenseFiles.map(file => `[\`${file.localPath.replace(`${CORPUS_ROOT}/`, '')}\`](${file.sourceUrl}) (SHA-256 \`${file.sha256}\`)`).join('<br>')} | ${source.roots.map(root => `\`${root || '(all)'}\``).join(', ')}${source.skippedPrefixes.map(entry => `; skipped \`${entry.prefix}\`: ${cell(entry.reason)}`).join('')} | ${source.candidates} | ${source.selected} |`),
    '',
    '## Selection',
    '',
    `- Candidates: ${selection.candidates}; selected: ${selection.selected}; excluded: ${Object.values(selection.excluded).reduce((sum, count) => sum + count, 0)}.`,
    `- Selected by licence: ${Object.entries(selection.licences).map(([licence, count]) => `${licence} ${count}`).join(', ')}.`,
    `- Exclusions by reason: ${EXCLUSION_ORDER.map(reason => `${reason} ${selection.excluded[reason]}`).join(', ')}.`,
    `- ngspice probe: ${selection.probe.tool}, ${selection.probe.timeoutMs / 1000} s bound; receipt \`${selection.probe.receipt}\` (SHA-256 \`${selection.probe.receiptSha256}\`).`,
    '',
    ...selection.rules.map(rule => `- ${rule}`),
    '',
    '## Skipped sources',
    '',
    ...SKIPPED_SOURCES.map(entry => `- ${entry.source}: ${entry.reason}`),
    '',
    '## Fixtures',
    '',
    `Every fixture's bytes differ from every fixture of the other public corpora (SHA-256, also with the terminal newline stripped). ${manifest.circuits.filter(circuit => circuit.sameNameAs.length > 0).length} fixtures share a file name with an existing fixture of another corpus (different bytes); the last column lists them.`,
    '',
    '| ID | Upstream path | Revision | Licence | SHA-256 | Local path | Same name in |',
    '|---|---|---|---|---|---|---|',
    ...manifest.circuits.map(circuit => `| \`${circuit.id}\` | [${circuit.source}: ${cell(circuit.upstreamPath)}](${circuit.sourceUrl}) | \`${circuit.revision.slice(0, 12)}\` | ${circuit.licence} | \`${circuit.sha256}\` | \`${cell(circuit.localPath)}\` | ${circuit.sameNameAs.map(path => `\`${path}\``).join(', ')} |`),
    '',
    '## Exclusions',
    '',
    'Licence exclusions are not committed. Every other exclusion is listed so a later batch can pick it up (for example `directory-cap` decks, or `not-self-contained` decks with their companion files).',
    '',
    '| Upstream path | Reason | Detail | SHA-256 |',
    '|---|---|---|---|',
    ...manifest.exclusions.map(exclusion => `| [${cell(exclusion.sourcePath)}](${exclusionUrl(exclusion.sourcePath)}) | ${exclusion.reason} | ${cell(exclusion.detail)} | \`${exclusion.sha256}\` |`),
    '',
  ];
  return lines.join('\n');
}

export function buildManifest(input: {
  candidates: Candidate[];
  circuits: CorpusHCircuit[];
  exclusions: CorpusHExclusion[];
  probeSha256: string;
  probeTool: string;
  licenseFiles: Map<string, ManifestSource['licenseFiles']>;
}): CorpusHManifest {
  const byPath = (left: { sourcePath: string }, right: { sourcePath: string }): number => (left.sourcePath < right.sourcePath ? -1 : left.sourcePath > right.sourcePath ? 1 : 0);
  const exclusions = [...input.exclusions].sort(byPath);
  const excluded = Object.fromEntries(EXCLUSION_ORDER.map(reason => [reason, exclusions.filter(exclusion => exclusion.reason === reason).length])) as Record<ExclusionReason, number>;
  const licences: Partial<Record<Licence, number>> = {};
  for (const circuit of input.circuits) licences[circuit.licence] = (licences[circuit.licence] ?? 0) + 1;
  return {
    schemaVersion: 1,
    issue: 'https://github.com/mfiumara/spice-ts/issues/785',
    redistributionDecision: 'Allowed per source under its repository-wide licence (table below); each source\'s licence files are retained byte-identical under licenses/<key>/. The decks are redistributed verbatim as separate benchmark data files: test inputs, not linked into or distributed with any MIT-licensed spice-ts package. Decks that carry their own copyright or licence notice are excluded and not committed.',
    mechanicalAdaptation: 'None. Every fixture is byte-identical to its pinned upstream revision (SHA-256 pinned per file), and both engines read the same bytes.',
    sources: SOURCES.map(source => ({
      key: source.key,
      name: source.name,
      repository: source.repository,
      revision: source.revision,
      license: source.licence,
      licenseBasis: source.licenceBasis,
      licenseFiles: input.licenseFiles.get(source.key) ?? [],
      roots: source.roots,
      skippedPrefixes: source.skippedPrefixes,
      candidates: input.candidates.filter(candidate => candidate.source === source.key).length,
      selected: input.circuits.filter(circuit => circuit.source === source.key).length,
    })),
    selection: {
      deckExtensions: DECK_EXTENSIONS.source,
      perDirectoryCap: PER_DIRECTORY_CAP,
      probe: { tool: input.probeTool, timeoutMs: PROBE_TIMEOUT_MS, receipt: `${CORPUS_ROOT}/ngspice-probe.json`, receiptSha256: input.probeSha256 },
      candidates: input.candidates.length,
      selected: input.circuits.length,
      excluded,
      licences,
      rules: SELECTION_RULES,
    },
    circuits: input.circuits,
    exclusions,
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const [checkoutArgument] = argv.filter((argument, index) => !argument.startsWith('--') && argv[index - 1] !== '--jobs');
  if (!checkoutArgument) throw new Error('usage: ingest.ts <checkouts-directory> [--probe [--jobs N]] [--check]');
  const checkouts = resolve(checkoutArgument);
  const { candidates, bytesByPath } = await readCandidates(checkouts);
  const existing = await existingCorpusIdentity(resolve('.'));
  const { eligible, exclusions: staticExclusions } = staticSelection(candidates, existing);
  if (argv.includes('--probe')) {
    const jobsIndex = argv.indexOf('--jobs');
    const jobs = jobsIndex >= 0 ? Number(argv[jobsIndex + 1]) : 4;
    process.stderr.write(`corpus-h probe: ${candidates.length} candidates, ${eligible.length} statically eligible; pid ${process.pid}\n`);
    const receipt = await runProbe(eligible, bytesByPath, jobs);
    await mkdir(resolve(CORPUS_ROOT), { recursive: true });
    await writeFile(PROBE_PATH, `${JSON.stringify(receipt, null, 2)}\n`);
    const counts = receipt.probes.reduce<Record<string, number>>((acc, probe) => ({ ...acc, [probe.status]: (acc[probe.status] ?? 0) + 1 }), {});
    process.stderr.write(`corpus-h probe: ${JSON.stringify(counts)}\n`);
    return;
  }
  const probeBytes = await readFile(PROBE_PATH);
  const receipt = JSON.parse(probeBytes.toString('utf8')) as ProbeReceipt;
  for (const source of SOURCES) {
    if (receipt.revisions[source.key] !== source.revision) throw new Error(`ngspice-probe.json is for another ${source.key} revision`);
  }
  const probes = new Map(receipt.probes.map(probe => [probe.sourcePath, probe]));
  const { circuits, exclusions } = finalSelection(eligible, probes, existing.names);
  const licenceBytes = new Map<string, Buffer>();
  const licenseFiles = new Map<string, ManifestSource['licenseFiles']>();
  for (const source of SOURCES) {
    const entries: ManifestSource['licenseFiles'] = [];
    for (const path of source.licenceFiles) {
      const bytes = gitShow(resolve(checkouts, source.key), source.revision, path);
      const localPath = `${CORPUS_ROOT}/licenses/${source.key}/${path}`;
      licenceBytes.set(localPath, bytes);
      entries.push({ sourcePath: path, sourceUrl: sourceUrl(source, path), localPath, sha256: sha256(bytes) });
    }
    licenseFiles.set(source.key, entries);
  }
  const manifest = buildManifest({
    candidates,
    circuits,
    exclusions: [...staticExclusions, ...exclusions],
    probeSha256: sha256(probeBytes),
    probeTool: receipt.ngspice,
    licenseFiles,
  });
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  const sourcesText = renderSources(manifest);
  if (argv.includes('--check')) {
    if (await readFile(MANIFEST_PATH, 'utf8') !== manifestText) throw new Error('committed corpus-h manifest.json differs from a fresh ingestion');
    if (await readFile(SOURCES_PATH, 'utf8') !== sourcesText) throw new Error('committed corpus-h SOURCES.md differs');
    for (const circuit of circuits) {
      if (sha256(await readFile(resolve(circuit.localPath))) !== circuit.sha256) throw new Error(`${circuit.id}: fixture bytes differ from upstream`);
    }
    for (const [localPath, bytes] of licenceBytes) {
      if (!(await readFile(resolve(localPath))).equals(bytes)) throw new Error(`${localPath}: licence file differs from upstream`);
    }
    process.stderr.write(`corpus-h ingest --check: ${circuits.length} fixtures match their pinned upstream revisions\n`);
    return;
  }
  await rm(resolve(CORPUS_ROOT, 'fixtures'), { recursive: true, force: true });
  await rm(resolve(CORPUS_ROOT, 'licenses'), { recursive: true, force: true });
  for (const circuit of circuits) {
    const target = resolve(circuit.localPath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytesByPath.get(circuit.sourcePath)!);
  }
  for (const [localPath, bytes] of licenceBytes) {
    await mkdir(dirname(resolve(localPath)), { recursive: true });
    await writeFile(resolve(localPath), bytes);
  }
  await writeFile(MANIFEST_PATH, manifestText);
  await writeFile(SOURCES_PATH, sourcesText);
  process.stderr.write(`corpus-h ingest: ${candidates.length} candidates, ${circuits.length} selected, ${JSON.stringify(manifest.selection.excluded)} ${JSON.stringify(manifest.selection.licences)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
