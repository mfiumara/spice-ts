#!/usr/bin/env tsx
/**
 * Corpus-f ingestion (#484): select every self-contained ngspice example and regression-test deck
 * at the pinned revision that is not already in the public corpora, copy it byte-for-byte, and
 * write manifest.json, LICENSE.txt and SOURCES.md.
 *
 * Usage (from the repository root):
 *   git clone https://git.code.sf.net/p/ngspice/ngspice <checkout>
 *   git -C <checkout> checkout 3ef069fb1f04177a153f342a32d941fc20ff047e
 *   pnpm exec tsx benchmarks/corpus/corpus-f/ingest.ts <checkout>
 *   pnpm exec tsx benchmarks/corpus/corpus-f/ingest.ts <checkout> --check   # verify, write nothing
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, relative, resolve } from 'node:path';
import {
  companionReferences,
  CORPUS_ROOT,
  DECK_EXTENSIONS,
  declaredAnalyses,
  type ExclusionReason,
  fixtureId,
  hostCommand,
  needsExternalInput,
  NGSPICE_GIT_URL,
  NGSPICE_REPOSITORY,
  NGSPICE_REVISION,
  sourceUrl,
  thirdPartyNotice,
  UPSTREAM_ROOTS,
} from './lib.js';

export interface CorpusFCircuit {
  id: string;
  sourcePath: string;
  sourceUrl: string;
  localPath: string;
  sha256: string;
  bytes: number;
  licence: 'BSD-3-Clause';
  analyses: string[];
  unmappedAnalyses: string[];
  /** Fixtures of other public corpora with the same file name: likely upstream variants (different bytes). */
  sameNameAs: string[];
}

export interface CorpusFExclusion {
  sourcePath: string;
  sha256: string;
  reason: ExclusionReason;
  detail: string;
}

export interface CorpusFManifest {
  schemaVersion: 1;
  issue: string;
  source: {
    name: string;
    repository: string;
    gitUrl: string;
    revision: string;
    license: 'BSD-3-Clause';
    licenseUrl: string;
    licenseTextSourcePath: 'COPYING';
    licenseTextLocalPath: string;
    licenseTextSha256: string;
    redistributionDecision: string;
    mechanicalAdaptation: string;
  };
  selection: {
    roots: string[];
    deckExtensions: string;
    candidates: number;
    selected: number;
    excluded: Record<ExclusionReason, number>;
    rules: string[];
  };
  circuits: CorpusFCircuit[];
  exclusions: CorpusFExclusion[];
}

const EXCLUSION_ORDER: ExclusionReason[] = ['already-in-corpus', 'duplicate-content', 'licence', 'not-utf8', 'host-command', 'not-self-contained', 'no-analysis'];

export const SELECTION_RULES = [
  'Candidates: every git-tracked file under examples/ and tests/ at the pinned revision whose name ends in .cir, .sp, .net, .deck, .spi, .cki or .ckt.',
  'already-in-corpus: the upstream path is already a fixture of benchmarks/corpus/ngspice, or the bytes (or the bytes without a terminal newline) hash-match any fixture of an existing public corpus.',
  'duplicate-content: the bytes hash-match an earlier candidate (paths sorted); the first path is kept.',
  'licence: the deck carries a third-party copyright or licence notice that the blanket ngspice Modified-BSD grant in COPYING cannot be assumed to cover.',
  'not-utf8: the bytes are not lossless UTF-8, so spice-ts cannot receive the identical deck through its string API.',
  'host-command: the deck runs shell or gnuplot commands on the host; running it unattended would execute host programs, and their output is not a simulator result.',
  'not-self-contained: the deck loads another file (.include/.lib/source/OSDI) or names a sibling upstream file; it cannot run unchanged in an isolated directory. Deferred to a later batch that ships companion files.',
  'no-analysis: no analysis card or control-block analysis command, so neither engine produces a comparable result (subcircuit/model libraries).',
];

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function filesBelow(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true });
  return entries.filter(entry => entry.isFile()).map(entry => resolve(entry.parentPath, entry.name));
}

