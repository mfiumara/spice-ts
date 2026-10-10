import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { sha256, type SimulationRequestV1 } from '@spice-ts/protocol';
import {
  createSpiceEngine,
  SpiceEngineError,
  type SpiceEngine,
  type SpiceWorkerManifestV1,
  type WorkerLike,
} from './index.js';
import { NUMERIC_WASM_LIMITS, validateNumericWasmModule, type NumericWasmExports } from './numeric-abi.js';

const circuits = [
  'V1 in 0 5\nR1 in 0 1k\n.op',
  'I1 0 out 2m\nR1 out 0 2k\n.op',
  'V1 in 0 12\nR1 in out 2k\nR2 out 0 1k\n.op',
  'V1 a 0 10\nR1 a b 1k\nI1 b 0 1m\nR2 b 0 2k\n.op',
] as const;

const acCircuits = [
  'V1 in 0 AC 1\nR1 in out 1k\nC1 out 0 1u\n.ac dec 3 10 10k',
  'V1 in 0 AC 2 30\nR1 in out 100\nL1 out 0 10m\n.ac dec 4 100 1k',
  'I1 0 out AC 1m -45\nR1 out 0 1k\nC1 out 0 100n\n.ac oct 2 100 1600',
] as const;

const linCircuits = [
  { points: 1, source: 'V1 in 0 AC 1\nR1 in 0 1k\n.ac lin 1 100 1k', expectedGrid: [100] },
  { points: 4, source: 'V1 in 0 AC 1\nR1 in 0 1k\n.ac lin 4 100 1k', expectedGrid: [100, 400, 700, 1000] },
] as const;

const transientCircuit = [
  'V1 in 0 PULSE(0 1 0 100u 100u 10m 20m)',
  'R1 in out 1k',
  'C1 out 0 1u',
  '.tran 100u 1m',
  '.end',
].join('\n');

const dcSweepCircuit = [
  'Vdrive in 0 0',
  'R1 in out 1k',
  'R2 out 0 1k',
  '.dc Vdrive -1 1 0.5',
  '.end',
].join('\n');

async function engine(backend: 'spice-ts-js' | 'spice-ts-wasm'): Promise<SpiceEngine> {
  return createSpiceEngine({ backend });
}

function request(source: string, options?: SimulationRequestV1['options']): SimulationRequestV1 {
  return { apiVersion: '1', input: { format: 'spice', source }, ...(options ? { options } : {}) };
}

