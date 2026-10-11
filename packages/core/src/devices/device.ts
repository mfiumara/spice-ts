/**
 * Context provided to device models during MNA matrix assembly.
 *
 * Devices use `stampG`, `stampB`, and `stampC` to contribute their
 * conductance, excitation, and dynamic (capacitance) terms to the system.
 */
export interface StampContext {
  /** Add a value to the conductance matrix G at (row, col). Row/col are node or branch indices. */
  stampG(row: number, col: number, value: number): void;
  /** Add a value to the right-hand-side vector b at the given row. */
  stampB(row: number, value: number): void;
  /** Add a value to the dynamic (capacitance) matrix C at (row, col). */
  stampC(row: number, col: number, value: number): void;
  /** Get the current solution voltage at a node index (-1 for ground returns 0). */
  getVoltage(node: number): number;
  /** Get the current solution current for a branch index. */
  getCurrent(branch: number): number;
  /** Current simulation time in seconds. */
  time: number;
  /** Current timestep in seconds (0 for DC). */
  dt: number;
  /** Total number of non-ground nodes in the system. */
  numNodes: number;
  /** Scale factor for source values (used during DC sweep ramping). */
  sourceScale: number;
  /** Use an explicit DC value instead of a transient waveform when available. */
  useDcSourceValue: boolean;
}

/**
 * Integration rule for one transient step, after the order-1 bootstrap at
 * starts, breakpoints and history resets has been applied.
 */
export interface ChargeIntegration {
  readonly method: 'euler' | 'trapezoidal' | 'gear2';
  /** Step being solved, t(n+1) - t(n). */
  readonly dt: number;
  /** Previous accepted step t(n) - t(n-1); required for `gear2`. */
  readonly prevDt?: number;
}

/** A frequency-independent contribution to the complex AC right-hand side. */
export type ACRHSContribution =
  | {
      kind: 'branch';
      branch: number;
      magnitude: number;
      phase: number;
    }
  | {
      kind: 'node-pair';
      positiveNode: number;
      negativeNode: number;
      magnitude: number;
      phase: number;
    };

/**
 * Interface that all device models must implement.
 *
 * Each device stamps its contributions into the MNA system via
 * the {@link StampContext} during each Newton-Raphson iteration.
 */
export interface DeviceModel {
  /** Device instance name (e.g., `'R1'`, `'M1'`). */
  readonly name: string;
  /** Node indices this device is connected to (-1 for ground). */
  readonly nodes: number[];
  /** Branch indices owned by this device (e.g., voltage sources, inductors). */
  readonly branches: number[];
  /** Stamp the device's DC/resistive contributions into the MNA system. */
  stamp(ctx: StampContext): void;
  /** Restrict a Newton candidate while preserving its global step direction. */
  limitNewtonStep?(previous: Float64Array, candidate: Float64Array): number;
  /** Stamp dynamic (reactive) contributions for AC and transient analysis. */
  stampDynamic?(ctx: StampContext): void;
  /**
   * False when `stampDynamic` stamps nothing for this instance (e.g. a diode
   * without CJO, CJSW or TT). Transient integration then treats the device
   * as purely static and uses the exact accepted static-current history.
   */
  readonly storesCharge?: boolean;
  /**
   * Non-fatal model-card diagnostics found while building the device, such as
   * a parameter ngspice-47 warns about and ignores. Surfaced as `'model'`
   * simulation warnings.
   */
  readonly modelWarnings?: readonly string[];
  /**
   * True when the device integrates its own nonlinear charge in transient
   * analysis (ngspice NIintegrate on q(v)) through {@link stampTransientCharge}
   * instead of stamping C(v) via {@link stampDynamic}. `stampDynamic` is then
   * still used for AC, noise and other small-signal analyses.
   */
  readonly integratesTransientCharge?: boolean;
  /**
   * Stamp the integrated charge companion (G and b) for one transient Newton
   * iteration. Called after `stamp` with the same context.
   */
  stampTransientCharge?(ctx: StampContext, integration: ChargeIntegration): void;
  /**
   * Stamp the charge current accepted at the last committed timepoint as a
   * constant current. Used to build the trapezoidal history of other
   * reactive elements that share its nodes.
   */
  stampAcceptedChargeCurrent?(ctx: StampContext): void;
  /** Stamp AC small-signal contributions at angular frequency omega. */
  stampAC?(ctx: StampContext, omega: number): void;
  /** Commit state from a transient timepoint after NR and LTE acceptance. */
  acceptTransientStep?(ctx: StampContext): void;
  /**
   * True when the device limits every junction voltage it reads relative to
   * its previous Newton iterate (ngspice DEVpnjlim). Transient Newton leaves
   * the nodes of such devices undamped, because a damped node cannot follow
   * the limited junction and the iterate-relative limit would ratchet away.
   */
  readonly limitsOwnJunctions?: boolean;
  /**
   * Start a transient Newton solve at a new or retried timepoint: limit the
   * first iterate against the last accepted junction state (ngspice
   * MODEINITPRED), not against an iterate of a rejected attempt.
   */
  beginTransientNewton?(): void;
  /**
   * Receive the undamped transient Newton solution. A self-limiting device
   * limits its next junction voltage from this solve, not from the damped
   * iterate: node damping may hold a terminal back, and limiting against that
   * lagging node would ratchet the junction away from the Newton step.
   */
  observeTransientNewton?(solution: Float64Array): void;
  /**
   * Whether the last `stamp` limited a junction (ngspice CKTnoncon). Newton
   * cannot be declared converged on an iterate that was limited, because the
   * stamp then linearised a voltage the solution does not have.
   */
  limitedLastStamp?(): boolean;
  /** Receive the transient TSTEP used by SPICE waveform defaults (e.g. zero PULSE TR/TF). */
  setTransientTimestep?(timestep: number): void;
  /** Clear device-owned transient history before restarting at t=0. */
  resetTransient?(): void;
  /** Whether this device requires Newton-Raphson iteration (nonlinear). */
  readonly isNonlinear: boolean;
  /** Return this device's AC right-hand-side contribution, or null. */
  getACExcitation?(): ACRHSContribution | null;
  /** Set the device's primary parameter value (resistance, capacitance, etc.). */
  setParameter?(value: number): void;
  /** Get the device's primary parameter value. */
  getParameter?(): number;
  /** Apply a circuit temperature in degrees Celsius to temperature-sensitive behavior. */
  setTemperature?(value: number): void;
  /** Return the currently applied circuit temperature in degrees Celsius. */
  getTemperature?(): number;
  /**
   * Return times in [currentTime, stopTime] at which this device has a
   * discontinuity in its waveform or its derivatives. The transient driver
   * uses these as breakpoints — it will step exactly to each one, reset
   * integration history, and cut dt. Optional; devices without
   * discontinuities (resistors, capacitors, diodes, MOSFETs with DC gates)
   * should omit this method.
   */
  getBreakpoints?(stopTime: number): number[];
}
