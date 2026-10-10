import { parseTitleless, type CompiledCircuit, type StampContext } from '@spice-ts/core';
import type {
  JsonObject,
  SimulationRequestV1,
  SimulationResultV1,
  SpiceApiErrorV1,
} from '@spice-ts/protocol';
import {
  assertNumericWasmAbi,
  NUMERIC_WASM_LIMITS,
  type NumericWasmExports,
} from './numeric-abi.js';

export interface NumericValidationResultV1 {
  status: 'valid';
  nodeCount: number;
  branchCount: number;
  analysisCount: number;
}

export class NumericBackendError extends Error {
  constructor(readonly error: SpiceApiErrorV1) {
    super(error.message);
    this.name = 'NumericBackendError';
  }
}

interface PreparedLinearOp {
  compiled: CompiledCircuit;
  order: number;
  analysis: Extract<CompiledCircuit['analyses'][number], { type: 'op' | 'tran' }>;
}

export function validateLinearOpWasmV1(request: SimulationRequestV1): NumericValidationResultV1 {
  const { compiled } = prepare(request);
  return {
    status: 'valid',
    nodeCount: compiled.nodeCount,
    branchCount: compiled.branchCount,
    analysisCount: compiled.analyses.length,
  };
}

export async function simulateLinearOpWasmV1(
  request: SimulationRequestV1,
  wasmBytes: Uint8Array,
): Promise<SimulationResultV1> {
  const { compiled, order, analysis } = prepare(request);
  const instantiated = await WebAssembly.instantiate(wasmBytes.slice().buffer as ArrayBuffer);
  const exports = instantiated.instance.exports as NumericWasmExports;
  assertNumericWasmAbi(exports);

  if (analysis.type === 'tran') {
    return simulateTransient(request, compiled, order, analysis, exports);
  }

  const { matrix, rhs } = stampSystem(compiled, order, 0, true, new Float64Array(order));
  addGmin(matrix, compiled.nodeCount, order, request.options?.gmin ?? 0);
  const solution = solve(exports, order, matrix, rhs);

  return {
    status: 'complete',
    analyses: [{
      type: 'op',
      analysisIndex: 0,
      voltagesV: Object.fromEntries(compiled.nodeNames.map((name, index) => [name, solution[index]! ])),
      currentsA: Object.fromEntries(compiled.branchNames.map((name, index) => [
        name,
        solution[compiled.nodeCount + index]!,
      ])),
    }],
  };
}

function stampSystem(
  compiled: CompiledCircuit,
  order: number,
  time: number,
  useDcSourceValue: boolean,
  solution: Float64Array,
): { matrix: Float64Array; capacitance: Float64Array; rhs: Float64Array } {
  const matrix = new Float64Array(order * order);
  const capacitance = new Float64Array(order * order);
  const rhs = new Float64Array(order);
  const context: StampContext = {
    stampG(row, column, value) { matrix[row * order + column] += value; },
    stampB(row, value) { rhs[row] += value; },
    stampC(row, column, value) { capacitance[row * order + column] += value; },
    getVoltage(node) { return node < 0 ? 0 : solution[node]!; },
    getCurrent(branch) { return solution[compiled.nodeCount + branch]!; },
    time,
    dt: 0,
    numNodes: compiled.nodeCount,
    sourceScale: 1,
    useDcSourceValue,
  };
  for (const device of compiled.devices) {
    device.stamp(context);
    device.stampDynamic?.(context);
  }
  return { matrix, capacitance, rhs };
}

function solve(
  exports: NumericWasmExports,
  order: number,
  matrix: Float64Array,
  rhs: Float64Array,
): Float64Array {
  const heapBase = Number(exports.__heap_base.value);
  const matrixPointer = align8(heapBase);
  const rhsPointer = matrixPointer + matrix.byteLength;
  if (rhsPointer + rhs.byteLength > exports.memory.buffer.byteLength) {
    throw resourceLimit('numericWasmMemoryBytes', exports.memory.buffer.byteLength, rhsPointer + rhs.byteLength);
  }
  new Float64Array(exports.memory.buffer, matrixPointer, matrix.length).set(matrix);
  new Float64Array(exports.memory.buffer, rhsPointer, rhs.length).set(rhs);
  const status = exports.solve_f64(order, matrixPointer, rhsPointer);
  if (status === 1) {
    throw numericError('SINGULAR_MATRIX', 'The bounded WebAssembly matrix is singular', 'solve', { order });
  }
  if (status !== 0) {
    throw numericError('INVALID_CIRCUIT', 'The bounded WebAssembly solver rejected non-finite numeric data', 'solve', { order, status });
  }
  const solution = new Float64Array(exports.memory.buffer, rhsPointer, order).slice();
  return solution;
}