describe('bounded numeric WebAssembly backend', () => {
  it('runs one bounded passive voltage or current source DC sweep without fallback', async () => {
    const wasm = await engine('spice-ts-wasm');
    try {
      const voltage = await wasm.simulate(request(dcSweepCircuit), { requestId: 'dc-voltage' });
      expect(voltage.ok).toBe(true);
      if (!voltage.ok) return;
      expect(voltage.metadata).toMatchObject({ backend: 'spice-ts-wasm' });
      expect(voltage.data.analyses[0]).toMatchObject({
        type: 'dc', analysisIndex: 0,
        axis: { name: 'Vdrive', unit: 'V', values: [-1, -0.5, 0, 0.5, 1] },
        voltagesV: { in: [-1, -0.5, 0, 0.5, 1], out: [-0.5, -0.25, 0, 0.25, 0.5] },
      });

      const current = await wasm.simulate(request([
        'Isweep 0 out 0', 'R1 out 0 1k', '.dc Isweep 2m 0 -1m',
      ].join('\n')), { requestId: 'dc-current-descending' });
      expect(current.ok).toBe(true);
      if (!current.ok) return;
      expect(current.data.analyses[0]).toMatchObject({
        type: 'dc', axis: { name: 'Isweep', unit: 'A', values: [0.002, 0.001, 0] },
        voltagesV: { out: [2, 1, 0] },
      });

      const reads = [];
      for await (const read of wasm.simulateStream(request(dcSweepCircuit), {
        requestId: 'dc-stream', chunkPoints: 2,
      })) reads.push(read);
      expect(reads.map(read => read.status)).toEqual(['running', 'running', 'complete']);
      expect(reads.flatMap(read => read.events).map(event => event.type)).toEqual([
        'analysis-start', 'point', 'point', 'point', 'point', 'point', 'analysis-end',
      ]);
    } finally {
      await wasm.close();
    }
  });

  it('rejects invalid, nested, nonlinear, and over-limit DC sweeps before fallback', async () => {
    const wasm = await engine('spice-ts-wasm');
    try {
      for (const [name, source, code, details] of [
        ['zero-step', 'V1 in 0 0\nR1 in 0 1k\n.dc V1 0 1 0', 'INVALID_CIRCUIT', { feature: 'dc-grid' }],
        ['wrong-direction', 'V1 in 0 0\nR1 in 0 1k\n.dc V1 0 1 -1', 'INVALID_CIRCUIT', { feature: 'dc-grid' }],
        ['nested', 'V1 in 0 0\nR1 in 0 1k\n.dc V1 0 1 1 V2 0 1 1', 'UNSUPPORTED_FEATURE', { feature: 'dc-nested-sweep' }],
        ['nonlinear-source', 'V1 in 0 PULSE(0 1 0 1n 1n 1m 2m)\nR1 in 0 1k\n.dc V1 0 1 1', 'UNSUPPORTED_FEATURE', { feature: 'source-waveform' }],
        ['nonlinear-device', 'V1 in 0 0\nD1 in 0 D\n.model D D\n.dc V1 0 1 1', 'UNSUPPORTED_FEATURE', {}],
      ] as const) {
        const result = await wasm.simulate(request(source), { requestId: `dc-${name}` });
        expect(result).toMatchObject({
          ok: false, error: { code, phase: 'validation', retryable: false, details },
          metadata: { backend: 'spice-ts-wasm' },
        });
      }

      const limited = await wasm.simulate(request(dcSweepCircuit, {
        limits: { maxResultPoints: 4 },
      }), { requestId: 'dc-point-limit' });
      expect(limited).toMatchObject({
        ok: false,
        error: { code: 'RESOURCE_LIMIT', phase: 'validation', details: {
          limit: 'maxResultPoints', configured: 4, observed: 5,
        } },
      });

      const serialized = await wasm.simulate(request(dcSweepCircuit, {
        limits: { maxSerializedResultBytes: 1 },
      }), { requestId: 'dc-serialized-limit' });
      expect(serialized).toMatchObject({
        ok: false,
        error: { code: 'RESOURCE_LIMIT', phase: 'serialize', details: {
          limit: 'maxSerializedResultBytes', configured: 1, observed: expect.any(Number),
        } },
      });
    } finally {
      await wasm.close();
    }
  });

  it('advertises the exact bounded slice and artifact identity', async () => {
    const wasm = await engine('spice-ts-wasm');
    try {
      expect(wasm.capabilities).toMatchObject({
        backends: ['spice-ts-wasm'],
        analyses: ['op', 'dc', 'tran', 'ac'],
        nativeSchemaVersions: [],
        engineBuildId: expect.stringMatching(/^spice-ts-wasm-[0-9a-f]{16}$/),
        numericWasm: {
          kernel: 'dense-gaussian-complex-f64-v2',
          abiVersion: 2,
          artifactSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
          artifactBytes: expect.any(Number),
          inputFormats: ['spice'],
          analyses: ['op', 'dc', 'tran', 'ac'],
          devicesByAnalysis: {
            op: ['R', 'I', 'V', 'G', 'F'],
            dc: ['R', 'I', 'V'],
            tran: ['R', 'C', 'I', 'V'],
            ac: ['R', 'C', 'L', 'I', 'V'],
          },
          fallback: 'reject',
          limits: { maxSystemOrder: 64, maxAcPoints: 1025, maxResultPoints: 4096, memoryPages: 3 },
        },
      });
    } finally {
      await wasm.close();
    }
  });

  it('loads an import-free ABI-v2 complex kernel with fixed memory', async () => {
    const bytes = await readFile(new URL('../native/dense-solver.wasm', import.meta.url));
    const module = await WebAssembly.compile(bytes);
    expect(WebAssembly.Module.imports(module)).toEqual([]);
    expect(WebAssembly.Module.exports(module).map(entry => entry.name)).toEqual(expect.arrayContaining([
      'memory', '__heap_base', 'abi_version', 'max_order', 'stamp_vccs_f64', 'stamp_cccs_f64',
      'solve_f64', 'solve_complex_f64',
    ]));
    await expect(validateNumericWasmModule(module)).resolves.toBeUndefined();
    const instance = await WebAssembly.instantiate(module);
    const exports = instance.exports as unknown as NumericWasmExports;
    const memory = exports.memory;
    expect(memory.buffer.byteLength).toBe(NUMERIC_WASM_LIMITS.memoryPages * 65_536);
    const matrixPointer = Number(exports.__heap_base.value);
    const matrix = new Float64Array(memory.buffer, matrixPointer, 16);
    expect(exports.stamp_vccs_f64(4, matrixPointer, 0, 1, 2, 3, 0.01)).toBe(0);
    expect(Array.from(matrix)).toEqual([
      0, 0, 0.01, -0.01,
      0, 0, -0.01, 0.01,
      0, 0, 0, 0,
      0, 0, 0, 0,
    ]);
    matrix.fill(0);
    expect(exports.stamp_cccs_f64(4, matrixPointer, 0, 1, 3, 2)).toBe(0);
    expect(Array.from(matrix)).toEqual([
      0, 0, 0, 2,
      0, 0, 0, -2,
      0, 0, 0, 0,
      0, 0, 0, 0,
    ]);
    expect(() => memory.grow(1)).toThrow();
  });

  it('matches the TypeScript backend on a fixed linear OP circuit suite', async () => {
    const js = await engine('spice-ts-js');
    const wasm = await engine('spice-ts-wasm');
    try {
      for (const [index, source] of circuits.entries()) {
        const input = request(source);
        const [expected, actual] = await Promise.all([
          js.simulate(input, { requestId: `js-${index}` }),
          wasm.simulate(input, { requestId: `wasm-${index}` }),
        ]);
        expect(expected.ok).toBe(true);
        expect(actual.ok).toBe(true);
        if (!expected.ok || !actual.ok) continue;
        expect(actual.metadata).toMatchObject({
          backend: 'spice-ts-wasm',
          resolvedOptions: { backend: 'spice-ts-wasm' },
        });
        const expectedOp = expected.data.analyses[0];
        const actualOp = actual.data.analyses[0];
        expect(expectedOp?.type).toBe('op');
        expect(actualOp?.type).toBe('op');
        if (expectedOp?.type !== 'op' || actualOp?.type !== 'op') continue;
        expect(Object.keys(actualOp.voltagesV)).toEqual(Object.keys(expectedOp.voltagesV));
        for (const [name, value] of Object.entries(expectedOp.voltagesV)) {
          expect(actualOp.voltagesV[name]).toBeCloseTo(value, 12);
        }
        expect(Object.keys(actualOp.currentsA)).toEqual(Object.keys(expectedOp.currentsA));
        for (const [name, value] of Object.entries(expectedOp.currentsA)) {
          expect(actualOp.currentsA[name]).toBeCloseTo(value, 12);
        }
      }
    } finally {
      await Promise.all([js.close(), wasm.close()]);
    }
  });

  it('solves the bounded linear VCCS OP slice through the WASM backend', async () => {
    const wasm = await engine('spice-ts-wasm');
    try {
      const source = [
        'VCTRL control 0 2',
        'G1 out 0 control 0 2m',
        'R1 out 0 1k',
        '.op',
      ].join('\n');
      const result = await wasm.simulate(request(source), { requestId: 'wasm-vccs-op' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const op = result.data.analyses[0];
      expect(op?.type).toBe('op');
      if (op?.type !== 'op') return;
      expect(op.voltagesV).toMatchObject({ control: 2, out: -4 });
      expect(op.currentsA.VCTRL).toBeCloseTo(0, 15);
      expect(result.metadata).toMatchObject({ backend: 'spice-ts-wasm' });
    } finally {
      await wasm.close();
    }
  });

  it('enforces the serialized-result ceiling for bounded VCCS OP', async () => {
    const wasm = await engine('spice-ts-wasm');
    try {
      const result = await wasm.simulate(request([
        'VCTRL control 0 2',
        'G1 out 0 control 0 2m',
        'R1 out 0 1k',
        '.op',
      ].join('\n'), {
        limits: { maxSerializedResultBytes: 1 },
      }), { requestId: 'wasm-vccs-op-serialized-limit' });
      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'RESOURCE_LIMIT',
          phase: 'serialize',
          retryable: false,
          details: {
            limit: 'maxSerializedResultBytes',
            configured: 1,
            observed: expect.any(Number),
          },
        },
        metadata: { backend: 'spice-ts-wasm' },
      });
    } finally {
      await wasm.close();
    }
  });

  it('rejects VCCS forms outside the bounded linear OP slice without fallback', async () => {
    const wasm = await engine('spice-ts-wasm');
    try {
      for (const [name, source, feature] of [
        ['transient', 'V1 control 0 1\nG1 out 0 control 0 1m\nR1 out 0 1k\n.tran 1u 1m', 'device-or-directive'],
        ['polynomial', 'V1 control 0 1\nG1 out 0 POLY(1) control 0 1m\nR1 out 0 1k\n.op', 'vccs-form'],
        ['vcvs', 'V1 control 0 1\nE1 out 0 control 0 2\nR1 out 0 1k\n.op', 'device-or-directive'],
      ] as const) {
        const result = await wasm.simulate(request(source), { requestId: `wasm-vccs-reject-${name}` });
        expect(result).toMatchObject({
          ok: false,
          error: {
            code: 'UNSUPPORTED_FEATURE',
            phase: 'validation',
            retryable: false,
            details: { backend: 'spice-ts-wasm', feature },
          },
          metadata: { backend: 'spice-ts-wasm' },
        });
      }
    } finally {
      await wasm.close();
    }
  });

  it('returns a structured singular-topology error for an unreferenced VCCS output', async () => {
    const wasm = await engine('spice-ts-wasm');
    try {
      const result = await wasm.simulate(request([
        'VCTRL control 0 1',
        'G1 out 0 control 0 1m',
        '.op',
      ].join('\n')), { requestId: 'wasm-vccs-singular' });
      expect(result).toMatchObject({
        ok: false,
        error: { code: 'SINGULAR_MATRIX', phase: 'solve', retryable: false },
        metadata: { backend: 'spice-ts-wasm' },
      });
    } finally {
      await wasm.close();
    }
  });

  it('rejects non-finite VCCS transconductance before stamping', async () => {
    const wasm = await engine('spice-ts-wasm');
    try {
      const result = await wasm.simulate(request([
        'VCTRL control 0 1',
        'G1 out 0 control 0 1e999',
        'R1 out 0 1k',
        '.op',
      ].join('\n')), { requestId: 'wasm-vccs-non-finite' });
      expect(result).toMatchObject({
        ok: false,
        error: { code: 'INVALID_CIRCUIT', phase: 'compile', retryable: false },
        metadata: { backend: 'spice-ts-wasm' },
      });
    } finally {
      await wasm.close();
    }
  });

  it('solves the bounded linear CCCS OP slice through the WASM backend', async () => {
    const wasm = await engine('spice-ts-wasm');
    try {
      const result = await wasm.simulate(request([
        'VCTRL control 0 2',
        'RCTRL control 0 1k',
        'F1 out 0 VCTRL 3',
        'RLOAD out 0 1k',
        '.op',
      ].join('\n')), { requestId: 'wasm-cccs-op' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const op = result.data.analyses[0];
      expect(op?.type).toBe('op');
      if (op?.type !== 'op') return;
      expect(op.voltagesV).toMatchObject({ control: 2, out: 6 });
      expect(op.currentsA.VCTRL).toBeCloseTo(-0.002, 15);
      expect(result.metadata).toMatchObject({ backend: 'spice-ts-wasm' });
    } finally {
      await wasm.close();
    }
  });

  it('resolves a mixed-case CCCS controlling voltage source like SPICE', async () => {
    const wasm = await engine('spice-ts-wasm');
    try {
      const result = await wasm.simulate(request([
        'VCTRL control 0 2',
        'RCTRL control 0 1k',
        'F1 out 0 vctrl 3',
        'RLOAD out 0 1k',
        '.op',
      ].join('\n')), { requestId: 'wasm-cccs-mixed-case-control' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const op = result.data.analyses[0];
      expect(op?.type).toBe('op');
      if (op?.type !== 'op') return;
      expect(op.voltagesV).toMatchObject({ control: 2, out: 6 });
      expect(op.currentsA.VCTRL).toBeCloseTo(-0.002, 15);
      expect(result.metadata).toMatchObject({ backend: 'spice-ts-wasm' });
    } finally {
      await wasm.close();
    }
  });

  it('enforces the serialized-result ceiling for bounded CCCS OP', async () => {
    const wasm = await engine('spice-ts-wasm');
    try {
      const result = await wasm.simulate(request([
        'VCTRL control 0 2',
        'RCTRL control 0 1k',
        'F1 out 0 VCTRL 3',
        'RLOAD out 0 1k',
        '.op',
      ].join('\n'), {
        limits: { maxSerializedResultBytes: 1 },
      }), { requestId: 'wasm-cccs-op-serialized-limit' });
      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'RESOURCE_LIMIT',
          phase: 'serialize',
          retryable: false,
          details: {
            limit: 'maxSerializedResultBytes',
            configured: 1,
            observed: expect.any(Number),
          },
        },
        metadata: { backend: 'spice-ts-wasm' },
      });
    } finally {
      await wasm.close();
    }
  });

  it('rejects CCCS forms outside the bounded linear OP slice without fallback', async () => {
    const wasm = await engine('spice-ts-wasm');
    try {
      for (const [name, source, feature] of [
        ['transient', 'V1 control 0 1\nF1 out 0 V1 2\nR1 out 0 1k\n.tran 1u 1m', 'device-or-directive'],
        ['polynomial', 'V1 control 0 1\nF1 out 0 POLY(1) V1 2\nR1 out 0 1k\n.op', 'cccs-form'],
        ['ccvs', 'V1 control 0 1\nH1 out 0 V1 2\nR1 out 0 1k\n.op', 'device-or-directive'],
      ] as const) {
        const result = await wasm.simulate(request(source), { requestId: `wasm-cccs-reject-${name}` });
        expect(result).toMatchObject({
          ok: false,
          error: {
            code: 'UNSUPPORTED_FEATURE',
            phase: 'validation',
            retryable: false,
            details: { backend: 'spice-ts-wasm', feature },
          },
          metadata: { backend: 'spice-ts-wasm' },
        });
      }
    } finally {
      await wasm.close();
    }
  });

  it('rejects unresolved CCCS controlling sources with structured validation errors', async () => {
    const wasm = await engine('spice-ts-wasm');
    try {
      for (const [name, source, controlSource, reason] of [
        ['missing', 'F1 out 0 VNOPE 2\nRLOAD out 0 1k\n.op', 'VNOPE', 'missing'],
        ['branchless', 'RCTRL control 0 1k\nF1 out 0 RCTRL 2\nRLOAD out 0 1k\n.op', 'RCTRL', 'branchless'],
        ['forward', 'F1 out 0 VCTRL 2\nVCTRL control 0 1\nRLOAD out 0 1k\n.op', 'VCTRL', 'forward-reference'],
      ] as const) {
        const result = await wasm.simulate(request(source), { requestId: `wasm-cccs-control-${name}` });
        expect(result).toMatchObject({
          ok: false,
          error: {
            code: 'INVALID_CIRCUIT',
            phase: 'validation',
            retryable: false,
            details: {
              backend: 'spice-ts-wasm',
              feature: 'cccs-control-source',
              device: 'F1',
              controlSource,
              reason,
            },
          },
          metadata: { backend: 'spice-ts-wasm' },
        });
      }
    } finally {
      await wasm.close();
    }
  });

  it('rejects non-finite CCCS gain before stamping', async () => {
    const wasm = await engine('spice-ts-wasm');
    try {
      const result = await wasm.simulate(request([
        'VCTRL control 0 1',
        'RCTRL control 0 1k',
        'F1 out 0 VCTRL 1e999',
        'RLOAD out 0 1k',
        '.op',
      ].join('\n')), { requestId: 'wasm-cccs-non-finite' });
      expect(result).toMatchObject({
        ok: false,
        error: { code: 'INVALID_CIRCUIT', phase: 'compile', retryable: false },
        metadata: { backend: 'spice-ts-wasm' },
      });
    } finally {
      await wasm.close();
    }
  });

  it('matches the TypeScript backend on fixed passive AC circuits through the complex WASM path', async () => {
    const js = await engine('spice-ts-js');
    const wasm = await engine('spice-ts-wasm');
    try {
      for (const [circuitIndex, source] of acCircuits.entries()) {
        const [expected, actual] = await Promise.all([
          js.simulate(request(source), { requestId: `js-ac-${circuitIndex}` }),
          wasm.simulate(request(source), { requestId: `wasm-ac-${circuitIndex}` }),
        ]);
        expect(expected.ok).toBe(true);
        expect(actual.ok).toBe(true);
        if (!expected.ok || !actual.ok) continue;
        const expectedAc = expected.data.analyses[0];
        const actualAc = actual.data.analyses[0];
        expect(expectedAc?.type).toBe('ac');
        expect(actualAc?.type).toBe('ac');
        if (expectedAc?.type !== 'ac' || actualAc?.type !== 'ac') continue;
        expect(actualAc.frequencyHz).toEqual(expectedAc.frequencyHz);
        expect(Object.keys(actualAc.voltagePhasors)).toEqual(Object.keys(expectedAc.voltagePhasors));
        expect(Object.keys(actualAc.currentPhasors)).toEqual(Object.keys(expectedAc.currentPhasors));
        for (const [name, expectedValues] of Object.entries(expectedAc.voltagePhasors) as
          Array<[string, typeof expectedAc.voltagePhasors[string]]>) {
          const actualValues = actualAc.voltagePhasors[name]!;
          expect(actualValues).toHaveLength(expectedValues.length);
          expectedValues.forEach((value, pointIndex) => {
            expect(actualValues[pointIndex]?.magnitude).toBeCloseTo(value.magnitude, 11);
            expect(actualValues[pointIndex]?.phaseDegrees).toBeCloseTo(value.phaseDegrees, 10);
          });
        }
        for (const [name, expectedValues] of Object.entries(expectedAc.currentPhasors) as
          Array<[string, typeof expectedAc.currentPhasors[string]]>) {
          const actualValues = actualAc.currentPhasors[name]!;
          expect(actualValues).toHaveLength(expectedValues.length);
          expectedValues.forEach((value, pointIndex) => {
            expect(actualValues[pointIndex]?.magnitude).toBeCloseTo(value.magnitude, 11);
            expect(actualValues[pointIndex]?.phaseDegrees).toBeCloseTo(value.phaseDegrees, 10);
          });
        }
      }
    } finally {
      await Promise.all([js.close(), wasm.close()]);
    }
  });

  it('uses ngspice total-point semantics for LIN N=1 and N=4', async () => {
    const wasm = await engine('spice-ts-wasm');
    try {
      for (const { points, source, expectedGrid } of linCircuits) {
        const result = await wasm.simulate(request(source), { requestId: `wasm-ac-lin-${points}` });
        expect(result.ok).toBe(true);
        if (!result.ok) continue;
        const analysis = result.data.analyses[0];
        expect(analysis?.type).toBe('ac');
        if (analysis?.type !== 'ac') continue;
        expect(analysis.frequencyHz).toEqual(expectedGrid);
      }
    } finally {
      await wasm.close();
    }
  });

  it('runs bounded passive RC transient analysis with canonical stream ordering and reset', async () => {
    const wasm = await engine('spice-ts-wasm');
    try {
      const first = await wasm.simulate(request(transientCircuit), { requestId: 'tran-result' });
      const second = await wasm.simulate(request(transientCircuit), { requestId: 'tran-reuse' });
      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (!first.ok || !second.ok) return;
      expect(second.data).toEqual(first.data);
      const transient = first.data.analyses[0];
      expect(transient?.type).toBe('tran');
      if (transient?.type !== 'tran') return;
      expect(transient.timeS).toHaveLength(11);
      expect(transient.timeS[0]).toBe(0);
      expect(transient.timeS.at(-1)).toBeCloseTo(1e-3, 15);
      expect(transient.voltagesV.out[0]).toBe(0);
      expect(transient.voltagesV.out.at(-1)).toBeGreaterThan(0.5);

      const currentDriven = await wasm.simulate(request([
        'I1 0 out PULSE(0 1m 0 100u 100u 10m 20m)',
        'R1 out 0 1k',
        'C1 out 0 1u',
        '.tran 100u 1m',
      ].join('\n')), { requestId: 'tran-current-source' });
      expect(currentDriven.ok).toBe(true);

      const reads = [];
      for await (const read of wasm.simulateStream(request(transientCircuit), {
        requestId: 'tran-stream', chunkPoints: 4,
      })) reads.push(read);
      expect(reads.map(read => read.status)).toEqual(['running', 'running', 'complete']);
      const events = reads.flatMap(read => read.events);
      expect(events.map(event => event.type)).toEqual([
        'analysis-start', ...Array.from({ length: 11 }, () => 'point'), 'analysis-end',
      ]);
    } finally {
      await wasm.close();
    }
  });

  it('schedules an exact 1 us grid through 1 ms without a duplicate terminal point', async () => {
    const wasm = await engine('spice-ts-wasm');
    try {
      const result = await wasm.simulate(request([
        'V1 in 0 1',
        'R1 in out 1k',
        'C1 out 0 1u',
        '.tran 1u 1m',
      ].join('\n')), { requestId: 'tran-exact-grid' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const transient = result.data.analyses[0];
      expect(transient?.type).toBe('tran');
      if (transient?.type !== 'tran') return;
      expect(transient.timeS).toHaveLength(1_001);
      expect(transient.timeS.at(-1)).toBe(1e-3);
      expect(transient.timeS.at(-2)).toBeCloseTo(999e-6, 15);
    } finally {
      await wasm.close();
    }
  });

  it('enforces the serialized-result byte limit for transient results', async () => {
    const wasm = await engine('spice-ts-wasm');
    try {
      const result = await wasm.simulate(request(transientCircuit, {
        limits: { maxSerializedResultBytes: 1 },
      }), { requestId: 'tran-serialized-limit' });
      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'RESOURCE_LIMIT',
          phase: 'serialize',
          retryable: false,
          details: {
            limit: 'maxSerializedResultBytes',
            configured: 1,
            observed: expect.any(Number),
          },
        },
        metadata: { backend: 'spice-ts-wasm' },
      });
    } finally {
      await wasm.close();
    }
  });

  it('rejects compound clauses after a transient PULSE source', async () => {
    const wasm = await engine('spice-ts-wasm');
    try {
      const result = await wasm.simulate(request([
        'V1 in 0 PULSE(0 1 0 100u 100u 10m 20m) AC 2',
        'R1 in out 1k',
        'C1 out 0 1u',
        '.tran 100u 1m',
      ].join('\n')), { requestId: 'tran-compound-pulse' });
      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'UNSUPPORTED_FEATURE',
          phase: 'validation',
          details: { backend: 'spice-ts-wasm', feature: 'source-waveform' },
        },
        metadata: { backend: 'spice-ts-wasm' },
      });
    } finally {
      await wasm.close();
    }
  });

  it('returns exact diagnostics for unsupported transient controls', async () => {
    const wasm = await engine('spice-ts-wasm');
    try {
      for (const [source, feature, message] of [
        ['V1 in 0 1\nR1 in 0 1k\n.tran 1u 1m 1u', 'tran-start-time', 'Transient start time is not supported'],
        ['V1 in 0 1\nR1 in 0 1k\n.tran 1u 1m 0 100n', 'tran-max-timestep', 'Transient maximum timestep is not supported'],
        ['V1 in 0 1\nR1 in 0 1k\n.tran 1u 1m uic', 'tran-uic', 'Transient UIC is not supported'],
      ] as const) {
        const result = await wasm.simulate(request(source), { requestId: feature });
        expect(result).toMatchObject({
          ok: false,
          error: { code: 'UNSUPPORTED_FEATURE', message, details: { backend: 'spice-ts-wasm', feature } },
        });
      }
      const option = await wasm.simulate(request(transientCircuit, { integrationMethod: 'euler' }), {
        requestId: 'integration-method',
      });
      expect(option).toMatchObject({
        ok: false,
        error: {
          code: 'UNSUPPORTED_FEATURE', message: 'Only trapezoidal transient integration is supported',
          details: { backend: 'spice-ts-wasm', feature: 'integration-method' },
        },
      });
    } finally {
      await wasm.close();
    }
  });

  it('bounds AC result points and rejects nonlinear AC without fallback', async () => {
    const wasm = await engine('spice-ts-wasm');
    try {
      const limited = await wasm.simulate(request(linCircuits[1].source, {
        limits: { maxResultPoints: 2 },
      }), { requestId: 'ac-point-limit' });
      expect(limited).toMatchObject({
        ok: false,
        error: {
          code: 'RESOURCE_LIMIT',
          details: { limit: 'maxResultPoints', configured: 2, observed: 4 },
        },
      });

      const nonlinear = await wasm.simulate(request(
        'V1 in 0 AC 1\nR1 in out 1k\nD1 out 0 diode\n.model diode D\n.ac dec 3 10 10k',
      ), { requestId: 'ac-nonlinear' });
      expect(nonlinear).toMatchObject({
        ok: false,
        error: { code: 'UNSUPPORTED_FEATURE', retryable: false },
        metadata: { backend: 'spice-ts-wasm' },
      });
    } finally {
      await wasm.close();
    }
  });

  it('rejects unsupported analyses and devices without falling back', async () => {
    const wasm = await engine('spice-ts-wasm');
    try {
      for (const [name, source] of Object.entries({
        capacitor: 'V1 in 0 1\nC1 in 0 1u\n.op',
        waveform: 'V1 in 0 PULSE(0 1 0 1n 1n 1m 2m)\nR1 in 0 1k\n.op',
        inductorTransient: 'V1 in 0 1\nL1 in 0 1m\n.tran 1u 1m',
        nonlinearTransient: 'V1 in 0 1\nD1 in 0 D\n.model D D\n.tran 1u 1m',
      })) {
        const result = await wasm.simulate(request(source), { requestId: `unsupported-${name}` });
        expect(result).toMatchObject({
          ok: false,
          error: { code: 'UNSUPPORTED_FEATURE', retryable: false },
          metadata: { backend: 'spice-ts-wasm' },
        });
      }
    } finally {
      await wasm.close();
    }
  });

  it('enforces caller and backend resource ceilings before allocation', async () => {
    const wasm = await engine('spice-ts-wasm');
    try {
      const limited = await wasm.simulate(request(circuits[0], {
        limits: { maxComponents: 1 },
      }), { requestId: 'component-limit' });
      expect(limited).toMatchObject({
        ok: false,
        error: { code: 'RESOURCE_LIMIT', details: { limit: 'maxComponents', configured: 1, observed: 2 } },
      });

      const vccsLimited = await wasm.simulate(request([
        'VCTRL control 0 1',
        'G1 out 0 control 0 1m',
        'R1 out 0 1k',
        '.op',
      ].join('\n'), { limits: { maxComponents: 2 } }), { requestId: 'vccs-component-limit' });
      expect(vccsLimited).toMatchObject({
        ok: false,
        error: { code: 'RESOURCE_LIMIT', details: { limit: 'maxComponents', configured: 2, observed: 3 } },
      });

      const cccsLimited = await wasm.simulate(request([
        'VCTRL control 0 1',
        'RCTRL control 0 1k',
        'F1 out 0 VCTRL 2',
        'RLOAD out 0 1k',
        '.op',
      ].join('\n'), { limits: { maxComponents: 3 } }), { requestId: 'cccs-component-limit' });
      expect(cccsLimited).toMatchObject({
        ok: false,
        error: { code: 'RESOURCE_LIMIT', details: { limit: 'maxComponents', configured: 3, observed: 4 } },
      });

      const oversized = Array.from({ length: 65 }, (_, index) => `V${index + 1} n${index + 1} 0 ${index + 1}`).join('\n') + '\n.op';
      const bounded = await wasm.simulate(request(oversized), { requestId: 'order-limit' });
      expect(bounded).toMatchObject({
        ok: false,
        error: { code: 'RESOURCE_LIMIT', details: { limit: 'maxSystemOrder', configured: 64 } },
      });

      const tooManyPoints = await wasm.simulate(request(transientCircuit, {
        limits: { maxResultPoints: 10 },
      }), { requestId: 'tran-point-limit' });
      expect(tooManyPoints).toMatchObject({
        ok: false,
        error: { code: 'RESOURCE_LIMIT', details: { limit: 'maxResultPoints', configured: 10, observed: 11 } },
      });
    } finally {
      await wasm.close();
    }
  });

  it('rejects a correctly hashed but invalid numeric artifact before worker construction', async () => {
    const workerUrl = new URL('../dist/worker.js', import.meta.url);
    const workerBytes = new Uint8Array(await readFile(workerUrl));
    const invalid = Uint8Array.from([0, 97, 115, 109, 1, 0, 0]);
    const manifest: SpiceWorkerManifestV1 = {
      schemaVersion: 1,
      engineBuildId: `spice-ts-js-${sha256(workerBytes).slice(0, 16)}`,
      worker: { url: workerUrl.href, sha256: sha256(workerBytes) },
      numericWasm: {
        url: `data:application/wasm;base64,${Buffer.from(invalid).toString('base64')}`,
        sha256: sha256(invalid),
        byteLength: invalid.byteLength,
        engineBuildId: `spice-ts-wasm-${sha256(invalid).slice(0, 16)}`,
      },
    };
    let constructions = 0;
    await expect(createSpiceEngine({
      backend: 'spice-ts-wasm',
      manifest,
      workerFactory: () => { constructions++; throw new Error('must not construct'); },
    })).rejects.toBeInstanceOf(SpiceEngineError);
    expect(constructions).toBe(0);
  });

  it('rejects a numeric artifact integrity mismatch before worker construction', async () => {
    const workerUrl = new URL('../dist/worker.js', import.meta.url);
    const workerBytes = new Uint8Array(await readFile(workerUrl));
    const numericUrl = new URL('../dist/dense-solver.wasm', import.meta.url);
    const wrongSha256 = '0'.repeat(64);
    const manifest: SpiceWorkerManifestV1 = {
      schemaVersion: 1,
      engineBuildId: `spice-ts-js-${sha256(workerBytes).slice(0, 16)}`,
      worker: { url: workerUrl.href, sha256: sha256(workerBytes) },
      numericWasm: {
        url: numericUrl.href,
        sha256: wrongSha256,
        byteLength: (await readFile(numericUrl)).byteLength,
        engineBuildId: `spice-ts-wasm-${wrongSha256.slice(0, 16)}`,
      },
    };
    let constructions = 0;
    await expect(createSpiceEngine({
      backend: 'spice-ts-wasm',
      manifest,
      workerFactory: () => { constructions++; throw new Error('must not construct'); },
    })).rejects.toMatchObject({
      error: { code: 'BACKEND_UNAVAILABLE', phase: 'transport' },
    });
    expect(constructions).toBe(0);
  });

  it('registers cancellation before asynchronous WASM worker construction', async () => {
    const wasm = await engine('spice-ts-wasm');
    try {
      const pending = wasm.simulate(request([
        'VCTRL control 0 2',
        'RCTRL control 0 1k',
        'F1 out 0 VCTRL 3',
        'RLOAD out 0 1k',
        '.op',
      ].join('\n')), { requestId: 'wasm-cancel' });
      expect(await wasm.cancel('wasm-cancel')).toEqual({ requestId: 'wasm-cancel', status: 'cancelling' });
      await expect(pending).resolves.toMatchObject({ ok: false, error: { code: 'CANCELLED' } });
    } finally {
      await wasm.close();
    }
  });

  it('terminates an unresponsive worker at the caller wall-time bound', async () => {
    let terminations = 0;
    const silentWorker: WorkerLike = {
      postMessage() {},
      onMessage() { return () => {}; },
      onError() { return () => {}; },
      terminate() { terminations++; },
    };
    const wasm = await createSpiceEngine({
      backend: 'spice-ts-wasm',
      workerFactory: () => silentWorker,
    });
    try {
      const result = await wasm.simulate(request(circuits[0], {
        limits: { maxWallTimeMs: 5 },
      }), { requestId: 'wasm-deadline' });
      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'RESOURCE_LIMIT',
          phase: 'solve',
          details: { limit: 'maxWallTimeMs', configured: 5, observed: 5 },
        },
      });
      expect(terminations).toBe(1);
    } finally {
      await wasm.close();
    }
  });
});
