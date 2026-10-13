#!/usr/bin/env tsx
/**
 * Runs one deck through corpus-f's `runFixture` (spice-ts bounded child + ngspice-47 on the same
 * bytes) and prints the fixture outcome as one JSON line, then the process's peak RSS on stderr.
 * Used by the bounded-heap regression test (#839) and for single-deck evidence; a V8 flag such as
 * `--max-old-space-size` given to this process also bounds the spice-ts child, which inherits
 * `process.execArgv`.
 *
 *   pnpm exec tsx benchmarks/corpus/corpus-f/run-deck.ts <deck> [source-path]
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { declaredAnalyses } from './lib.js';
import { runFixture } from './outcomes.js';

async function main(): Promise<void> {
  const [path, sourcePath = path] = process.argv.slice(2);
  if (!path) throw new Error('usage: run-deck.ts <deck> [source-path]');
  const bytes = await readFile(path);
  const { mapped, unmapped } = declaredAnalyses(bytes.toString('utf8'));
  const started = performance.now();
  const outcome = await runFixture({
    id: sourcePath,
    sourcePath,
    sourceUrl: '',
    localPath: path,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
    licence: 'BSD-3-Clause',
    analyses: mapped,
    unmappedAnalyses: unmapped,
    sameNameAs: [],
  });
  process.stdout.write(`${JSON.stringify(outcome)}\n`);
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  process.stderr.write(`run-deck: ${seconds} s; fixture process peak RSS ${(process.resourceUsage().maxRSS / 1024).toFixed(0)} MB\n`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
