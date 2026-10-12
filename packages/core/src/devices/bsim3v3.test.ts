import { describe, it, expect } from 'vitest';
import { simulate } from '../simulate.js';
import { parse } from '../parser/index.js';
import { BSIM3v3 } from './bsim3v3.js';

describe('BSIM3v3 device', () => {
  it('NMOS in saturation produces positive drain current', async () => {
    const result = await simulate(`
      VDD 1 0 DC 1.8
      VGS 2 0 DC 1.0
      .model NMOD NMOS (LEVEL=49 VTH0=0.5 U0=400 TOX=4n)
      RD 1 3 100
      M1 3 2 0 0 NMOD W=10u L=0.18u
      .op
      .end
    `);
    const vout = result.dc!.voltage('3');
    expect(vout).toBeLessThan(1.8);
    expect(vout).toBeGreaterThan(0);
  });

  it('NMOS in cutoff: output near VDD', async () => {
    const result = await simulate(`
      VDD 1 0 DC 1.8
      VGS 2 0 DC 0.0
      .model NMOD NMOS (LEVEL=49 VTH0=0.5 U0=400 TOX=4n)
      RD 1 3 1k
      M1 3 2 0 0 NMOD W=10u L=0.18u
      .op
      .end
    `);
    const vout = result.dc!.voltage('3');
    expect(vout).toBeCloseTo(1.8, 1);
  });

  it('PMOS produces current with negative Vgs', async () => {
    const result = await simulate(`
      VDD 1 0 DC 1.8
      VIN 2 0 DC 0
      .model PMOD PMOS (LEVEL=49 VTH0=-0.5 U0=150 TOX=4n)
      RD 3 0 100
      M1 3 2 1 1 PMOD W=20u L=0.18u
      .op
      .end
    `);
    const vout = result.dc!.voltage('3');
    expect(vout).toBeGreaterThan(0.1);
  });

  it('BSIM3 CMOS inverter switches correctly', async () => {
    const result = await simulate(`
      VDD vdd 0 DC 1.8
      VIN in 0 DC 1.8
      .model NMOD NMOS (LEVEL=49 VTH0=0.5 U0=400 TOX=4n)
      .model PMOD PMOS (LEVEL=49 VTH0=-0.5 U0=150 TOX=4n)
      MP out in vdd vdd PMOD W=20u L=0.18u
      MN out in 0 0 NMOD W=10u L=0.18u
      .op
      .end
    `);
    const vout = result.dc!.voltage('out');
    expect(vout).toBeLessThan(0.3);
  });

  it('body effect: bulk-source voltage shifts threshold', async () => {
    const r0 = await simulate(`
      VDD 1 0 DC 1.8
      VGS 2 0 DC 0.7
      .model NMOD NMOS (LEVEL=49 VTH0=0.5 K1=0.6 U0=400 TOX=4n)
      RD 1 3 1k
      M1 3 2 0 0 NMOD W=10u L=0.18u
      .op
      .end
    `);
    const r1 = await simulate(`
      VDD 1 0 DC 1.8
      VGS 2 0 DC 0.7
      VBS 4 0 DC -1
      .model NMOD NMOS (LEVEL=49 VTH0=0.5 K1=0.6 U0=400 TOX=4n)
      RD 1 3 1k
      M1 3 2 0 4 NMOD W=10u L=0.18u
      .op
      .end
    `);
    const v0 = r0.dc!.voltage('3');
    const v1 = r1.dc!.voltage('3');
    expect(v1).toBeGreaterThan(v0);
  });
});

describe('BSIM3v3 instance handling (#589)', () => {
  const card = '.model NMOD NMOS (LEVEL=49 VTH0=0.5 K1=0.6 U0=400 TOX=4n)';
  const device = (instance: string): BSIM3v3 => {
    const found = parse(`m\n${card}\nVD d 0 1\nVG g 0 1\nM1 d g 0 0 NMOD ${instance}\n.op\n.end`)
      .compile().devices.find((d): d is BSIM3v3 => d instanceof BSIM3v3);
    if (!found) throw new Error('no BSIM3 device');
    return found;
  };

  it('rejects a non-positive effective channel length with the instance name (b3temp.c E_BADPARM)', () => {
    expect(() => device('W=1u L=0.18u').size).not.toThrow();
    expect(() => parse(`m\n.model NMOD NMOS (LEVEL=49 LINT=0.2u)\nM1 d g 0 0 NMOD W=1u L=0.18u\n.op\n.end`).compile())
      .toThrow(/M1.*Effective channel length/);
  });

  it('scales the drain current by the parallel multiplier M', async () => {
    const run = async (instance: string) => (await simulate(
      `m\n${card}\nVD d 0 1.2\nVG g 0 1.2\nM1 d g 0 0 NMOD ${instance}\n.op\n.end`,
    )).dc!.current('VD');
    const single = await run('W=1u L=0.18u');
    expect(await run('W=1u L=0.18u M=2')).toBeCloseTo(2 * single, 15);
  });

  it('limits Newton steps like b3ld.c (DEVfetlim on Vgs, DEVlimvds on Vds)', () => {
    const m1 = device('W=1u L=0.18u');
    const [nD, nG] = m1.nodes;
    const solution = (vd: number, vg: number) => {
      const s = new Float64Array(Math.max(nD, nG) + 1);
      s[nD] = vd;
      s[nG] = vg;
      return s;
    };
    // Vds 1 V -> 10 V: DEVlimvds allows at most 4 V from below 3.5 V.
    expect(m1.limitNewtonStep(solution(1, 0), solution(10, 0))).toBeCloseTo(3 / 9, 12);
    // Vds 5 V -> 20 V: at most 3 * 5 + 2 = 17 V.
    expect(m1.limitNewtonStep(solution(5, 0), solution(20, 0))).toBeCloseTo(12 / 15, 12);
    // Reverse mode: the same limits apply to -Vds.
    expect(m1.limitNewtonStep(solution(-1, 0), solution(-10, 0))).toBeLessThan(1);
    // A large gate step from off is held near threshold by DEVfetlim.
    expect(m1.limitNewtonStep(solution(1, 0), solution(1, 10))).toBeLessThan(0.2);
    expect(m1.limitNewtonStep(solution(1, 1), solution(1, 1))).toBe(1);
  });
});
