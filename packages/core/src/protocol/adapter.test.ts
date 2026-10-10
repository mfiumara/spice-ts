import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ConvergenceError, CycleError, InvalidCircuitError, ParseError,
  SingularMatrixError, TimestepTooSmallError,
} from '../errors.js';
import { Circuit } from '../circuit.js';
import { mapProtocolErrorV1, simulateProtocolV1 } from './adapter.js';
import type { SimulationRequestV1, SimulationResultV1, SpiceTsCircuitDocumentV1 } from './types.js';

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as T;
}

function sha256CanonicalJson(value: unknown): string {
  const canonical = (current: unknown): unknown => {
    if (Array.isArray(current)) return current.map(canonical);
    if (current !== null && typeof current === 'object') {
      const record = current as Record<string, unknown>;
      return Object.fromEntries(Object.keys(record).sort().map(key => [key, canonical(record[key])]));
    }
    return Object.is(current, -0) ? 0 : current;
  };
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

describe('protocol v1 core adapter', () => {
  it('maps a native request to an exact JSON-safe golden result', async () => {
    const request = fixture<SimulationRequestV1>('request-v1.json');
    const expected = fixture<SimulationResultV1>('result-v1.json');

    const actual = await simulateProtocolV1(request);

    expect(actual).toEqual(expected);
    expect(JSON.parse(JSON.stringify(actual))).toEqual(actual);
    expect(sha256CanonicalJson(request)).toBe('5fc67488af7a936090a9835bf048f2b970d22c0751ca621dce0fed668759d8c3');
    expect(sha256CanonicalJson(actual)).toBe('be52bdaf72e22ce359b2565fda9c2c148eb243dbb032a612b36f9b0649150e12');
  });

  it('maps titleless SPICE input and preserves declaration order', async () => {
    const result = await simulateProtocolV1({
      apiVersion: '1',
      input: { format: 'spice', source: 'V1 b 0 2\nR1 b 0 1k\n.op' },
      options: { backend: 'spice-ts-js' },
    });
    expect(result.analyses).toEqual([{
      type: 'op', analysisIndex: 0, voltagesV: { b: 2 }, currentsA: { V1: -0.002 },
    }]);
  });

  it('maps native models and subcircuits into the existing Circuit inputs', async () => {
    const result = await simulateProtocolV1({
      apiVersion: '1',
      input: {
        format: 'spice-ts',
        document: {
          format: 'spice-ts', schemaVersion: '1.0',
          circuit: {
            nets: ['in', 'out'],
            components: [
              { type: 'V', id: 'V1', name: 'V1', ports: [{ name: 'p', net: 'in' }, { name: 'n', net: '0' }], params: { waveform: 'dc', dc: 1 } },
              { type: 'R', id: 'R1', name: 'R1', ports: [{ name: 'p', net: 'in' }, { name: 'n', net: 'out' }], params: { resistance: 1000 } },
              { type: 'D', id: 'D1', name: 'D1', ports: [{ name: 'anode', net: 'out' }, { name: 'cathode', net: '0' }], params: {}, model: 'DM' },
              { type: 'X', id: 'X1', name: 'X1', ports: [{ name: 'port1', net: 'in' }, { name: 'port2', net: '0' }], params: {}, subcircuit: 'LOAD' },
            ],
          },
          analyses: [{ type: 'op' }],
          models: [{ name: 'DM', type: 'D', params: { IS: 1e-12 } }],
          subcircuits: [{
            name: 'LOAD', ports: ['p', 'n'], components: [
              { type: 'R', id: 'RL', name: 'RL', ports: [{ name: 'p', net: 'p' }, { name: 'n', net: 'n' }], params: { resistance: 2000 } },
            ],
          }],
        },
      },
    });
    const op = result.analyses[0];
    expect(op?.type).toBe('op');
    if (op?.type !== 'op') throw new Error('expected operating-point result');
    expect(op.voltagesV.out).toBeGreaterThan(0);
    expect(op.voltagesV.out).toBeLessThan(1);
    expect(op.currentsA).toHaveProperty('V1');
  });

  it('serializes DC typed arrays and AC phasors with sorted keys', async () => {
    const result = await simulateProtocolV1({
      apiVersion: '1',
      input: {
        format: 'spice',
        source: 'V1 z 0 DC 1 AC 1\nRz z 0 1k\nRa a 0 1k\n.dc V1 0 1 1\n.ac lin 1 1 2',
      },
    });
    expect(result.analyses.map(({ type, analysisIndex }) => ({ type, analysisIndex }))).toEqual([
      { type: 'dc', analysisIndex: 0 }, { type: 'ac', analysisIndex: 1 },
    ]);
    const dc = result.analyses.find(analysis => analysis.type === 'dc');
    const ac = result.analyses.find(analysis => analysis.type === 'ac');
    expect(dc?.type).toBe('dc');
    expect(ac?.type).toBe('ac');
    if (dc?.type !== 'dc' || ac?.type !== 'ac') throw new Error('expected DC and AC results');
    expect(Object.keys(dc.voltagesV)).toEqual(['a', 'z']);
    expect(Array.isArray(dc.axis.values)).toBe(true);
    expect(Object.keys(ac.voltagePhasors)).toEqual(['a', 'z']);
    expect(ac.voltagePhasors.z![0]).toHaveProperty('phaseDegrees');
  });

  it.each([
    ['noise', 'V1 in 0 DC 0 AC 1\nR1 in out 1k\nR2 out 0 1k\n.noise v(out) V1 lin 2 1 2'],
    ['tf', 'V1 in 0 1\nR1 in out 1k\nR2 out 0 1k\n.tf v(out) V1'],
  ])('rejects parsed %s analyses that protocol v1 cannot serialize', async (type, source) => {
    const promise = simulateProtocolV1({ apiVersion: '1', input: { format: 'spice', source } });

    await expect(promise).rejects.toEqual(
      new InvalidCircuitError(`Protocol v1 does not support '${type}' analysis results`),
    );
  });

  it('round-trips the CircuitIR representation of a PWL source', async () => {
    const circuit = new Circuit();
    circuit.addVoltageSource('V1', 'out', '0', {
      type: 'pwl', points: [{ time: 0, value: 0 }, { time: 1, value: 1 }],
    });
    circuit.addResistor('R1', 'out', '0', 1000);
    const document: SpiceTsCircuitDocumentV1 = {
      format: 'spice-ts', schemaVersion: '1.0', circuit: circuit.toIR(),
      analyses: [{ type: 'tran', timestep: 0.5, stopTime: 1 }], models: [], subcircuits: [],
    };
    expect(document.circuit.components[0]?.params.points).toBe('0:0,1:1');

    const result = await simulateProtocolV1({ apiVersion: '1', input: { format: 'spice-ts', document } });

    const transient = result.analyses[0];
    expect(transient?.type).toBe('tran');
    if (transient?.type !== 'tran') throw new Error('expected transient result');
    expect(transient.voltagesV.out?.at(-1)).toBeCloseTo(1);
  });

  it('maps every existing typed SpiceError subtype without parsing messages', () => {
    const errors = [
      new ParseError('bad token', 2, '???'),
      new InvalidCircuitError('empty'),
      new SingularMatrixError('zero pivot', ['out'], ['V1'], 1),
      new ConvergenceError('stalled', undefined, ['out'], Float64Array.of(1, 2), Float64Array.of(0, 3)),
      new TimestepTooSmallError(1, 1e-15),
      new CycleError(['A', 'B', 'A']),
    ].map(mapProtocolErrorV1);

    expect(errors).toEqual(fixture('errors-v1.json'));
    expect(sha256CanonicalJson(errors)).toBe('cf23f06d0e7427b537d5d848626fe06dfa736f87ddb5ef794ccc9b73bb750217');
  });

  it('never exposes the internal backend name on protocol values', async () => {
    const request = fixture<SimulationRequestV1>('request-v1.json');
    const result = await simulateProtocolV1(request);
    const failures = [
      mapProtocolErrorV1(new ParseError('bad spice-ts token', 1, 'spice-ts')),
      mapProtocolErrorV1(new SingularMatrixError('spice-ts pivot', ['spice-ts'], ['spice-ts'])),
      mapProtocolErrorV1(new ConvergenceError(
        'spice-ts stalled', undefined, ['spice-ts'], Float64Array.of(1), Float64Array.of(0),
      )),
      mapProtocolErrorV1(new CycleError(['spice-ts', 'spice-ts'])),
    ];
    expect(request.options?.backend).toBe('spice-ts-js');
    for (const wireValue of [result, ...failures]) {
      expect(JSON.stringify(wireValue)).not.toMatch(/\bspice-ts\b(?!-(?:js|wasm))/);
    }
    expect(failures[0]).toMatchObject({
      message: expect.stringContaining('spice-ts-js'),
      details: { context: 'spice-ts-js' },
    });
  });
});