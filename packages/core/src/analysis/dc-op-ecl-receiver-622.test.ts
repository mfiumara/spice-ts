import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';

/**
 * #622: the Raytheon ECL `bjtdrvr` subcircuit of corpus-f
 * `examples/TransmissionLines/ltra5_1_line.sp`, isolated with its input held at
 * the 1.4234 V the receiver sees at t=0. The circuit has more than one DC
 * solution: ngspice-47 accepts both, and lands on the one below because its
 * CKTop tries plain Newton from the initial guess first and only falls back to
 * gmin and source stepping when that fails. spice-ts used to ramp every source
 * from 1 % before the first Newton solve and settled on the other solution
 * (v(4) 0.0363 V, v(xrcv.8) 2.74 V, v(xrcv.22) 4.57 V).
 *
 * Models and subcircuit are byte-identical to the fixture. References:
 * ngspice-47 batch `.op` on this exact deck.
 */
const DECK = `isolated bjtdrvr receiver #622
vcc vcc 0 5
v3 3 0 1.4234
xrcv 3 4 vcc bjtdrvr
.model qmodn npn(bf=100 rb=100 cje=0.09375pF cjc=0.28125pF is=1e-12
+pe=0.5 pc=0.5)
.model qmodpd npn(bf=100 rb=100 cje=0.08187pF cjc=0.2525pF is=1e-12
+pe=0.5 pc=0.5)
.model qmodpdmine npn(bf=100 rb=100  cje=0.08187pF cjc=0.05pF is=1e-12
+pe=0.5 pc=0.5)
.model dmod1 d(n=2.25 is=1.6399e-4 bv=10)
.model dmod2 d
.model dmod d(vj=0.3v)
.subckt bjtdrvr 19 268 20
q1 22 18 13 qmodn
q2 18 16 13 qmodn
qd2 21 9 0 qmodn
q4 14 14 0 qmodn
q3 16 15 14 qmodpd
q5 8 13 17 qmodn
q6 25 12 0 qmodn
q7 6 17 0 qmodpd
qd1 26 10 0 qmodn
q8 7 11 10 qmodn
q10 268 17 0 qmodpdmine
q9 7 10 268 qmodn
d1 0 19 dmod1
d2 18 19 dmod2
d3 13 19 dmod
dq1 18 22 dmod
dq2 16 18 dmod
d502 9 21 dmod
dq3 15 16 dmod
d10 24 8 dmod
d4 15 6 dmod
dq6 12 25 dmod
dq7 17 6 dmod
dd1 17 10 dmod
d7 11 6 dmod
dd2 17 26 dmod
d9 23 6 dmod
dq8 11 7 dmod
d501 17 268 dmod
dq9 10 7 dmod
d14 20 27 dmod
d8 0 268 dmod
r1 18 20 6k
r2 22 20 2.2k
r4 0 13 7k
rd1 9 13 2k
rd2 21 13 3k
r3 16 20 10k
r5 15 20 15k
r9 0 17 4k
r6 24 20 750
r10 12 17 2k
r12 24 11 1.5k
r11 25 17 3k
r15 23 20 10k
r13 0 10 15k
r14 7 27 12
.ends bjtdrvr
`;

const NGSPICE_47_NODES: Record<string, number> = {
  '4': 2.404862e-02,
  'xrcv.6': 3.654158e-02,
  'xrcv.7': 4.450252e+00,
  'xrcv.8': 1.255637e+00,
  'xrcv.9': 5.689538e-01,
  'xrcv.10': 2.565872e-01,
  'xrcv.11': 6.870244e-01,
  'xrcv.12': 5.158548e-01,
  'xrcv.13': 1.232697e+00,
  'xrcv.14': 3.297923e-01,
  'xrcv.15': 6.595846e-01,
  'xrcv.16': 1.804902e+00,
  'xrcv.17': 6.630247e-01,
  'xrcv.18': 1.269356e+00,
  'xrcv.21': 3.106358e-02,
  'xrcv.22': 5.000000e+00,
  'xrcv.23': 6.700100e-01,
  'xrcv.24': 1.941180e+00,
  'xrcv.25': 4.165983e-02,
  'xrcv.26': 2.873241e-01,
  'xrcv.27': 4.450455e+00,
};

const NGSPICE_47_CURRENTS: Record<string, number> = {
  vcc: -5.75895e-03,
  v3: -1.63975e-04,
};

function expectRelClose(actual: number | undefined, expected: number, label: string): void {
  expect(actual, label).toBeDefined();
  const rel = Math.abs(actual! - expected) / Math.abs(expected);
  expect(rel, `${label}: spice-ts ${actual} vs ngspice-47 ${expected}`).toBeLessThan(1e-3);
}

describe('ECL bjtdrvr receiver operating point vs ngspice-47 (#622)', () => {
  it('.op lands on the ngspice-47 solution', async () => {
    const result = await simulate(`${DECK}.op\n.end\n`);
    for (const [node, expected] of Object.entries(NGSPICE_47_NODES)) {
      expectRelClose(result.dc!.voltages.get(node), expected, `v(${node})`);
    }
    for (const [source, expected] of Object.entries(NGSPICE_47_CURRENTS)) {
      expectRelClose(result.dc!.currents.get(source), expected, `i(${source})`);
    }
  });

  it('the transient operating point (t=0) lands on the same solution', async () => {
    const result = await simulate(`${DECK}.tran 1p 2p\n.end\n`);
    const tran = result.transient!;
    for (const [node, expected] of Object.entries(NGSPICE_47_NODES)) {
      expectRelClose(tran.voltage(node)[0], expected, `v(${node}) at t=0`);
    }
  });
});
