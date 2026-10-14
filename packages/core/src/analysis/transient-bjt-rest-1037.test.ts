import { describe, expect, it } from 'vitest';
import { createTransientSim } from './transient-driver.js';

// Self-written, rounded-parameter reduction, not a vendor-library quotation.
// At DC equilibrium there is no changing source and no physical transient.
const REST = `Reverse-biased BJT at rest (#1037)
V1 c 0 46.5
Q1 c 0 0 N
.model N NPN(IS=1e-14 BF=200 BR=6 VAF=75 CJC=7p CJE=22p TR=50n TF=400p RB=10 RC=1)
.options rshunt=1G
.tran 100f 10p
.end
`;

describe('reverse-biased BJT small-step convergence (#1037)', () => {
  it('preserves DC equilibrium through a 10 ps transient', async () => {
    const sim = await createTransientSim(REST);
    try {
      while (!sim.isDone) sim.advance();
      expect(sim.simTime).toBeCloseTo(1e-11, 20);
    } finally {
      sim.dispose();
    }
  });
});
