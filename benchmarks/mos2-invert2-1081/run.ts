import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { arch, cpus, platform, release } from 'node:os';
import type { ClassicCircuit } from '../corpus/classic/report.js';
import type { Manifest } from '../corpus/corpus-j/parity.js';
import { reduceRow } from '../corpus/corpus-j/parity.js';
import { runNgspicePacked, runBoundedSimulatePacked } from '../corpus/corpus-f/outcomes.js';
import { unpackExecution } from '../corpus/corpus-f/packed.js';

const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
async function main() {
  const root = 'benchmarks/mos2-invert2-1081';
  const manifest = JSON.parse(readFileSync('benchmarks/corpus/corpus-m/manifest.json', 'utf8')) as Manifest;
  const label = process.argv[2] ?? 'before';
  const diagnostic = process.argv[3];
  if (!/^[a-z-]+$/.test(label)) throw new Error('invalid receipt label');
  if (diagnostic !== undefined && diagnostic !== 'fine' && diagnostic !== 'tight') throw new Error('unknown diagnostic');
  const rows = [];
  const inputs = [];
  const waveforms = [];
  for (const id of ['m-19', 'm-20']) {
    const circuit = manifest.circuits.find(c => c.id === id)!;
    const original = readFileSync(circuit.localPath);
    if (hash(original) !== circuit.sha256) throw new Error('fixture hash mismatch');
    // Diagnostic changes go to both engines, never to the original corpus files.
    const input = diagnostic === 'fine'
      ? Buffer.from(original.toString().replace(/\.tran 20ns 30us/i, '.tran 20ns 30us 0 0.1ns'))
      : diagnostic === 'tight'
        ? Buffer.from(original.toString().replace(/\.END/i, '.options reltol=1e-6 vntol=1e-9 abstol=1e-15\n.END'))
        : original;
    inputs.push({ id, originalSha256: circuit.sha256, actualSha256: hash(input) });
    const ng = await runNgspicePacked(input, circuit);
    const ts = await runBoundedSimulatePacked(input, { ...circuit, category: 'corpus-m',
      ngspice: { expectedStatus: 'pass' }, spiceTs: { expectedStatus: 'pass' } } as unknown as ClassicCircuit);
    const row = reduceRow(circuit, ng, ts);
    rows.push(row);
    waveforms.push({ id, ng: unpackExecution(ng.execution), ts: unpackExecution(ts) });
    console.log(id, row.outcome, row.worstSignal, row.worstNormalizedError);
  }
  writeFileSync(`${root}/${label}.json`, JSON.stringify({ diagnostic: diagnostic ?? null, inputs,
    head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    tools: { node: process.version, ngspice: execFileSync('ngspice', ['--version'], { encoding: 'utf8' }) },
    environment: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model }, rows }, null, 2) + '\n');
  writeFileSync(`${root}/${label}-waveforms.json.gz`, gzipSync(JSON.stringify(waveforms)));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
