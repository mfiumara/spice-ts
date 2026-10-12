import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';

// Issue #621: ngspice-47 sizes transient steps with CKTtrunc alone, i.e. each
// device's DEVtrunc runs CKTterr on its own charges (CAPtrunc on the capacitor
// charge, INDtrunc on the inductor flux, DIOtrunc on the junction charge,
// LTRAtrunc, MOS1trunc, ...). It has no node-voltage truncation check.
// References: ngspice-47 (Homebrew) on the identical decks, `meas tran ...
// find v(...) at=...` and `length(time)`.

/** Linear interpolation of `values` at `at` on the accepted grid `time`. */
function sample(time: readonly number[], values: readonly number[], at: number): number {
  let index = time.findIndex(t => t >= at);
  if (index <= 0) index = 1;
  const t0 = time[index - 1]!;
  const t1 = time[index]!;
  return values[index - 1]! + (values[index]! - values[index - 1]!) * (at - t0) / (t1 - t0);
}

describe('ngspice-47 CKTtrunc step control without node-voltage LTE (#621)', () => {
  it('completes the #646 CJSW diode deck and matches ngspice-47 v(out)', async () => {
    // Before #621 the node-voltage LTE rejected the 5.9 -> 6.2 ns step across
    // the sidewall charge step at FCS*VJSW (#450), which ngspice's charge-only
    // CKTterr accepts; the shorter retries have no KCL solution and the run
    // ended in TimestepTooSmallError at 5.99 ns.
    const result = await simulate(`t
V1 in 0 PULSE(-2 2 1n 1n 1n 20n 50n)
R1 in out 1k
D1 out 0 DJ pj=5
.model DJ D IS=1e-18 JSW=2e-14 CJSW=1p
.tran 0.5n 100n
.end
`);
    const transient = result.transient!;
    const time = transient.time;
    const out = transient.voltage('out');
    expect(time.at(-1)).toBeCloseTo(100e-9, 15);
    // ngspice-47: v22 = 0.604187, v60 = 0.604186, v80 = -1.52597.
    expect(Math.abs(sample(time, out, 22e-9) - 0.604187)).toBeLessThan(5e-6);
    expect(Math.abs(sample(time, out, 60e-9) - 0.604186)).toBeLessThan(5e-6);
    expect(Math.abs(sample(time, out, 80e-9) - -1.52597)).toBeLessThan(5e-3);
  });

  it('steps over the ltra1_1_line reflection on the ngspice-47 step grid', async () => {
    // corpus-f examples/TransmissionLines/ltra1_1_line.sp with its .control
    // `TRAN 0.2N 47N 0 0.1N` as a .tran card. ngspice-47 takes 513 points and
    // crosses the first reflection back at the driver (18.156 ns) on a 0.1 ns
    // step: v(2) = 2.5024 V. With the node-voltage LTE spice-ts refined it to
    // ~20 ps (698 points) and resolved v(2) = 2.43 V there.
    const result = await simulate(`MOSdriver -- lossy line LTRA model -- C load
m5     2     168    0     0  mn0p9  w = 18.0u l=0.9u
m6     2     168    1     1  mp1p0  w = 36.0u l=1.0u
CN2  2   0  0.025398e-12
CN3  3   0  0.007398e-12
o1  2 0 3 0 lline
vdd    1    0   dc 5.0
VS 168  0  PULSE (0 5 15.9NS 0.2NS 0.2NS 15.8NS 32NS )
.TRAN 0.2N 47N 0 0.1N
.MODEL mn0p9 NMOS VTO=0.8 KP=48U GAMMA=0.30 PHI=0.55
+LAMBDA=0.00 CGSO=0 CGDO=0 CJ=0 CJSW=0 TOX=18N LD=0.0U
.MODEL mp1p0 PMOS VTO=-0.8 KP=21U GAMMA=0.45 PHI=0.61
+LAMBDA=0.00 CGSO=0 CGDO=0 CJ=0 CJSW=0 TOX=18N LD=0.0U
.model lline ltra rel=1 r=12.45 g=0 l=8.972e-9 c=0.468e-12
+len=16 steplimit compactrel=1.0e-3 compactabs=1.0e-14
.end
`);
    const transient = result.transient!;
    const time = transient.time;
    expect(time.length).toBeGreaterThanOrEqual(Math.floor(0.95 * 513));
    expect(time.length).toBeLessThanOrEqual(Math.ceil(1.05 * 513));
    expect(Math.abs(sample(time, transient.voltage('2'), 18.156e-9) - 2.5024)).toBeLessThan(0.02);
  });
});