function simulateTransient(
  request: SimulationRequestV1,
  compiled: CompiledCircuit,
  order: number,
  analysis: Extract<CompiledCircuit['analyses'][number], { type: 'tran' }>,
  exports: NumericWasmExports,
): SimulationResultV1 {
  const pointCount = Math.ceil(analysis.stopTime / analysis.timestep) + 1;
  const configuredPointLimit = Math.min(
    NUMERIC_WASM_LIMITS.maxResultPoints,
    request.options?.limits?.maxResultPoints ?? Infinity,
  );
  if (pointCount > configuredPointLimit) {
    throw resourceLimit('maxResultPoints', configuredPointLimit, pointCount);
  }

  const gmin = request.options?.gmin ?? 0;
  const initial = stampSystem(compiled, order, 0, true, new Float64Array(order));
  addGmin(initial.matrix, compiled.nodeCount, order, gmin);
  let solution = solve(exports, order, initial.matrix, initial.rhs);
  let previousRhs = initial.rhs;
  let previousTime = 0;
  const timeS = [0];
  const voltagesV = Object.fromEntries(compiled.nodeNames.map((name, index) => [name, [solution[index]!]]));
  const currentsA = Object.fromEntries(compiled.branchNames.map((name, index) => [
    name,
    [solution[compiled.nodeCount + index]!],
  ]));

  for (let point = 1; point < pointCount; point++) {
    const time = Math.min(point * analysis.timestep, analysis.stopTime);
    const dt = time - previousTime;
    const stamped = stampSystem(compiled, order, time, false, solution);
    addGmin(stamped.matrix, compiled.nodeCount, order, gmin);
    const system = new Float64Array(stamped.matrix.length);
    const rhs = new Float64Array(order);
    const dynamicScale = 2 / dt;
    for (let row = 0; row < order; row++) {
      let history = 0;
      for (let column = 0; column < order; column++) {
        const index = row * order + column;
        system[index] = stamped.matrix[index]! + dynamicScale * stamped.capacitance[index]!;
        history += (dynamicScale * stamped.capacitance[index]! - stamped.matrix[index]!) * solution[column]!;
      }
      rhs[row] = stamped.rhs[row]! + previousRhs[row]! + history;
    }
    solution = solve(exports, order, system, rhs);
    previousRhs = stamped.rhs;
    previousTime = time;
    timeS.push(time);
    compiled.nodeNames.forEach((name, index) => voltagesV[name]!.push(solution[index]!));
    compiled.branchNames.forEach((name, index) => currentsA[name]!.push(solution[compiled.nodeCount + index]!));
  }

  return {
    status: 'complete',
    analyses: [{ type: 'tran', analysisIndex: 0, timeS, voltagesV, currentsA }],
  };
}

function addGmin(matrix: Float64Array, nodeCount: number, order: number, gmin: number): void {
  for (let node = 0; node < nodeCount; node++) matrix[node * order + node] += gmin;
}

