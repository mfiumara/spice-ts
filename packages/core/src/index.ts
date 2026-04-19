export { simulate, simulateStream, simulateStepStream } from './simulate.js';
export { createTransientSim } from './analysis/transient-driver.js';
export type { TransientSim, TransientSimOptions } from './analysis/transient-driver.js';
export { parse, parseAsync } from './parser/index.js';
export { preprocess } from './parser/preprocessor.js';
export { Circuit } from './circuit.js';
export type { CompiledCircuit } from './circuit.js';
export { DCResult, TransientResult, ACResult, DCSweepResult } from './results.js';
export type { SimulationResult, StepResult } from './results.js';
export type {
  SimulationOptions,
  TransientStep,
  ACPoint,
  AnalysisCommand,
  SourceWaveform,
  ModelParams,
  SubcktDefinition,
  IncludeResolver,
  StepAnalysis,
  StepSweepMode,
  StepStreamEvent,
} from './types.js';
export type { DeviceModel, StampContext } from './devices/device.js';
export type { CircuitIR, IRComponent, IRPort, ComponentType } from './ir/types.js';
export { VCVS } from './devices/vcvs.js';
export { VCCS } from './devices/vccs.js';
export { CCVS } from './devices/ccvs.js';
export { CCCS } from './devices/cccs.js';
export {
  SpiceError,
  ParseError,
  InvalidCircuitError,
  SingularMatrixError,
  ConvergenceError,
  TimestepTooSmallError,
  CycleError,
} from './errors.js';
export type { ConvergenceFailureKind } from './errors.js';
