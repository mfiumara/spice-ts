import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { TransientStep } from '../types.js';
import { createTransientSim } from './transient-driver.js';

const fixtureBytes = readFileSync(new URL(
  '../../../../benchmarks/corpus/ngspice/fixtures/examples/wave/jimi_fuzz.cir',
  import.meta.url,
));

function interpolateVoltage(
  before: TransientStep,
  after: TransientStep,
  node: string,
  time: number,
): number {
  const weight = (time - before.time) / (after.time - before.time);
  const start = before.voltages.get(node)!;
  return start + weight * (after.voltages.get(node)! - start);
}

describe('jimi-fuzz transient parity', () => {
  it('tracks the ngspice-47 nonlinear transient on the unchanged fixture', async () => {
    expect(fixtureBytes.byteLength).toBe(1_009);
    expect(createHash('sha256').update(fixtureBytes).digest('hex')).toBe(
      '0607c7f358628d0ce60eff584b329a4d685ae215894c466622a19357c7163b0e',
    );

    const sampleTime = 0.50075;
    // ngspice-47: byte-identical fixture, linear interpolation on its native
    // 243,504-point transient grid (see benchmarks/issue-146-jimi-fuzz.ts).
    const ngspiceV6 = 0.8338286512968213;
    const sim = await createTransientSim(fixtureBytes.toString('utf8'));
    try {
      let before = sim.advance();
      let after = before;
      while (after.time < sampleTime) {
        before = after;
        after = sim.advance();
      }
      expect(Math.abs(interpolateVoltage(before, after, '6', sampleTime) - ngspiceV6))
        .toBeLessThan(1e-2);
      expect(sim.convergence.transient.nrRetries).toBe(0);
    } finally {
      sim.dispose();
    }
  }, 10_000);
});