function prepare(request: SimulationRequestV1): PreparedLinearOp {
  if (request.input.format !== 'spice') unsupported('input-format', 'Only SPICE text input is supported');
  if (request.input.virtualFiles && Object.keys(request.input.virtualFiles).length > 0) {
    unsupported('virtual-files', 'Virtual files are not supported');
  }
  const source = request.input.source;
  const sourceBytes = new TextEncoder().encode(source).byteLength;
  const sourceLimit = Math.min(NUMERIC_WASM_LIMITS.maxSourceBytes, request.options?.limits?.maxSourceBytes ?? Infinity);
  if (sourceBytes > sourceLimit) throw resourceLimit('maxSourceBytes', sourceLimit, sourceBytes);

  const cards = source.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('*'));
  const components = cards.filter(line => !line.startsWith('.'));
  const componentLimit = Math.min(NUMERIC_WASM_LIMITS.maxComponents, request.options?.limits?.maxComponents ?? Infinity);
  if (components.length > componentLimit) throw resourceLimit('maxComponents', componentLimit, components.length);
  const analyses = cards.filter(line => /^\.(op|dc|tran|ac)\b/i.test(line));
  const analysisLimit = Math.min(1, request.options?.limits?.maxAnalyses ?? Infinity);
  if (analyses.length > analysisLimit) throw resourceLimit('maxAnalyses', analysisLimit, analyses.length);
  if (analyses.length !== 1 || !/^\.(?:op|tran)(?:\s|$)/i.test(analyses[0])) {
    unsupported('analysis', 'Exactly one .op or .tran analysis is supported');
  }

  const transientCard = analyses[0]!.match(/^\.tran\s+(.+)$/i);
  if (transientCard) validateTransientControls(transientCard[1]!, request);

  for (const card of cards) {
    if (/^\.(?:op|tran|end)(?:\s|$)/i.test(card)) continue;
    const type = card[0]?.toUpperCase();
    if (type !== 'R' && type !== 'C' && type !== 'I' && type !== 'V') {
      unsupported('device-or-directive', `Unsupported bounded numeric card '${card.split(/\s+/)[0] ?? ''}'`);
    }
    const tokens = card.split(/\s+/);
    if (type === 'R' || type === 'C') {
      if (tokens.length !== 4) {
        unsupported(type === 'R' ? 'resistor-form' : 'capacitor-form',
          `${type === 'R' ? 'Resistors' : 'Capacitors'} must use name positive negative value`);
      }
    } else {
      const dc = tokens.length === 5 && tokens[3]?.toUpperCase() === 'DC';
      const pulse = /\bPULSE\s*\(/i.test(card);
      if (tokens.length !== 4 && !dc && !(transientCard && pulse)) {
        unsupported('source-waveform', 'Sources must use a constant or DC value');
      }
    }
  }

  const circuit = parseTitleless(source);
  const compiled = circuit.compile();
  if (compiled.steps.length > 0) unsupported('step', 'Stepped analysis is not supported');
  if (compiled.poleZeroAnalyses.length > 0 || compiled.analyses.length !== 1
    || !['op', 'tran'].includes(compiled.analyses[0]?.type ?? '')) {
    unsupported('analysis', 'Exactly one unstepped .op or .tran analysis is supported');
  }
  if (compiled.devices.some(device => !['R', 'C', 'I', 'V'].includes(device.name[0]?.toUpperCase() ?? ''))) {
    unsupported('device', 'Only R, C, I, and V devices are supported');
  }
  const order = compiled.nodeCount + compiled.branchCount;
  if (order < 1) throw numericError('INVALID_CIRCUIT', 'The circuit has no numeric unknowns', 'compile');
  if (order > NUMERIC_WASM_LIMITS.maxSystemOrder) {
    throw resourceLimit('maxSystemOrder', NUMERIC_WASM_LIMITS.maxSystemOrder, order);
  }
  return {
    compiled,
    order,
    analysis: compiled.analyses[0] as PreparedLinearOp['analysis'],
  };
}

function validateTransientControls(card: string, request: SimulationRequestV1): void {
  const tokens = card.trim().split(/\s+/);
  if (tokens.some(token => token.toUpperCase() === 'UIC')) {
    unsupported('tran-uic', 'Transient UIC is not supported');
  }
  if (tokens.length >= 4) unsupported('tran-max-timestep', 'Transient maximum timestep is not supported');
  if (tokens.length >= 3) unsupported('tran-start-time', 'Transient start time is not supported');
  if (request.options?.integrationMethod && request.options.integrationMethod !== 'trapezoidal') {
    unsupported('integration-method', 'Only trapezoidal transient integration is supported');
  }
  if (request.options?.maxTimestep !== undefined) {
    unsupported('max-timestep', 'Transient maximum timestep is not supported');
  }
  if (request.options?.trtol !== undefined) {
    unsupported('trtol', 'Transient LTE controls are not supported');
  }
}

function align8(value: number): number {
  return (value + 7) & ~7;
}

function unsupported(feature: string, message: string): never {
  throw numericError('UNSUPPORTED_FEATURE', message, 'validation', { backend: 'spice-ts-wasm', feature });
}

function resourceLimit(limit: string, configured: number, observed: number): NumericBackendError {
  return numericError('RESOURCE_LIMIT', `Resource limit '${limit}' exceeded`, 'validation', {
    limit, configured, observed,
  });
}

function numericError(
  code: SpiceApiErrorV1['code'],
  message: string,
  phase: SpiceApiErrorV1['phase'],
  details: JsonObject = {},
): NumericBackendError {
  return new NumericBackendError({ code, message, retryable: false, phase, details });
}
