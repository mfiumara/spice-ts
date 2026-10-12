import { describe, it, expect } from 'vitest';
import { simulate } from '../simulate.js';

// Reference values come from ngspice-47 (`ngspice -b`, `set numdgt=13`) run on
// the identical decks (#642). With NS given, dioload.c gives the sidewall
// current its own law csatsw*(exp(vd/(NS*vt)) - 1), with the reverse law below
// -3*NS*vt and the breakdown law below -BV, and diotemp.c scales JSW with NS.

// ngspice stops Newton once its reltol/vntol test passes, so its printed
// operating points carry a few microvolts of residual.
const NGSPICE_NEWTON_RESIDUAL = 1e-5;
// ngspice ends its breakdown-knee iteration at reltol*IBV (diotemp.c).
const NGSPICE_BREAKDOWN_RESIDUAL = 2e-5;

function expectNear(actual: number, expected: number, tolerance: number): void {
  expect(Math.abs(actual - expected)).toBeLessThan(tolerance);
}

function deck(model: string, options: { source?: number; pj?: number; extra?: string } = {}): string {
  return `diode sidewall emission
    V1 in 0 ${options.source ?? 5}
    R1 in out 1k
    D1 out 0 DJ pj=${options.pj ?? 2}
    .model DJ D ${model}
    ${options.extra ?? ''}
    .op
    .end
  `;
}

async function operatingPoint(model: string, options?: Parameters<typeof deck>[1]) {
  const result = await simulate(deck(model, options));
  return { out: result.dc!.voltage('out'), current: result.dc!.current('V1') };
}

