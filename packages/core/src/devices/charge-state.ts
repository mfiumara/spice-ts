import type { ChargeIntegration, ChargeTruncation, StampContext } from './device.js';

/** ngspice cktterr.c error coefficients, indexed by integration order - 1. */
const TRAP_COEFFICIENTS = [0.5, 0.08333333333];
const GEAR_COEFFICIENTS = [0.5, 0.2222222222];

/**
 * Accepted transient state of a device's nonlinear charges, integrated as
 * ngspice NIintegrate does (CKTstate0/1/2 per charge plus its capacitor
 * current): the companion current of each charge is the integrated dQ/dt of
 * q(v), and its history is the charge and current accepted at x(n), never a
 * Jacobian evaluated at the new iterate and applied to the old voltages.
 *
 * Usage per transient Newton iteration: {@link begin} with the step's
 * integration rule, then {@link current} for each charge (after computing q
 * at the voltage the static stamp linearised at); {@link factor} is
 * dI/dQ, so the companion conductance of a charge is `factor * dQ/dV`.
 * On each accepted timepoint, {@link accept} every charge, then {@link commit}.
 */
export class TransientChargeState {
  private readonly acceptedCharge: Float64Array;
  private readonly previousCharge: Float64Array;
  /** q(n-2): the extra point TRAP/Gear-2 truncation error needs (ngspice CKTstate3). */
  private readonly olderCharge: Float64Array;
  private readonly acceptedCurrent: Float64Array;
  private readonly acceptedVoltage: Float64Array;
  private readonly acceptedCapacitance: Float64Array;
  private hasAccepted = false;
  private hasPrevious = false;
  /** Accepted timepoints held in the charge history, capped at 3 (q(n), q(n-1), q(n-2)). */
  private historyLength = 0;
  /** Set while {@link truncationTimestep} evaluates the trial charges. */
  private truncation: ChargeTruncation | undefined;
  private truncationIndices: readonly number[] | undefined;
  private truncationBound = Infinity;
  /** Integration rule of the most recent charge stamp, committed on acceptance. */
  private pending: ChargeIntegration | undefined;
  private method: ChargeIntegration['method'] = 'euler';
  private a2 = 0;
  private a3 = 0;
  /** dI/dQ of the active rule (ngspice CKTag[0]). */
  factor = 0;

  constructor(readonly size: number) {
    this.acceptedCharge = new Float64Array(size);
    this.previousCharge = new Float64Array(size);
    this.olderCharge = new Float64Array(size);
    this.acceptedCurrent = new Float64Array(size);
    this.acceptedVoltage = new Float64Array(size);
    this.acceptedCapacitance = new Float64Array(size);
  }

  /** Select the integration rule for the charges of one Newton iteration. */
  begin(integration: ChargeIntegration): void {
    this.pending = integration;
    this.select(integration);
  }

  /** Capacitor current of charge `index` at value `charge` under the active rule. */
  current(index: number, charge: number): number {
    if (!this.hasAccepted) return 0;
    const previous = this.acceptedCharge[index];
    if (this.method === 'trapezoidal') {
      return this.factor * (charge - previous) - this.acceptedCurrent[index];
    }
    if (this.method === 'gear2') {
      return this.factor * charge - this.a2 * previous + this.a3 * this.previousCharge[index];
    }
    return this.factor * (charge - previous);
  }

  /**
   * Charge of a capacitance-only element (no closed-form q(v)), advanced from
   * the accepted point as ngspice's HFET, MESA and Meyer MOS models do:
   * q = q(n) + C * (v - v(n)). With `averaged`, C is the mean of C(v) and the
   * accepted C(v(n)) (ngspice DEVqmeyer), which integrates C(v) to second order.
   * Before the first accepted point the charge is C * v.
   */
  incrementalCharge(index: number, voltage: number, capacitance: number, averaged = false): number {
    if (!this.hasAccepted) return capacitance * voltage;
    return this.acceptedCharge[index]
      + this.incrementalCapacitance(index, capacitance, averaged) * (voltage - this.acceptedVoltage[index]);
  }

  /** The dQ/dV that {@link incrementalCharge} applies (the averaged C when `averaged`). */
  incrementalCapacitance(index: number, capacitance: number, averaged = false): number {
    return averaged && this.hasAccepted
      ? 0.5 * (capacitance + this.acceptedCapacitance[index])
      : capacitance;
  }

