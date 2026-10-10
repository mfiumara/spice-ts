import type {
  AcResultV1,
  AnalysisResultV1,
  AnalysisV1,
  CircuitComponentV1,
  CircuitModelV1,
  ComplexPolarV1,
  DcResultV1,
  JsonObject,
  SimulationOptionsV1,
  SimulationRequestV1,
  SimulationResultV1,
  SpiceApiErrorV1,
  SpiceTsCircuitDocumentV1,
  StepCoordinateV1,
  SubcircuitV1,
  TransientResultV1,
} from './types.js';
import { Circuit } from '../circuit.js';
import {
  ConvergenceError,
  CycleError,
  InvalidCircuitError,
  ParseError,
  SingularMatrixError,
  SpiceError,
  TimestepTooSmallError,
} from '../errors.js';
import { parseTitlelessAsync } from '../parser/index.js';
import type { ACResult, DCSweepResult, DCResult, SimulationResult, StepResult, TransientResult } from '../results.js';
import { simulate } from '../simulate.js';
import type { AnalysisCommand, SimulationOptions, SourceWaveform } from '../types.js';

const MAX_DETAIL_NAMES = 32;

/** Execute a protocol-v1 request through the existing core simulator. */
export async function simulateProtocolV1(request: SimulationRequestV1): Promise<SimulationResultV1> {
  const circuit = await requestCircuit(request);
  const analyses = [...circuit.analyses] as AnalysisCommand[];
  const options = coreOptions(request.options);
  const serialized: AnalysisResultV1[] = [];

  for (let analysisIndex = 0; analysisIndex < analyses.length; analysisIndex++) {
    const analysis = analyses[analysisIndex]!;
    circuit.analyses.splice(0, circuit.analyses.length, analysis);
    const compiled = circuit.compile();
    const result = await simulate(circuit, options);
    appendAnalysisResult(serialized, result, analysis, analysisIndex, compiled.nodeNames, compiled.branchNames, circuit);
  }

  circuit.analyses.splice(0, circuit.analyses.length, ...analyses);
  return { status: 'complete', analyses: serialized };
}

/** Convert an existing typed core error to its stable protocol-v1 representation. */
export function mapProtocolErrorV1(error: unknown): SpiceApiErrorV1 {
  if (error instanceof ParseError) {
    return apiError('PARSE_ERROR', error, 'parse', { line: error.line, context: error.context });
  }
  if (error instanceof TimestepTooSmallError) {
    return apiError('TIMESTEP_TOO_SMALL', error, 'solve', {
      ...convergenceDetails(error),
      timestep: error.timestep,
    });
  }
  if (error instanceof SingularMatrixError) {
    const details: JsonObject = {
      involvedNodes: error.involvedNodes.slice(0, MAX_DETAIL_NAMES),
      involvedBranches: error.involvedBranches.slice(0, MAX_DETAIL_NAMES),
    };
    if (error.pivotIndex !== undefined) details.pivotIndex = error.pivotIndex;
    return apiError('SINGULAR_MATRIX', error, 'solve', details);
  }
  if (error instanceof ConvergenceError) {
    return apiError('CONVERGENCE_FAILED', error, 'solve', convergenceDetails(error));
  }
  if (error instanceof CycleError) {
    return apiError('INVALID_CIRCUIT', error, 'compile', { chain: error.chain.slice(0, MAX_DETAIL_NAMES) });
  }
  if (error instanceof InvalidCircuitError) {
    return apiError('INVALID_CIRCUIT', error, 'compile', {});
  }
  if (error instanceof SpiceError) {
    return {
      code: 'INTERNAL_ERROR', message: 'Internal simulation error', retryable: false,
      phase: 'solve', details: {},
    };
  }
  return {
    code: 'INTERNAL_ERROR', message: 'Internal simulation error', retryable: false,
    phase: 'solve', details: {},
  };
}

async function requestCircuit(request: SimulationRequestV1): Promise<Circuit> {
  switch (request.input.format) {
    case 'spice': {
      const files = request.input.virtualFiles ?? {};
      return parseTitlelessAsync(request.input.source, async path => {
        const source = files[path];
        if (source === undefined) throw new ParseError(`Virtual include '${path}' was not provided`, 0, path);
        return source;
      });
    }
    case 'spice-ts':
      return circuitFromDocument(request.input.document);
    case 'circuit-json':
      throw new InvalidCircuitError('circuit-json conversion is owned by @spice-ts/circuit-json and is unavailable in core');
  }
}

