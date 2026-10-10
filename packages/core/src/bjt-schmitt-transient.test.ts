import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { simulate } from './simulate.js';

const fixtureBytes = readFileSync(
  new URL('../../../benchmarks/corpus/corpus-e/fixtures/tests/d_bjt-schmitt-nobypass.ckt', import.meta.url),
);
const fixture = fixtureBytes.toString('utf8');
const fixtureSha256 = createHash('sha256').update(fixtureBytes).digest('hex');

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
    expect(Math.max(...postRecoveryGaps.slice(0, 3))).toBeLessThan(1e-12);
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
    expect(v6[edgeStart - 1]).toBeCloseTo(-1.0896, 3);
    expect(v7[edgeStart - 1]).toBeCloseTo(-1.7692, 3);
    expect(v6[edgeStart]).toBeCloseTo(-0.0262, 3);
    expect(v7[edgeStart]).toBeCloseTo(-0.7475, 3);

    const telemetry = first.convergence!.transient;
    expect(telemetry.acceptedSteps).toBe(transient.time.length - 1);
    expect(telemetry.rejectedSteps).toBe(telemetry.nrRetries + telemetry.lteRetries);
    expect(telemetry.acceptedSteps).toBeLessThan(4_000);
    expect(telemetry.rejectedSteps).toBeLessThan(1_500);
    expect(telemetry.minimumAcceptedTimestep).toBeGreaterThan(0);
    expect(telemetry.failure).toBeNull();
  });
});
