import { describe, expect, it } from 'vitest';
import { InvalidCircuitError, ParseError } from '../errors.js';
import { parse } from '../parser/index.js';
import { simulate } from '../simulate.js';

/**
 * PSpice `.model <name> VSWITCH(...)` switches (#825). ngspice-47 has no
 * VSWITCH device: its PSpice compatibility mode (frontend/inpcompat.c) turns a
 * VON/VOFF model into the XSPICE pswitch code model (log=TRUE) and each S
 * instance into `a<name> %gd(nc+ nc-) %gd(n+ n-) a<model>`, and a VT/VH model
 * into the native SW switch.
 *
 * Every expected value is `ngspice -b` (ngspice-47) output on the same deck,
 * run with `set ngbehavior=psa` in .spiceinit (`ps`/`ltps` translate only
 * included library files; see the library test below).
 */
function relativeError(actual: number, expected: number): number {
  return Math.abs(actual - expected) / Math.abs(expected);
}

describe('PSpice VSWITCH switch model (#825)', () => {
  it('matches ngspice-47 over a DC sweep through off, log-cubic transition and on regions', async () => {
    // SMOD1: von > voff; SMOD2: von < voff and parenthesised parameters.
    const result = await simulate(`vswitch dc sweep
V1 in 0 DC 1
Vc c 0 DC 0
R1 in out 1k
S1 out 0 c 0 SMOD1
R2 in out2 1k
S2 out2 0 c 0 SMOD2
.MODEL SMOD1 VSWITCH RON=1 ROFF=1MEG VON=0.5 VOFF=-0.5
.MODEL SMOD2 VSWITCH(RON=10 ROFF=1e4 VON=-1 VOFF=1.5)
.dc Vc -2 2 0.25
.end
`);
    // ngspice-47 .print dc v(out) v(out2), Vc = -2 .. 2 step 0.25.
    const ngspice = [
      [9.990010e-01, 9.900990e-03], [9.990010e-01, 9.900990e-03], [9.990010e-01, 9.900990e-03],
      [9.990010e-01, 9.900990e-03], [9.990010e-01, 9.900990e-03], [9.990010e-01, 1.198842e-02],
      [9.990010e-01, 2.009935e-02], [9.919552e-01, 4.256259e-02], [5.000000e-01, 1.021427e-01],
      [8.585298e-03, 2.402531e-01], [9.990010e-04, 4.678084e-01], [9.990010e-04, 6.922182e-01],
      [9.990010e-04, 8.297955e-01], [9.990010e-04, 8.917911e-01], [9.990010e-04, 9.090909e-01],
      [9.990010e-04, 9.090909e-01], [9.990010e-04, 9.090909e-01],
    ];
    const out = result.dcSweep!.voltage('out');
    const out2 = result.dcSweep!.voltage('out2');
    expect(out).toHaveLength(ngspice.length);
    // At Vc = -0.25 (index 7) ngspice-47 prints 9.919552e-01 / 4.256259e-02 against the
    // exact 9.914147e-01 / 4.257032e-02 that its .op at Vc = -0.25 (and its sweep with
    // reltol=1e-5) gives: the step from -0.5 is limited (conv_limit) and niiter.c
    // returns, and cktdump.c prints, the iterate before the converging solve (CKTrhsOld).
    // spice-ts reports the converged solve, within RELTOL of ngspice there.
    ngspice.forEach(([v1, v2], index) => {
      const tolerance = index === 7 ? 1e-3 : 1e-6;
      expect(relativeError(out[index], v1)).toBeLessThan(tolerance);
      expect(relativeError(out2[index], v2)).toBeLessThan(tolerance);
    });
    expect(relativeError(out[7], 9.914147e-1)).toBeLessThan(1e-6);
    expect(relativeError(out2[7], 4.257032e-2)).toBeLessThan(1e-6);
  });

  it('turns a VT/VH model into the native SW switch and ignores TD on a pswitch model', async () => {
    // ngspice-47: v(out) = 1.938643e-02, v(out2) = 4.975124e-03; MIF warns that td is ignored.
    const result = await simulate(`vswitch td and vt
V1 in 0 DC 1
Vc c 0 DC 0.2
R1 in out 1k
S1 out 0 c 0 SMOD1
R2 in out2 1k
S2 out2 0 c 0 SMOD2
.MODEL SMOD1 VSWITCH RON=1 ROFF=1MEG VON=0.5 VOFF=-0.5 TD=1n
.MODEL SMOD2 VSWITCH RON=5 ROFF=1e5 VT=0.1 VH=0.05
.op
.end
`);
    expect(relativeError(result.dc!.voltage('out'), 1.938643e-2)).toBeLessThan(1e-6);
    expect(relativeError(result.dc!.voltage('out2'), 4.975124e-3)).toBeLessThan(1e-6);

    const circuit = parse('vt\nS1 1 0 2 0 SMOD2\n.MODEL SMOD2 VSWITCH RON=5 ROFF=1e5 VT=0.1 VH=0.05\n.op');
    expect(circuit.compile().models.get('smod2')).toMatchObject({ type: 'SW', params: { RON: 5, ROFF: 1e5, VT: 0.1, VH: 0.05 } });
  });

  it('translates VSWITCH models and S instances of an included PSpice library subcircuit in transient', async () => {
    // ngspice-47 with `set ngbehavior=ltps` (translates the included library):
    // a.x1.as1 %gd c 0 %gd out 0 x1:asmodx / pswitch(r_on=0.01 r_off=1e4 cntl_on=1.5 cntl_off=-1.5 log=true).
    const library = `* PSpice-style switch library
.subckt sw2 a b c d
S1 a b c d SMODX
.MODEL SMODX VSWITCH RON=0.01 ROFF=1e4
+ VON=1.5 VOFF=-1.5
.ends
`;
    // Max step 10 ns on both sides: with ngspice's default steps its own
    // waveform is ~5 % off the converged one on the 1 us discharge edges.
    const result = await simulate(`vswitch tran in subckt from library
.include swlib.lib
V1 in 0 DC 5
Vc c 0 PULSE(-3 3 0 10u 10u 40u 100u)
R1 in out 100
C1 out 0 100n
X1 out 0 c 0 sw2
.tran 0.5u 200u 0 10n
.end
`, { resolveInclude: async () => library });
    const time = result.transient!.time;
    const out = result.transient!.voltage('out');
    const at = (t: number): number => {
      const index = time.findIndex(value => value >= t - 1e-15);
      if (Math.abs(time[index] - t) < 1e-15) return out[index];
      const fraction = (t - time[index - 1]) / (time[index] - time[index - 1]);
      return out[index - 1] + fraction * (out[index] - out[index - 1]);
    };
    // ngspice-47 wrdata v(out), linearly interpolated at these times.
    const ngspice: Array<[number, number]> = [
      [3e-6, 4.950133], [5e-6, 3.902325], [5.5e-6, 8.002998e-1], [6e-6, 1.066918e-2],
      [12e-6, 4.999500e-4], [30e-6, 4.999500e-4], [55e-6, 1.618062e-1], [62e-6, 2.557140],
      [80e-6, 4.561934], [105e-6, 3.877954], [150e-6, 4.999500e-4], [200e-6, 4.898950],
    ];
    expect(out[0]).toBeCloseTo(4.950495, 6);
    for (const [t, expected] of ngspice) expect(relativeError(at(t), expected)).toBeLessThan(2e-3);
  });

  it('linearises the switch resistance in AC (ngspice-47 loads a negative conductance there)', async () => {
    // Operating point (ngspice-47): v(out) = 1.145895e-01, so r = 1k * v / (1 - v).
    // ngspice-47's pswitch AC_GAIN(out,out) = -1/r gives vr(out) = -1.45795 here; the
    // small-signal model of the operating point, which spice-ts loads, is a positive 1/r
    // plus the control transconductance d(v/r)/d(vc).
    const result = await simulate(`vswitch ac
V1 in 0 DC 1 AC 1
Vc c 0 DC 0.1 AC 0
R1 in out 1k
S1 out 0 c 0 SMOD1
.MODEL SMOD1 VSWITCH RON=1 ROFF=1MEG VON=0.5 VOFF=-0.5
.op
.ac lin 1 1k 1k
.end
`);
    const v = result.dc!.voltage('out');
    expect(relativeError(v, 1.145895e-1)).toBeLessThan(1e-6);
    const r = 1000 * v / (1 - v);
    const gain = r / (1000 + r);
    expect(relativeError(result.ac!.voltage('out')[0].magnitude, gain)).toBeLessThan(1e-6);
  });

  it('runs the pswitch code model directly on A cards, including log=false', async () => {
    // ngspice-47 default mode, .print dc v(out) v(out2) for Vc = -1.5 .. 1.5 step 0.25.
    const result = await simulate(`pswitch a cards
V1 in 0 DC 1
Vc c 0 DC 0
R1 in out 1k
a1 %gd(c 0) %gd(out 0) lin1
R2 in out2 1k
a2 (c 0) (out2 0) lin2
.model lin1 pswitch(cntl_on=0.5 cntl_off=-0.5 r_on=10 r_off=1e4 log=false)
.model lin2 pswitch(cntl_on=-1 cntl_off=1 r_on=100 r_off=1e5 log=false)
.dc Vc -1.5 1.5 0.25
.end
`);
    const ngspice = [
      [9.090909e-01, 9.090909e-02], [9.090909e-01, 9.090909e-02], [9.090909e-01, 9.090909e-02],
      [9.090909e-01, 9.264029e-01], [9.090909e-01, 9.616491e-01], [8.824881e-01, 9.740989e-01],
      [8.334721e-01, 9.804114e-01], [7.148967e-01, 9.842613e-01], [9.900990e-03, 9.868464e-01],
      [9.900990e-03, 9.887683e-01], [9.900990e-03, 9.901093e-01], [9.900990e-03, 9.900990e-01],
      [9.900990e-03, 9.900990e-01],
    ];
    const out = result.dcSweep!.voltage('out');
    const out2 = result.dcSweep!.voltage('out2');
    expect(out).toHaveLength(ngspice.length);
    // Indices 5, 9 and 10 follow a limited sweep step: ngspice-47 prints the iterate
    // before the converging solve (see the VSWITCH DC sweep above), within RELTOL.
    ngspice.forEach(([v1, v2], index) => {
      const tolerance = [5, 9, 10].includes(index) ? 1e-3 : 1e-6;
      expect(relativeError(out[index], v1)).toBeLessThan(tolerance);
      expect(relativeError(out2[index], v2)).toBeLessThan(tolerance);
    });
    // The converged values there: r = 7502.5, r(0.75) = 87512.5 and r = r_off.
    expect(relativeError(out[5], 7502.5 / 8502.5)).toBeLessThan(1e-9);
    expect(relativeError(out2[9], 87512.5 / 88512.5)).toBeLessThan(1e-9);
    expect(relativeError(out2[10], 1e5 / 101000)).toBeLessThan(1e-9);
  });

  it('rejects a VSWITCH model with neither VON/VOFF nor VT/VH, like ngspice-47', () => {
    expect(() => parse('bad\nS1 1 0 2 0 SBAD\n.MODEL SBAD VSWITCH RON=1 ROFF=1e6\n.op')).toThrow(ParseError);
    expect(() => parse('bad\n.subckt s a b c d\nS1 a b c d SBAD\n.MODEL SBAD VSWITCH(RON=1)\n.ends\n.op'))
      .toThrow(ParseError);
  });

  it('keeps the VSWITCH card through toNetlist() and refuses it on an A instance', async () => {
    const circuit = parse('rt\nV1 1 0 1\nR1 1 2 1k\nS1 2 0 1 0 SMOD1\n.MODEL SMOD1 VSWITCH RON=1 ROFF=1MEG VON=0.5 VOFF=-0.5\n.op');
    const reparsed = await simulate(circuit.toNetlist());
    expect(relativeError(reparsed.dc!.voltage('2'), 1 / 1001)).toBeLessThan(1e-9);

    const aCard = parse('a\nV1 1 0 1\nA1 %gd(1 0) %gd(1 0) SMOD1\n.MODEL SMOD1 VSWITCH RON=1 ROFF=1MEG VON=0.5 VOFF=-0.5\n.op');
    expect(() => aCard.compile()).toThrow(InvalidCircuitError);
  });
});
