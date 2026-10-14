// Observation-only identical-input waveform capture. No solver/deck overrides.
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { runNgspicePacked, runBoundedSimulatePacked } from '../../benchmarks/corpus/corpus-f/outcomes.js';
import { unpackExecution } from '../../benchmarks/corpus/corpus-f/packed.js';
import type { ClassicCircuit } from '../../benchmarks/corpus/classic/report.js';
import { reduceRow, type Manifest } from '../../benchmarks/corpus/corpus-j/parity.js';

async function main() {
  const manifest = JSON.parse(readFileSync('benchmarks/corpus/corpus-k/manifest.json', 'utf8')) as Manifest;
  const circuit = manifest.circuits.find(c => c.id === 'k-13')!;
  const deck = readFileSync(circuit.localPath);
  if (createHash('sha256').update(deck).digest('hex') !== circuit.sha256) throw new Error('fixture changed');
  const ng = await runNgspicePacked(deck, circuit);
  const ts = await runBoundedSimulatePacked(deck, { ...circuit, category: 'corpus-k', ngspice: { expectedStatus: 'pass' }, spiceTs: { expectedStatus: 'pass' } } as unknown as ClassicCircuit);
  const receipt = { row: reduceRow(circuit, ng, ts), ngspice: unpackExecution(ng.execution), spiceTs: unpackExecution(ts) };
  writeFileSync('evidence/1019/waveforms.json.gz', gzipSync(JSON.stringify(receipt) + '\n'));
  console.log(JSON.stringify(receipt.row));
}
main().catch(e => { console.error(e); process.exitCode = 1; });