/** Hashes and upstream paths already covered by the committed public corpora (excluding corpus-f). */
export interface ExistingCorpora {
  hashes: Set<string>;
  ngspicePaths: Set<string>;
  /** Lower-case file name -> repository paths of existing fixtures with that name. */
  names: Map<string, string[]>;
}

export async function existingCorpusIdentity(root: string): Promise<ExistingCorpora> {
  const corpusDirectory = resolve(root, 'benchmarks/corpus');
  const hashes = new Set<string>();
  const names = new Map<string, string[]>();
  for (const corpus of await readdir(corpusDirectory, { withFileTypes: true })) {
    if (!corpus.isDirectory() || corpus.name === 'corpus-f') continue;
    const fixtures = resolve(corpusDirectory, corpus.name, 'fixtures');
    let files: string[] = [];
    try { files = await filesBelow(fixtures); } catch { continue; }
    for (const file of files.sort()) {
      hashes.add(sha256(await readFile(file)));
      const name = basename(file).toLowerCase();
      names.set(name, [...(names.get(name) ?? []), relative(root, file)]);
    }
  }
  const manifest = JSON.parse(await readFile(resolve(corpusDirectory, 'ngspice/manifest.json'), 'utf8')) as { circuits: Array<{ sourcePath: string }> };
  return { hashes, ngspicePaths: new Set(manifest.circuits.map(circuit => circuit.sourcePath)), names };
}

function stripTerminalNewline(bytes: Buffer): Buffer {
  let end = bytes.length;
  if (end > 0 && bytes[end - 1] === 0x0a) end -= 1;
  if (end > 0 && bytes[end - 1] === 0x0d) end -= 1;
  return bytes.subarray(0, end);
}

export function selectDecks(
  candidates: ReadonlyArray<{ sourcePath: string; bytes: Buffer }>,
  upstreamFiles: ReadonlySet<string>,
  existing: ExistingCorpora,
): { circuits: CorpusFCircuit[]; exclusions: CorpusFExclusion[] } {
  const circuits: CorpusFCircuit[] = [];
  const exclusions: CorpusFExclusion[] = [];
  const seen = new Map<string, string>();
  const ids = new Set<string>();
  for (const { sourcePath, bytes } of [...candidates].sort((left, right) => left.sourcePath.localeCompare(right.sourcePath))) {
    const digest = sha256(bytes);
    const text = bytes.toString('utf8');
    const exclude = (reason: ExclusionReason, detail: string): void => {
      exclusions.push({ sourcePath, sha256: digest, reason, detail });
    };
    if (existing.ngspicePaths.has(sourcePath)) { exclude('already-in-corpus', 'upstream path is a benchmarks/corpus/ngspice fixture'); continue; }
    if (existing.hashes.has(digest) || existing.hashes.has(sha256(stripTerminalNewline(bytes)))) {
      exclude('already-in-corpus', 'content hash matches an existing public-corpus fixture');
      continue;
    }
    const earlier = seen.get(digest);
    if (earlier) { exclude('duplicate-content', `identical bytes to ${earlier}`); continue; }
    seen.set(digest, sourcePath);
    const notice = thirdPartyNotice(text);
    if (notice) { exclude('licence', notice); continue; }
    if (!Buffer.from(text, 'utf8').equals(bytes)) { exclude('not-utf8', 'bytes are not lossless UTF-8'); continue; }
    const host = hostCommand(text);
    if (host) { exclude('host-command', host); continue; }
    const external = needsExternalInput(text);
    const companions = companionReferences(text, sourcePath, upstreamFiles);
    if (external || companions.length > 0) {
      exclude('not-self-contained', [external, ...companions.map(path => `references ${path}`)].filter(Boolean).join('; '));
      continue;
    }
    const analyses = declaredAnalyses(text);
    if (analyses.mapped.length === 0 && analyses.unmapped.length === 0) { exclude('no-analysis', 'no analysis card or control-block analysis command'); continue; }
    const id = fixtureId(sourcePath);
    if (ids.has(id)) throw new Error(`fixture id collision: ${id}`);
    ids.add(id);
    circuits.push({
      id,
      sourcePath,
      sourceUrl: sourceUrl(sourcePath),
      localPath: `${CORPUS_ROOT}/fixtures/${sourcePath}`,
      sha256: digest,
      bytes: bytes.byteLength,
      licence: 'BSD-3-Clause',
      analyses: analyses.mapped,
      unmappedAnalyses: analyses.unmapped,
      sameNameAs: existing.names.get(basename(sourcePath).toLowerCase()) ?? [],
    });
  }
  return { circuits, exclusions };
}

