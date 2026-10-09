import type { ConvergenceTelemetry } from './types.js';

export function createConvergenceTelemetry(): ConvergenceTelemetry {
  return {
    dc: {
      newtonIterations: 0,
      acceptedSolves: 0,
      rejectedSolves: 0,
      sourceStepAttempts: 0,
      sourceStepFailures: 0,
      gminStepAttempts: 0,
      gminStepFailures: 0,
      failure: null,
    },
    transient: {
      acceptedSteps: 0,
      rejectedSteps: 0,
      newtonIterations: 0,
      nrRetries: 0,
      lteRetries: 0,
      minimumAcceptedTimestep: null,
      failure: null,
    },
  };
}

export function snapshotConvergenceTelemetry(
  telemetry: ConvergenceTelemetry,
): ConvergenceTelemetry {
  return {
    dc: { ...telemetry.dc },
    transient: { ...telemetry.transient },
  };
}

export function resetConvergenceTelemetry(telemetry: ConvergenceTelemetry): void {
  const empty = createConvergenceTelemetry();
  Object.assign(telemetry.dc, empty.dc);
  Object.assign(telemetry.transient, empty.transient);
}