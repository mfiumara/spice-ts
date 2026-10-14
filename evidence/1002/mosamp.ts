import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { simulate } from '../../packages/core/src/simulate.js';
async function main() {
  const deck = readFileSync('benchmarks/corpus/classic/fixtures/spice3f5/mosamp2.cir');
  const result = await simulate(deck.toString());
  const voltage = result.transient!.voltage('5').at(-1)!;
  const receipt = { inputSha256: createHash('sha256').update(deck).digest('hex'),
    lastTime: result.transient!.time.at(-1), voltage, defaultReference: 9.46397521,
    originalTestBound: 5e-6, maxAbsAtStop: Math.abs(voltage - 9.46397521),
    points: result.transient!.time.length, convergence: result.convergence,
    command: `pnpm exec tsx evidence/1002/mosamp.ts ${process.argv[2]}` };
  writeFileSync(`evidence/1002/mosamp-${process.argv[2]}.json`, JSON.stringify(receipt, null, 2) + '\n');
  console.log(receipt);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
