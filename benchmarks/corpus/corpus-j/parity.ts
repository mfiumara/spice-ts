#!/usr/bin/env tsx
/** Scoped serial wrapper around the unchanged corpus-f engine runners and corpus-h report. */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, release, tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { deserialize, serialize } from 'node:v8';
import { fileURLToPath } from 'node:url';
import type { CorpusFCircuit } from '../corpus-f/ingest.js';
import type { ClassicCircuit } from '../classic/report.js';
import { firstSpiceTsErrorLine, normalizedSignalErrors, outcome, pairedReferenceSeries, sig3 } from '../corpus-f/lib.js';
import { MATCH_RULE, outcomeDigest, runBoundedSimulatePacked, runNgspicePacked, type FixtureOutcome, type ReferenceRun } from '../corpus-f/outcomes.js';
import { compareInBatches, lazyExecution, type PackedExecution } from '../corpus-f/packed.js';
import { parityReport, type CorpusHReport } from '../corpus-h/parity.js';
import { gapBucket } from '../corpus-i/lib.js';

export const ROOT = 'benchmarks/corpus/corpus-j';
export const CHILD_BOUND_MS = 20_000;
export const WALL_BUDGET_MS = 900_000;
const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const sharedReport = parityReport({ name: 'corpus-j', root: ROOT, scriptUrl: import.meta.url,
  title: '# corpus-j: partial novel source survey (#940)', earlierRules: 'corpus-i/h/f', gapIssues: {}, followUpIssues: [], gapBucket });
