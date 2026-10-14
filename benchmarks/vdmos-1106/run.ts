// Eight original decks, unchanged corpus-n worker, captured exports and corpus-j metrics.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, release, tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { deserialize } from 'node:v8';
import { gzipSync } from 'node:zlib';
import { MATCH_RULE, type ReferenceRun } from '../corpus/corpus-f/outcomes.js';
import type { PackedExecution } from '../corpus/corpus-f/packed.js';
import { reduceRow, type Circuit, type Manifest } from '../corpus/corpus-j/parity.js';
import { hash } from '../corpus/corpus-n/survey.js';

const root = 'benchmarks/vdmos-1106';
async function main() {
  const phase = process.argv[2];
  if (phase !== 'before' && phase !== 'after') throw new Error('expected before or after');
  const manifestBytes = await readFile('benchmarks/corpus/corpus-n/manifest.json');
  const manifest = JSON.parse(manifestBytes.toString()) as Manifest;
  const circuits = manifest.circuits.filter(c => /\/examples\/vdmos\//.test(c.localPath));
  if (circuits.length !== 8) throw new Error(`expected eight decks, got ${circuits.length}`);
  if (!/ngspice-47\b/.test(spawnSync('ngspice', ['--version'], { encoding: 'utf8' }).stdout)) throw new Error('requires ngspice-47');
  async function run(circuit: Circuit, engine: 'ngspice' | 'spiceTs') {
    const directory = await mkdtemp(resolve(tmpdir(), 'vdmos-1106-'));
    const output = resolve(directory, 'execution.bin');
    const start = performance.now();
    try {
      const result = await new Promise<{ code: number | null; timedOut: boolean }>((done, reject) => {
        const child = spawn(process.execPath, [...process.execArgv, 'benchmarks/corpus/corpus-n/parity.ts', '--engine', engine, circuit.id, output], { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
        let timedOut = false;
        const timer = setTimeout(() => { timedOut = true; if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* exited */ } } }, 119_000);
        child.on('error', error => { clearTimeout(timer); reject(error); });
        child.on('close', code => { clearTimeout(timer); done({ code, timedOut }); });
      });
      const wallMs = performance.now() - start;
      if (result.code === 0 && !result.timedOut) {
        const run = deserialize(await readFile(output)) as ReferenceRun<PackedExecution>;
        await writeFile(`${root}/${phase}-${circuit.id}-${engine}.json.gz`, gzipSync(JSON.stringify(run, (_key, value) => value instanceof Float64Array ? Array.from(value) : value)));
        return { run, wallMs };
      }
      const error = result.timedOut ? 'owned engine group exceeded uniform 119 s deadline' : `engine exited ${result.code}`;
      return { run: { status: 'failed' as const, firstErrorLine: error, execution: { status: 'failed' as const, convergence: 'failed' as const, analyses: [], error } }, wallMs };
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
  const fixtures = [];
  for (const circuit of circuits) {
    const input = await readFile(circuit.localPath);
    if (hash(input) !== circuit.sha256) throw new Error(`input hash mismatch: ${circuit.id}`);
    const ng = await run(circuit, 'ngspice');
    const ts = await run(circuit, 'spiceTs');
    const row = { ...reduceRow(circuit, ng.run, ts.run.execution), runtime: { ngspiceChildWallMs: ng.wallMs, spiceTsChildWallMs: ts.wallMs } };
    fixtures.push(row);
    console.log(`${circuit.id} ${row.outcome}: signals=${row.comparedSignals} error=${row.worstNormalizedError}`);
  }
  const receipt = {
    phase, head: spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim(),
    coreTree: spawnSync('git', ['rev-parse', 'HEAD:packages/core'], { encoding: 'utf8' }).stdout.trim(),
    manifestSha256: hash(manifestBytes), sources: manifest.sources,
    tools: { node: process.version, ngspice: 'ngspice-47' },
    environment: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model },
    command: `spice-heavy pnpm exec tsx ${root}/run.ts ${phase}`,
    policy: { fixtureAdaptation: 'none', perCircuitToleranceTuning: false, matchThreshold: 0.01, matchRule: MATCH_RULE, executionDeadlineMs: 119_000, runtimeBoundary: 'serial cold owned engine group wall, not solver-only or warm runtime' }, fixtures,
  };
  await writeFile(`${root}/${phase}.json.gz`, gzipSync(JSON.stringify(receipt, null, 2) + '\n'));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
