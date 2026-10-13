import { describe, expect, it } from 'vitest';
import { createTransientSim } from './transient-driver.js';

/**
 * Issue #878: transient Newton iterations of a MOS1 CMOS inverter chain,
 * timepoint by timepoint, against ngspice-47.
 *
 * The deck is the M2 scaling deck `cmos-inverter-chain-tran` at 42 nodes
 * (benchmarks/performance/scaling-m2-fixture.mjs). NGSPICE_47_ITERATIONS are
 * the NIiter iteration counts of its 213 transient timepoints from ngspice-47
 * built with one fprintf after the NIiter call in dctran.c
 * (benchmarks/performance/results/issue-878/README.md); that build reports
 * the same `Transient iterations = 483` as the Homebrew ngspice-47 binary.
 *
 * Before #878 MOS1 had no MODEINITPRED predictor: the first iterate of every
 * timepoint was linearised at the previous solution, and 133 of the 213
 * timepoints took 3 iterations where ngspice-47 takes 2 (599 vs 483).
 */
const NGSPICE_47_ITERATIONS = [
  2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 2, 2, 2, 3,
  2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 2, 2, 2, 2, 2, 2, 3, 3,
  3, 3, 2, 2, 2, 2, 2, 2, 2, 3, 3, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 2, 2, 2, 2, 2, 2, 3, 3, 3,
  2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 2, 2, 2, 2, 2, 2, 3, 3, 3, 2,
  2, 2, 2, 2, 2, 2, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 3, 3, 2, 2,
  2, 2, 2, 2, 2, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 3, 3, 2, 2, 2,
  2, 2, 2, 2, 3, 3, 3, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 3, 3, 3, 2, 2, 2, 2,
  2, 2, 2,
];

function inverterChain(stages: number): string {
  const lines = [
    `* spice-ts generated CMOS inverter chain transient: ${stages} stages, ${stages + 2} nodes`,
    '.options acct',
    'VDD vdd 0 DC 2.5',
    'VIN s0 0 PULSE(0 2.5 0.1n 0.1n 0.1n 5n 10n)',
    '.model nch nmos level=1 vto=0.5 kp=120u lambda=0.02',
    '.model pch pmos level=1 vto=-0.5 kp=60u lambda=0.02',
  ];
  for (let stage = 1; stage <= stages; stage++) {
    lines.push(`MP${stage} s${stage} s${stage - 1} vdd vdd pch W=2u L=1u`);
    lines.push(`MN${stage} s${stage} s${stage - 1} 0 0 nch W=1u L=1u`);
    lines.push(`C${stage} s${stage} 0 10f`);
  }
  lines.push('.tran 10p 2n', `.print tran v(s${Math.min(stages, 20)})`, '.end');
  return `${lines.join('\n')}\n`;
}

describe('MOS1 transient Newton iterations vs ngspice-47 (#878)', () => {
  it('takes ngspice-47 NIiter iteration counts at every timepoint of the CMOS chain', async () => {
    const sim = await createTransientSim(inverterChain(40));
    const iterations: number[] = [];
    let total = sim.convergence.transient.newtonIterations;
    while (!sim.isDone) {
      sim.advance();
      const now = sim.convergence.transient.newtonIterations;
      iterations.push(now - total);
      total = now;
    }

    expect(sim.convergence.transient.rejectedSteps).toBe(0);
    expect(iterations).toHaveLength(NGSPICE_47_ITERATIONS.length);
    // ngspice NIiter never accepts its first iterate (noncon = 1 at iterno 1);
    // spice-ts accepts a first iterate that passes every convergence test, so
    // a timepoint may take 1 where ngspice-47 takes 2. Nowhere more.
    const mismatches = iterations.flatMap((count, point) => {
      const reference = NGSPICE_47_ITERATIONS[point];
      return count === reference || (count === 1 && reference === 2) ? [] : [{ point, count, reference }];
    });
    expect(mismatches).toEqual([]);
    const sum = iterations.reduce((a, b) => a + b, 0);
    expect(sum).toBeGreaterThanOrEqual(Math.ceil(0.95 * 483));
    expect(sum).toBeLessThanOrEqual(483);
  });
});
