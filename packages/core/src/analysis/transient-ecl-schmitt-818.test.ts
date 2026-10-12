import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';

// Issue #818: the ECL Schmitt trigger of corpus-h xictools/wrspice/examples/
// schmitt.cir (also classic/ecl-schmitt-trigger and ngspice/schmitt-trigger).
// ngspice-47 crosses the regenerative rising edge in one 10 ns step,
// 289.6 ns -> 299.6 ns, converging in 15 Newton iterations; spice-ts failed
// that step after 100 iterations, cut the step by 8 and switched later, so
// v(6) was off by up to 0.56 V around 300 ns. A traced ngspice-47 build showed
// the iterates of both engines agree until they amplify microvolt differences
// in the accepted points before the edge. Three ngspice-47 Newton rules were
// missing in transient analysis:
//
//  - niiter.c NIconvTest also tests branch currents (RELTOL*max + ABSTOL);
//    spice-ts accepted an iterate ngspice refines once more (279.6 ns).
//  - bjtconv.c BJTconvTest also runs in transient, on cc, cb, gpi and gmu
//    that include the integrated qbe/qbc terms.
//  - bjtload.c extrapolates vbe/vbc on the first iterate (MODEINITPRED) and
//    limits every iterate with DEVpnjlim against the previous one.
//
// No tolerance, step limit or per-circuit option is involved.
const DECK = `* schmitt ckt - ecl compatible schmitt trigger
.tran 10ns 1000ns
vin 1 0 pulse(-1.6 -1.2 10ns 400ns 400ns 100ns 10000ns)
vee 8 0 -5
rin 1 2 50
rc1 0 3 50
r1 3 5 185
r2 5 8 760
rc2 0 6 100
re 4 8 260
rth1 7 8 125
rth2 7 0 85
cload 7 0 5pf
q1 3 2 4 qstd off
q2 6 5 4 qstd
q3 0 6 7 qstd
q4 0 6 7 qstd
.model qstd npn(is=1.0e-16 bf=50 br=0.1 rb=50 rc=10 tf=0.12ns tr=5ns
+   cje=0.4pf pe=0.8 me=0.4 cjc=0.5pf pc=0.8 mc=0.333 ccs=1pf va=50)
.end
`;

// ngspice-47 (`ngspice -b`, wrdata) accepted points around the rising edge.
const NGSPICE = [
  { time: 289.6e-9, v3: -2.90493538e-1, v6: -1.04113048 },
  { time: 299.6e-9, v3: -7.31560179e-1, v6: -1.32178483e-1 },
];

describe('ECL Schmitt trigger rising edge matches ngspice-47 (#818)', () => {
  it('crosses the regenerative edge in ngspice-47\'s single 10 ns step', async () => {
    const result = await simulate(DECK);
    const transient = result.transient!;
    const time = Array.from(transient.time);
    const v3 = transient.voltage('3');
    const v6 = transient.voltage('6');
    for (const point of NGSPICE) {
      const index = time.findIndex(t => Math.abs(t - point.time) < 1e-15);
      expect(index, `accepted point at ${point.time}`).toBeGreaterThan(0);
      expect(Math.abs(v3[index] - point.v3)).toBeLessThan(1e-4);
      expect(Math.abs(v6[index] - point.v6)).toBeLessThan(1e-4);
    }
    // No Newton-failure retry between the two points (ngspice-47 has none).
    expect(time.filter(t => t > 289.6e-9 + 1e-15 && t < 299.6e-9 - 1e-15)).toEqual([]);
  });
});
