#!/usr/bin/env tsx
/**
 * Corpus-g ingestion (#711): Xyce Regression Suite decks that are self-contained, not already in a
 * public corpus, and that ngspice-47 runs unchanged. Fixtures are copied byte-for-byte.
 *
 * Usage (from the repository root):
 *   git clone --filter=blob:none https://github.com/Xyce/Xyce_Regression.git <checkout>
 *   git -C <checkout> checkout 7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2
 *   spice-heavy pnpm exec tsx benchmarks/corpus/corpus-g/ingest.ts <checkout> --probe   # ngspice probe -> ngspice-probe.json
 *   pnpm exec tsx benchmarks/corpus/corpus-g/ingest.ts <checkout>                       # select, copy, write manifest/SOURCES
 *   pnpm exec tsx benchmarks/corpus/corpus-g/ingest.ts <checkout> --check               # verify, write nothing
 *
 * Selection is spice-ts-blind: only static rules and the recorded ngspice probe decide what is committed.
 */
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseNgspiceRaw } from '../../comparison-harness.js';
import { analysisType } from '../classic/report.js';
import { classifyNgspiceFailure, firstNgspiceErrorLine, scrub } from '../corpus-f/lib.js';
import {
  type Candidate,
  CORPUS_ROOT,
  type CorpusGCircuit,
  type CorpusGExclusion,
  DECK_EXTENSIONS,
  EXCLUSION_ORDER,
  type ExclusionReason,
  type ExistingCorpora,
  finalSelection,
  PER_DIRECTORY_CAP,
  PROBE_TIMEOUT_MS,
  type ProbeRecord,
  SELECTION_RULES,
  sourceUrl,
  staticSelection,
  staticVerdict,
  stripTerminalNewline,
  UPSTREAM_ROOT,
  XYCE_REPOSITORY,
  XYCE_REVISION,
} from './lib.js';

export interface CorpusGManifest {
  schemaVersion: 1;
  issue: string;
  source: {
    name: string;
    repository: string;
    revision: string;
    license: 'GPL-3.0-or-later';
    licenseUrl: string;
    licenseNoticeSourcePath: 'README.md';
    licenseNoticeLocalPath: string;
    licenseNoticeSha256: string;
    licenseTextUrl: string;
    licenseTextLocalPath: string;
    licenseTextSha256: string;
    redistributionDecision: string;
    mechanicalAdaptation: string;
  };
  selection: {
    root: string;
    deckExtensions: string;
    perDirectoryCap: number;
    probe: { tool: string; timeoutMs: number; receipt: string; receiptSha256: string };
    candidates: number;
    selected: number;
    excluded: Record<ExclusionReason, number>;
    rules: string[];
  };
  circuits: CorpusGCircuit[];
  exclusions: CorpusGExclusion[];
}

export interface ProbeReceipt {
  schemaVersion: 'spice-ts-corpus-g-ngspice-probe/v1';
  revision: string;
  ngspice: string;
  command: string;
  timeoutMs: number;
  probes: ProbeRecord[];
}

const PROBE_PATH = resolve(CORPUS_ROOT, 'ngspice-probe.json');
const MANIFEST_PATH = resolve(CORPUS_ROOT, 'manifest.json');
const SOURCES_PATH = resolve(CORPUS_ROOT, 'SOURCES.md');
/** The GPLv3 text is the same file corpus C retains (fetched from gnu.org; byte-identical). */
const GPL_TEXT_SOURCE = 'benchmarks/corpus/xyce/COPYING.txt';
const GPL_TEXT_URL = 'https://www.gnu.org/licenses/gpl-3.0.txt';

export function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function filesBelow(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true });
  return entries.filter(entry => entry.isFile()).map(entry => resolve(entry.parentPath, entry.name));
}

