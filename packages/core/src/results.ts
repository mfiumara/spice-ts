import type { ConvergenceTelemetry, SimulationWarning } from './types.js';

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

  /** Copy of all node voltage waveforms as a Map. */
  get voltages(): Map<string, number[]> {
    return new Map(this.voltageArrays);
  }

  /** Copy of all branch current waveforms as a Map. */
  get currents(): Map<string, number[]> {
    return new Map(this.currentArrays);
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

  /** Copy of all node voltage phasors as a Map. */
  get voltages(): Map<string, { magnitude: number; phase: number }[]> {
    return new Map(this.voltageArrays);
  }

  /** Copy of all branch current phasors as a Map. */
  get currents(): Map<string, { magnitude: number; phase: number }[]> {
    return new Map(this.currentArrays);
  }
}

/** Spectral voltage-noise densities from a `.noise` analysis. */
export class NoiseResult {
  constructor(
    /** Frequency points in Hz. */
    public readonly frequencies: number[],
    /** Output node named by the `.noise` command. */
    public readonly outputNode: string,
    /** Input source named by the `.noise` command. */
    public readonly inputSource: string,
    /** Output-referred voltage-noise density in V/sqrt(Hz). */
    public readonly outputNoiseDensity: number[],
    /** Input-referred voltage-noise density in V/sqrt(Hz). */
    public readonly inputNoiseDensity: number[],
    /** Integrated output-referred RMS noise in V, absent for a zero-width sweep. */
    public readonly integratedOutputNoise: number | undefined,
    /** Integrated input-referred RMS noise in V, absent for a zero-width sweep. */
    public readonly integratedInputNoise: number | undefined,
    /** Optional negative output node for a differential voltage result. */
    public readonly outputReferenceNode?: string,
  ) {}
}

/** Rectangular complex distortion component. */
export interface ComplexDistortionValue {
  real: number;
  imaginary: number;
}

/** Harmonic products included in the bounded single-tone result. */
export type DistortionOrder = 2 | 3;

/** Intermodulation products included in the bounded two-tone result. */
export type DistortionIntermodulationProduct = 'f1+f2' | 'f1-f2' | '2f1-f2';

/** Product selector for a bounded single- or two-tone distortion result. */
export type DistortionProduct = DistortionOrder | DistortionIntermodulationProduct;

/** Deterministic harmonic or intermodulation results from a bounded `.disto`. */
export class DistortionResult {
  public readonly products: readonly DistortionProduct[];

  constructor(
    /** Swept F1 frequencies in ascending order. */
    public readonly frequencies: number[],
    private readonly voltageArrays: Map<DistortionProduct, Map<string, ComplexDistortionValue[]>>,
    private readonly currentArrays: Map<DistortionProduct, Map<string, ComplexDistortionValue[]>>,
    /** Fixed F2/start-F1 ratio for two-tone results. */
    public readonly f2OverF1?: number,
  ) {
    this.products = [...voltageArrays.keys()];
  }

  voltage(node: string, product: DistortionProduct): ComplexDistortionValue[] {
    const arrays = this.voltageArrays.get(product);
    if (!arrays) throw new Error(`Distortion product ${product} is unavailable for this analysis`);
    const values = arrays.get(node);
    if (!values) throw new Error(`Unknown node: ${node}`);
    return values.map(value => ({ ...value }));
  }

  current(branch: string, product: DistortionProduct): ComplexDistortionValue[] {
    const arrays = this.currentArrays.get(product);
    if (!arrays) throw new Error(`Distortion product ${product} is unavailable for this analysis`);
    const values = arrays.get(branch);
    if (!values) throw new Error(`Unknown branch: ${branch}`);
    return values.map(value => ({ ...value }));
  }
}

/** Scalar small-signal quantities from a bounded `.tf v(node) source` analysis. */
export class TransferFunctionResult {
  constructor(
    /** Output node named by the `.tf` command. */
    public readonly outputNode: string,
    /** Independent input source named by the `.tf` command. */
    public readonly inputSource: string,
    /** Voltage gain (V/V) or transimpedance (V/A). */
    public readonly transfer: number,
    /** Small-signal resistance seen by the input source, in ohms. */
    public readonly inputResistance: number,
    /** Small-signal resistance looking into the output node, in ohms. */
    public readonly outputResistance: number,
  ) {}
}

/** One finite pole or zero in radians per second. */
export interface PoleZeroValue {
  real: number;
  imaginary: number;
}

/** Deterministically ordered finite poles and zeros from a bounded `.pz` analysis. */
export class PoleZeroResult {
  constructor(
    public readonly inputPositive: string,
    public readonly inputNegative: string,
    public readonly outputPositive: string,
    public readonly outputNegative: string,
    public readonly poles: PoleZeroValue[],
    public readonly zeros: PoleZeroValue[],
  ) {}
}

/** One rectangular complex sensitivity value. */
export interface ComplexSensitivityValue {
  real: number;
  imaginary: number;
}

/** Sensitivity to one non-zero primary device parameter. */
export interface SensitivityEntry {
  device: string;
  parameter: 'resistance' | 'capacitance' | 'inductance' | 'dc' | 'acMagnitude' | 'gain';
  dc?: number;
  ac?: ComplexSensitivityValue[];
}

/** Deterministically ordered results from the bounded `.sens` slice. */
export class SensitivityResult {
  constructor(
    public readonly outputNode: string,
    public readonly mode: 'dc' | 'ac',
    public readonly frequencies: number[],
    public readonly entries: SensitivityEntry[],
  ) {}
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
 * Result of a single parametric step.
 * Contains the same result fields as a non-stepped simulation.
 */
export interface StepResult {
  /** Name of the swept parameter or device */
  paramName: string;
  /** Value of the parameter for this step */
  paramValue: number;
  /** DC operating point result (from .op) */
  dc?: DCResult;
  /** DC sweep result (from .dc) */
  dcSweep?: DCSweepResult;
  /** Transient analysis result (from .tran) */
  transient?: TransientResult;
  /** AC small-signal analysis result (from .ac) */
  ac?: ACResult;
  /** DC small-signal transfer function (from .tf) */
  transferFunction?: TransferFunctionResult;
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
  /** Resistor-noise spectral result (from `.noise`) */
  noise?: NoiseResult;
  /** Bounded ideal-linear harmonic or intermodulation result (from `.disto`). */
  distortion?: DistortionResult;
  /** DC small-signal transfer function (from `.tf`) */
  transferFunction?: TransferFunctionResult;
  /** Finite poles and zeros (in rad/s) from `.pz`. */
  poleZero?: PoleZeroResult;
  /** Primary-value sensitivities from the bounded `.sens` slice. */
  sensitivity?: SensitivityResult;
  /** Parametric sweep results (from .step). When present, top-level result fields are empty. */
  steps?: StepResult[];
  /** Warnings collected during simulation */
  warnings: SimulationWarning[];
  /** Native-solver convergence counters. External adapters may omit them. */
  convergence?: ConvergenceTelemetry;
}
