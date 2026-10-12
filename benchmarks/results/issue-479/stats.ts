// Transient Newton / step statistics for a deck (diagnostic).
import { readFile } from 'node:fs/promises';
import { simulate } from '../../../packages/core/src/index.js';

async function main(): Promise<void> {
  const [file, options] = process.argv.slice(2);
  let text = await readFile(file, 'utf8');
  if (options) text = text.replace(/^\.END\s*$/im, `.OPTIONS ${options}\n.END`);
  const t0 = performance.now();
  const result = await simulate(text);
  const ms = performance.now() - t0;
  console.log(JSON.stringify(result.convergence?.transient), `${ms.toFixed(0)} ms`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
