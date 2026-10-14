import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, release } from 'node:os';
import { spawnSync } from 'node:child_process';
import type { ClassicCircuit } from '../../corpus/classic/report.js';
import { runBoundedSimulatePacked, runNgspicePacked } from '../../corpus/corpus-f/outcomes.js';
import { reduceRow, type Circuit, type Manifest } from '../../corpus/corpus-j/parity.js';

async function main() {
  const root = 'benchmarks/reference/maxord-983';
  const manifest = JSON.parse(await readFile('benchmarks/corpus/corpus-k/manifest.json', 'utf8')) as Manifest;
  const pump = manifest.circuits.find(circuit => circuit.id === 'k-13');
  if (!pump) throw new Error('missing k-13 fixture');
  const original = await readFile(pump.localPath);
  if (createHash('sha256').update(original).digest('hex') !== pump.sha256) throw new Error('pump fixture hash changed');
  const version = spawnSync('ngspice', ['--version'], { encoding: 'utf8' }).stdout;
  if (!version.includes('ngspice-47')) throw new Error('requires ngspice-47');
  const baselineCommit = '8c8318aa011e104b0488f0e69bb17f63aee3ce72';
  const before = spawnSync('git', ['show', `${baselineCommit}:benchmarks/corpus/corpus-k/outcomes.json`], { encoding: 'utf8' });
  if (before.status !== 0) throw new Error('baseline commit unavailable; fetch full history');
  const baseline = JSON.parse(before.stdout).fixtures.find((row: { id: string }) => row.id === pump.id);
  const fixtures = [];
  const cases: Array<{ circuit: Circuit; bytes: Buffer }> = [{ circuit: pump, bytes: original }];
  for (const method of ['trap', 'gear']) {
    for (const order of [1, 2]) {
      const bytes = Buffer.from(`MAXORD RC regression (project authored, MIT)
V1 in 0 PULSE(0 1 0 1n 1n 1m 2m)
R1 in out 1k
C1 out 0 1n
.options method=${method} maxord=${order}
.tran 20n 1u
.end
`);
      cases.push({ circuit: { ...pump, id: `rc-${method}-${order}`, sourcePath: 'project-authored RC order-cap regression',
        localPath: 'rc.cir', sha256: createHash('sha256').update(bytes).digest('hex'), sameNameAs: [] }, bytes });
    }
  }
  for (const { circuit, bytes } of cases) {
    const startNg = performance.now();
    const ng = await runNgspicePacked(bytes, circuit);
    const ngWall = performance.now() - startNg;
    const startTs = performance.now();
    const ts = await runBoundedSimulatePacked(bytes, { ...circuit, category: 'maxord-983',
      ngspice: { expectedStatus: 'pass' }, spiceTs: { expectedStatus: 'pass' } } as unknown as ClassicCircuit);
    const row = { ...reduceRow(circuit, ng, ts), runtime: { ngspiceWallMs: ngWall, spiceTsWallMs: performance.now() - startTs } };
    fixtures.push(row);
    console.log(JSON.stringify({ id: row.id, ng: row.ngspice, ts: row.spiceTs, outcome: row.outcome, worstNormalizedError: row.worstNormalizedError }));
  }
  await writeFile(`${root}/report.json`, JSON.stringify({ schemaVersion: 'maxord-983/v1',
    command: `spice-heavy pnpm exec tsx ${root}/run.ts`, coreTree: spawnSync('git', ['rev-parse', 'HEAD:packages/core'], { encoding: 'utf8' }).stdout.trim(),
    node: process.version, ngspice: '47', machine: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model },
    policy: { input: 'identical bytes per case for both engines', perCircuitToleranceTuning: false, fixtureAdaptation: 'none for pump; project-authored RC cases',
      runtime: 'cold ngspice batch wall / cold Node child wall, not solver-only or speed claim', baseline: 'committed corpus-k outcome plus RED tests at 13e8bd0c' },
    baselineCommit, before: baseline, fixtures }, null, 2) + '\n');
  if (fixtures.some(row => row.ngspice.status !== 'success' || row.spiceTs.status !== 'success' || row.comparedSignals === 0)) throw new Error('a case did not run/compare');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
