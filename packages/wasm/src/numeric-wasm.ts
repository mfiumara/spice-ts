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

interface PreparedNumericBase {
  compiled: CompiledCircuit;
  order: number;
}

interface PreparedLinearOp extends PreparedNumericBase {
  analysis: 'op';
}

interface PreparedPassiveAc extends PreparedNumericBase {
  analysis: 'ac';
  frequenciesHz: number[];
}

type PreparedNumeric = PreparedLinearOp | PreparedPassiveAc;

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
  const prepared = prepare(request);
  const instantiated = await WebAssembly.instantiate(wasmBytes.slice().buffer as ArrayBuffer);
  const exports = instantiated.instance.exports as NumericWasmExports;
  assertNumericWasmAbi(exports);

  return prepared.analysis === 'op'
    ? simulateOp(prepared, request, exports)
    : simulateAc(prepared, request, exports);
}

function simulateOp(
  { compiled, order }: PreparedLinearOp,
  request: SimulationRequestV1,
  exports: NumericWasmExports,
): SimulationResultV1 {

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

function simulateAc(
  { compiled, order, frequenciesHz }: PreparedPassiveAc,
  request: SimulationRequestV1,
  exports: NumericWasmExports,
): SimulationResultV1 {
  const conductance = new Float64Array(order * order);
  const dynamic = new Float64Array(order * order);
  const rhsReal = new Float64Array(order);
  const rhsImaginary = new Float64Array(order);
  const zero = new Float64Array(order);
  const context: StampContext = {
    stampG(row, column, value) { conductance[row * order + column] += value; },
    stampB() {},
    stampC(row, column, value) { dynamic[row * order + column] += value; },
    getVoltage(node) { return node < 0 ? 0 : zero[node]!; },
    getCurrent(branch) { return zero[compiled.nodeCount + branch]!; },
    time: 0,
    dt: 0,
    numNodes: compiled.nodeCount,
    sourceScale: 1,
    useDcSourceValue: true,
  };
  for (const device of compiled.devices) device.stamp(context);
  for (const device of compiled.devices) device.stampDynamic?.(context);
  const gmin = request.options?.gmin ?? 0;
  for (let node = 0; node < compiled.nodeCount; node++) {
    conductance[node * order + node] += gmin;
  }
  for (const device of compiled.devices) {
    const contribution = device.getACExcitation?.();
    if (!contribution) continue;
    const phase = contribution.phase * Math.PI / 180;
    const real = contribution.magnitude * Math.cos(phase);
    const imaginary = contribution.magnitude * Math.sin(phase);
    if (contribution.kind === 'branch') {
      const row = compiled.nodeCount + contribution.branch;
      rhsReal[row] += real;
      rhsImaginary[row] += imaginary;
    } else {
      if (contribution.positiveNode >= 0) {
        rhsReal[contribution.positiveNode] -= real;
        rhsImaginary[contribution.positiveNode] -= imaginary;
      }
      if (contribution.negativeNode >= 0) {
        rhsReal[contribution.negativeNode] += real;
        rhsImaginary[contribution.negativeNode] += imaginary;
      }
    }
  }

  const heapBase = align8(Number(exports.__heap_base.value));
  const matrixRealPointer = heapBase;
  const matrixImaginaryPointer = matrixRealPointer + conductance.byteLength;
  const rhsRealPointer = matrixImaginaryPointer + dynamic.byteLength;
  const rhsImaginaryPointer = rhsRealPointer + rhsReal.byteLength;
  const requiredBytes = rhsImaginaryPointer + rhsImaginary.byteLength;
  if (requiredBytes > exports.memory.buffer.byteLength) {
    throw resourceLimit('numericWasmMemoryBytes', exports.memory.buffer.byteLength, requiredBytes);
  }

  const voltagePhasors = Object.fromEntries([...compiled.nodeNames].sort().map(name => [name, []])) as
    Record<string, Array<{ magnitude: number; phaseDegrees: number }>>;
  const currentPhasors = Object.fromEntries([...compiled.branchNames].sort().map(name => [name, []])) as
    Record<string, Array<{ magnitude: number; phaseDegrees: number }>>;
  for (const [pointIndex, frequencyHz] of frequenciesHz.entries()) {
    const matrixImaginary = new Float64Array(dynamic.length);
    const omega = 2 * Math.PI * frequencyHz;
    for (let index = 0; index < dynamic.length; index++) {
      matrixImaginary[index] = dynamic[index]! * omega;
    }
    new Float64Array(exports.memory.buffer, matrixRealPointer, conductance.length).set(conductance);
    new Float64Array(exports.memory.buffer, matrixImaginaryPointer, matrixImaginary.length).set(matrixImaginary);
    new Float64Array(exports.memory.buffer, rhsRealPointer, rhsReal.length).set(rhsReal);
    new Float64Array(exports.memory.buffer, rhsImaginaryPointer, rhsImaginary.length).set(rhsImaginary);
    const status = exports.solve_complex_f64(
      order, matrixRealPointer, matrixImaginaryPointer, rhsRealPointer, rhsImaginaryPointer,
    );
    if (status === 1) {
      throw numericError('SINGULAR_MATRIX', 'The bounded WebAssembly complex matrix is singular', 'solve', {
        order, analysis: 'ac', pointIndex, frequencyHz,
      });
    }
    if (status !== 0) {
      throw numericError('INVALID_CIRCUIT', 'The bounded WebAssembly complex solver rejected numeric data', 'solve', {
        order, analysis: 'ac', pointIndex, frequencyHz, status,
      });
    }
    const solutionReal = new Float64Array(exports.memory.buffer, rhsRealPointer, order);
    const solutionImaginary = new Float64Array(exports.memory.buffer, rhsImaginaryPointer, order);
    compiled.nodeNames.forEach((name, index) => {
      voltagePhasors[name]!.push(polar(solutionReal[index]!, solutionImaginary[index]!));
    });
    compiled.branchNames.forEach((name, index) => {
      const solutionIndex = compiled.nodeCount + index;
      currentPhasors[name]!.push(polar(solutionReal[solutionIndex]!, solutionImaginary[solutionIndex]!));
    });
  }

  const result: SimulationResultV1 = {
    status: 'complete',
    analyses: [{
      type: 'ac', analysisIndex: 0, frequencyHz: frequenciesHz,
      voltagePhasors, currentPhasors,
    }],
  };
  const serializedLimit = request.options?.limits?.maxSerializedResultBytes;
  if (serializedLimit !== undefined) {
    const observed = new TextEncoder().encode(JSON.stringify(result)).byteLength;
    if (observed > serializedLimit) {
      throw numericError('RESOURCE_LIMIT', "Resource limit 'maxSerializedResultBytes' exceeded", 'serialize', {
        limit: 'maxSerializedResultBytes', configured: serializedLimit, observed,
      });
    }
  }
  return result;
}

function polar(real: number, imaginary: number): { magnitude: number; phaseDegrees: number } {
  return {
    magnitude: Math.hypot(real, imaginary),
    phaseDegrees: Math.atan2(imaginary, real) * 180 / Math.PI,
  };
}

function prepare(request: SimulationRequestV1): PreparedNumeric {
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
  if (analyses.length !== 1) unsupported('analysis', 'Exactly one .op or .ac analysis is supported');
  const analysis = /^\.op(?:\s|$)/i.test(analyses[0]!)
    ? 'op'
    : /^\.ac(?:\s|$)/i.test(analyses[0]!)
      ? 'ac'
      : unsupported('analysis', 'Exactly one .op or .ac analysis is supported');

  validateCards(cards, analysis);
  const circuit = parseTitleless(source);
  const compiled = circuit.compile();
  if (compiled.steps.length > 0 || compiled.poleZeroAnalyses.length > 0
    || compiled.analyses.length !== 1 || compiled.analyses[0]?.type !== analysis) {
    unsupported('analysis', `Exactly one unstepped .${analysis} analysis is supported`);
  }
  const devices = analysis === 'op' ? ['R', 'I', 'V'] : ['R', 'C', 'L', 'I', 'V'];
  if (compiled.devices.some(device => !devices.includes(device.name[0]?.toUpperCase() ?? ''))) {
    unsupported('device', `Only ${devices.join(', ')} devices are supported for .${analysis}`);
  }
  if (analysis === 'ac') validatePassiveValues(compiled);
  const order = compiled.nodeCount + compiled.branchCount;
  if (order < 1) throw numericError('INVALID_CIRCUIT', 'The circuit has no numeric unknowns', 'compile');
  if (order > NUMERIC_WASM_LIMITS.maxSystemOrder) {
    throw resourceLimit('maxSystemOrder', NUMERIC_WASM_LIMITS.maxSystemOrder, order);
  }
  if (analysis === 'op') return { analysis, compiled, order };

  const compiledAnalysis = compiled.analyses[0];
  if (compiledAnalysis?.type !== 'ac') unsupported('analysis', 'Exactly one .ac analysis is supported');
  const pointCount = acPointCount(compiledAnalysis);
  const pointLimit = Math.min(
    NUMERIC_WASM_LIMITS.maxAcPoints,
    request.options?.limits?.maxResultPoints ?? Infinity,
  );
  if (pointCount > pointLimit) throw resourceLimit('maxResultPoints', pointLimit, pointCount);
  return { analysis, compiled, order, frequenciesHz: acFrequencies(compiledAnalysis, pointCount) };
}

function validateCards(cards: string[], analysis: 'op' | 'ac'): void {
  const allowedDevices = analysis === 'op' ? ['R', 'I', 'V'] : ['R', 'C', 'L', 'I', 'V'];
  for (const card of cards) {
    if (new RegExp(`^\\.(?:${analysis}|end)(?:\\s|$)`, 'i').test(card)) continue;
    const tokens = card.split(/\s+/);
    const type = tokens[0]?.[0]?.toUpperCase() ?? '';
    if (!allowedDevices.includes(type)) {
      unsupported('device-or-directive', `Unsupported linear .${analysis} card '${tokens[0] ?? ''}'`);
    }
    if (type === 'R' || type === 'C' || type === 'L') {
      if (tokens.length !== 4) {
        unsupported('passive-form', 'Passive devices must use name positive negative value');
      }
    } else if (analysis === 'op') {
      const dc = tokens.length === 5 && tokens[3]?.toUpperCase() === 'DC';
      if (tokens.length !== 4 && !dc) {
        unsupported('source-waveform', 'OP sources must use a constant or DC value');
      }
    } else if (!validAcSourceTokens(tokens)) {
      unsupported('source-waveform', 'AC sources must use constant, DC, AC, or DC plus AC values');
    }
  }
}

function validAcSourceTokens(tokens: string[]): boolean {
  const first = tokens[3]?.toUpperCase();
  if (tokens.length === 4) return true;
  if (first === 'DC') {
    return tokens.length === 5
      || ((tokens.length === 7 || tokens.length === 8) && tokens[5]?.toUpperCase() === 'AC');
  }
  return first === 'AC' && (tokens.length === 5 || tokens.length === 6);
}

function validatePassiveValues(compiled: CompiledCircuit): void {
  for (const device of compiled.devices) {
    const type = device.name[0]?.toUpperCase();
    const passive = device as unknown as {
      resistance?: number;
      capacitance?: number;
      inductance?: number;
    };
    const value = type === 'R' ? passive.resistance
      : type === 'C' ? passive.capacitance
        : type === 'L' ? passive.inductance
          : undefined;
    if (value !== undefined && (!Number.isFinite(value) || value <= 0)) {
      throw numericError('INVALID_CIRCUIT', `Passive device '${device.name}' must have a positive finite value`, 'compile');
    }
  }
}

function acPointCount(analysis: {
  variation: 'dec' | 'oct' | 'lin';
  points: number;
  startFreq: number;
  stopFreq: number;
}): number {
  if (analysis.variation === 'lin') return analysis.points;
  const span = analysis.variation === 'dec'
    ? Math.log10(analysis.stopFreq / analysis.startFreq)
    : Math.log2(analysis.stopFreq / analysis.startFreq);
  return Math.round(span * analysis.points) + 1;
}

function acFrequencies(
  analysis: { variation: 'dec' | 'oct' | 'lin'; points: number; startFreq: number; stopFreq: number },
  pointCount: number,
): number[] {
  if (analysis.variation === 'lin') {
    if (pointCount === 1) return [analysis.startFreq];
    const step = (analysis.stopFreq - analysis.startFreq) / (pointCount - 1);
    return Array.from({ length: pointCount }, (_, index) => analysis.startFreq + index * step);
  }
  const base = analysis.variation === 'dec' ? 10 : 2;
  return Array.from(
    { length: pointCount },
    (_, index) => analysis.startFreq * Math.pow(base, index / analysis.points),
  );
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
