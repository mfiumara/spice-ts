import { describe, it, expect } from 'vitest';
import { simulate } from '../simulate.js';

// Issue #582: BSIM3 (LEVEL=49) had no drain/source interchange, so a device
// with Vds < 0 (NMOS convention) conducted 0 A. ngspice-47 BSIM3 swaps drain
// and source (BSIM3mode = -1) and conducts symmetrically.
const NMOD = '.model NMOD NMOS (LEVEL=49 VTH0=0.5 K1=0.6 U0=400 TOX=4n VSAT=1.5e5 PCLM=1.3 '
  + 'PDIBLC1=0.39 PDIBLC2=0.0086 CGSO=2.5e-10 CGDO=2.5e-10 CJ=1e-3 CJSW=5e-10 MJ=0.5 PB=1)';
const PMOD = '.model PMOD PMOS (LEVEL=49 VTH0=-0.5 K1=0.6 U0=150 TOX=4n VSAT=1.2e5 PCLM=1.3 '
  + 'PDIBLC1=0.39 PDIBLC2=0.0086 CGSO=2.5e-10 CGDO=2.5e-10 CJ=1e-3 CJSW=5e-10 MJ=0.5 PB=1)';

describe('BSIM3v3 reverse mode (drain/source interchange, #582)', () => {
  it('a symmetric NMOS conducts the same current with drain and source swapped', async () => {
    const forward = await simulate(`
      ${NMOD}
      VD d 0 DC 0.9
      VG g 0 DC 1.8
      M1 d g 0 0 NMOD W=0.5u L=0.18u
      .op
      .end
    `);
    // Same bias with the drain/source terminals of the instance exchanged.
    const reverse = await simulate(`
      ${NMOD}
      VD d 0 DC 0.9
      VG g 0 DC 1.8
      M1 0 g d 0 NMOD W=0.5u L=0.18u
      .op
      .end
    `);
    const iForward = forward.dc!.current('VD');
    const iReverse = reverse.dc!.current('VD');
    expect(Math.abs(iForward)).toBeGreaterThan(1e-5);
    expect(iReverse).toBeCloseTo(iForward, 12);
  });

  it('a symmetric PMOS conducts the same current with drain and source swapped', async () => {
    const forward = await simulate(`
      ${PMOD}
      VS s 0 DC 1.8
      VD d 0 DC 0.9
      M1 d 0 s s PMOD W=1u L=0.18u
      .op
      .end
    `);
    const reverse = await simulate(`
      ${PMOD}
      VS s 0 DC 1.8
      VD d 0 DC 0.9
      M1 s 0 d s PMOD W=1u L=0.18u
      .op
      .end
    `);
    const iForward = forward.dc!.current('VD');
    const iReverse = reverse.dc!.current('VD');
    expect(Math.abs(iForward)).toBeGreaterThan(1e-6);
    // The bulk stays tied to the high terminal, so only the channel swaps.
    expect(iReverse).toBeCloseTo(iForward, 12);
  });

  it('a PMOS card with negative VTH0 is an enhancement device (off at Vgs = 0)', async () => {
    // ngspice-47 BSIM3 uses type*VTH0: i(VD) = 1.81e-12 A at Vgs = 0, Vds = -1.8 V.
    const result = await simulate(`
      ${PMOD}
      VS s 0 DC 1.8
      VG g 0 DC 1.8
      VD d 0 DC 0
      M1 d g s s PMOD W=1u L=0.18u
      .op
      .end
    `);
    expect(Math.abs(result.dc!.current('VD'))).toBeLessThan(1e-9);
  });

  it('6T SRAM write-0 flips the cell like ngspice-47', async () => {
    const result = await simulate([
      'sram',
      NMOD,
      PMOD,
      'VDD vdd 0 DC 1.8',
      'VWL wl 0 PULSE(0 1.8 1n 50p 50p 3n 10n)',
      'VBL bl 0 PULSE(1.8 0 0.5n 50p 50p 5n 10n)',
      'VBLB blb 0 DC 1.8',
      'MP1 q qb vdd vdd PMOD W=1u L=0.18u',
      'MN1 q qb 0 0 NMOD W=0.5u L=0.18u',
      'MP2 qb q vdd vdd PMOD W=1u L=0.18u',
      'MN2 qb q 0 0 NMOD W=0.5u L=0.18u',
      'MNA1 bl wl q 0 NMOD W=0.5u L=0.18u',
      'MNA2 blb wl qb 0 NMOD W=0.5u L=0.18u',
      '.ic V(q)=1.8 V(qb)=0',
      '.tran 10p 10n',
      '.end',
    ].join('\n'));
    const tran = result.transient!;
    const q = tran.voltage('q');
    const qb = tran.voltage('qb');
    // ngspice-47: q 1.8 V / qb 0 V before the word line opens ...
    const before = tran.time.findIndex((t) => t >= 0.9e-9);
    expect(q[before]).toBeGreaterThan(1.75);
    expect(qb[before]).toBeLessThan(0.05);
    // ... the cell is written by ~1.25 ns and holds q ~ 0 V, qb ~ 1.8 V at 10 ns.
    const end = tran.time.length - 1;
    expect(q[end]).toBeLessThan(0.05);
    expect(qb[end]).toBeGreaterThan(1.75);
  });
});
