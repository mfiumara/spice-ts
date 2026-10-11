import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
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
    // same deck with `off` and `.tran 20ns 1000ns 0 0.2ns` (fine TMAX so its
    // own edge timing is resolved): v(6) crosses -0.5 V rising at 304.10 ns
    // and falling at 784.30 ns. Charge-free switching lands 12 ns early.
    const transient = (await simulate(fixture)).transient!;
    const [rising, falling, ...rest] = crossings(transient.time, transient.voltage('6'), -0.5);

    expect(rest).toEqual([]);
    expect(Math.abs(rising! - 304.10e-9)).toBeLessThan(1e-9);
    expect(Math.abs(falling! - 784.30e-9)).toBeLessThan(1e-9);
  });

  it('recovers across the charge-free regenerative jump with a bounded Backward-Euler step', { timeout: 30_000 }, async () => {
    const first = await simulate(chargeFreeVariant(fixture));
    const second = await simulate(chargeFreeVariant(fixture));
    const transient = first.transient!;

    expect(transient.time.at(-1)).toBeCloseTo(1e-6, 12);
    expect(second.transient!.time).toEqual(transient.time);

    const v6 = transient.voltage('6');
    const v7 = transient.voltage('7');
    const edgeStart = v6.findIndex((value, index) => index > 0 && v6[index - 1]! < -0.9 && value >= -0.9);
    const edgeEnd = v6.findIndex((value, index) => index > edgeStart && value >= -0.1);
    expect(edgeStart).toBeGreaterThan(0);
    expect(edgeEnd).toBeGreaterThan(edgeStart);

    const edgeGaps = transient.time
      .slice(edgeStart, edgeEnd + 1)
      .map((time, index) => time - transient.time[edgeStart + index - 1]!);
    expect(Math.max(...edgeGaps)).toBeLessThanOrEqual(5e-9);

    const postRecoveryGaps = transient.time
      .slice(edgeEnd + 1, edgeEnd + 9)
      .map((time, index) => time - transient.time[edgeEnd + index]!);
    // After the Backward-Euler recovery step LTE regrows dt from a picosecond
    // scale. Before #482 the raw-RHS trapezoidal history of cload paired the
    // new BJT Jacobian with the old solution, and the step after recovery fell
    // into a 0.24/0.49/0.98 ps grow-fail-cut cycle (3129 points, 1037 Newton
    // retries) instead.
    expect(Math.min(...postRecoveryGaps)).toBeGreaterThan(1e-12);
    expect(postRecoveryGaps.some((gap, index) => (
      index > 0 && gap > postRecoveryGaps[index - 1]!
      && gap <= postRecoveryGaps[index - 1]! * 2.01
    ))).toBe(true);

    const regenerativeSamples = v6
      .map((value, index) => ({ index, v6: value, v7: v7[index]! }))
      .filter(sample => sample.index >= edgeStart && sample.index <= edgeEnd);
    expect(regenerativeSamples.length).toBeGreaterThanOrEqual(2);
    expect(regenerativeSamples.every((sample, index) => (
      index === 0
      || (sample.v6 > regenerativeSamples[index - 1]!.v6
        && sample.v7 > regenerativeSamples[index - 1]!.v7)
    ))).toBe(true);
    // spice-ts regression pins for the recovery step (no ngspice reference:
    // ngspice-47 rejects the fixture's `off=1` card). The pre-edge sample
    // reflects the Early factor using the true reverse VBC (#385). The same
    // deck converged (RELTOL=1e-7, TMAX=10 ps) gives v6=-1.0125, v7=-1.8101
    // at that time; the raw-RHS history (#482) had v7 0.6 mV high at -1.8095.
    // The mid-jump v7 sample moved from -0.8945 to -0.8950 when the BJT
    // thermal voltage became ngspice's kT/q at 300.15 K (#525).
    expect(v6[edgeStart - 1]).toBeCloseTo(-1.0125, 3);
    expect(v7[edgeStart - 1]).toBeCloseTo(-1.8101, 3);
    expect(v6[edgeStart]).toBeCloseTo(-0.0461, 3);
    expect(v7[edgeStart]).toBeCloseTo(-0.8950, 3);

    const telemetry = first.convergence!.transient;
    expect(telemetry.acceptedSteps).toBeLessThan(4_000);
    expect(telemetry.rejectedSteps).toBeLessThan(1_500);
    expect(telemetry.failure).toBeNull();
  });
});
