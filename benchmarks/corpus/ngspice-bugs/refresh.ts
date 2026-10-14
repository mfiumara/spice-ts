/** #812: hash-gated orchestration of the existing comparison harness, not a verdict oracle.
 * Prepare fetch-only variants as documented in manifest; missing/mismatched bytes are gaps.
 * Run: spice-heavy pnpm exec tsx benchmarks/corpus/ngspice-bugs/refresh.ts
 * Results append after each deck to refresh.jsonl. No fixture/manifest writes, no tuning.
 */
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpus } from 'node:os';
import { compareFixture, runNgspice, type ComparisonFixture, type EngineRun } from '../../comparison-harness.js';
import { runNativeSpiceTs, runNativeNgspice, type ClassicCircuit } from '../classic/report.js';
import { compareExecutions } from '../../aggregate-report.js';
import { simulate } from '../../../packages/core/dist/index.js';
import { HERE, loadManifest } from './render.js';

const IDS = [158, 398, 505, 645, 683, 685, 690, 691, 695, 718, 720, 725, 737, 738, 740, 745, 761, 763, 764, 791, 794, 795, 828, 852, 871];
const root = resolve(HERE, '../../..');

async function child(path: string): Promise<void> {
  const input = readFileSync(path);
  const text = input.toString('utf8');
  if (!Buffer.from(text).equals(input)) throw new Error('not lossless UTF-8');
  writeFileSync(process.argv[4], JSON.stringify({ status: 'running-spice-ts' }));
  if (/^\s*\.noise\b/im.test(text)) {
    const circuit: ClassicCircuit = { id: 'fixture', localPath: path, category: 'noise', analyses: ['noise'], sourcePath: path, sourceUrl: '', sha256: createHash('sha256').update(input).digest('hex'), ngspice: { expectedStatus: 'pass' }, spiceTs: { expectedStatus: 'pass' } };
    const own = await runNativeSpiceTs(input, circuit, { parseFirst: false });
    const reference = await runNativeNgspice(input, circuit);
    const comparisons = own.status === 'success' && reference.status === 'success' ? compareExecutions(own, reference) : [];
    const compact = (execution: typeof own) => ({ ...execution, analyses: execution.analyses.map(item => ({ type: item.type, points: item.series.grid.length })) });
    writeFileSync(process.argv[4], JSON.stringify({ status: 'noise-execution', netlistSha256: createHash('sha256').update(input).digest('hex'), spiceTs: compact(own), ngspice: compact(reference), comparisons }));
    return;
  }
  const analysis = /^\s*\.tran\b/im.test(text) ? 'tran' : /^\s*\.ac\b/im.test(text) ? 'ac' : /^\s*\.dc\b/im.test(text) ? 'dc' : 'op';
  const fixture: ComparisonFixture = { name: 'fixture', analysis, netlist: text, signals: [] };
  process.chdir(dirname(path));
  const runSpiceTs = async (): Promise<EngineRun> => {
    const start = performance.now();
    const command = ['@spice-ts/core', 'simulate', path];
    try {
      const result = await simulate(text, { resolveInclude: async name => readFileSync(resolve(dirname(path), name), 'utf8') });
      const data = analysis === 'tran' ? result.transient : analysis === 'ac' ? result.ac : analysis === 'dc' ? result.dcSweep : result.dc;
      if (!data) throw new Error(`comparison adapter: simulate completed but no ${analysis} output (not a simulator failure)`);
      const grid = analysis === 'tran' ? result.transient!.time : analysis === 'ac' ? result.ac!.frequencies : analysis === 'dc' ? Array.from(result.dcSweep!.sweepValues) : [0];
      type Value = number | { magnitude: number; phase: number };
      const entries = (kind: string, map: Iterable<[string, number | Iterable<Value>]>) => Array.from(map, ([name, values]) => [
        `${kind}(${name.toLowerCase()})`, Array.from(typeof values === 'number' ? [values] : values, value => typeof value === 'number' ? { re: value, im: 0 } : { re: value.magnitude * Math.cos(value.phase * Math.PI / 180), im: value.magnitude * Math.sin(value.phase * Math.PI / 180) }),
      ] as const);
      const signals = Object.fromEntries([...entries('v', data.voltages), ...entries('i', data.currents)]);
      fixture.signals = Object.keys(signals);
      return { status: 'success', convergence: 'converged', runtimeMs: performance.now() - start, command, series: { grid, signals } };
    } catch (error) {
      return { status: 'failed', convergence: 'failed', runtimeMs: performance.now() - start, command, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
    }
  };
  // Sequential: signal selection is populated by the native spice-ts result before measuring.
  const own = await runSpiceTs();
  writeFileSync(process.argv[4], JSON.stringify({ status: 'running-ngspice', spiceTsStatus: own.status }));
  const reference = await runNgspice(fixture);
  const report = await compareFixture(fixture, { runSpiceTs: async () => own, runNgspice: async () => reference });
  const receipt = { ...report, spiceTs: own, ngspice: reference };
  writeFileSync(process.argv[4], JSON.stringify(receipt));
}

async function main(): Promise<void> {
  if (process.argv[2] === '--child') return child(resolve(process.argv[3]));
  const manifest = await loadManifest();
  const wanted = new Set(process.argv.slice(3).map(Number));
  const tickets = IDS.filter(ticket => wanted.size === 0 || wanted.has(ticket));
  const output = resolve(process.argv[2] ?? resolve(HERE, 'refresh.jsonl'));
  if (existsSync(output)) throw new Error(`Refusing to overwrite ${output}`);
  appendFileSync(output, JSON.stringify({ generatedAt: new Date().toISOString(), environment: { node: process.version, platform: process.platform, arch: process.arch, cpu: cpus()[0]?.model }, core: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), ngspice: execFileSync('ngspice', ['--version'], { encoding: 'utf8' }).trim(), tickets }) + '\n');
  for (const ticket of tickets) {
    const entry = manifest.tickets.find(item => item.ticket === ticket)!;
    const decks = entry.uncommittedDecks.length ? entry.uncommittedDecks.map(deck => ({ ...deck, path: resolve(HERE, 'fetched', String(ticket), deck.name) })) : entry.committedDecks.filter(deck => !/(?:original|switch_original|arg_capture|temper_capture|sqrt_neg)\.cir$/.test(deck.path)).map(deck => ({ ...deck, name: deck.path, path: resolve(HERE, deck.path) }));
    for (const deck of decks) {
      const actual = existsSync(deck.path) ? createHash('sha256').update(readFileSync(deck.path)).digest('hex') : null;
      let receipt: unknown;
      if (actual !== deck.sha256) receipt = { status: 'provenance-gap', expectedSha256: deck.sha256, actualSha256: actual };
      else {
        const resultPath = `${output}.child.json`;
        const completed = spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(import.meta.url), '--child', deck.path, resultPath], { cwd: root, encoding: 'utf8', timeout: 180_000, maxBuffer: 4 * 1024 * 1024 });
        receipt = completed.status === 0 ? JSON.parse(readFileSync(resultPath, 'utf8')) : { status: 'child-failed', phase: existsSync(resultPath) ? JSON.parse(readFileSync(resultPath, 'utf8')) : null, exitCode: completed.status, signal: completed.signal, error: completed.error?.message ?? completed.stderr };
      }
      appendFileSync(output, JSON.stringify({ ticket, deck: deck.name, receipt }) + '\n');
      console.log(ticket, deck.name, JSON.stringify(receipt).slice(0, 180));
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
