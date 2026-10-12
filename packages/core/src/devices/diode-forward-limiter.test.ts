import { describe, it, expect } from 'vitest';
import { simulate } from '../simulate.js';

// Issue #430: the diode junction limiter used to compress the junction voltage
// above vcrit with an absolute log law, and the stamp linearised around that
// compressed voltage. The converged operating point then missed the diode law
// once the junction current passed about N*VT/sqrt(2). ngspice-47 limits each
// Newton iterate relative to the previous one (DEVpnjlim), so limiting shapes
// the iterates but never the converged solution.
//
// Each case lists two ngspice-47 results (`ngspice -b`, `set numdgt=12`) on the
// same deck: with default options, and with
// `.options reltol=1e-7 abstol=1e-15 vntol=1e-9`, which converges ngspice onto
// the exact diode law. With default tolerances both simulators stop Newton a
// few microvolts early, and ngspice stops 0.24 mV early in the 1.5 A breakdown
// deck, so the tight result is the reference for the converged law.
const NEWTON_STOP_RESIDUAL = 1e-5;
const K_OVER_Q = 1.38064852e-23 / 1.6021766208e-19;
const VT = K_OVER_Q * 300.15;
const GMIN = 1e-12;

interface DiodeLaw {
  IS: number;
  N?: number;
  IKF?: number;
}

function diodeCurrent(voltage: number, { IS, N = 1, IKF }: DiodeLaw): number {
  const current = IS * Math.expm1(voltage / (N * VT));
  const kneeCurrent = IKF ? current / (1 + Math.sqrt(current / IKF)) : current;
  return kneeCurrent + GMIN * voltage;
}

/** KCL at `out`, expressed as the junction-voltage error it implies. */
function expectOnDiodeLaw(out: number, source: number, resistance: number, law: DiodeLaw): void {
  const resistorCurrent = (source - out) / resistance;
  const voltageError = (law.N ?? 1) * VT * Math.log(resistorCurrent / diodeCurrent(out, law));
  expect(Math.abs(voltageError)).toBeLessThan(NEWTON_STOP_RESIDUAL);
}

async function operatingPointOut(
  resistance: number,
  model: string,
  source = 5,
): Promise<number> {
  const result = await simulate(`diode limiter
    V1 in 0 DC ${source}
    R1 in out ${resistance}
    D1 out 0 DM
    .model DM D ${model}
    .op
    .end
  `);
  return result.dc!.voltage('out');
}

describe('diode junction limiter keeps the exact diode law (#430)', () => {
  it.each([
    // R, ngspice-47 default, ngspice-47 tight
    [100, 0.7520860618017, 0.7520858103243],
    [10, 0.8112790406060, 0.8112790292309],
    [1, 0.8704672880177, 0.8704671145157],
  ])('matches ngspice-47 at high forward current with R=%s', async (resistance, ngspice, tight) => {
    const out = await operatingPointOut(resistance, 'IS=1e-14');
    expect(Math.abs(out - tight)).toBeLessThan(NEWTON_STOP_RESIDUAL);
    expect(Math.abs(out - ngspice)).toBeLessThan(NEWTON_STOP_RESIDUAL);
    expectOnDiodeLaw(out, 5, resistance, { IS: 1e-14 });
  });

  it('matches ngspice-47 above the IKF knee without RS', async () => {
    // ngspice-47: default 8.490625923005e-01, tight 8.490625372760e-01
    const out = await operatingPointOut(100, 'IS=1e-14 IKF=1m');
    expect(Math.abs(out - 0.8490625372760)).toBeLessThan(NEWTON_STOP_RESIDUAL);
    expect(Math.abs(out - 0.8490625923005)).toBeLessThan(NEWTON_STOP_RESIDUAL);
    expectOnDiodeLaw(out, 5, 100, { IS: 1e-14, IKF: 1e-3 });
  });

  it('matches ngspice-47 for the N=1.2 IKF deck from the PR #431 review', async () => {
    // ngspice-47: default 1.016380189196e+00, tight 1.016379577629e+00
    const out = await operatingPointOut(100, 'IS=1e-14 N=1.2 IKF=1m');
    expect(Math.abs(out - 1.016379577629)).toBeLessThan(NEWTON_STOP_RESIDUAL);
    expect(Math.abs(out - 1.016380189196)).toBeLessThan(NEWTON_STOP_RESIDUAL);
    expectOnDiodeLaw(out, 5, 100, { IS: 1e-14, N: 1.2, IKF: 1e-3 });
  });

  it('keeps the expanded series-resistance junction on the diode law', async () => {
    // ngspice-47: default 8.154379093524e-01, tight 8.154378979929e-01
    const out = await operatingPointOut(10, 'IS=1e-14 RS=0.01');
    expect(Math.abs(out - 0.8154378979929)).toBeLessThan(NEWTON_STOP_RESIDUAL);
    expect(Math.abs(out - 0.8154379093524)).toBeLessThan(NEWTON_STOP_RESIDUAL);
  });

  it('stops on the breakdown law at 1.5 A of reverse current like ngspice-47', async () => {
    // ngspice-47: tight -5.18882816996e+00. With default options ngspice stops
    // at -5.18906514978e+00, 0.24 mV (a 0.9% KCL residual) short of its own law.
    // spice-ts runs the same CKTop order (plain Newton first, #622) and takes
    // the same Newton iterates here, so it stops on the same default-option
    // point.
    const out = await operatingPointOut(10, 'IS=1e-14 BV=5 IBV=1m', -20);
    expect(Math.abs(out - -5.18906514978)).toBeLessThan(1e-9);
    expect(Math.abs(out - -5.18882816996)).toBeLessThan(3e-4);
  });

  it('linearises AC at the converged high-current junction', async () => {
    // ngspice-47 `.ac lin 1 1k 1k`: vr(out) = 6.137000810025e-03 (tight),
    // 6.136998127594e-03 (default options), vi(out) = 0.
    const result = await simulate(`diode limiter ac
      V1 in 0 DC 5 AC 1
      R1 in out 10
      D1 out 0 DM
      .model DM D IS=1e-14
      .op
      .ac lin 1 1k 1k
      .end
    `);
    const magnitude = result.ac!.voltage('out')[0]!.magnitude;
    // |v(out)| ~ 1/(R*gd), and gd follows the operating point as exp(v/VT):
    // a junction within NEWTON_STOP_RESIDUAL of ngspice's moves the gain by
    // up to NEWTON_STOP_RESIDUAL/VT. spice-ts stops ~6 uV from ngspice on this
    // deck because the diode starts Newton at 0 V instead of ngspice's
    // MODEINITJCT vcrit.
    const tolerance = NEWTON_STOP_RESIDUAL / VT;
    expect(Math.abs(magnitude - 6.136998127594e-3) / 6.136998127594e-3).toBeLessThan(tolerance);
    expect(Math.abs(magnitude - 6.137000810025e-3) / 6.137000810025e-3).toBeLessThan(tolerance);
  });

  it('follows the exact diode law across a high-current DC sweep', async () => {
    const result = await simulate(`diode limiter sweep
      V1 in 0 DC 0
      R1 in out 10
      D1 out 0 DM
      .model DM D IS=1e-14
      .dc V1 0 5 1
      .end
    `);
    const sweep = result.dcSweep!;
    const sources = sweep.sweepValues;
    const outs = sweep.voltage('out');
    expect(sources).toHaveLength(6);
    for (let index = 1; index < sources.length; index++) {
      expectOnDiodeLaw(outs[index]!, sources[index]!, 10, { IS: 1e-14 });
    }
  });
});
