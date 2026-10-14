import { readFile, writeFile } from 'node:fs/promises';
import { deserialize } from 'node:v8';
import { reduceRow, type Manifest } from '../../corpus/corpus-j/parity.js';
import type { ReferenceRun } from '../../corpus/corpus-f/outcomes.js';
import type { PackedExecution } from '../../corpus/corpus-f/packed.js';

// Engine blobs are produced by the unchanged corpus-k --engine runner.
const directory = 'benchmarks/results/issue-995';
const phase = process.argv[2];
if (phase !== 'before' && phase !== 'after') throw new Error('phase must be before or after');
async function main() {
  const manifest = JSON.parse(await readFile('benchmarks/corpus/corpus-k/manifest.json', 'utf8')) as Manifest;
  const circuit = manifest.circuits.find(c => c.id === 'k-8')!;
  const ng = deserialize(await readFile(`${directory}/ng.bin`)) as ReferenceRun<PackedExecution>;
  const ts = deserialize(await readFile(`${directory}/${phase}.bin`)) as ReferenceRun<PackedExecution>;
  const row = reduceRow(circuit, ng, ts.execution);
  await writeFile(`${directory}/${phase}.json`, JSON.stringify(row, null, 2) + '\n');
  console.log(JSON.stringify(row, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
