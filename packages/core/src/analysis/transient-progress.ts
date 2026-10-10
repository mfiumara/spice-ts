/**
 * Progress policy for the adaptive transient step loop.
 *
 * Every retry inside one `advance()` call shrinks dt geometrically, so a single
 * call is already bounded by the dt floor. What can still run forever is the
 * outer sequence of *accepted* steps: when node-voltage LTE can never be
 * satisfied (e.g. trapezoidal ringing behind a slope discontinuity no source
 * reports), dt collapses below the LTE floor, the step is accepted unchecked,
 * grows, is rejected, and the cycle repeats at ~1e-13 s per step. The monitor
 * turns that cycle first into an order-1 recovery and, if time still does not
 * advance, into a terminal verdict the driver reports as a structured error.
 */
export type ProgressVerdict = 'continue' | 'reduce-order' | 'stalled';

/**
 * Consecutive accepted steps without a passing LTE check, after an LTE
 * rejection, before the driver drops higher-order history for one step. Steps
 * that are unchecked only because the user's timestep is at or below the LTE
 * floor never count: no rejection forced them there, and a Backward-Euler
 * restart would damp lossless LC tanks. Legitimate recovery from an NR
 * timestep cut doubles dt from the 1e-15 s floor past the 1e-13 s LTE floor in
 * at most seven accepted steps, so a longer run means the LTE estimate is
 * stuck rather than resolving a fast edge.
 */
export const ORDER_ONE_RECOVERY_RUN = 16;

/** Accepted steps per progress window. */
export const PROGRESS_WINDOW_STEPS = 10_000;

/** Average accepted dt below this (seconds) counts as no progress... */
const STALL_TIMESTEP = 1e-12;
/** ...unless the caller's own maximum timestep is that small. */
const STALL_FRACTION_OF_MAX_TIMESTEP = 1e-3;

export class TransientProgressMonitor {
  private readonly stallSpan: number;
  private unverifiedRun = 0;
  /** An LTE rejection happened since the last LTE-verified acceptance. */
  private rejectedSinceVerified = false;
  private windowSteps = 0;
  private windowStart: number | undefined;

  constructor(maxTimestep: number) {
    const stallTimestep = Math.min(STALL_TIMESTEP, maxTimestep * STALL_FRACTION_OF_MAX_TIMESTEP);
    this.stallSpan = PROGRESS_WINDOW_STEPS * stallTimestep;
  }

  /** Record that a step was rejected by the truncation-error check. */
  lteRejected(): void {
    this.rejectedSinceVerified = true;
  }

  /**
   * Record one accepted timepoint.
   *
   * @param time Simulation time after the accepted step.
   * @param dt Accepted timestep.
   * @param lteVerified Whether a truncation-error check passed for this step.
   */
  accept(time: number, dt: number, lteVerified: boolean): ProgressVerdict {
    this.windowStart ??= time - dt;
    if (++this.windowSteps >= PROGRESS_WINDOW_STEPS) {
      const advanced = time - this.windowStart;
      this.windowStart = time;
      this.windowSteps = 0;
      if (advanced < this.stallSpan) return 'stalled';
    }

    if (lteVerified) {
      this.unverifiedRun = 0;
      this.rejectedSinceVerified = false;
      return 'continue';
    }
    if (!this.rejectedSinceVerified) return 'continue';
    if (++this.unverifiedRun >= ORDER_ONE_RECOVERY_RUN) {
      this.unverifiedRun = 0;
      return 'reduce-order';
    }
    return 'continue';
  }

  reset(): void {
    this.unverifiedRun = 0;
    this.rejectedSinceVerified = false;
    this.windowSteps = 0;
    this.windowStart = undefined;
  }
}
