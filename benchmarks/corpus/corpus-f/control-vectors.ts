#!/usr/bin/env tsx
/**
 * #521: source unchanged .control fixtures and export reference vectors with ngspice-47.
 * Run: pnpm exec tsx benchmarks/corpus/corpus-f/control-vectors.ts [--check] [--jobs 6]
 * Prints the complete receipt as JSON; updates only the supplemental README section.
 * The original outcomes.json remains the historical batch-1 receipt, not a new measurement.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, tmpdir } from 'node:os';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseNgspiceRaw } from '../../comparison-harness.js';
import { analysisType, type EngineAnalysis } from '../classic/report.js';
import type { CorpusFCircuit, CorpusFManifest } from './ingest.js';
import { CONTROL_SECTION, CORPUS_ROOT, MATCH_THRESHOLD, classifyNgspiceFailure, firstNgspiceErrorLine, gapBucket, scrub } from './lib.js';
import { GAP_ISSUES, runFixture, runNgspice, summarize, type FixtureOutcome } from './outcomes.js';

export { CONTROL_SECTION };
const CHILD = '--control-vector-child';
const TIMEOUT_MS = 600_000;

export function hasControlBlock(text: string): boolean {
  return /^\s*\.control\b/im.test(text.split(/\r?\n/).slice(1).join('\n'));
}

/**
 * #528: a deck's own `quit`/`exit` would end ngspice before the export lines run. The wrapper
 * aliases both to an `echo` (an ngspice front-end command, not a fixture edit), so the deck's
 * control block runs to completion exactly as written and only the process exit is deferred.
 */
export const DEFERRED_EXIT_ALIASES = ['quit', 'exit'].map(command => `alias ${command} echo corpus-f: deck ${command} deferred until export`);

export function controlWrapperDeck(types: readonly string[]): string {
  return ['* corpus-f unmodified-fixture export wrapper', '.control', ...DEFERRED_EXIT_ALIASES, 'source fixture.cir',
    ...[...new Set(types)].flatMap(type => [`setplot ${type}1`, `write ${type}.raw all`]),
    '.endc', '.end', ''].join('\n');
}

