#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [repoRoot, fixturePath] = process.argv.slice(2);
if (!repoRoot || !fixturePath) {
  console.error('usage: run-spice-ts.mjs <repo-root> <fixture-path>');
  process.exit(2);
}

function classify(error) {
  const message = String(error?.message ?? error);
  if (/timestep|converg|singular/i.test(message)) return 'convergence';
  if (error?.name === 'ParseError') return /unsupported/i.test(message) ? 'unsupported' : 'parse';
  if (/unsupported|not implemented/i.test(message)) return 'unsupported';
  return 'execution';
}

try {
  const bytes = await readFile(fixturePath);
  const inputSha256 = createHash('sha256').update(bytes).digest('hex');
  const { simulate } = await import(pathToFileURL(resolve(repoRoot, 'packages/core/dist/index.js')));
  try {
    await simulate(bytes.toString('utf8'));
    console.log(JSON.stringify({ status: 'pass', inputSha256 }));
  } catch (error) {
    console.log(
      JSON.stringify({
        status: 'fail',
        failureKind: classify(error),
        inputSha256,
        errorName: error?.name ?? 'Error',
        errorMessage: String(error?.message ?? error),
      }),
    );
  }
} catch (error) {
  console.log(
    JSON.stringify({
      status: 'fail',
      failureKind: 'execution',
      errorName: error?.name ?? 'Error',
      errorMessage: String(error?.message ?? error),
    }),
  );
  process.exitCode = 1;
}
