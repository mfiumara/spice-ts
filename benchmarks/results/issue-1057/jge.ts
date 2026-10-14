import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { arch, cpus, platform, release } from 'node:os';
import type { ClassicCircuit } from '../../corpus/classic/report.js';
import { runNgspicePacked, runBoundedSimulatePacked } from '../../corpus/corpus-f/outcomes.js';
import { reduceRow, type Circuit, type Manifest } from '../../corpus/corpus-j/parity.js';

// Read-only fixture/metadata from the reviewed corpus-l commit. Never alter the
// corpus harness, original fixture bytes, options or uniform comparison rules.
const revision = '66d67caff2f10e4d6a36d2e59898cc52d661b98d';
const show = (path: string) => execFileSync('git', ['show', `${revision}:${path}`]);
const manifest = JSON.parse(show('benchmarks/corpus/corpus-l/manifest.json').toString()) as Manifest;
const circuit = manifest.circuits.find(c => c.id === 'l-17') as Circuit;
if (!circuit) throw new Error('missing l-17');
const input = show(circuit.localPath);
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
if (hash(input) !== circuit.sha256) throw new Error('fixture hash mismatch');
const engine = execFileSync('ngspice', ['--version'], { encoding: 'utf8' });
if (!/ngspice-47\b/.test(engine)) throw new Error('requires ngspice-47');

async function main(): Promise<void> {
  const started = performance.now();
  const ng = await runNgspicePacked(input, circuit);
  const ngspiceWallMs = performance.now() - started;
  const startTs = performance.now();
  const ts = await runBoundedSimulatePacked(input, { ...circuit, category: 'corpus-l',
    ngspice: { expectedStatus: 'pass' }, spiceTs: { expectedStatus: 'pass' } } as unknown as ClassicCircuit);
  const spiceTsWallMs = performance.now() - startTs;
  const before = JSON.parse(show('benchmarks/corpus/corpus-l/outcomes.json').toString()).fixtures.find((row: { id: string }) => row.id === circuit.id);
  const after = reduceRow(circuit, ng, ts);
  const receipt = {
    command: 'spice-heavy pnpm exec tsx benchmarks/results/issue-1057/jge.ts',
    fixtureRevision: revision, fixture: circuit.localPath, sha256: circuit.sha256,
    source: 'Xyce/Xyce_Regression Netlists/CircuitSim90/MOS3/jge.cir, GPL-3.0-or-later; provenance in pinned corpus-l/SOURCES.md',
    coreTree: execFileSync('git', ['rev-parse', 'HEAD:packages/core'], { encoding: 'utf8' }).trim(),
    workingCoreDiffSha256: hash(execFileSync('git', ['diff', 'HEAD', '--', 'packages/core/src'])),
    tools: { ngspice: 'ngspice-47', node: process.version },
    environment: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model },
    policy: 'Unchanged corpus-f runners and corpus-j reduceRow. Identical fixture bytes. No tolerance changes. Cold wall includes adapter/process startup; not a speed claim.',
    before: { provenance: 'reviewed corpus-l baseline at fixtureRevision (not remeasured)', ...before },
    after, runtime: { ngspiceWallMs, spiceTsWallMs },
  };
  writeFileSync('benchmarks/results/issue-1057/jge.json', JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ outcome: after.outcome, ngspice: after.ngspice, spiceTs: after.spiceTs,
    worst: after.worstNormalizedError, signal: after.worstSignal, runtime: receipt.runtime }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
