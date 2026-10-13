import { readFileSync } from 'node:fs';
import { simulate } from '../../packages/core/src/simulate.js';
try {
  const result = await simulate(readFileSync(process.argv[2], 'utf8'));
  console.log(JSON.stringify({ status: 'success', output: result.control?.output, runs: result.control?.runs.length,
    n1: result.control?.runs.map(run => run.result.dc?.voltage('n1')) }));
} catch (error) {
  console.log(JSON.stringify({ status: 'failed', error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
}
