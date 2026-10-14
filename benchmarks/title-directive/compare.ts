import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, release, tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { deserialize } from 'node:v8';
import { reduceRow, type Manifest } from '../corpus/corpus-j/parity.js';
import type { ReferenceRun } from '../corpus/corpus-f/outcomes.js';
import type { PackedExecution } from '../corpus/corpus-f/packed.js';

// Reuse the original corpus-j part2 adapter, but run only j-16. Each owned
// engine group has the same 19 s execution deadline as the corpus survey.
async function main() {
const phase = process.argv[2];
if (phase !== 'before' && phase !== 'after') throw new Error('Expected before or after');
const manifest = JSON.parse(await readFile('benchmarks/corpus/corpus-j/manifest.json', 'utf8')) as Manifest;
const circuit = manifest.circuits.find(circuit => circuit.id === 'j-16');
if (!circuit) throw new Error('Missing j-16');
const input = await readFile(circuit.localPath);
const sha256 = createHash('sha256').update(input).digest('hex');
if (sha256 !== circuit.sha256) throw new Error('Fixture hash mismatch');
const version = spawnSync('ngspice', ['--version'], { encoding: 'utf8' }).stdout;
if (!/ngspice-47\b/.test(version)) throw new Error('Requires ngspice-47');
const directory = await mkdtemp(resolve(tmpdir(), 'title-directive-'));
const runs: Partial<Record<'ngspice' | 'spiceTs', ReferenceRun<PackedExecution>>> = {};
const wallMs: Record<string, number> = {};
try {
  for (const engine of ['ngspice', 'spiceTs'] as const) {
    const resultPath = resolve(directory, `${engine}.bin`);
    const started = performance.now();
    await new Promise<void>((done, reject) => {
      const child = spawn('pnpm', ['exec', 'tsx', 'benchmarks/corpus/corpus-j/part2.ts', '--engine', engine, circuit.id, resultPath],
        { detached: true, stdio: ['ignore', 'ignore', 'pipe'] });
      let diagnostic = '';
      let timedOut = false;
      child.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk).slice(-4000); });
      const timer = setTimeout(() => {
        timedOut = true;
        if (child.pid) {
          try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already exited */ }
        }
      }, 19_000);
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('close', code => {
        clearTimeout(timer);
        if (timedOut || code !== 0) reject(new Error(`${engine}: ${timedOut ? '19 s group deadline exceeded' : diagnostic}`));
        else done();
      });
    });
    wallMs[engine] = performance.now() - started;
    runs[engine] = deserialize(await readFile(resultPath)) as ReferenceRun<PackedExecution>;
  }
  const row = reduceRow(circuit, runs.ngspice!, runs.spiceTs!.execution);
  if (row.ngspice.status !== 'success') throw new Error('j-16 ngspice reference failed');
  if (phase === 'before' && !row.spiceTs.firstErrorLine?.includes("Unsupported dot command: '.title'")) {
    throw new Error('Expected the pre-fix .title failure; build the RED commit first');
  }
  if (phase === 'after' && row.outcome !== 'matched') throw new Error(`j-16 regression: ${row.outcome}`);
  const receipt = {
    phase, coreTree: spawnSync('git', ['rev-parse', 'HEAD:packages/core'], { encoding: 'utf8' }).stdout.trim(),
    tools: { node: process.version, ngspice: 'ngspice-47' },
    environment: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model },
    command: `spice-heavy pnpm exec tsx benchmarks/title-directive/compare.ts ${phase}`,
    policy: { input: 'unchanged corpus-j j-16 bytes', fixtureAdaptation: 'none', perCircuitToleranceTuning: false,
      matchThreshold: 0.01, adapters: 'unchanged corpus-j part2.ts --engine',
      runtimeBoundary: 'cold child wall including pnpm/tsx, adapter, parse/solve and export; no speed claim' },
    sha256, wallMs, row,
  };
  await writeFile(`benchmarks/title-directive/${phase}.json`, JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(row, null, 2));
} finally {
  await rm(directory, { recursive: true, force: true });
}
}
main().catch(error => { console.error(error); process.exitCode = 1; });