/** Every fixture hash of every other corpus, plus Xyce_Regression paths any other manifest already cites. */
export async function existingCorpusIdentity(root: string): Promise<ExistingCorpora> {
  const corpusDirectory = resolve(root, 'benchmarks/corpus');
  const hashes = new Set<string>();
  const names = new Map<string, string[]>();
  const xycePaths = new Set<string>();
  for (const corpus of (await readdir(corpusDirectory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
    if (!corpus.isDirectory() || corpus.name === 'corpus-g') continue;
    let files: string[] = [];
    try { files = await filesBelow(resolve(corpusDirectory, corpus.name, 'fixtures')); } catch { files = []; }
    for (const file of files.sort()) {
      hashes.add(sha256(await readFile(file)));
      const name = basename(file).toLowerCase();
      names.set(name, [...(names.get(name) ?? []), relative(root, file)]);
    }
    let manifest = '';
    try { manifest = await readFile(resolve(corpusDirectory, corpus.name, 'manifest.json'), 'utf8'); } catch { continue; }
    for (const match of manifest.matchAll(/"(Netlists\/[^"]+)"/g)) xycePaths.add(match[1]);
  }
  return { hashes, xycePaths, names };
}

async function readCandidates(checkout: string): Promise<{ candidates: Candidate[]; bytesByPath: Map<string, Buffer> }> {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8' }).trim();
  if (head !== XYCE_REVISION) throw new Error(`checkout HEAD ${head} is not the pinned revision ${XYCE_REVISION}`);
  const tracked = execFileSync('git', ['ls-files', UPSTREAM_ROOT], { cwd: checkout, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n').filter(Boolean);
  const upstreamFiles = new Set(tracked);
  const bytesByPath = new Map<string, Buffer>();
  const candidates: Candidate[] = [];
  for (const sourcePath of tracked.filter(path => DECK_EXTENSIONS.test(path))) {
    const bytes = execFileSync('git', ['show', `${XYCE_REVISION}:${sourcePath}`], { cwd: checkout, maxBuffer: 64 * 1024 * 1024 });
    bytesByPath.set(sourcePath, bytes);
    candidates.push({
      sourcePath,
      sha256: sha256(bytes),
      sha256Trimmed: sha256(stripTerminalNewline(bytes)),
      bytes: bytes.byteLength,
      verdict: staticVerdict(bytes, sourcePath, upstreamFiles),
    });
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

/** ngspice-47 on the identical bytes, same invocation as corpus-f outcomes.ts, with the probe bound. */
export async function probeDeck(sourcePath: string, bytes: Buffer): Promise<ProbeRecord> {
  const directory = await mkdtemp(resolve(tmpdir(), 'spice-ts-corpus-g-probe-'));
  const netlist = basename(sourcePath);
  try {
    await writeFile(resolve(directory, netlist), bytes);
    await writeFile(resolve(directory, '.spiceinit'), 'set filetype=ascii\n');
    const { code, output, timedOut } = await new Promise<{ code: number | null; output: string; timedOut: boolean }>(done => {
      const child = spawn('ngspice', ['-b', '-r', 'output.raw', netlist], { cwd: directory, env: { ...process.env, HOME: directory }, stdio: ['ignore', 'pipe', 'pipe'] });
      let text = '';
      let killed = false;
      child.stdout.on('data', chunk => { if (text.length < 4_000_000) text += chunk; });
      child.stderr.on('data', chunk => { if (text.length < 4_000_000) text += chunk; });
      const timer = setTimeout(() => { killed = true; child.kill('SIGKILL'); }, PROBE_TIMEOUT_MS);
      child.on('close', exitCode => { clearTimeout(timer); done({ code: exitCode, output: text, timedOut: killed }); });
    });
    const record = (status: ProbeRecord['status'], plots: string[], line?: string): ProbeRecord => {
      const result: ProbeRecord = { sourcePath, sha256: sha256(bytes), status, plots };
      if (line) result.firstErrorLine = line;
      return result;
    };
    if (timedOut) return record('failed', [], `ngspice exceeded the ${PROBE_TIMEOUT_MS} ms probe bound`);
    const errorLine = firstNgspiceErrorLine(output, directory);
    if (code !== 0) return record(classifyNgspiceFailure(output), [], errorLine ?? `ngspice exited ${code}`);
    let raw = '';
    try { raw = await readFile(resolve(directory, 'output.raw'), 'utf8'); } catch { raw = ''; }
    let plots: string[] = [];
    try {
      plots = parseNgspiceRaw(raw).map(plot => analysisType(plot.plotName)).filter((type): type is NonNullable<typeof type> => type !== null);
    } catch (error) {
      return record('failed', [], scrub(`raw file could not be parsed: ${(error as Error).message}`, directory));
    }
    if (plots.length === 0) return record(errorLine ? classifyNgspiceFailure(output) : 'failed', [], errorLine ?? 'no raw analysis data produced');
    return record('success', plots);
  } finally {
    await rm(directory, { recursive: true, force: true });
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
      if (done % 50 === 0 || done === eligible.length) process.stderr.write(`corpus-g probe: ${done}/${eligible.length}\n`);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, jobs) }, worker));
  return {
    schemaVersion: 'spice-ts-corpus-g-ngspice-probe/v1',
    revision: XYCE_REVISION,
    ngspice: ngspiceVersion(),
    command: 'ngspice -b -r <raw> <identical-deck> (HOME=<tmp> with .spiceinit "set filetype=ascii")',
    timeoutMs: PROBE_TIMEOUT_MS,
    probes,
  };
}

/** Sources considered for this batch and not committed, with the reason (issue #711 asks for the list). */
export const SKIPPED_SOURCES: ReadonlyArray<{ source: string; reason: string }> = [
  {
    source: 'KiCad eeschema simulation demos (`demos/simulation` of KiCad 10.0.5, https://gitlab.com/kicad/code/kicad/-/tree/master/demos/simulation)',
    reason: 'The demos ship `.kicad_sch` schematics, not SPICE decks: a netlist would be a kicad-cli-generated derivative (an adaptation, and its bytes depend on the KiCad version). Most demos also load vendor model libraries (AD8051, AD8009, LM317, OPA1641, IRF VDMOS, GaN Systems and ST SiC PSpice models) whose own notices the KiCad licence cannot be assumed to cover. Skipped; a later batch can commit generated netlists for the demos that use only built-in models, with the generator command recorded.',
  },
  {
    source: 'ISCAS-85/89 combinational and sequential benchmark netlists',
    reason: 'Gate-level `.bench` files, not SPICE: running them needs a transistor-level translation with a chosen cell library, which is an adaptation this batch avoids. The MCNC/CircuitSim90 transistor-level decks that the Xyce suite redistributes are in scope instead (one per suite directory here, the rest listed as directory-cap).',
  },
  {
    source: 'Openly licensed textbook circuits (for example Lessons In Electric Circuits, Design Science License)',
    reason: 'The netlists are embedded in prose, so extracting them is an adaptation, and each would need a per-book licence review. Not evaluated in this batch.',
  },
  {
    source: 'Vendor application notes and LTspice example circuits',
    reason: 'Their terms do not grant redistribution. Skipped (link-only at most).',
  },
  {
    source: 'Xyce Regression decks with their own copyright or licence notice',
    reason: 'Listed below as `licence` exclusions and not committed.',
  },
];

function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/`/g, "'");
}

export function renderSources(manifest: CorpusGManifest): string {
  const { source, selection } = manifest;
  const lines = [
    '# corpus-g sources: Xyce Regression Suite decks that ngspice runs unchanged (#711)',
    '',
    'Generated by `pnpm exec tsx benchmarks/corpus/corpus-g/ingest.ts <Xyce_Regression-checkout>`; do not edit by hand.',
    '',
    `- Repository: ${source.repository}`,
    `- Pinned revision: \`${source.revision}\` (same revision as corpus C \`benchmarks/corpus/xyce\` and \`xyce-spice3\`)`,
    `- Licence: ${source.license}. The pinned [README copyright and licence notice](${source.licenseUrl}) grants redistribution and modification under the GNU GPL version 3 or later.`,
    `- Licence retention: the byte-identical upstream README is \`${source.licenseNoticeLocalPath}\` (SHA-256 \`${source.licenseNoticeSha256}\`); the complete GPLv3 text from ${source.licenseTextUrl} is \`${source.licenseTextLocalPath}\` (SHA-256 \`${source.licenseTextSha256}\`).`,
    `- Redistribution decision: ${source.redistributionDecision}`,
    `- Adaptation: ${source.mechanicalAdaptation}`,
    '',
    '## Selection',
    '',
    `- Candidates: ${selection.candidates}; selected: ${selection.selected}; excluded: ${Object.values(selection.excluded).reduce((sum, count) => sum + count, 0)}.`,
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
    ...manifest.circuits.map(circuit => `| \`${circuit.id}\` | [${circuit.sourcePath}](${circuit.sourceUrl}) | \`${source.revision.slice(0, 12)}\` | ${circuit.licence} | \`${circuit.sha256}\` | \`${circuit.localPath}\` | ${circuit.sameNameAs.map(path => `\`${path}\``).join(', ')} |`),
    '',
    '## Exclusions',
    '',
    'Licence exclusions are not committed. Every other exclusion is listed so a later batch can pick it up (for example `directory-cap` decks, or `not-self-contained` decks with their companion files).',
    '',
    '| Upstream path | Reason | Detail | SHA-256 |',
    '|---|---|---|---|',
    ...manifest.exclusions.map(exclusion => `| [${exclusion.sourcePath}](${sourceUrl(exclusion.sourcePath, source.revision)}) | ${exclusion.reason} | ${cell(exclusion.detail)} | \`${exclusion.sha256}\` |`),
    '',
  ];
  return lines.join('\n');
}

