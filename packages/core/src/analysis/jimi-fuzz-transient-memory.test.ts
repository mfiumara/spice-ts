import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createTransientSim } from './transient-driver.js';

const fixtureBytes = readFileSync(new URL(
  '../../../../benchmarks/corpus/ngspice/fixtures/examples/wave/jimi_fuzz.cir',
  import.meta.url,
));
const fixture = fixtureBytes.toString('utf8');

describe('jimi-fuzz transient point growth', () => {
  it('bounds the persistent NR retry cycle on the unchanged nonlinear fixture', async () => {
    expect(fixtureBytes.byteLength).toBe(1_009);
    expect(createHash('sha256').update(fixtureBytes).digest('hex')).toBe(
      '0607c7f358628d0ce60eff584b329a4d685ae215894c466622a19357c7163b0e',
    );

    const sim = await createTransientSim(fixture);
    try {
      for (let point = 1; point < 20_000; point++) sim.advance();

      expect(sim.simTime).toBeGreaterThan(0.1);
      expect(sim.convergence.transient.nrRetries).toBeLessThanOrEqual(1_024);
    } finally {
      sim.dispose();
    }
  }, 10_000);
});
