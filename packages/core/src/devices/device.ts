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
  /** Stamp dynamic (reactive) contributions for AC and transient analysis. */
  stampDynamic?(ctx: StampContext): void;
  /** Stamp AC small-signal contributions at angular frequency omega. */
  stampAC?(ctx: StampContext, omega: number): void;
  /** Commit state from a transient timepoint after NR and LTE acceptance. */
  acceptTransientStep?(ctx: StampContext): void;
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
