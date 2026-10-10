#!/usr/bin/env tsx
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  runNativeSpiceTs,
  type ClassicCircuit,
} from '../../corpus/classic/report.js';

interface XyceManifest {
  circuits: ClassicCircuit[];
}

async function main(): Promise<void> {
  const targetId = process.argv[2];
  if (!targetId) throw new Error('fixture id is required');

  const manifest = JSON.parse(
    await readFile(resolve('benchmarks/corpus/xyce/manifest.json'), 'utf8'),
  ) as XyceManifest;
  const circuit = manifest.circuits.find(candidate => candidate.id === targetId);
  if (!circuit) throw new Error(`missing Xyce fixture: ${targetId}`);
  const input = await readFile(resolve(circuit.localPath));
  const execution = await runNativeSpiceTs(input, circuit);
  process.stdout.write(JSON.stringify(execution));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
