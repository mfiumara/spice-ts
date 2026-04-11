import type { SimulationWarning } from './types.js';

/**
 * Result of a DC operating point (`.op`) analysis.
 *
 * Contains the steady-state node voltages and branch currents.
 */
export class DCResult {
  constructor(
    private readonly voltageMap: Map<string, number>,
    private readonly currentMap: Map<string, number>,
  ) {}

  /**
   * Get the DC voltage at a node.
   *
   * @param node - Node name as it appears in the netlist
   * @returns Voltage in volts
   * @throws Error if the node name is not found in the result
   */
  voltage(node: string): number {
    const v = this.voltageMap.get(node);
    if (v === undefined) throw new Error(`Unknown node: ${node}`);
    return v;
  }

  /**
   * Get the DC current through a voltage source or inductor branch.
   *
   * @param source - Branch device name (e.g., `'V1'`)
   * @returns Current in amps
   * @throws Error if the branch name is not found in the result
   */
  current(source: string): number {
    const i = this.currentMap.get(source);
    if (i === undefined) throw new Error(`Unknown branch: ${source}`);
    return i;
  }

  /** Copy of all node voltages as a Map. */
  get voltages(): Map<string, number> {
    return new Map(this.voltageMap);
  }

  /** Copy of all branch currents as a Map. */
  get currents(): Map<string, number> {
    return new Map(this.currentMap);
  }
}

/**
 * Result of a transient (`.tran`) analysis.
 *
 * Contains time-domain waveforms for all nodes and branches.
 */
export class TransientResult {
  constructor(
    /** Array of time points in seconds. */
    public readonly time: number[],
    private readonly voltageArrays: Map<string, number[]>,
    private readonly currentArrays: Map<string, number[]>,
  ) {}

  /**
   * Get the voltage waveform at a node over time.
   *
   * @param node - Node name as it appears in the netlist
   * @returns Array of voltage values (one per time point)
   * @throws Error if the node name is not found in the result
   */
  voltage(node: string): number[] {
    const v = this.voltageArrays.get(node);
    if (v === undefined) throw new Error(`Unknown node: ${node}`);
    return v;
  }

  /**
   * Get the current waveform through a branch over time.
   *
   * @param source - Branch device name (e.g., `'V1'`)
   * @returns Array of current values (one per time point)
   * @throws Error if the branch name is not found in the result
   */
  current(source: string): number[] {
    const i = this.currentArrays.get(source);
    if (i === undefined) throw new Error(`Unknown branch: ${source}`);
    return i;
  }
}

/**
 * Result of an AC small-signal (`.ac`) analysis.
 *
 * Contains frequency-domain magnitude and phase data for all nodes and branches.
 */
export class ACResult {
  constructor(
    /** Array of frequency points in Hz. */
    public readonly frequencies: number[],
    private readonly voltageArrays: Map<string, { magnitude: number; phase: number }[]>,
    private readonly currentArrays: Map<string, { magnitude: number; phase: number }[]>,
  ) {}

  /**
   * Get the AC voltage response at a node across all frequencies.
   *
   * @param node - Node name as it appears in the netlist
   * @returns Array of `{ magnitude, phase }` objects (one per frequency point; phase in degrees)
   * @throws Error if the node name is not found in the result
   */
  voltage(node: string): { magnitude: number; phase: number }[] {
    const v = this.voltageArrays.get(node);
    if (v === undefined) throw new Error(`Unknown node: ${node}`);
    return v;
  }

  /**
   * Get the AC current response through a branch across all frequencies.
   *
   * @param source - Branch device name (e.g., `'V1'`)
   * @returns Array of `{ magnitude, phase }` objects (one per frequency point; phase in degrees)
   * @throws Error if the branch name is not found in the result
   */
  current(source: string): { magnitude: number; phase: number }[] {
    const i = this.currentArrays.get(source);
    if (i === undefined) throw new Error(`Unknown branch: ${source}`);
    return i;
  }
}

/**
 * Result of a DC sweep (`.dc`) analysis.
 *
 * Contains node voltages and branch currents at each sweep point.
 */
export class DCSweepResult {
  constructor(
    /** Array of swept source values (e.g., voltage in volts). */
    public readonly sweepValues: Float64Array,
    private readonly voltageArrays: Map<string, Float64Array>,
    private readonly currentArrays: Map<string, Float64Array>,
  ) {}

  /**
   * Get the voltage at a node across all sweep points.
   *
   * @param node - Node name as it appears in the netlist
   * @returns Float64Array of voltage values (one per sweep point)
   * @throws Error if the node name is not found in the result
   */
  voltage(node: string): Float64Array {
    const v = this.voltageArrays.get(node);
    if (v === undefined) throw new Error(`Unknown node: ${node}`);
    return v;
  }

  /**
   * Get the current through a branch across all sweep points.
   *
   * @param source - Branch device name (e.g., `'V1'`)
   * @returns Float64Array of current values (one per sweep point)
   * @throws Error if the branch name is not found in the result
   */
  current(source: string): Float64Array {
    const i = this.currentArrays.get(source);
    if (i === undefined) throw new Error(`Unknown branch: ${source}`);
    return i;
  }
}

/**
 * Aggregate result object returned by {@link simulate}.
 *
 * Each field is populated only if the corresponding analysis was requested
 * in the netlist. For example, `.op` populates `dc`, `.tran` populates `transient`.
 */
export interface SimulationResult {
  /** DC operating point result (from `.op`) */
  dc?: DCResult;
  /** DC sweep result (from `.dc`) */
  dcSweep?: DCSweepResult;
  /** Transient analysis result (from `.tran`) */
  transient?: TransientResult;
  /** AC small-signal analysis result (from `.ac`) */
  ac?: ACResult;
  /** Warnings collected during simulation */
  warnings: SimulationWarning[];
}
