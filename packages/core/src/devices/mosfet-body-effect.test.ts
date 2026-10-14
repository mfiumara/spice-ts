import { describe, expect, it } from 'vitest';
import { InvalidCircuitError, UnsupportedModelLevelError } from '../errors.js';
import { BSIM4 } from './bsim4/device.js';
import { parse } from '../parser/index.js';
import { simulate } from '../simulate.js';

// Issue #530: the Level-1 MOSFET must follow ngspice-47 mos1load.c/mos1temp.c
// for the body effect (GAMMA/PHI), the signed VTO (depletion devices) and the
// lateral diffusion LD (Leff = L - 2*LD). Reference values come from
// `ngspice -b` (ngspice-47) on the same decks, printed to 6 significant digits.

function relativeError(actual: number, expected: number): number {
  return Math.abs(actual - expected) / Math.abs(expected);
}

const MODELS = `
.model NB NMOS (LEVEL=1 VTO=0.7 KP=100u GAMMA=0.6 PHI=0.65 LAMBDA=0.02)
.model NDEP NMOS (LEVEL=1 VTO=-1 KP=50u)
.model NLD NMOS (LEVEL=1 VTO=0.7 KP=100u LD=0.3u LAMBDA=0.02)
.model PB PMOS (LEVEL=1 VTO=-0.8 KP=40u GAMMA=0.5 PHI=0.7 LAMBDA=0.02)
.model PDEP PMOS (LEVEL=1 VTO=0.6 KP=40u)
`;

async function operatingCurrent(body: string, source: string): Promise<number> {
  const result = await simulate(`issue 530\n${body}\n${MODELS}\n.op\n.end\n`);
  return result.dc!.current(source);
}

describe('MOS level-1 body effect, signed VTO and LD match ngspice-47 (issue #530)', () => {
  it('raises the threshold with reverse body bias (GAMMA/PHI, saturation)', async () => {
    const current = await operatingCurrent(
      'VD d 0 DC 2\nVG g 0 DC 1.5\nVB b 0 DC -2\nM1 d g 0 b NB W=10u L=2u', 'VD',
    );
    expect(relativeError(current, -2.45057e-5)).toBeLessThan(1e-5);
  });

  it('applies the body effect in the linear region', async () => {
    const current = await operatingCurrent(
      'VD d 0 DC 0.3\nVG g 0 DC 1.5\nVB b 0 DC -2\nM1 d g 0 b NB W=10u L=2u', 'VD',
    );
    expect(relativeError(current, -2.36922e-5)).toBeLessThan(1e-5);
  });

  it('lowers the threshold with forward body bias (vbs > 0 branch of mos1load.c)', async () => {
    const current = await operatingCurrent(
      'VD d 0 DC 2\nVG g 0 DC 1.5\nVB b 0 DC 0.3\nM1 d g 0 b NB W=10u L=2u', 'VD',
    );
    expect(relativeError(current, -2.16079e-4)).toBeLessThan(1e-5);
  });

  it('uses vbd for the body effect when drain and source swap', async () => {
    const current = await operatingCurrent(
      'VS s 0 DC 1\nVG g 0 DC 1.5\nVB b 0 DC -2\nM1 0 g s b NB W=10u L=2u', 'VS',
    );
    expect(relativeError(current, -2.40345e-5)).toBeLessThan(1e-5);
  });

  it('conducts at vgs = 0 for an NMOS depletion device (VTO < 0)', async () => {
    const current = await operatingCurrent(
      'VD d 0 DC 2\nVG g 0 DC 0\nM1 d g 0 0 NDEP W=10u L=2u', 'VD',
    );
    expect(relativeError(current, -1.25e-4)).toBeLessThan(1e-5);
  });

  it('conducts at vgs = 0 for a PMOS depletion device (VTO > 0)', async () => {
    const current = await operatingCurrent(
      'VD d 0 DC -2\nVG g 0 DC 0\nM1 d g 0 0 PDEP W=10u L=2u', 'VD',
    );
    expect(relativeError(current, 3.6e-5)).toBeLessThan(1e-5);
  });

  it('applies the PMOS body effect with the bulk above the source', async () => {
    const current = await operatingCurrent(
      'VD d 0 DC -2\nVG g 0 DC -1.5\nVB b 0 DC 1\nM1 d g 0 b PB W=10u L=2u', 'VD',
    );
    expect(relativeError(current, 2.262396e-5)).toBeLessThan(1e-5);
  });

  it('shortens the channel by 2*LD', async () => {
    const current = await operatingCurrent(
      'VD d 0 DC 3\nVG g 0 DC 1.5\nM1 d g 0 0 NLD W=10u L=2u', 'VD',
    );
    expect(relativeError(current, -2.42286e-4)).toBeLessThan(1e-5);
  });

  it('derives GAMMA from TOX/NSUB and linearises gmbs for AC (source follower)', async () => {
    const deck = `source follower
VDD vdd 0 DC 5
VIN in 0 DC 3 AC 1
M1 vdd in out 0 NSUB W=20u L=2u
RS out 0 20k
.model NSUB NMOS (LEVEL=1 TOX=50n NSUB=5e15 UO=600 LAMBDA=0.01)
`;
    const op = await simulate(`${deck}.op\n.end\n`);
    expect(relativeError(op.dc!.voltage('out'), 1.693774)).toBeLessThan(1e-5);
    expect(relativeError(op.dc!.current('VDD'), -8.46887e-5)).toBeLessThan(1e-5);
    const ac = await simulate(`${deck}.ac lin 1 1k 1k\n.end\n`);
    expect(relativeError(ac.ac!.voltage('out')[0].magnitude, 0.7241142)).toBeLessThan(1e-5);
  });

  it('uses L - 2*LD for drain current and flicker noise (mos1noi.c)', async () => {
    const result = await simulate(`mos noise LD
VDD vdd 0 DC 5
Vgate gate 0 DC 2 AC 1
Rload vdd out 2k
M1 out gate 0 0 NMOD W=10u L=3u
.model NMOD NMOS (LEVEL=1 VTO=0.7 KP=200u LAMBDA=0.02 KF=1e-25 AF=1 LD=0.5u)
.noise v(out) Vgate dec 1 10 100
.end
`);
    // ngspice-47 (numdgt=10) at 10 Hz: onoise_spectrum 3.2201232483e-06, inoise_spectrum 1.2033155191e-06.
    expect(relativeError(result.noise!.outputNoiseDensity[0], 3.2201232483e-6)).toBeLessThan(1e-6);
    expect(relativeError(result.noise!.inputNoiseDensity[0], 1.2033155191e-6)).toBeLessThan(1e-6);
  });
});

