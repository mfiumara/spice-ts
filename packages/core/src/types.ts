/** Node identifier — string name from netlist (e.g., '1', 'out', '0' for ground) */
export type NodeName = string;

/** Ground node is always '0' */
export const GROUND_NODE = '0';

/** Analysis command types */
export type AnalysisType = 'op' | 'dc' | 'tran' | 'ac';

/** DC analysis command */
export interface DCAnalysis {
  type: 'op';
}

/** DC sweep analysis command */
export interface DCSweepAnalysis {
  type: 'dc';
  source: string;
  start: number;
  stop: number;
  step: number;
}

/** Transient analysis command */
export interface TransientAnalysis {
  type: 'tran';
  timestep: number;
  stopTime: number;
  startTime?: number;
  maxTimestep?: number;
}

/** AC analysis command */
export interface ACAnalysis {
  type: 'ac';
  variation: 'dec' | 'oct' | 'lin';
  points: number;
  startFreq: number;
  stopFreq: number;
}

export type AnalysisCommand = DCAnalysis | DCSweepAnalysis | TransientAnalysis | ACAnalysis;

/** Integration methods for transient analysis */
export type IntegrationMethod = 'euler' | 'trapezoidal';

/** Simulation options with SPICE-convention defaults */
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

/** A single transient timestep result */
export interface TransientStep {
  time: number;
  voltages: Map<string, number>;
  currents: Map<string, number>;
}

/** A single AC frequency point result */
export interface ACPoint {
  frequency: number;
  voltages: Map<string, { magnitude: number; phase: number }>;
  currents: Map<string, { magnitude: number; phase: number }>;
}

/** Device model parameter set parsed from .model card */
export interface ModelParams {
  name: string;
  type: string;
  params: Record<string, number>;
}

/** Source waveform types */
export interface DCSource {
  type: 'dc';
  value: number;
}

export interface PulseSource {
  type: 'pulse';
  v1: number;
  v2: number;
  delay: number;
  rise: number;
  fall: number;
  width: number;
  period: number;
}

export interface SinSource {
  type: 'sin';
  offset: number;
  amplitude: number;
  frequency: number;
  delay?: number;
  damping?: number;
  phase?: number;
}

export interface ACSource {
  type: 'ac';
  magnitude: number;
  phase: number;
}

export type SourceWaveform = DCSource | PulseSource | SinSource | ACSource;

/** Warning collected during simulation */
export interface SimulationWarning {
  type: string;
  message: string;
  node?: string;
}
