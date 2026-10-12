import { ParseError } from '../errors.js';

/**
 * Thrown for a `.meas`/`.measure` form ngspice-47 evaluates but spice-ts does
 * not (for example `.meas sp`, or a `par()` operand in an AC measurement).
 * Never silently skipped. A measurement ngspice itself rejects is not an
 * error: it is reported in `SimulationResult.measurements` with
 * `status: 'failed'`, as ngspice prints it and continues.
 */
export class UnsupportedMeasureError extends ParseError {
  /** Stable machine-readable error code. */
  readonly code = 'UNSUPPORTED_MEASURE';

  constructor(
    /** Why this measurement form is not evaluated. */
    public readonly reason: string,
    line: number,
    context: string,
  ) {
    super(`Unsupported .measure: ${reason}`, line, context);
    this.name = 'UnsupportedMeasureError';
  }
}