/** A missing setplot leaves the previous plot selected: never mislabel that plot as another type. */
export async function runControlReference(input: Buffer, circuit: CorpusFCircuit): Promise<Awaited<ReturnType<typeof runNgspice>>> {
  const directory = await mkdtemp(resolve(tmpdir(), 'corpus-f-control-'));
  try {
    await writeFile(resolve(directory, 'fixture.cir'), input);
    await writeFile(resolve(directory, '.spiceinit'), 'set filetype=ascii\n');
    await writeFile(resolve(directory, 'wrapper.cir'), controlWrapperDeck(circuit.analyses));
    const env: NodeJS.ProcessEnv = { ...process.env, HOME: directory };
    delete env.DISPLAY;
    const run = spawnSync('ngspice', ['-b', 'wrapper.cir'], {
      cwd: directory, env, encoding: 'utf8', timeout: TIMEOUT_MS,
      killSignal: 'SIGKILL', maxBuffer: 64 * 1024 * 1024,
    });
    const output = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    const error = firstNgspiceErrorLine(output, directory);
    if (run.error || run.status !== 0) {
      const detail = scrub(run.error?.message ?? error ?? `ngspice exited ${run.status ?? run.signal}`, directory);
      return { status: classifyNgspiceFailure(output), firstErrorLine: detail,
        execution: { status: 'failed', convergence: 'failed', analyses: [], error: detail } };
    }
    const analyses: EngineAnalysis[] = [];
    const unreadable: string[] = [];
    for (const type of new Set(circuit.analyses)) {
      let raw: string;
      try { raw = await readFile(resolve(directory, `${type}.raw`), 'utf8'); } catch (readError) {
        const code = (readError as NodeJS.ErrnoException).code;
        if (code !== 'ENOENT') unreadable.push(`${type}.raw (${code ?? (readError as Error).message})`);
        continue;
      }
      for (const plot of parseNgspiceRaw(raw)) {
        const actualType = analysisType(plot.plotName);
        if (actualType === type) analyses.push({ type: actualType, plotName: plot.plotName, series: { grid: plot.grid, signals: plot.signals } });
      }
    }
    if (analyses.length === 0 && error) return { status: classifyNgspiceFailure(output), firstErrorLine: error,
      execution: { status: 'failed', convergence: 'failed', analyses: [], error } };
    return { status: 'success', execution: { status: 'success', convergence: 'converged', analyses },
      ...(analyses.length === 0 ? { note: noReferenceNote(circuit, unreadable) } : {}) };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** Why a successful ngspice run still left nothing to score (#528): published, never hidden. */
export function noReferenceNote(circuit: Pick<CorpusFCircuit, 'analyses' | 'unmappedAnalyses'>, unreadable: readonly string[] = []): string {
  const prefix = 'source/write wrapper exported no reference vectors';
  if (circuit.analyses.length === 0) {
    const unmapped = [...new Set(circuit.unmappedAnalyses ?? [])];
    return `${prefix}: the deck runs only ${unmapped.length > 0 ? unmapped.join('/') : 'no'} analyses, which the comparison adapter does not map to a scored analysis type`;
  }
  if (unreadable.length > 0) return `${prefix}: ${unreadable.join(', ')} could not be loaded as one string (e.g. larger than the Node string limit)`;
  return `${prefix}: no plot of a declared analysis type was left to write`;
}

/** Reporting links only. No issue mapping changes execution, scoring, or tolerances. */
export function trackingIssue(fixture: FixtureOutcome): string {
  if (fixture.outcome === 'matched') return '—';
  let issue: string | number = 511;
  if (fixture.outcome === 'not-compared' || fixture.ngspice.status !== 'success') issue = 694;
  else if (fixture.outcome === 'mismatch') {
    if (/\/ltra\d/.test(fixture.sourcePath)) issue = 595;
    else if (fixture.sourcePath.endsWith('/inv_vdmos.sp')) issue = 596;
  } else {
    const bucket = gapBucket(fixture.spiceTs.firstErrorLine, fixture.spiceTs.status);
    issue = (bucket && GAP_ISSUES[bucket]) || 511;
  }
  return typeof issue === 'number' ? `https://github.com/mfiumara/spice-ts/issues/${issue}` : issue;
}

export function renderControlSection(fixtures: FixtureOutcome[], head: string, version: string): string {
  const totals = summarize(fixtures).totals;
  const cell = (text: string | undefined | null): string => (text ?? '—').replace(/\|/g, '\\|').replace(/`/g, "'").replace(/[\r\n]+/g, ' ');
  return [CONTROL_SECTION.trimStart(),
    'This supplement supersedes the historical batch-1 rows above for every `.control` deck. The original `outcomes.json` is deliberately unchanged.', '',
    `Measured with core tree \`${head}\` (\`git rev-parse HEAD:packages/core\`), ${version}, Node ${process.version}, ${platform()}/${arch()}, ${cpus()[0]?.model ?? 'unknown'}.`,
    '`pnpm build && pnpm exec tsx benchmarks/corpus/corpus-f/control-vectors.ts > control-receipt.json` regenerates this section and prints the full receipt. Add `--check` to rerun without changing files; `--jobs N` controls parallelism.', '',
    'Every reference comes only from `ngspice -b wrapper.cir`. In a fresh temporary directory, the wrapper first runs `alias quit echo ...` and `alias exit echo ...` (#528), so a deck whose control block calls `quit`/`exit` runs that block to completion exactly as written while ngspice stays alive for the export, then runs `source fixture.cir`, then `setplot <type>1` and `write <type>.raw all` for each declared analysis type. `fixture.cir` is a byte-identical copy, verified against the manifest. No rewritten decks or `-r` reference fallback.',
    `Scoring reuses \`runFixture\`, \`compareExecutions\` and \`normalizedSignalErrors\` with MATCH_THRESHOLD = ${MATCH_THRESHOLD}. There is no per-circuit tuning. Only the first plot of each type is compared, matching the existing adapter; repeated analyses are not independently scored. A failed \`setplot\` cannot be mistaken for the requested analysis. Decks that leave no plot of a declared type (for example they \`destroy\` it) remain unscored, not matches.`, '',
    `All ${fixtures.length} control decks: ${Object.entries(totals.outcomes).map(([name, count]) => `${name} ${count}`).join(', ')}.`,
    'Bucket “loss” includes numerical mismatches and typed-unsupported/failed spice-ts executions with an ngspice reference. “No reference” and “not compared” are explicitly unscored. Worst error/signal is — where no comparison exists. #511 tracks untriaged numerical losses; #694 tracks the remaining reference/export limitations. Links do not affect scoring.', '',
    '| Fixture | Bucket | Outcome | Worst normalized error | Worst signal | Tracking issue | Diagnostic |',
    '|---|---|---|---|---|---|---|',
    ...fixtures.map(fixture => {
      const bucket = fixture.outcome === 'matched' ? 'match' : fixture.ngspice.status !== 'success' || fixture.ngspice.analyses.length === 0 ? 'no reference' : fixture.outcome === 'not-compared' ? 'not compared' : 'loss';
      const diagnostic = [fixture.ngspice.firstErrorLine, fixture.ngspice.note, fixture.spiceTs.firstErrorLine].filter(Boolean).join(' / ');
      return `| [${fixture.sourcePath}](fixtures/${fixture.sourcePath}) | ${bucket} | ${fixture.outcome} | ${fixture.worstNormalizedError ?? '—'} | ${cell(fixture.worstSignal)} | ${trackingIssue(fixture)} | ${cell(diagnostic || undefined)} |`;
    }), '',
  ].join('\n');
}

async function child(id: string): Promise<FixtureOutcome> {
  return new Promise((resolvePromise, reject) => {
    const processChild = spawn(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), CHILD, id], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    processChild.stdout.on('data', chunk => { stdout += chunk; });
    processChild.stderr.on('data', chunk => { stderr += chunk; });
    const timer = setTimeout(() => processChild.kill('SIGKILL'), TIMEOUT_MS + 180_000);
    processChild.on('error', error => { clearTimeout(timer); reject(error); });
    processChild.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) { reject(new Error(`${id}: child exited ${code}: ${stderr}`)); return; }
      try { resolvePromise(JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as FixtureOutcome); } catch (error) { reject(error); }
    });
  });
}

