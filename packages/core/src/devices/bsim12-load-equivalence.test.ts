import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { simulate } from '../index.js';

// Full sweep outputs captured before removing per-load closures (#1134).
// Keep all voltage/current bits, not just the ngspice reference sample points.
it.each([
  ['bsim1tst', '29ab73c06131c74e5abacaedb78f14d1879894c51c426e1e249bd25cca48f385'],
  ['bsim2tst', 'ec1071b47b54077bc95ac2e05c4acbbc3768de7e61876ad3f06f4c5f1341524c'],
])('%s retains every sweep output bit', async (fixture, hash) => {
  const deck = readFileSync(new URL(`../../../../benchmarks/corpus/classic/fixtures/spice3f5/${fixture}.cir`, import.meta.url), 'utf8');
  const sweep = (await simulate(deck)).dcSweep!;
  const data = JSON.stringify([sweep.sweepValues, [...sweep.voltages], [...sweep.currents]],
    (_, value) => ArrayBuffer.isView(value) ? Array.from(value as Float64Array) : value);
  expect(createHash('sha256').update(data).digest('hex')).toBe(hash);
});