export const { summarize } = sharedReport;
export function renderMarkdown(report: CorpusHReport): string {
  return sharedReport.renderMarkdown(report)
    .replace('static rules plus an ngspice-47 reference probe, see SOURCES.md', 'static/hash rules only, no ngspice reference probe or engine-success filter; see SOURCES.md')
    .replace('Gap buckets apply the corpus-j rules in `lib.ts` first, then the corpus-i/h/f rules.', 'Gap buckets use the unchanged corpus-i/h/f rules; precise cross-dialect observations are in SOURCES.md.')
    .replace(/- Bounds: ngspice 600 s, spice-ts 120 s per fixture\./, '- Bounds: serial owned engine groups <=20 s each (19 s execution deadline), cumulative child wall <=900 s across attempts.')
    .replace('Grouped from spice-ts\'s own first error line (corpus-j rules, then corpus-i/h/f rules).', 'Grouped from spice-ts\'s own first error line (unchanged corpus-i/h/f rules).')
    .replace(/\n## Transient fine-step reference \(#592\)[\s\S]*$/, '\n');
}
export interface Circuit extends CorpusFCircuit { includeClosure: string[]; revision: string; source: string }
export interface Manifest { sources: Array<{ key: string; revision: string; license: string }>; circuits: Circuit[] }
export function reduceRow(circuit: Circuit, ng: ReferenceRun<PackedExecution>, spice: PackedExecution) {
  const comparisons = ng.status === 'success' && spice.status === 'success' ? compareInBatches(spice, ng.execution) : [];
  const { errors, missing } = normalizedSignalErrors(comparisons, pairedReferenceSeries(lazyExecution(spice), lazyExecution(ng.execution)));
  const worst = errors.reduce<typeof errors[number] | null>((a, b) => a === null || b.normalized > a.normalized ? b : a, null);
  const error = firstSpiceTsErrorLine(spice.error);
  const row: FixtureOutcome = { id: circuit.id, sourcePath: circuit.sourcePath, sha256: circuit.sha256,
    analyses: circuit.analyses, unmappedAnalyses: circuit.unmappedAnalyses, sameNameAs: circuit.sameNameAs,
    ngspice: { status: ng.status, analyses: ng.execution.analyses.map(a => `${a.type}:${a.grid.length}`), firstErrorLine: ng.firstErrorLine, note: ng.note },
    spiceTs: { status: spice.status, analyses: spice.analyses.map(a => `${a.type}:${a.grid.length}`), firstErrorLine: error },
    comparedAnalyses: comparisons.length, comparedSignals: errors.length,
    worstNormalizedError: worst ? sig3(worst.normalized) : null, worstSignal: worst ? `${worst.analysis} ${worst.signal}` : null,
    outcome: outcome({ ngspice: ng.status, spiceTs: spice.status, comparedAnalyses: comparisons.length,
      spiceTsAnalyses: new Set(spice.analyses.map(a => a.type)).size, worstNormalized: worst?.normalized ?? null, missingSignals: missing }),
    gapBucket: gapBucket(error, spice.status) ?? null };
  return { ...row, comparisons };
}
async function ledger(): Promise<Array<{ event: string; wallMs?: number }>> {
  try { return (await readFile(`${ROOT}/wall.jsonl`, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
}
export function consumedWall(entries: Array<{ event: string; wallMs?: number }>): number {
  const starts = entries.filter(e => e.event === 'start').length;
  const ends = entries.filter(e => e.event === 'end');
  return ends.reduce((total, e) => total + (e.wallMs ?? CHILD_BOUND_MS), 0) + (starts - ends.length) * CHILD_BOUND_MS;
}
async function bounded(circuit: Circuit, engine: 'ngspice' | 'spiceTs') {
  if (consumedWall(await ledger()) + CHILD_BOUND_MS > WALL_BUDGET_MS) throw new Error('cumulative child wall budget exhausted');
  const directory = await mkdtemp(resolve(tmpdir(), 'corpus-j-'));
  const resultPath = resolve(directory, 'execution.bin');
  const started = performance.now();
  await appendFile(`${ROOT}/wall.jsonl`, JSON.stringify({ event: 'start', id: circuit.id, engine, reservationMs: CHILD_BOUND_MS }) + '\n');
  let timedOut = false;
  let diagnostic = '';
  const code = await new Promise<number | null>((done, reject) => {
    const child = spawn(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), '--engine', engine, circuit.id, resultPath],
      { detached: true, stdio: ['ignore', 'ignore', 'pipe'] });
    child.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk).slice(-4000); });
    // Leave one second for group cleanup and receipt I/O within the 20 s boundary.
    const timer = setTimeout(() => { timedOut = true; if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already exited */ } } }, CHILD_BOUND_MS - 1000);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); done(code); });
  });
  const wallMs = performance.now() - started;
  await appendFile(`${ROOT}/wall.jsonl`, JSON.stringify({ event: 'end', id: circuit.id, engine, wallMs, timedOut, exitCode: code }) + '\n');
  try {
    if (!timedOut && code === 0) return { run: deserialize(await readFile(resultPath)) as ReferenceRun<PackedExecution>, wallMs };
    const error = timedOut ? 'scoped corpus-j owned process group exceeded 19 s execution deadline (20 s group bound)' : `engine child exited ${code}: ${diagnostic}`;
    return { run: { status: 'failed' as const, firstErrorLine: error,
      execution: { status: 'failed' as const, convergence: 'failed' as const, analyses: [], error } }, wallMs };
  } finally { await rm(directory, { recursive: true, force: true }); }
}
async function main() {
  const bytes = await readFile(`${ROOT}/manifest.json`);
  const manifest = JSON.parse(bytes.toString('utf8')) as Manifest;
  if (process.argv[2] === '--render') {
    const report = JSON.parse(await readFile(`${ROOT}/outcomes.json`, 'utf8')) as CorpusHReport;
    const footer = (await readFile(`${ROOT}/README.md`, 'utf8')).split('## Partial delivery and runtime boundary')[1];
    if (!footer) throw new Error('missing partial delivery note');
    await writeFile(`${ROOT}/README.md`, renderMarkdown(report) + '\n## Partial delivery and runtime boundary' + footer);
    return;
  }
  if (process.argv[2] === '--engine') {
    const circuit = manifest.circuits.find(c => c.id === process.argv[4]);
    if (!circuit) throw new Error('unknown fixture');
    const input = await readFile(circuit.localPath);
    if (hash(input) !== circuit.sha256) throw new Error('fixture hash mismatch');
    const run = process.argv[3] === 'ngspice' ? await runNgspicePacked(input, circuit) : await (async () => {
      const execution = await runBoundedSimulatePacked(input, { ...circuit, category: 'corpus-j',
        ngspice: { expectedStatus: 'pass' }, spiceTs: { expectedStatus: 'pass' } } as unknown as ClassicCircuit);
      return { status: execution.status, execution };
    })();
    await writeFile(process.argv[5], serialize(run));
    return;
  }
  const version = spawnSync('ngspice', ['--version'], { encoding: 'utf8' }).stdout;
  if (!/ngspice-47\b/.test(version)) throw new Error('requires ngspice-47');
  const fixtures = [];
  for (const circuit of manifest.circuits) {
    // No engine success influences inclusion. Every selected row runs in both engines.
    const spice = await bounded(circuit, 'spiceTs');
    const ng = await bounded(circuit, 'ngspice');
    const row = { ...reduceRow(circuit, ng.run, spice.run.execution), runtime: { spiceTsChildWallMs: spice.wallMs, ngspiceChildWallMs: ng.wallMs } };
    fixtures.push(row);
    await writeFile(`${ROOT}/checkpoint.json`, JSON.stringify(fixtures, null, 2) + '\n');
    console.log(`${circuit.id}: ${row.outcome}`);
  }
  const base = { schemaVersion: 'spice-ts-corpus-j-outcomes/v1', sources: manifest.sources, manifestSha256: hash(bytes),
    tools: { ngspice: 'ngspice-47', spiceTs: JSON.parse(await readFile('packages/core/package.json', 'utf8')).version, node: process.version },
    environment: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model ?? 'unknown' },
    commands: { generate: `spice-heavy pnpm exec tsx ${ROOT}/parity.ts`, verify: `pnpm exec tsx --test ${ROOT}/corpus-j.test.ts`,
      ngspice: 'unchanged corpus-f runNgspicePacked on original bytes', spiceTs: 'unchanged corpus-f runBoundedSimulatePacked on original bytes' },
    policy: { input: 'byte-identical fixture for both engines', fixtureAdaptation: 'none', perCircuitToleranceTuning: false,
      matchThreshold: 0.01, matchRule: MATCH_RULE, deterministicHashExcludes: ['environment', 'tools.node', 'ngspice.analyses', 'spiceTs.analyses'],
      childGroupBoundMs: CHILD_BOUND_MS, executionDeadlineMs: CHILD_BOUND_MS - 1000, cumulativeChildWallBudgetMs: WALL_BUDGET_MS,
      runtimeBoundary: 'serial cold engine wrapper wall includes Node/tsx startup, unchanged shared engine adapter, output serialization and close; no warm speed claim',
      fineReference: 'not run: would adapt original bytes; headline inputs unchanged',
      stochastic: 'mc() decks retained; independent random realizations cannot establish deterministic waveform parity' },
    actualCumulativeChildWallMs: consumedWall(await ledger()), ...summarize(fixtures), fixtures };
  const report = { ...base, outcomeSha256: outcomeDigest(base as never) };
  await writeFile(`${ROOT}/outcomes.json`, JSON.stringify(report, null, 2) + '\n');
  await writeFile(`${ROOT}/README.md`, renderMarkdown(report as unknown as CorpusHReport) + '\n## Partial delivery and runtime boundary\n\n11 novel fixtures, not the requested 20. No eSim standalone candidate survived the static/hash survey. No KiCad schematic export, PDK/vendor includes, derived variants or byte adaptation were used to fill the gap. See SOURCES.md and manifest exclusions. These LTspice A-device and mc() decks may fail in ngspice as well as spice-ts; every such loss is retained. This is not a parity expansion claim.\n\nDetailed matched-point max/RMS absolute and relative metrics (including missing signals and both breakpoint-aware and linear interpolation receipts) are in outcomes.json. Null/empty metrics mean no comparison, never zero error. Independent mc() realizations are not deterministic parity evidence. No fine-TMAX adapted reference is run.\n\nEach cold engine wrapper owns one serial process group, with a 19 s execution deadline and 20 s group boundary, <=900 s cumulative child wall across attempts. wall.jsonl persists reservations and actual wall; an interrupted reservation conservatively consumes 20 s. Engine wall includes launch, parse, solve, adapter output and serialization, not just solver time. No speed superiority is claimed. Aggregate incorporation is deferred to nightly #855; no aggregate refresh here.\n');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
