import { readFileSync } from 'node:fs';
import { simulate } from './src/index.js';
for (const p of ['examples/xspice/various/ro_nand_digi.cir', 'examples/Monte_Carlo/rand_numb_test.cir']) {
  try { await simulate(readFileSync(`../../benchmarks/corpus/corpus-f/fixtures/${p}`, 'utf8')); console.log(p, 'success'); }
  catch (e) { console.log(p, (e as Error).constructor.name, String((e as Error).message).split('\n')[0]); }
}
