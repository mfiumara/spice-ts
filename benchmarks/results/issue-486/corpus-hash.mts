#!/usr/bin/env tsx
/**
 * Issue #486: bit-exact spice-ts result digest over the 100 aggregate corpus
 * fixtures, for proving a performance change leaves the aggregate parity
 * outcome unchanged while `aggregate-report.ts --check` cannot run (stale
 * SOURCES.md pin owned by the aggregate lane).
 *
 *   npx tsx benchmarks/results/issue-486/corpus-hash.mts <core-root> <out.json>
 *
 * <core-root> is a directory containing packages/core/dist (the aggregate's
 * spice-ts adapter, runNativeSpiceTs, loads packages/core/dist from the cwd).
 * Each fixture runs in its own child process with the aggregate's 120 s
 * bound; the digest is SHA-256 over v8.serialize of the full EngineExecution
 * (status, convergence, every analysis grid and signal as Float64), so any
 * changed bit, point count or status changes it.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { serialize } from 'node:v8';

const CORPORA = ['ngspice', 'classic', 'xyce', 'corpus-d', 'corpus-e'];
const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(scriptPath, '../../../..');

if (process.argv[2] === '--child') {
  const [fixturePath, circuitJson] = process.argv.slice(3);
  const { runNativeSpiceTs } = await import(pathToFileURL(resolve(repoRoot, 'benchmarks/corpus/classic/report.ts')).href);
  const execution = await runNativeSpiceTs(readFileSync(fixturePath), JSON.parse(circuitJson));
  process.stdout.write(createHash('sha256').update(serialize(execution)).digest('hex'));
  process.exit(0);
}

const [coreRoot, out] = process.argv.slice(2);
if (!coreRoot || !out) throw new Error('usage: corpus-hash.mts <core-root> <out.json>');
const digests: Record<string, string> = {};
for (const corpus of CORPORA) {
  const manifest = JSON.parse(readFileSync(resolve(repoRoot, `benchmarks/corpus/${corpus}/manifest.json`), 'utf8'));
  for (const circuit of manifest.circuits) {
    const run = spawnSync(process.execPath, [...process.execArgv, scriptPath, '--child', resolve(repoRoot, circuit.localPath), JSON.stringify(circuit)], {
      cwd: resolve(coreRoot), encoding: 'utf8', timeout: 120_000, killSignal: 'SIGKILL', maxBuffer: 16 * 1024 * 1024,
    });
    const key = `${corpus}/${circuit.id}`;
    digests[key] = run.status === 0 ? run.stdout.trim() : `child-failed:${run.error?.message ?? run.status}`;
    console.log(`${key} ${digests[key]}`);
  }
}
writeFileSync(out, `${JSON.stringify(digests, null, 2)}\n`);
console.log(`${Object.keys(digests).length} fixtures -> ${out}`);