export function buildManifest(input: {
  candidates: Candidate[];
  circuits: CorpusGCircuit[];
  exclusions: CorpusGExclusion[];
  probeSha256: string;
  probeTool: string;
  noticeSha256: string;
  gplSha256: string;
}): CorpusGManifest {
  const exclusions = [...input.exclusions].sort((left, right) => left.sourcePath.localeCompare(right.sourcePath));
  const excluded = Object.fromEntries(EXCLUSION_ORDER.map(reason => [reason, exclusions.filter(exclusion => exclusion.reason === reason).length])) as Record<ExclusionReason, number>;
  return {
    schemaVersion: 1,
    issue: 'https://github.com/mfiumara/spice-ts/issues/711',
    source: {
      name: 'Xyce Regression Suite netlists',
      repository: XYCE_REPOSITORY,
      revision: XYCE_REVISION,
      license: 'GPL-3.0-or-later',
      licenseUrl: `${XYCE_REPOSITORY}/blob/${XYCE_REVISION}/README.md#copyright-and-license`,
      licenseNoticeSourcePath: 'README.md',
      licenseNoticeLocalPath: `${CORPUS_ROOT}/LICENSE-NOTICE.md`,
      licenseNoticeSha256: input.noticeSha256,
      licenseTextUrl: GPL_TEXT_URL,
      licenseTextLocalPath: `${CORPUS_ROOT}/COPYING.txt`,
      licenseTextSha256: input.gplSha256,
      redistributionDecision: 'Allowed under GPL-3.0-or-later, as for corpus C (`benchmarks/corpus/xyce`): the decks are redistributed verbatim as separate benchmark data files with the upstream copyright/licence notice and the complete GPLv3 text alongside them. They are test inputs, not linked into or distributed with any MIT-licensed spice-ts package. Decks that carry their own copyright or licence notice are excluded and not committed.',
      mechanicalAdaptation: 'None. Every fixture is byte-identical to the pinned revision (SHA-256 pinned per file), and both engines read the same bytes.',
    },
    selection: {
      root: UPSTREAM_ROOT,
      deckExtensions: DECK_EXTENSIONS.source,
      perDirectoryCap: PER_DIRECTORY_CAP,
      probe: { tool: input.probeTool, timeoutMs: PROBE_TIMEOUT_MS, receipt: `${CORPUS_ROOT}/ngspice-probe.json`, receiptSha256: input.probeSha256 },
      candidates: input.candidates.length,
      selected: input.circuits.length,
      excluded,
      rules: SELECTION_RULES,
    },
    circuits: input.circuits,
    exclusions,
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const [checkoutArgument] = argv.filter((argument, index) => !argument.startsWith('--') && argv[index - 1] !== '--jobs');
  if (!checkoutArgument) throw new Error('usage: ingest.ts <Xyce_Regression-checkout> [--probe [--jobs N]] [--check]');
  const checkout = resolve(checkoutArgument);
  const { candidates, bytesByPath } = await readCandidates(checkout);
  const existing = await existingCorpusIdentity(resolve('.'));
  const { eligible, exclusions: staticExclusions } = staticSelection(candidates, existing);
  if (argv.includes('--probe')) {
    const jobsIndex = argv.indexOf('--jobs');
    const jobs = jobsIndex >= 0 ? Number(argv[jobsIndex + 1]) : 4;
    process.stderr.write(`corpus-g probe: ${candidates.length} candidates, ${eligible.length} statically eligible; pid ${process.pid}\n`);
    const receipt = await runProbe(eligible, bytesByPath, jobs);
    await mkdir(resolve(CORPUS_ROOT), { recursive: true });
    await writeFile(PROBE_PATH, `${JSON.stringify(receipt, null, 2)}\n`);
    const counts = receipt.probes.reduce<Record<string, number>>((acc, probe) => ({ ...acc, [probe.status]: (acc[probe.status] ?? 0) + 1 }), {});
    process.stderr.write(`corpus-g probe: ${JSON.stringify(counts)}\n`);
    return;
  }
  const probeBytes = await readFile(PROBE_PATH);
  const receipt = JSON.parse(probeBytes.toString('utf8')) as ProbeReceipt;
  if (receipt.revision !== XYCE_REVISION) throw new Error('ngspice-probe.json is for another revision');
  const probes = new Map(receipt.probes.map(probe => [probe.sourcePath, probe]));
  const { circuits, exclusions } = finalSelection(eligible, probes, existing.names);
  const notice = execFileSync('git', ['show', `${XYCE_REVISION}:README.md`], { cwd: checkout });
  const gpl = await readFile(resolve(GPL_TEXT_SOURCE));
  const manifest = buildManifest({
    candidates,
    circuits,
    exclusions: [...staticExclusions, ...exclusions],
    probeSha256: sha256(probeBytes),
    probeTool: receipt.ngspice,
    noticeSha256: sha256(notice),
    gplSha256: sha256(gpl),
  });
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  const sourcesText = renderSources(manifest);
  if (argv.includes('--check')) {
    if (await readFile(MANIFEST_PATH, 'utf8') !== manifestText) throw new Error('committed corpus-g manifest.json differs from a fresh ingestion');
    if (await readFile(SOURCES_PATH, 'utf8') !== sourcesText) throw new Error('committed corpus-g SOURCES.md differs');
    for (const circuit of circuits) {
      if (sha256(await readFile(resolve(circuit.localPath))) !== circuit.sha256) throw new Error(`${circuit.id}: fixture bytes differ from upstream`);
    }
    process.stderr.write(`corpus-g ingest --check: ${circuits.length} fixtures match upstream ${XYCE_REVISION}\n`);
    return;
  }
  await rm(resolve(CORPUS_ROOT, 'fixtures'), { recursive: true, force: true });
  for (const circuit of circuits) {
    const target = resolve(circuit.localPath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytesByPath.get(circuit.sourcePath)!);
  }
  await writeFile(resolve(CORPUS_ROOT, 'LICENSE-NOTICE.md'), notice);
  await writeFile(resolve(CORPUS_ROOT, 'COPYING.txt'), gpl);
  await writeFile(MANIFEST_PATH, manifestText);
  await writeFile(SOURCES_PATH, sourcesText);
  process.stderr.write(`corpus-g ingest: ${candidates.length} candidates, ${circuits.length} selected, ${JSON.stringify(manifest.selection.excluded)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
