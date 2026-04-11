export { simulate, simulateStream } from './simulate.js';
export { parse, parseAsync } from './parser/index.js';
export { preprocess } from './parser/preprocessor.js';
export { Circuit } from './circuit.js';
export type { CompiledCircuit } from './circuit.js';
export { DCResult, TransientResult, ACResult, DCSweepResult } from './results.js';
export type { SimulationResult } from './results.js';
export type {
  SimulationOptions,
  TransientStep,
  ACPoint,
  AnalysisCommand,
  SourceWaveform,
  ModelParams,
  SubcktDefinition,
  IncludeResolver,
} from './types.js';
export type { DeviceModel, StampContext } from './devices/device.js';
export {
  SpiceError,
  ParseError,
  InvalidCircuitError,
  SingularMatrixError,
  ConvergenceError,
  TimestepTooSmallError,
  CycleError,
} from './errors.js';