function coreOptions(options?: SimulationOptionsV1): SimulationOptions {
  const backend = options?.backend ?? 'spice-ts-js';
  if (backend === 'spice-ts-wasm') {
    throw new InvalidCircuitError("Protocol backend 'spice-ts-wasm' is not available");
  }
  return {
    simulator: backend === 'spice-ts-js' ? 'spice-ts' : 'ngspice-wasm',
    abstol: options?.abstol,
    vntol: options?.vntol,
    reltol: options?.reltol,
    maxIterations: options?.maxIterations,
    maxTransientIterations: options?.maxTransientIterations,
    maxTimestep: options?.maxTimestep,
    integrationMethod: options?.integrationMethod,
    trtol: options?.trtol,
    gmin: options?.gmin,
  };
}

function circuitFromDocument(document: SpiceTsCircuitDocumentV1): Circuit {
  const circuit = new Circuit();
  for (const model of document.models) circuit.addModel(coreModel(model));
  for (const subcircuit of document.subcircuits) circuit.addSubcircuit(coreSubcircuit(subcircuit));
  for (const component of document.circuit.components) addComponent(circuit, component);
  for (const analysis of document.analyses) addAnalysis(circuit, analysis);
  return circuit;
}

function coreModel(model: CircuitModelV1): { name: string; type: string; params: Record<string, number> } {
  return { name: model.name, type: model.type, params: numberParams(model.params) };
}

function coreSubcircuit(subcircuit: SubcircuitV1): { name: string; ports: string[]; params: Record<string, number>; body: string[] } {
  return {
    name: subcircuit.name,
    ports: [...subcircuit.ports],
    params: {},
    body: [
      ...(subcircuit.models ?? []).map(modelLine),
      ...subcircuit.components.map(componentLine),
    ],
  };
}

function addAnalysis(circuit: Circuit, analysis: AnalysisV1): void {
  switch (analysis.type) {
    case 'op': circuit.addAnalysis('op'); break;
    case 'dc': circuit.addAnalysis('dc', analysis); break;
    case 'tran': circuit.addAnalysis('tran', analysis); break;
    case 'ac': circuit.addAnalysis('ac', analysis); break;
  }
}

function addComponent(circuit: Circuit, component: CircuitComponentV1): void {
  const p = component.params;
  const nodes = component.ports.map(port => port.net);
  const named = (name: string, fallback: number): string => component.ports.find(port => port.name === name)?.net ?? nodes[fallback]!;
  const model = component.model ?? stringParam(p, 'modelName');
  switch (component.type.toUpperCase()) {
    case 'R': circuit.addResistor(component.name, named('p', 0), named('n', 1), numberParam(p, 'resistance')); break;
    case 'C': circuit.addCapacitor(component.name, named('p', 0), named('n', 1), optionalNumber(p, 'capacitance'), model, numberParamsExcept(p, ['capacitance', 'modelName'])); break;
    case 'L': circuit.addInductor(component.name, named('p', 0), named('n', 1), optionalNumber(p, 'inductance'), model, numberParamsExcept(p, ['inductance', 'modelName'])); break;
    case 'V': circuit.addVoltageSource(component.name, named('p', 0), named('n', 1), waveform(p)); break;
    case 'I': circuit.addCurrentSource(component.name, named('p', 0), named('n', 1), waveform(p)); break;
    case 'D': circuit.addDiode(component.name, named('anode', 0), named('cathode', 1), model); break;
    case 'Q': circuit.addBJT(component.name, named('collector', 0), named('base', 1), named('emitter', 2), required(model, 'model')); break;
    case 'M': circuit.addMOSFET(component.name, named('drain', 0), named('gate', 1), named('source', 2), required(model, 'model'), numberParamsExcept(p, ['modelName', 'channelType']), component.ports.find(port => port.name === 'bulk')?.net); break;
    case 'E': circuit.addVCVS(component.name, named('outP', 2), named('outN', 3), named('ctrlP', 0), named('ctrlN', 1), numberParam(p, 'gain')); break;
    case 'G': circuit.addVCCS(component.name, named('outP', 2), named('outN', 3), named('ctrlP', 0), named('ctrlN', 1), numberParam(p, 'gm')); break;
    case 'H': circuit.addCCVS(component.name, named('outP', 0), named('outN', 1), required(stringParam(p, 'controlSource'), 'controlSource'), numberParam(p, 'gain')); break;
    case 'F': circuit.addCCCS(component.name, named('outP', 0), named('outN', 1), required(stringParam(p, 'controlSource'), 'controlSource'), numberParam(p, 'gain')); break;
    case 'X': circuit.addSubcircuitInstance(component.name, nodes, required(component.subcircuit ?? stringParam(p, 'subcircuit'), 'subcircuit'), numberParamsExcept(p, ['subcircuit'])); break;
    default: throw new InvalidCircuitError(`Unsupported native component type '${component.type}'`);
  }
}

