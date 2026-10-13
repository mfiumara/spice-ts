import { readFileSync } from 'node:fs';
import { simulate } from '../../packages/core/src/simulate.js';
try {
  const result = await simulate(readFileSync(process.argv[2], 'utf8'));
  const nodes = process.argv[2].endsWith('minimal.cir') ? ['a', 'b'] : ['n1'];
  console.log(JSON.stringify({ status: 'success', output: result.control?.output,
    runs: result.control?.runs.map(run => Object.fromEntries(nodes.map(node => [node, run.result.dc?.voltage(node)]))) }));
} catch (error) {
  console.log(JSON.stringify({ status: 'failed', error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
}