  /** Charge current accepted at the last committed timepoint. */
  acceptedChargeCurrent(index: number): number {
    return this.acceptedCurrent[index];
  }

  /**
   * Record charge `index` at an accepted timepoint. The capacitor current is
   * integrated with the rule of the last charge stamp; the initial operating
   * point (no pending rule) is at rest, as ngspice copies CKTstate0 into
   * CKTstate1 with a zero capacitor current at MODEINITTRAN.
   */
  accept(index: number, charge: number, voltage = 0, capacitance = 0): void {
    if (this.truncation !== undefined) {
      if (this.truncationIndices === undefined || this.truncationIndices.includes(index)) {
        this.truncationBound = Math.min(this.truncationBound, this.chargeTruncation(index, charge, this.truncation));
      }
      return;
    }
    const integration = this.pending;
    let current = 0;
    if (integration !== undefined && this.hasAccepted) {
      this.select(integration);
      current = this.current(index, charge);
    }
    this.olderCharge[index] = this.previousCharge[index];
    this.previousCharge[index] = this.acceptedCharge[index];
    this.acceptedCharge[index] = charge;
    this.acceptedCurrent[index] = current;
    this.acceptedVoltage[index] = voltage;
    this.acceptedCapacitance[index] = capacitance;
  }

  /** Finish an accepted timepoint after every charge was {@link accept}ed. */
  commit(): void {
    if (this.truncation !== undefined) return;
    this.historyLength = Math.min(this.historyLength + 1, 3);
    this.hasPrevious = this.hasAccepted && this.pending !== undefined;
    this.hasAccepted = true;
    this.pending = undefined;
  }

  /** Forget all history before a transient restart at t = 0. */
  reset(): void {
    this.hasAccepted = false;
    this.hasPrevious = false;
    this.historyLength = 0;
    this.pending = undefined;
    this.acceptedCharge.fill(0);
    this.previousCharge.fill(0);
    this.olderCharge.fill(0);
    this.acceptedCurrent.fill(0);
    this.acceptedVoltage.fill(0);
    this.acceptedCapacitance.fill(0);
  }

  /**
   * ngspice DEVtrunc: the largest next timestep the local truncation error of
   * these charges allows (ngspice cktterr.c CKTterr, minimised over charges).
   * `evaluate` must compute the charges at the converged trial solution and
   * pass each to {@link accept} (then {@link commit}), exactly as on
   * acceptance; while it runs those calls only measure the error and leave the
   * accepted history untouched. `indices` restricts the estimate to the
   * charges ngspice truncates for this device (e.g. MOS1 gate charges only).
   * Returns Infinity when no rule is pending or the history is too short.
   */
  truncationTimestep(
    truncation: ChargeTruncation,
    evaluate: () => void,
    indices?: readonly number[],
  ): number {
    const integration = this.pending;
    if (integration === undefined || !this.hasAccepted) return Infinity;
    this.select(integration);
    // Order 1 needs q(n+1), q(n), q(n-1); order 2 one point more (CKTstates[0..order+1]).
    if (this.historyLength < this.order() + 1) return Infinity;
    this.truncation = truncation;
    this.truncationIndices = indices;
    this.truncationBound = Infinity;
    try {
      evaluate();
    } finally {
      this.truncation = undefined;
      this.truncationIndices = undefined;
    }
    return this.truncationBound;
  }

  /** Integration order of the active rule. */
  private order(): 1 | 2 {
    return this.method === 'euler' ? 1 : 2;
  }

  /** ngspice CKTterr for one charge at trial value `charge`. */
  private chargeTruncation(index: number, charge: number, truncation: ChargeTruncation): number {
    const { deltas, reltol, abstol, chgtol, trtol } = truncation;
    const order = this.order();
    const delta = deltas[0];
    const current = this.current(index, charge);
    const previous = this.acceptedCharge[index];
    const currentTolerance = abstol + reltol * Math.max(Math.abs(current), Math.abs(this.acceptedCurrent[index]));
    const chargeTolerance = reltol * Math.max(Math.abs(charge), Math.abs(previous), chgtol) / delta;
    const tolerance = Math.max(currentTolerance, chargeTolerance);
    // Divided differences of q over t(n+1), t(n), ..., t(n-order).
    const diff = [charge, previous, this.previousCharge[index], this.olderCharge[index]];
    const span = [deltas[0], deltas[1], deltas[2]];
    for (let j: number = order; ; j--) {
      for (let i = 0; i <= j; i++) diff[i] = (diff[i] - diff[i + 1]) / span[i];
      if (j === 0) break;
      for (let i = 0; i < j; i++) span[i] = span[i + 1] + deltas[i];
    }
    const factor = (this.method === 'gear2' ? GEAR_COEFFICIENTS : TRAP_COEFFICIENTS)[order - 1];
    const bound = trtol * tolerance / Math.max(abstol, factor * Math.abs(diff[0]));
    return order === 2 ? Math.sqrt(bound) : bound;
  }