function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/`/g, "'");
}

export function renderSources(manifest: CorpusFManifest): string {
  const { source, selection } = manifest;
  const lines = [
    '# corpus-f sources: ngspice examples and regression-test decks (batch 1, #484)',
    '',
    'Generated by `pnpm exec tsx benchmarks/corpus/corpus-f/ingest.ts <ngspice-checkout>`; do not edit by hand.',
    '',
    `- Repository: ${source.repository} (git: ${source.gitUrl})`,
    `- Pinned revision: \`${source.revision}\` (same revision as benchmarks/corpus/ngspice)`,
    `- Licence: ${source.license} (Modified BSD). Upstream \`COPYING\` applies it to all source code, test and example files except listed paths; no path under \`examples/\` or \`tests/\` is listed.`,
    `- Licence source: ${source.licenseUrl}; byte-identical copy at \`${source.licenseTextLocalPath}\` (SHA-256 \`${source.licenseTextSha256}\`).`,
    `- Redistribution decision: ${source.redistributionDecision}`,
    `- Adaptation: ${source.mechanicalAdaptation}`,
    '',
    '## Selection',
    '',
    `- Candidates: ${selection.candidates}; selected: ${selection.selected}; excluded: ${Object.values(selection.excluded).reduce((sum, count) => sum + count, 0)}.`,
    `- Exclusions by reason: ${EXCLUSION_ORDER.map(reason => `${reason} ${selection.excluded[reason]}`).join(', ')}.`,
    '',
    ...selection.rules.map(rule => `- ${rule}`),
    '',
    '## Fixtures',
    '',
    `Every fixture's bytes differ from every fixture of the other public corpora (SHA-256, also with the terminal newline stripped). ${manifest.circuits.filter(circuit => circuit.sameNameAs.length > 0).length} fixtures share a file name with an existing fixture; they are ngspice-modified variants (for example SPICE3 decks edited upstream), listed in the last column so they are not counted as independent evidence by accident.`,
    '',
    '| ID | Upstream path | Revision | Licence | SHA-256 | Local path | Same name in |',
    '|---|---|---|---|---|---|---|',
    ...manifest.circuits.map(circuit => `| \`${circuit.id}\` | [${circuit.sourcePath}](${circuit.sourceUrl}) | \`${source.revision.slice(0, 12)}\` | ${circuit.licence} | \`${circuit.sha256}\` | \`${circuit.localPath}\` | ${circuit.sameNameAs.map(path => `\`${path}\``).join(', ')} |`),
    '',
    '## Exclusions',
    '',
    'Licence exclusions are not committed. Every other exclusion is listed so a later batch can pick it up.',
    '',
    '| Upstream path | Reason | Detail | SHA-256 |',
    '|---|---|---|---|',
    ...manifest.exclusions.map(exclusion => `| [${exclusion.sourcePath}](${sourceUrl(exclusion.sourcePath, source.revision)}) | ${exclusion.reason} | ${cell(exclusion.detail)} | \`${exclusion.sha256}\` |`),
    '',
  ];
  return lines.join('\n');
}

