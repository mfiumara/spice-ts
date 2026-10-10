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

    const telemetry = first.convergence!.transient;
    expect(telemetry.acceptedSteps).toBe(transient.time.length - 1);
    expect(telemetry.rejectedSteps).toBe(telemetry.nrRetries + telemetry.lteRetries);
    expect(telemetry.acceptedSteps).toBeLessThan(4_000);
    expect(telemetry.rejectedSteps).toBeLessThan(1_500);
    expect(telemetry.minimumAcceptedTimestep).toBeGreaterThan(0);
    expect(telemetry.failure).toBeNull();
  });
});