describe('diode NS sidewall emission coefficient like ngspice-47 (#642)', () => {
  it('gives the sidewall current its own NS characteristic (issue deck)', async () => {
    // ngspice-47: v(out) = 8.1127824177062e-01 (spice-ts lumped JSW into IS: 0.674938)
    const { out } = await operatingPoint('IS=1e-16 JSW=1e-14 NS=2');
    expectNear(out, 0.81127824177062, NGSPICE_NEWTON_RESIDUAL);
  });

  it('scales the sidewall saturation current with NS away from TNOM', async () => {
    // ngspice-47 `.options temp=75`: v(out) = 7.5058608157509e-01
    const { out } = await operatingPoint('IS=1e-16 JSW=1e-14 NS=2', { extra: '.options temp=75' });
    expectNear(out, 0.75058608157509, NGSPICE_NEWTON_RESIDUAL);
  });

  it('matches a sidewall-dominated junction at 27 C and -20 C', async () => {
    const model = 'IS=1e-20 JSW=1e-13 NS=1.6';
    // ngspice-47: v(out) = 9.5237651662184e-01
    expectNear((await operatingPoint(model, { pj: 4 })).out, 0.95237651662184, NGSPICE_NEWTON_RESIDUAL);
    // ngspice-47 `.options temp=-20`: v(out) = 9.8789858122575e-01
    expectNear(
      (await operatingPoint(model, { pj: 4, extra: '.options temp=-20' })).out,
      0.98789858122575,
      NGSPICE_NEWTON_RESIDUAL,
    );
  });

  it('uses the sidewall conductance in the AC small-signal model', async () => {
    const result = await simulate(`diode sidewall ac
      V1 in 0 DC 1 AC 1
      R1 in out 1k
      D1 out 0 DJ pj=4
      .model DJ D IS=1e-20 JSW=1e-13 NS=1.6 CJO=10p
      .op
      .ac lin 1 1meg 1meg
      .end
    `);
    // ngspice-47: v(out) = 8.2357498743149e-01
    expectNear(result.dc!.voltage('out'), 0.82357498743149, NGSPICE_NEWTON_RESIDUAL);
    // ngspice-47: vr(out) = 1.8955450508486e-01, vi(out) = -4.227928591816e-03
    const point = result.ac!.voltage('out')[0]!;
    const phase = point.phase * Math.PI / 180;
    const re = point.magnitude * Math.cos(phase);
    const im = point.magnitude * Math.sin(phase);
    expect(Math.abs(re - 0.18955450508486) / 0.18955450508486).toBeLessThan(1e-4);
    expect(Math.abs(im + 0.004227928591816) / 0.004227928591816).toBeLessThan(1e-4);
  });

  it('applies the sidewall reverse law below -3*NS*vt', async () => {
    // ngspice-47: i(v1) = 9.9937109673420e-07. The exp law would give ~1.0000e-6;
    // the reverse law -csatsw*(1 + (3*vts/(vd*e))^3) is 6.3e-10 A smaller.
    // The remaining 1e-12 A is ngspice's CKTgmin*vd junction current, which
    // the spice-ts diode keeps out of its DC current (a separate, NS-independent gap).
    const { current } = await operatingPoint('IS=1e-14 JSW=1e-6 NS=3', { source: -1, pj: 1 });
    expect(Math.abs(current - 9.993710967342e-7) / 9.993710967342e-7).toBeLessThan(2e-6);
  });

  it('puts the separate sidewall into breakdown below -BV', async () => {
    // ngspice-47: v(out) = -5.041423737369e+00. In breakdown the separate
    // sidewall follows the same law as the bottom, so this guards the split
    // rather than discriminating it from the merged characteristic.
    const { out } = await operatingPoint('IS=1e-14 JSW=1e-12 NS=2 BV=5 IBV=1m', { source: -10, pj: 1 });
    expectNear(out, -5.041423737369, NGSPICE_BREAKDOWN_RESIDUAL);
  });

  describe('when IBV is below Isat*BV/vt (diotemp.c xbv = tBV)', () => {
    // ngspice-47 diotemp.c:221-228 raises cbv and puts the breakdown knee at
    // tBV itself; iterating the log law there would give a NaN knee.
    // ngspice's reverse currents include CKTgmin*vd through the junction, as
    // the spice-ts diode does since #643.

    it('solves a reverse-biased NS diode with PJ=0 (review repro 1)', async () => {
      // ngspice-47: v(out) = -9.999999989900e-01, i(v1) = 1.0099998615232e-12
      const { out, current } = await operatingPoint(
        'IS=1e-14 JSW=1e-14 NS=2 BV=5 IBV=1e-12',
        { source: -1, pj: 0 },
      );
      expectNear(out, -0.99999999899, NGSPICE_NEWTON_RESIDUAL);
      const expected = 1.0099998615232e-12;
      expect(Math.abs(current - expected) / expected).toBeLessThan(1e-4);
    });

    it('solves a reverse-biased NS sidewall above the knee (review repro 2)', async () => {
      const model = 'IS=1e-14 JSW=1e-7 NS=2.5 BV=6 IBV=1u';
      // The review used R1=10; this deck's R1=1k changes nothing about the junction law.
      const cases = [
        // ngspice-47: v(out) = -9.999000353451e-01, i(v1) = 9.9964654923901e-08
        { source: -1, out: -0.9999000353451, current: 9.9964654923901e-8 },
        // ngspice-47: v(out) = -3.999899996558e+00, i(v1) = 1.0000344198113e-07
        { source: -4, out: -3.999899996558, current: 1.0000344198113e-7 },
      ];
      for (const reference of cases) {
        const { out, current } = await operatingPoint(model, { source: reference.source, pj: 1 });
        expectNear(out, reference.out, NGSPICE_NEWTON_RESIDUAL);
        const expected = reference.current;
        expect(Math.abs(current - expected) / expected).toBeLessThan(1e-5);
      }
    });

    it('puts the breakdown knee at BV itself', async () => {
      // ngspice-47: v(out) = -5.692887890375e+00, i(v1) = 4.3071121096245e-03
      const { out } = await operatingPoint(
        'IS=1e-14 JSW=1e-14 NS=2 BV=5 IBV=1e-12',
        { source: -10, pj: 0 },
      );
      expectNear(out, -5.692887890375, NGSPICE_NEWTON_RESIDUAL);
      // Without NS/JSW the bottom junction takes the same knee (ngspice-47
      // gives the identical operating point); before, its NaN knee kept it out
      // of breakdown altogether.
      const plain = await operatingPoint('IS=1e-14 BV=5 IBV=1e-12', { source: -10, pj: 0 });
      expectNear(plain.out, -5.692887890375, NGSPICE_NEWTON_RESIDUAL);
    });
  });

  it('keeps NS=1 and NS-absent decks bit-identical', async () => {
    // ngspice-47 gives v(out) = 6.7494123725255e-01 for both decks.
    const absent = await operatingPoint('IS=1e-16 JSW=1e-14');
    const unity = await operatingPoint('IS=1e-16 JSW=1e-14 NS=1');
    expectNear(absent.out, 0.67494123725255, NGSPICE_NEWTON_RESIDUAL);
    expect(unity.out).toBe(absent.out);
    expect(unity.current).toBe(absent.current);
    // NS equal to N is the merged characteristic too, at TNOM and away from it.
    for (const extra of ['', '.options temp=75']) {
      const merged = await operatingPoint('IS=1e-16 JSW=1e-14 N=1.3 NS=1.3', { extra });
      const separate = await operatingPoint('IS=1e-16 JSW=1e-14 N=1.3 NS=1.30000001', { extra });
      expectNear(merged.out, separate.out, 1e-7);
    }
  });
});