function appendAnalysisResult(
  target: AnalysisResultV1[],
  result: SimulationResult,
  analysis: AnalysisCommand,
  analysisIndex: number,
  nodeNames: string[],
  branchNames: string[],
  circuit: Circuit,
): void {
  if (result.steps) {
    result.steps.forEach((step, index) => target.push(serializeOne(step, analysis, analysisIndex, nodeNames, branchNames, circuit, {
      index, parameter: step.paramName, value: step.paramValue,
    })));
  } else {
    target.push(serializeOne(result, analysis, analysisIndex, nodeNames, branchNames, circuit));
  }
}

function serializeOne(
  result: SimulationResult | StepResult,
  analysis: AnalysisCommand,
  analysisIndex: number,
  nodeNames: string[],
  branchNames: string[],
  circuit: Circuit,
  step?: StepCoordinateV1,
): AnalysisResultV1 {
  switch (analysis.type) {
    case 'op': return serializeOp(required(result.dc, 'operating-point result'), analysisIndex, nodeNames, branchNames, step);
    case 'dc': return serializeDc(required(result.dcSweep, 'DC-sweep result'), analysis, analysisIndex, nodeNames, branchNames, circuit, step);
    case 'tran': return serializeTransient(required(result.transient, 'transient result'), analysisIndex, nodeNames, branchNames, step);
    case 'ac': return serializeAc(required(result.ac, 'AC result'), analysisIndex, nodeNames, branchNames, step);
  }
}

function serializeOp(result: DCResult, analysisIndex: number, nodes: string[], branches: string[], step?: StepCoordinateV1): AnalysisResultV1 {
  return withStep({
    type: 'op', analysisIndex,
    voltagesV: sortedRecord(nodes, name => result.voltage(name)),
    currentsA: sortedRecord(branches, name => result.current(name)),
  }, step);
}

function serializeDc(result: DCSweepResult, analysis: Extract<AnalysisCommand, { type: 'dc' }>, analysisIndex: number, nodes: string[], branches: string[], circuit: Circuit, step?: StepCoordinateV1): DcResultV1 {
  const source = circuit.toIR().components.find(component => component.name === analysis.source);
  return withStep({
    type: 'dc', analysisIndex,
    axis: { name: analysis.source, unit: source?.type === 'I' ? 'A' : 'V', values: Array.from(result.sweepValues) },
    voltagesV: sortedRecord(nodes, name => Array.from(result.voltage(name))),
    currentsA: sortedRecord(branches, name => Array.from(result.current(name))),
  }, step);
}

function serializeTransient(result: TransientResult, analysisIndex: number, nodes: string[], branches: string[], step?: StepCoordinateV1): TransientResultV1 {
  return withStep({
    type: 'tran', analysisIndex, timeS: [...result.time],
    voltagesV: sortedRecord(nodes, name => [...result.voltage(name)]),
    currentsA: sortedRecord(branches, name => [...result.current(name)]),
  }, step);
}

function serializeAc(result: ACResult, analysisIndex: number, nodes: string[], branches: string[], step?: StepCoordinateV1): AcResultV1 {
  const polar = (values: { magnitude: number; phase: number }[]): ComplexPolarV1[] => values.map(value => ({
    magnitude: value.magnitude, phaseDegrees: value.phase,
  }));
  return withStep({
    type: 'ac', analysisIndex, frequencyHz: [...result.frequencies],
    voltagePhasors: sortedRecord(nodes, name => polar(result.voltage(name))),
    currentPhasors: sortedRecord(branches, name => polar(result.current(name))),
  }, step);
}

function sortedRecord<T>(names: string[], value: (name: string) => T): Record<string, T> {
  const result: Record<string, T> = {};
  for (const name of [...names].sort(compareCodePoints)) result[name] = value(name);
  return result;
}

function compareCodePoints(left: string, right: string): number {
  const a = Array.from(left, character => character.codePointAt(0)!);
  const b = Array.from(right, character => character.codePointAt(0)!);
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    if (a[index] !== b[index]) return a[index]! - b[index]!;
  }
  return a.length - b.length;
}

function withStep<T extends AnalysisResultV1>(result: T, step?: StepCoordinateV1): T {
  return step ? { ...result, step } : result;
}

