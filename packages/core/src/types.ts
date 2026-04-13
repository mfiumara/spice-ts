/** Node identifier — string name from netlist (e.g., '1', 'out', '0' for ground) */
export type NodeName = string;

/** Ground node is always '0' */
export const GROUND_NODE = '0';

/** Supported analysis command types. */
export type AnalysisType = 'op' | 'dc' | 'tran' | 'ac';

/** DC operating point analysis (`.op`). */
export interface DCAnalysis {
  type: 'op';
}

/** DC sweep analysis (`.dc`). Sweeps a source over a range. */
export interface DCSweepAnalysis {
  type: 'dc';
  /** Name of the source to sweep (e.g., `'V1'`) */
  source: string;
  /** Start value of the sweep (volts or amps) */
  start: number;
  /** Stop value of the sweep */
  stop: number;
  /** Step size between sweep points */
  step: number;
}

/** Transient analysis (`.tran`). Time-domain simulation. */
export interface TransientAnalysis {
  type: 'tran';
  /** Suggested timestep in seconds */
  timestep: number;
  /** Simulation end time in seconds */
  stopTime: number;
  /** Simulation start time in seconds (default: 0) */
  startTime?: number;
  /** Maximum allowed timestep in seconds */
  maxTimestep?: number;
}

/** AC small-signal analysis (`.ac`). Frequency sweep. */
export interface ACAnalysis {
  type: 'ac';
  /** Frequency sweep variation: `'dec'` (decades), `'oct'` (octaves), or `'lin'` (linear) */
  variation: 'dec' | 'oct' | 'lin';
  /** Number of points per decade/octave, or total for linear */
  points: number;
  /** Start frequency in Hz */
  startFreq: number;
  /** Stop frequency in Hz */
  stopFreq: number;
}

/** Union of all analysis command types. Discriminated on the `type` field. */
export type AnalysisCommand = DCAnalysis | DCSweepAnalysis | TransientAnalysis | ACAnalysis;

/** Integration methods for transient analysis */
export type IntegrationMethod = 'euler' | 'trapezoidal';

/**
 * Options for controlling simulation behavior.
 *
 * All fields are optional; SPICE-convention defaults are used when omitted.
 */
export interface SimulationOptions {
  /** Absolute current tolerance (A). Default: 1e-12 */
  abstol?: number;
  /** Absolute voltage tolerance (V). Default: 1e-6 */
  vntol?: number;
  /** Relative tolerance. Default: 1e-3 */
  reltol?: number;
  /** Max Newton-Raphson iterations (DC). Default: 100 */
  maxIterations?: number;
  /** Max Newton-Raphson iterations per transient step. Default: 50 */
  maxTransientIterations?: number;
  /** Maximum timestep for transient. Default: stopTime/50 */
  maxTimestep?: number;
  /** Integration method. Default: 'trapezoidal' */
  integrationMethod?: IntegrationMethod;
  /** Trapezoidal truncation error factor. Default: 7 */
  trtol?: number;
  /** Minimum conductance added to all node diagonals for gmin stepping. Default: 0 (disabled) */
  gmin?: number;
  /** Resolver for .include and .lib file directives */
  resolveInclude?: IncludeResolver;
}

/** Resolved options with all defaults filled in */
export interface ResolvedOptions {
  abstol: number;
  vntol: number;
  reltol: number;
  maxIterations: number;
  maxTransientIterations: number;
  maxTimestep: number;
  integrationMethod: IntegrationMethod;
  trtol: number;
  gmin: number;
}

export const DEFAULT_OPTIONS: ResolvedOptions = {
  abstol: 1e-12,
  vntol: 1e-6,
  reltol: 1e-3,
  maxIterations: 100,
  maxTransientIterations: 50,
  maxTimestep: Infinity,
  integrationMethod: 'trapezoidal',
  trtol: 7,
  gmin: 0,
};

export function resolveOptions(opts?: SimulationOptions, stopTime?: number): ResolvedOptions {
  return {
    abstol: opts?.abstol ?? DEFAULT_OPTIONS.abstol,
    vntol: opts?.vntol ?? DEFAULT_OPTIONS.vntol,
    reltol: opts?.reltol ?? DEFAULT_OPTIONS.reltol,
    maxIterations: opts?.maxIterations ?? DEFAULT_OPTIONS.maxIterations,
    maxTransientIterations: opts?.maxTransientIterations ?? DEFAULT_OPTIONS.maxTransientIterations,
    maxTimestep: opts?.maxTimestep ?? (stopTime ? stopTime / 50 : DEFAULT_OPTIONS.maxTimestep),
    integrationMethod: opts?.integrationMethod ?? DEFAULT_OPTIONS.integrationMethod,
    trtol: opts?.trtol ?? DEFAULT_OPTIONS.trtol,
    gmin: opts?.gmin ?? DEFAULT_OPTIONS.gmin,
  };
}

