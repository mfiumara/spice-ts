import { InvalidCircuitError } from '../errors.js';
import type { SimulationOptions, TransientAnalysis } from '../types.js';

/** True when `value` is a usable `maxTimestep` option: unset, 0 (unset), or positive and finite. */
export function isValidMaxTimestepOption(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}

/**
 * The caller `maxTimestep` option as a step cap. 0 means unset, as in ngspice;
 * negative or non-finite values throw {@link InvalidCircuitError} instead of
 * reaching the transient driver.
 */
export function maxTimestepOption(value: number | undefined): number | undefined {
  if (!isValidMaxTimestepOption(value)) {
    throw new InvalidCircuitError(
      `SimulationOptions.maxTimestep must be a positive finite number or 0 (unset), got ${String(value)}`,
    );
  }
  return value === 0 ? undefined : value;
}

/**
 * The `.tran` analysis as the driver runs it. `.tran` TMAX is the step cap, as
 * in ngspice; without one, a caller `maxTimestep` option replaces the default
 * min(TSTEP, TSTOP/50) cap. A zero TSTEP runs at the cap, else TSTOP/50.
 * An option of 0 is unset; negative or non-finite options throw.
 */
export function runnableTransient(
  analysis: TransientAnalysis,
  options?: Pick<SimulationOptions, 'maxTimestep'>,
): TransientAnalysis {
  const option = maxTimestepOption(options?.maxTimestep);
  const maxTimestep = analysis.maxTimestep ?? option;
  const capped = maxTimestep === undefined ? analysis : { ...analysis, maxTimestep };
  if (capped.timestep > 0) return capped;
  return { ...capped, timestep: maxTimestep ?? analysis.stopTime / 50 };
}

/**
 * The step cap the transient driver enforces for a runnable `.tran`
 * ({@link runnableTransient}): its TMAX, else min(TSTEP, TSTOP/50).
 * Shared by simulate(), the streaming paths and createTransientSim (#678).
 */
export function transientStepCap(analysis: Pick<TransientAnalysis, 'stopTime' | 'timestep' | 'maxTimestep'>): number {
  return analysis.maxTimestep ?? Math.min(analysis.timestep, analysis.stopTime / 50);
}
