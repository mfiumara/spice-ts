// Scoped #982 evidence, reading original corpus-k bytes from the accepted git object.
// No fixture copies, corpus edits, tolerance changes, or aggregate regeneration.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, release, tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { deserialize, serialize } from 'node:v8';
import { fileURLToPath } from 'node:url';
import type { ClassicCircuit } from '../../benchmarks/corpus/classic/report.js';
import { MATCH_RULE, runNgspicePacked, runBoundedSimulatePacked, type ReferenceRun } from '../../benchmarks/corpus/corpus-f/outcomes.js';
import type { PackedExecution } from '../../benchmarks/corpus/corpus-f/packed.js';
import { reduceRow, type Circuit, type Manifest } from '../../benchmarks/corpus/corpus-j/parity.js';

const REVISION = 'e05f5f1748bb7aaada478e9c3378ec4dfb45e17c';
const ROOT = 'benchmarks/corpus/corpus-k';
const object = (path: string): Buffer => {
  const result = spawnSync('git', ['show', `${REVISION}:${path}`], { maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr.toString());
  return result.stdout;
};
const manifest = JSON.parse(object(`${ROOT}/manifest.json`).toString()) as Manifest;
const baseline = JSON.parse(object(`${ROOT}/outcomes.json`).toString());
const selected = manifest.circuits.filter(c => /MOSFET level 2.*series resistance/.test(baseline.fixtures.find((row: { id: string }) => row.id === c.id)?.spiceTs.firstErrorLine ?? ''));
if (selected.length !== 14) throw new Error('expected 13 reference successes plus e1480 both-engine failure');
const hash = (input: Buffer) => createHash('sha256').update(input).digest('hex');
async function bounded(circuit: Circuit, engine: string) {
  const directory = await mkdtemp(resolve(tmpdir(), 'mos2-982-'));
  const output = resolve(directory, 'execution.bin');
  const start = performance.now();
  try {
    const result = await new Promise<{ code: number | null; timedOut: boolean }>((done, reject) => {
      const child = spawn(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), '--engine', engine, circuit.id, output], { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* exited */ } } }, 119_000);
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('close', code => { clearTimeout(timer); done({ code, timedOut }); });
    });
    const wallMs = performance.now() - start;
    if (result.code === 0 && !result.timedOut) return { run: deserialize(await readFile(output)) as ReferenceRun<PackedExecution>, wallMs, ...result };
    const error = result.timedOut ? 'owned engine group exceeded uniform 119 s deadline' : `engine exited ${result.code}`;
    return { run: { status: 'failed' as const, firstErrorLine: error, execution: { status: 'failed' as const, convergence: 'failed' as const, analyses: [], error } }, wallMs, ...result };
  } finally { await rm(directory, { recursive: true, force: true }); }
}
async function main() {
  if (process.argv[2] === '--engine') {
    const circuit = selected.find(c => c.id === process.argv[4]);
    if (!circuit) throw new Error('unknown fixture');
    const input = object(circuit.localPath);
    if (hash(input) !== circuit.sha256) throw new Error('fixture hash mismatch');
    const run = process.argv[3] === 'ngspice' ? await runNgspicePacked(input, circuit) : await (async () => {
      const execution = await runBoundedSimulatePacked(input, { ...circuit, category: 'corpus-k', ngspice: { expectedStatus: 'pass' }, spiceTs: { expectedStatus: 'pass' } } as unknown as ClassicCircuit);
      return { status: execution.status, execution };
    })();
    await writeFile(process.argv[5], serialize(run)); return;
  }
  if (!/ngspice-47\b/.test(spawnSync('ngspice', ['--version'], { encoding: 'utf8' }).stdout)) throw new Error('requires ngspice-47');
  const fixtures = [];
  for (const circuit of selected) {
    const ng = await bounded(circuit, 'ngspice');
    const spice = await bounded(circuit, 'spiceTs');
    const row = { id: circuit.id, before: baseline.fixtures.find((row: { id: string }) => row.id === circuit.id),
      after: { ...reduceRow(circuit, ng.run, spice.run.execution), runtime: { ngspiceChildWallMs: ng.wallMs, spiceTsChildWallMs: spice.wallMs },
        process: { ngspice: { exitCode: ng.code, timedOut: ng.timedOut }, spiceTs: { exitCode: spice.code, timedOut: spice.timedOut } } } };
    fixtures.push(row);
    await writeFile('evidence/982/parity.json', JSON.stringify({ fixtureRevision: REVISION, baselineCoreTree: baseline.coreTree,
      coreTree: spawnSync('git', ['rev-parse', 'HEAD:packages/core'], { encoding: 'utf8' }).stdout.trim(),
      environment: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model, node: process.version, ngspice: 'ngspice-47' },
      policy: { input: 'byte-identical git object bytes', baseline: 'committed accepted corpus-k outcomes, not rerun', matchRule: MATCH_RULE, fixtureAdaptation: 'none', executionDeadlineMs: 119_000,
        runtimeBoundary: 'serial cold engine group wall including startup/adapter/serialization, not solver-only; no speed claim' }, fixtures }, null, 2) + '\n');
    console.log(`${circuit.id}: ${row.before.outcome} -> ${row.after.outcome}; error=${row.after.worstNormalizedError}; ${row.after.spiceTs.firstErrorLine ?? ''}`);
  }
  if (fixtures.length !== 14 || fixtures.filter(f => f.after.ngspice.status === 'success').length !== 13) throw new Error('reference count differs; inspect receipts');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
