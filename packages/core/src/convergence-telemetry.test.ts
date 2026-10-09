import { describe, expect, it } from 'vitest';
import { createTransientSim, simulate } from './index.js';
import { ConvergenceError, TimestepTooSmallError } from './errors.js';

describe('convergence telemetry', () => {
  it('reports deterministic DC Newton and source-stepping counters', async () => {
    const result = await simulate(`
V1 in 0 DC 5
D1 in out DTEST
R1 out 0 1k
.model DTEST D(IS=1e-14)
.op
`);

    expect(result.convergence!.dc).toEqual({
      newtonIterations: expect.any(Number),
      acceptedSolves: 14,
      rejectedSolves: 0,
      sourceStepAttempts: 13,
      sourceStepFailures: 0,
      gminStepAttempts: 0,
      gminStepFailures: 0,
      failure: null,
    });
    expect(result.convergence!.dc.newtonIterations).toBeGreaterThanOrEqual(14);
    expect(result.convergence!.transient).toEqual({
      acceptedSteps: 0,
      rejectedSteps: 0,
      newtonIterations: 0,
      nrRetries: 0,
      lteRetries: 0,
      minimumAcceptedTimestep: null,
      failure: null,
    });
  });

  it('reports accepted and rejected transient work without changing samples', async () => {
    const result = await simulate(`
V1 in 0 PULSE(0 5 10u 1u 1u 10u 30u)
R1 in out 1k
C1 out 0 1n
.tran 2u 60u
`);

    const transient = result.transient!;
    const telemetry = result.convergence!.transient;
    expect(telemetry.acceptedSteps).toBe(transient.time.length - 1);
    expect(telemetry.rejectedSteps).toBe(telemetry.nrRetries + telemetry.lteRetries);
    expect(telemetry.newtonIterations).toBeGreaterThanOrEqual(telemetry.acceptedSteps);
    expect(telemetry.minimumAcceptedTimestep).toBeGreaterThan(0);
    expect(telemetry.failure).toBeNull();
    expect(transient.voltage('out').every(Number.isFinite)).toBe(true);
  });

  it('exposes a bounded snapshot on the resumable transient driver', async () => {
    const sim = await createTransientSim(`
V1 in 0 DC 5
R1 in out 1k
C1 out 0 1u
.tran 1u 10u
`);

    expect(sim.convergence.transient.acceptedSteps).toBe(0);
    sim.advance();
    const snapshot = sim.convergence;
    expect(snapshot.transient.acceptedSteps).toBe(1);
    sim.advance();
    expect(snapshot.transient.acceptedSteps).toBe(1);
    expect(sim.convergence.transient.acceptedSteps).toBe(2);
    sim.dispose();
  });

  it('classifies timestep-floor failures and preserves retry counters', async () => {
    const sim = await createTransientSim(`
V1 in 0 DC 5
R1 in out 1k
C1 out 0 1u
.tran 1u 1m
`, { maxTransientIterations: 0 });

    try {
      sim.advance();
      throw new Error('expected advance() to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(TimestepTooSmallError);
      const failure = error as TimestepTooSmallError;
      expect(failure.convergence?.transient.failure).toBe('dt-floor');
      expect(failure.convergence?.transient.nrRetries).toBeGreaterThan(0);
      expect(failure.convergence?.transient.rejectedSteps)
        .toBe(failure.convergence?.transient.nrRetries);
    } finally {
      sim.dispose();
    }
  });

  it('classifies terminal DC Newton failures', async () => {
    try {
      await simulate('V1 in 0 DC 5\nR1 in 0 1k\n.op', { maxIterations: 0 });
      throw new Error('expected simulate() to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ConvergenceError);
      const failure = error as ConvergenceError;
      expect(failure.convergence?.dc.failure).toBe('nr-divergence');
      expect(failure.convergence?.dc.rejectedSolves).toBe(1);
      expect(failure.convergence?.transient.failure).toBeNull();
    }
  });
});