/**
 * A single transient simulation timestep, yielded by {@link simulateStream}.
 */
export interface TransientStep {
  /** Simulation time in seconds */
  time: number;
  /** Node voltages at this timestep (node name to volts) */
  voltages: Map<string, number>;
  /** Branch currents at this timestep (device name to amps) */
  currents: Map<string, number>;
}

/**
 * A single AC frequency point, yielded by {@link simulateStream}.
 */
export interface ACPoint {
  /** Frequency in Hz */
  frequency: number;
  /** Node voltage phasors (node name to magnitude/phase in degrees) */
  voltages: Map<string, { magnitude: number; phase: number }>;
  /** Branch current phasors (device name to magnitude/phase in degrees) */
  currents: Map<string, { magnitude: number; phase: number }>;
}

/**
 * Device model parameters parsed from a `.model` card.
 */
export interface ModelParams {
  /** Model name as declared in the netlist */
  name: string;
  /** Model type (e.g., `'NPN'`, `'PNP'`, `'NMOS'`, `'PMOS'`, `'D'`) */
  type: string;
  /** Key-value parameter map (e.g., `{ BF: 100, IS: 1e-14 }`) */
  params: Record<string, number>;
}

/** DC source waveform. Constant value. */
export interface DCSource {
  type: 'dc';
  /** DC value in volts (for voltage sources) or amps (for current sources) */
  value: number;
}

/** Pulse source waveform (PULSE). */
export interface PulseSource {
  type: 'pulse';
  /** Initial value */
  v1: number;
  /** Pulsed value */
  v2: number;
  /** Delay before first pulse in seconds */
  delay: number;
  /** Rise time in seconds */
  rise: number;
  /** Fall time in seconds */
  fall: number;
  /** Pulse width in seconds */
  width: number;
  /** Period in seconds */
  period: number;
}

/** Sinusoidal source waveform (SIN). */
export interface SinSource {
  type: 'sin';
  /** DC offset */
  offset: number;
  /** Peak amplitude */
  amplitude: number;
  /** Frequency in Hz */
  frequency: number;
  /** Delay before sine starts in seconds */
  delay?: number;
  /** Damping factor (1/s) */
  damping?: number;
  /** Phase offset in degrees */
  phase?: number;
}

/** AC small-signal source (AC). Used for `.ac` analysis excitation. */
export interface ACSource {
  type: 'ac';
  /** AC magnitude */
  magnitude: number;
  /** AC phase in degrees */
  phase: number;
}

/** Union of all source waveform types. Discriminated on the `type` field. */
export type SourceWaveform = DCSource | PulseSource | SinSource | ACSource;

/** Warning collected during simulation (non-fatal). */
export interface SimulationWarning {
  /** Warning category (e.g., `'convergence'`, `'topology'`) */
  type: string;
  /** Human-readable warning message */
  message: string;
  /** Related node name, if applicable */
  node?: string;
}

/**
 * Async function that resolves `.include` and `.lib` file paths to their contents.
 *
 * @param path - File path as it appears in the `.include` or `.lib` directive
 * @returns The file contents as a string
 */
export type IncludeResolver = (path: string) => Promise<string>;

/**
 * Subcircuit definition parsed from a `.subckt`/`.ends` block.
 */
export interface SubcktDefinition {
  /** Subcircuit name (case-insensitive) */
  name: string;
  /** Ordered list of port node names */
  ports: string[];
  /** Default parameter values (can be overridden per instance) */
  params: Record<string, number>;
  /** Raw netlist lines between `.subckt` and `.ends` */
  body: string[];
}

/** Sweep mode for .step directive */
export type StepSweepMode = 'lin' | 'dec' | 'oct' | 'list';

/** .step directive — parametric sweep configuration. */
export interface StepAnalysis {
  type: 'step';
  /** Device name (e.g., 'R1') or global param name to sweep */
  param: string;
  /** Sweep mode */
  sweepMode: StepSweepMode;
  /** Start value (lin/dec/oct) */
  start?: number;
  /** Stop value (lin/dec/oct) */
  stop?: number;
  /** Step increment (lin) */
  increment?: number;
  /** Points per decade or octave (dec/oct) */
  points?: number;
  /** Explicit list of values (list mode) */
  values?: number[];
}

/**
 * A single streaming event from a stepped simulation.
 * Wraps a TransientStep or ACPoint with step metadata.
 */
export interface StepStreamEvent {
  stepIndex: number;
  paramName: string;
  paramValue: number;
  point: TransientStep | ACPoint;
}