describe('unimplemented MOSFET levels are rejected (issue #530)', () => {
  // LEVEL=2 (mos2, #565), LEVEL=3/9 (mos3/mos9, #715), LEVEL=4 (BSIM1) and LEVEL=5 (BSIM2, #657) are implemented.
  it.each([7])('rejects LEVEL=%i with a typed error', level => {
    const deck = `level ${level}
VD d 0 DC 2
VG g 0 DC 2
M1 d g 0 0 NX W=10u L=2u
.model NX NMOS (LEVEL=${level} VTO=0.7 KP=100u)
.op
.end
`;
    let caught: unknown;
    try {
      parse(deck).compile();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(UnsupportedModelLevelError);
    expect(caught).toBeInstanceOf(InvalidCircuitError);
    expect(caught).toMatchObject({
      code: 'UNSUPPORTED_MODEL_LEVEL',
      deviceName: 'M1',
      modelName: 'NX',
      level,
      supportedLevels: [1, 2, 3, 4, 5, 6, 8, 9, 14, 49, 54, 260],
    });
  });

  it.each([14, 54])('registers static BSIM4 LEVEL=%i', async level => {
    const deck = `level ${level}
VD d 0 DC 2
VG g 0 DC 2
M1 d g 0 0 NX W=10u L=2u
.model NX NMOS (LEVEL=${level})
.op
.end
`;
    expect(parse(deck).compile().devices.find(device => device.name === 'M1')).toBeInstanceOf(BSIM4);
    expect((await simulate(deck)).dc!.current('VD')).toBeLessThan(0);
  });

  it('still accepts LEVEL=1 explicitly and by default', async () => {
    for (const card of ['LEVEL=1 VTO=0.7 KP=100u', 'VTO=0.7 KP=100u']) {
      const result = await simulate(`ok
VD d 0 DC 2
VG g 0 DC 2
M1 d g 0 0 NX W=10u L=2u
.model NX NMOS (${card})
.op
.end
`);
      // KP/2 * W/L * (VG - VTO)^2 = 50u * 5 * 1.69
      expect(relativeError(result.dc!.current('VD'), -4.225e-4)).toBeLessThan(1e-6);
    }
  });
});
