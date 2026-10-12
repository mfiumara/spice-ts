import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TimestepTooSmallError } from './errors.js';
import { simulate } from './simulate.js';

const fixtureBytes = readFileSync(
  new URL('../../../benchmarks/corpus/corpus-e/fixtures/tests/d_bjt-schmitt-nobypass.ckt', import.meta.url),
);
const fixture = fixtureBytes.toString('utf8');
const fixtureSha256 = createHash('sha256').update(fixtureBytes).digest('hex');

/**
 * The fixture's qstd model with every charge-storage parameter zeroed. Without
 * stored charge the regenerative transition is a discontinuous jump that only
 * the implicit-breakpoint recovery path (#139/#147) can step across, so this
 * derived deck keeps that path covered now that the byte-identical fixture
 * stores charge (#385) and switches smoothly.
 */
function chargeFreeVariant(netlist: string): string {
  const chargeParameters = ['tf=0.12ns', 'tr=5ns', 'cje=0.4pf', 'cjc=0.5pf', 'ccs=1pf'];
  let derived = netlist;
  for (const parameter of chargeParameters) {
    expect(derived).toContain(parameter);
    derived = derived.replace(parameter, `${parameter.split('=')[0]}=0`);
  }
  return derived;
}

/** Times at which a waveform crosses `level`, linearly interpolated. */
function crossings(time: number[], values: number[], level: number): number[] {
  const result: number[] = [];
  for (let index = 1; index < values.length; index++) {
    const before = values[index - 1]! - level;
    const after = values[index]! - level;
    if ((before < 0) !== (after < 0)) {
      const t0 = time[index - 1]!;
      result.push(t0 + (time[index]! - t0) * before / (before - after));
    }
  }
  return result;
}

describe('corpus-E BJT Schmitt transient convergence (#139)', () => {
  it('completes the byte-identical public fixture deterministically with bounded waveforms', { timeout: 30_000 }, async () => {
    expect(fixtureSha256).toBe('ec6efed82593b525b1661173b3a11dbec4880449968389ff86424051d42274b5');

    const first = await simulate(fixture);
    const second = await simulate(fixture);
    const transient = first.transient!;

    expect(transient.time.at(-1)).toBeCloseTo(1e-6, 12);
    expect(second.transient!.time).toEqual(transient.time);
    expect(second.convergence).toEqual(first.convergence);

    for (const node of ['1', '3', '5', '6', '7']) {
      const values = transient.voltage(node);
      expect(second.transient!.voltage(node)).toEqual(values);
      expect(values.every(Number.isFinite)).toBe(true);
      expect(Math.min(...values)).toBeGreaterThan(-6);
      expect(Math.max(...values)).toBeLessThan(1);
    }

    const v6 = transient.voltage('6');
    const edgeStart = v6.findIndex((value, index) => index > 0 && v6[index - 1]! < -0.9 && value >= -0.9);
    const edgeEnd = v6.findIndex((value, index) => index > edgeStart && value >= -0.1);
    expect(edgeStart).toBeGreaterThan(0);
    expect(edgeEnd).toBeGreaterThan(edgeStart);
    const edgeGaps = transient.time
      .slice(edgeStart, edgeEnd + 1)
      .map((time, index) => time - transient.time[edgeStart + index - 1]!);
    expect(Math.max(...edgeGaps)).toBeLessThanOrEqual(5e-9);

    const telemetry = first.convergence!.transient;
    expect(telemetry.acceptedSteps).toBe(transient.time.length - 1);
    expect(telemetry.rejectedSteps).toBe(telemetry.nrRetries + telemetry.lteRetries);
    expect(telemetry.acceptedSteps).toBeLessThan(4_000);
    expect(telemetry.rejectedSteps).toBeLessThan(1_500);
    expect(telemetry.minimumAcceptedTimestep).toBeGreaterThan(0);
    expect(telemetry.failure).toBeNull();
  });

  it('switches when ngspice-47 does once the qstd charge storage is stamped (#385)', { timeout: 30_000 }, async () => {
    // ngspice-47 rejects this fixture's `off=1` card. Its reference uses the
    // same deck without `off` and with `.tran 20ns 1000ns 0 0.2ns` (fine TMAX
    // so the edge timing is resolved): v(6) crosses -0.5 V rising at 304.038 ns
    // and falling at 784.162 ns (5017 points). spice-ts runs that identical
    // deck. Charge-free switching lands 12 ns early.
    const deck = fixture.replace(' off=1', '').replace(/^\.tran 20ns 1000ns$/m, '.tran 20ns 1000ns 0 0.2ns');
    const transient = (await simulate(deck)).transient!;
    const [rising, falling, ...rest] = crossings(transient.time, transient.voltage('6'), -0.5);

    expect(rest).toEqual([]);
    expect(Math.abs(rising! - 304.038e-9)).toBeLessThan(0.05e-9);
    expect(Math.abs(falling! - 784.162e-9)).toBeLessThan(0.05e-9);
  });

  it('stops at the charge-free regenerative fold where ngspice-47 does', { timeout: 30_000 }, async () => {
    // Without stored charge the regenerative transition is a fold: past
    // 287.616 ns no state continues the trajectory for a short step, and
    // ngspice-47 on this charge-free deck (`off`, `.tran 20ns 1000ns`, and with
    // TMAX 0.2 ns too) aborts with "timestep too small" at 287.616 ns. With
    // the node-voltage LTE spice-ts approached the fold on a different grid
    // and its implicit-breakpoint recovery (#139/#147) happened to converge a
    // 0.5 ns Backward-Euler step across it; on ngspice's CKTtrunc grid (#621)
    // that recovery is still attempted from the same onset but fails like
    // ngspice. The fixture itself stores charge (#385) and completes above.
    let error: unknown;
    try {
      await simulate(chargeFreeVariant(fixture));
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(TimestepTooSmallError);
    expect((error as TimestepTooSmallError).time! / 287.616e-9).toBeCloseTo(1, 5);
  });
});