async function main(): Promise<void> {
  const [checkoutArgument] = process.argv.slice(2).filter(argument => !argument.startsWith('--'));
  const check = process.argv.includes('--check');
  if (!checkoutArgument) throw new Error('usage: ingest.ts <ngspice-checkout> [--check]');
  const checkout = resolve(checkoutArgument);
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8' }).trim();
  if (head !== NGSPICE_REVISION) throw new Error(`checkout HEAD ${head} is not the pinned revision ${NGSPICE_REVISION}`);
  const tracked = execFileSync('git', ['ls-files', ...UPSTREAM_ROOTS], { cwd: checkout, encoding: 'utf8' }).split('\n').filter(Boolean);
  const upstreamFiles = new Set(tracked);
  const candidates = await Promise.all(tracked.filter(path => DECK_EXTENSIONS.test(path)).map(async sourcePath => ({
    sourcePath,
    bytes: execFileSync('git', ['show', `${NGSPICE_REVISION}:${sourcePath}`], { cwd: checkout, maxBuffer: 64 * 1024 * 1024 }),
  })));
  const root = resolve('.');
  const { circuits, exclusions } = selectDecks(candidates, upstreamFiles, await existingCorpusIdentity(root));
  const licence = execFileSync('git', ['show', `${NGSPICE_REVISION}:COPYING`], { cwd: checkout });
  const excluded = Object.fromEntries(EXCLUSION_ORDER.map(reason => [reason, exclusions.filter(exclusion => exclusion.reason === reason).length])) as Record<ExclusionReason, number>;
  const manifest: CorpusFManifest = {
    schemaVersion: 1,
    issue: 'https://github.com/mfiumara/spice-ts/issues/484',
    source: {
      name: 'ngspice examples and regression tests',
      repository: NGSPICE_REPOSITORY,
      gitUrl: NGSPICE_GIT_URL,
      revision: NGSPICE_REVISION,
      license: 'BSD-3-Clause',
      licenseUrl: sourceUrl('COPYING'),
      licenseTextSourcePath: 'COPYING',
      licenseTextLocalPath: `${CORPUS_ROOT}/LICENSE.txt`,
      licenseTextSha256: sha256(licence),
      redistributionDecision: 'Allowed. Every committed deck is under examples/ or tests/, which upstream COPYING places under Modified BSD; decks with a third-party notice are excluded and not committed.',
      mechanicalAdaptation: 'None. Every fixture is byte-identical to the pinned revision (SHA-256 pinned per file).',
    },
    selection: {
      roots: [...UPSTREAM_ROOTS],
      deckExtensions: DECK_EXTENSIONS.source,
      candidates: candidates.length,
      selected: circuits.length,
      excluded,
      rules: SELECTION_RULES,
    },
    circuits,
    exclusions,
  };
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  const sourcesText = renderSources(manifest);
  if (check) {
    const committed = await readFile(resolve(CORPUS_ROOT, 'manifest.json'), 'utf8');
    if (committed !== manifestText) throw new Error('committed corpus-f manifest.json differs from a fresh ingestion');
    if (await readFile(resolve(CORPUS_ROOT, 'SOURCES.md'), 'utf8') !== sourcesText) throw new Error('committed corpus-f SOURCES.md differs');
    for (const circuit of circuits) {
      if (sha256(await readFile(resolve(circuit.localPath))) !== circuit.sha256) throw new Error(`${circuit.id}: fixture bytes differ from upstream`);
    }
    process.stderr.write(`corpus-f ingest --check: ${circuits.length} fixtures match upstream ${NGSPICE_REVISION}\n`);
    return;
  }
  await rm(resolve(CORPUS_ROOT, 'fixtures'), { recursive: true, force: true });
  const bytesByPath = new Map(candidates.map(candidate => [candidate.sourcePath, candidate.bytes]));
  for (const circuit of circuits) {
    const target = resolve(circuit.localPath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytesByPath.get(circuit.sourcePath)!);
  }
  await writeFile(resolve(CORPUS_ROOT, 'LICENSE.txt'), licence);
  await writeFile(resolve(CORPUS_ROOT, 'manifest.json'), manifestText);
  await writeFile(resolve(CORPUS_ROOT, 'SOURCES.md'), sourcesText);
  process.stderr.write(`corpus-f ingest: ${candidates.length} candidates, ${circuits.length} selected, ${JSON.stringify(excluded)}\n`);
}

if (basename(process.argv[1] ?? '') === 'ingest.ts') {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
