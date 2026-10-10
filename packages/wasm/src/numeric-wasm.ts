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
  const { compiled, order } = prepare(request);
  const instantiated = await WebAssembly.instantiate(wasmBytes.slice().buffer as ArrayBuffer);
  const exports = instantiated.instance.exports as NumericWasmExports;
  assertNumericWasmAbi(exports);

  const matrix = new Float64Array(order * order);
  const rhs = new Float64Array(order);
  const zero = new Float64Array(order);
  const context: StampContext = {
    stampG(row, column, value) { matrix[row * order + column] += value; },
    stampB(row, value) { rhs[row] += value; },
    stampC() {},
    getVoltage(node) { return node < 0 ? 0 : zero[node]!; },
    getCurrent(branch) { return zero[compiled.nodeCount + branch]!; },
    time: 0,
    dt: 0,
    numNodes: compiled.nodeCount,
    sourceScale: 1,
    useDcSourceValue: true,
  };
  for (const device of compiled.devices) device.stamp(context);
  const gmin = request.options?.gmin ?? 0;
  for (let node = 0; node < compiled.nodeCount; node++) matrix[node * order + node] += gmin;

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
  if (analyses.length !== 1 || !/^\.op(?:\s|$)/i.test(analyses[0])) {
    unsupported('analysis', 'Exactly one .op analysis is supported');
  }

  for (const card of cards) {
    if (/^\.(?:op|end)(?:\s|$)/i.test(card)) continue;
    const type = card[0]?.toUpperCase();
    if (type !== 'R' && type !== 'I' && type !== 'V') {
      unsupported('device-or-directive', `Unsupported linear OP card '${card.split(/\s+/)[0] ?? ''}'`);
    }
    const tokens = card.split(/\s+/);
    if (type === 'R') {
      if (tokens.length !== 4) unsupported('resistor-form', 'Resistors must use Rname positive negative value');
    } else {
      const dc = tokens.length === 5 && tokens[3]?.toUpperCase() === 'DC';
      if (tokens.length !== 4 && !dc) {
        unsupported('source-waveform', 'Sources must use a constant or DC value');
      }
    }
  }

  const circuit = parseTitleless(source);
  const compiled = circuit.compile();
  if (compiled.steps.length > 0 || compiled.poleZeroAnalyses.length > 0
    || compiled.analyses.length !== 1 || compiled.analyses[0]?.type !== 'op') {
    unsupported('analysis', 'Exactly one unstepped .op analysis is supported');
  }
  if (compiled.devices.some(device => !['R', 'I', 'V'].includes(device.name[0]?.toUpperCase() ?? ''))) {
    unsupported('device', 'Only R, I, and V devices are supported');
  }
  const order = compiled.nodeCount + compiled.branchCount;
  if (order < 1) throw numericError('INVALID_CIRCUIT', 'The circuit has no numeric unknowns', 'compile');
  if (order > NUMERIC_WASM_LIMITS.maxSystemOrder) {
    throw resourceLimit('maxSystemOrder', NUMERIC_WASM_LIMITS.maxSystemOrder, order);
  }
  return { compiled, order };
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
