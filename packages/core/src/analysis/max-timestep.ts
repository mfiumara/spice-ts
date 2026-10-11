import { InvalidCircuitError } from '../errors.js';

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