  private select({ method, dt, prevDt }: ChargeIntegration): void {
    if (method === 'trapezoidal') {
      this.method = 'trapezoidal';
      this.factor = 2 / dt;
      return;
    }
    if (method === 'gear2' && prevDt !== undefined && this.hasPrevious) {
      const alpha = prevDt / dt;
      this.method = 'gear2';
      this.factor = (2 + alpha) / ((1 + alpha) * dt);
      this.a2 = (1 + alpha) / (alpha * dt);
      this.a3 = 1 / (alpha * (1 + alpha) * dt);
      return;
    }
    this.method = 'euler';
    this.factor = 1 / dt;
  }
}

/**
 * Stamp the linearised companion of a charge between `positive` and
 * `negative`: a current `current` flowing from positive to negative inside
 * the device, with conductance `conductance` around the branch voltage
 * `voltage` it was evaluated at.
 */
export function stampChargeBranch(
  ctx: StampContext,
  positive: number,
  negative: number,
  current: number,
  conductance: number,
  voltage: number,
): void {
  const equivalent = current - conductance * voltage;
  if (positive >= 0) {
    ctx.stampG(positive, positive, conductance);
    ctx.stampB(positive, -equivalent);
  }
  if (negative >= 0) {
    ctx.stampG(negative, negative, conductance);
    ctx.stampB(negative, equivalent);
  }
  if (positive >= 0 && negative >= 0) {
    ctx.stampG(positive, negative, -conductance);
    ctx.stampG(negative, positive, -conductance);
  }
}

/** Stamp an accepted charge current as a constant current from positive to negative. */
export function stampChargeCurrent(
  ctx: StampContext,
  positive: number,
  negative: number,
  current: number,
): void {
  if (current === 0) return;
  if (positive >= 0) ctx.stampB(positive, -current);
  if (negative >= 0) ctx.stampB(negative, current);
}

/**
 * ngspice junction depletion charge and capacitance (dioload.c, bjtload.c):
 * Q = VJ*CJ0*(1 - (1 - V/VJ)^(1-M))/(1-M) below FC*VJ, continued above it by
 * the integral of the linear capacitance CJ0/F2*(F3 + M*V/VJ), so Q is C^1.
 */
export function depletionCharge(
  voltage: number,
  zeroBiasCapacitance: number,
  potential: number,
  grading: number,
  forwardCoefficient: number,
): { charge: number; capacitance: number } {
  if (zeroBiasCapacitance === 0) return { charge: 0, capacitance: 0 };
  const corner = forwardCoefficient * potential;
  if (voltage < corner) {
    return {
      charge: abruptJunctionCharge(voltage, zeroBiasCapacitance, potential, grading),
      capacitance: zeroBiasCapacitance * Math.pow(1 - voltage / potential, -grading),
    };
  }
  const f2 = Math.pow(1 - forwardCoefficient, 1 + grading);
  const f3 = 1 - forwardCoefficient * (1 + grading);
  const scaled = zeroBiasCapacitance / f2;
  return {
    charge: abruptJunctionCharge(corner, zeroBiasCapacitance, potential, grading)
      + scaled * (f3 * (voltage - corner) + grading / (2 * potential) * (voltage * voltage - corner * corner)),
    capacitance: scaled * (f3 + grading * voltage / potential),
  };
}

/** Charge stored between 0 and V on the abrupt-junction law CJ0/(1-V/VJ)^M. */
function abruptJunctionCharge(
  voltage: number,
  zeroBiasCapacitance: number,
  potential: number,
  grading: number,
): number {
  const depletion = 1 - voltage / potential;
  const exponent = 1 - grading;
  return Math.abs(exponent) < 1e-12
    ? -potential * zeroBiasCapacitance * Math.log(depletion)
    : potential * zeroBiasCapacitance * (1 - Math.pow(depletion, exponent)) / exponent;
}