async function main(): Promise<void> {
  const manifest = JSON.parse(await readFile(resolve(CORPUS_ROOT, 'manifest.json'), 'utf8')) as CorpusFManifest;
  if (process.argv[2] === CHILD) {
    const circuit = manifest.circuits.find(candidate => candidate.id === process.argv[3]);
    if (!circuit) throw new Error(`Unknown fixture: ${process.argv[3]}`);
    console.log(JSON.stringify(await runFixture(circuit, runControlReference)));
    return;
  }
  const versionRun = spawnSync('ngspice', ['--version'], { encoding: 'utf8' });
  const version = /ngspice-\d+(?:\.\d+)*/.exec(`${versionRun.stdout}\n${versionRun.stderr}`)?.[0];
  if (version !== 'ngspice-47') throw new Error(`ngspice-47 required; found ${version ?? 'unavailable'}`);
  const jobsIndex = process.argv.indexOf('--jobs');
  const jobs = jobsIndex < 0 ? 6 : Number(process.argv[jobsIndex + 1]);
  if (!Number.isInteger(jobs) || jobs < 1) throw new Error('--jobs must be a positive integer');
  const circuits: CorpusFCircuit[] = [];
  for (const circuit of manifest.circuits) {
    if (hasControlBlock(await readFile(resolve(circuit.localPath), 'utf8'))) circuits.push(circuit);
  }
  const fixtures = new Array<FixtureOutcome>(circuits.length);
  // Keep completed measurements if a bounded worker fails; never publish a partial table.
  const progress = await mkdtemp(resolve(tmpdir(), 'corpus-f-control-receipt-'));
  console.error(`Per-fixture receipts: ${progress}`);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(jobs, circuits.length) }, async () => {
    while (next < circuits.length) {
      const index = next++;
      fixtures[index] = await child(circuits[index].id);
      await writeFile(resolve(progress, `${circuits[index].id}.json`), JSON.stringify(fixtures[index]));
      console.error(`${index + 1}/${circuits.length} ${circuits[index].id}: ${fixtures[index].outcome}`);
    }
  }));
  const head = spawnSync('git', ['rev-parse', 'HEAD:packages/core'], { encoding: 'utf8' }).stdout.trim();
  const section = renderControlSection(fixtures, head, version);
  const readmePath = resolve(CORPUS_ROOT, 'README.md');
  const readme = await readFile(readmePath, 'utf8');
  // Keep the original batch-1 receipt intact; publish new measurements in their own section.
  const updated = `${readme.split(CONTROL_SECTION)[0].trimEnd()}\n\n${section}`;
  console.log(JSON.stringify({ coreTree: head, ngspice: version, matchThreshold: MATCH_THRESHOLD, ...summarize(fixtures), fixtures }, null, 2));
  if (process.argv.includes('--check')) {
    // Ignore machine/version provenance in the Markdown check, but compare every measured row.
    const rows = (text: string): string => text.slice(text.indexOf('| Fixture |'));
    const committed = readme.split(CONTROL_SECTION)[1];
    if (!committed || rows(committed) !== rows(section)) throw new Error('Control-vector README rows differ from fresh measurements');
  } else await writeFile(readmePath, updated);
  console.error(JSON.stringify(summarize(fixtures).totals));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
