import { describe, expect, it } from 'vitest';
import type { CompiledCircuit } from '../circuit.js';
import { BJT } from '../devices/bjt.js';
import { TimestepTooSmallError } from '../errors.js';
import type { ResolvedOptions } from '../types.js';
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
  // Known loss, NOT a fix. Remove .fails when a general numerical fix lands.
  // The native ngspice-47 run on these same bytes completes with 108 rows.
  it('preserves DC equilibrium through a 10 ps transient', async () => {
    const sim = await createTransientSim(REST);
    try {
      while (!sim.isDone) expect(sim.advance().voltages.get('c')).toBe(46.5);
      expect(sim.simTime).toBeCloseTo(1e-11, 20);
    } finally {
      sim.dispose();
    }
  });

  it('keeps the same DC-biased device at rest on a nanosecond grid', async () => {
    const sim = await createTransientSim(REST.replace('.tran 100f 10p', '.tran 1n 100n'));
    try {
      while (!sim.isDone) expect(sim.advance().voltages.get('c')).toBe(46.5);
      expect(sim.convergence.transient.nrRetries).toBe(0);
    } finally {
      sim.dispose();
    }
  });

  it('localizes the small-step rejection to BJT current convergence, without LTE or limiting', async () => {
    const sim = await createTransientSim(REST);
    const driver = sim as unknown as {
      compiled: CompiledCircuit;
      options: ResolvedOptions;
      currentSolution(): Float64Array;
    };
    const bjt = driver.compiled.devices.find(device => device instanceof BJT) as BJT;
    const stamp = bjt.stamp.bind(bjt);
    const check = bjt.convergenceTest.bind(bjt);
    let previous = new Float64Array(driver.currentSolution());
    let currentOnlyRejection = false;
    bjt.stamp = ctx => {
      previous = new Float64Array(driver.currentSolution());
      stamp(ctx);
    };
    bjt.convergenceTest = (solution, tolerances) => {
      const converged = check(solution, tolerances);
      // Mirror NIconvTest for ALL unknowns, including branch currents.
      const allUnknownsConverged = solution.every((value, i) => (
        Math.abs(value - previous[i]) <= tolerances.reltol * Math.max(Math.abs(value), Math.abs(previous[i]))
          + (i < driver.compiled.nodeCount ? driver.options.vntol : tolerances.abstol)
      ));
      if (!converged && allUnknownsConverged && !bjt.limitedLastStamp()) currentOnlyRejection = true;
      return converged;
    };
    try {
      expect(() => { while (!sim.isDone) sim.advance(); }).toThrow(TimestepTooSmallError);
      expect(currentOnlyRejection).toBe(true);
      expect(sim.convergence.transient.nrRetries).toBeGreaterThan(0);
      expect(sim.convergence.transient.lteRetries).toBe(0);
      expect(sim.convergence.transient.failure).toBe('dt-floor');
    } finally {
      sim.dispose();
    }
  });
});