function convergenceDetails(error: ConvergenceError): JsonObject {
  const details: JsonObject = {
    kind: error.kind,
    oscillatingNodes: error.oscillatingNodes.slice(0, MAX_DETAIL_NAMES),
    solutionSummary: solutionSummary(error.lastSolution, error.prevSolution),
  };
  if (error.time !== undefined) details.time = error.time;
  if (error.dt !== undefined) details.dt = error.dt;
  if (error.gmin !== undefined) details.gmin = error.gmin;
  return details;
}

function solutionSummary(last: Float64Array, previous: Float64Array): JsonObject {
  const extrema = (values: Float64Array): [number | null, number | null] => values.length === 0
    ? [null, null]
    : [Math.min(...values), Math.max(...values)];
  const [lastMinimum, lastMaximum] = extrema(last);
  const [previousMinimum, previousMaximum] = extrema(previous);
  let changedCount = Math.abs(last.length - previous.length);
  for (let index = 0; index < Math.min(last.length, previous.length); index++) {
    if (last[index] !== previous[index]) changedCount++;
  }
  return { lastMinimum, lastMaximum, previousMinimum, previousMaximum, changedCount };
}

function apiError(code: SpiceApiErrorV1['code'], error: Error, phase: SpiceApiErrorV1['phase'], details: JsonObject): SpiceApiErrorV1 {
  return { code, message: wireMessage(error.message), retryable: false, phase, details };
}

function wireMessage(message: string): string {
  return message.replace(/\bspice-ts\b(?!-(?:js|wasm))/g, 'spice-ts-js');
}

function numberParams(params: JsonObject): Record<string, number> {
  return numberParamsExcept(params, []);
}

function numberParamsExcept(params: JsonObject, excluded: string[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(params)) {
    if (!excluded.includes(key) && typeof value === 'number') result[key] = value;
  }
  return result;
}

function numberParam(params: JsonObject, name: string): number {
  const value = params[name];
  if (typeof value !== 'number') throw new InvalidCircuitError(`Native component parameter '${name}' must be a number`);
  return value;
}

function optionalNumber(params: JsonObject, name: string): number | undefined {
  const value = params[name];
  if (value === undefined) return undefined;
  if (typeof value !== 'number') throw new InvalidCircuitError(`Native component parameter '${name}' must be a number`);
  return value;
}

function stringParam(params: JsonObject, name: string): string | undefined {
  const value = params[name];
  return typeof value === 'string' ? value : undefined;
}

function required<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new InvalidCircuitError(`Missing ${name}`);
  return value;
}

function waveform(params: JsonObject): Partial<SourceWaveform> & { dc?: number } {
  const kind = stringParam(params, 'waveform') ?? 'dc';
  switch (kind) {
    case 'dc': return { dc: numberParam(params, 'dc') };
    case 'ac': return { type: 'ac', dc: optionalNumber(params, 'dc'), magnitude: optionalNumber(params, 'magnitude') ?? 1, phase: optionalNumber(params, 'phase') ?? 0 };
    case 'sin': return { type: 'sin', offset: numberParam(params, 'offset'), amplitude: numberParam(params, 'amplitude'), frequency: numberParam(params, 'frequency'), delay: optionalNumber(params, 'delay'), damping: optionalNumber(params, 'damping'), phase: optionalNumber(params, 'phase') };
    case 'pulse': return { type: 'pulse', v1: numberParam(params, 'v1'), v2: numberParam(params, 'v2'), delay: numberParam(params, 'delay'), rise: numberParam(params, 'rise'), fall: numberParam(params, 'fall'), width: numberParam(params, 'width'), period: numberParam(params, 'period') };
    case 'pwl': {
      const points = params.points;
      if (!Array.isArray(points)) throw new InvalidCircuitError("Native PWL parameter 'points' must be an array");
      return { type: 'pwl', points: points.map((point, index) => {
        if (typeof point !== 'object' || point === null || Array.isArray(point)) throw new InvalidCircuitError(`Native PWL point ${index} is invalid`);
        const entry = point as JsonObject;
        return { time: numberParam(entry, 'time'), value: numberParam(entry, 'value') };
      }) };
    }
    default: throw new InvalidCircuitError(`Unsupported native source waveform '${kind}'`);
  }
}

function modelLine(model: CircuitModelV1): string {
  const params = Object.entries(numberParams(model.params)).map(([key, value]) => `${key}=${value}`).join(' ');
  return `.model ${model.name} ${model.type}${params ? ` (${params})` : ''}`;
}

function componentLine(component: CircuitComponentV1): string {
  const circuit = new Circuit();
  addComponent(circuit, component);
  return circuit.toNetlist().split('\n').find(line => line.startsWith(component.name + ' '))
    ?? (() => { throw new InvalidCircuitError(`Unable to serialize subcircuit component '${component.name}'`); })();
}
