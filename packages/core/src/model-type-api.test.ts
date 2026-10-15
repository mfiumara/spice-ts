import { describe, expect, it } from 'vitest';
import { Circuit } from './circuit.js';
import { simulate } from './simulate.js';
import { executeProtocolV1 } from './protocol/envelopes.js';
import type { SimulationRequestV1 } from './protocol/types.js';
import * as root from './index.js';
import {
  InvalidCircuitError,
  ModelTypeMismatchError,
  ParseError,
  UnsupportedCircuitModelTypeError,
} from './index.js';

// Issue #544: #542 (#509) rejects unsupported `.model` types in the parser only.
// The Circuit API, subcircuit bodies and the JSON protocol stored any type, and
// an M or D instance could reference a supported model of the wrong device kind
// (`.model q1 npn` on an M card simulated as an NMOS). ngspice-47 rejects both.

function phfetCircuit(): Circuit {
  const c = new Circuit();
  c.addVoltageSource('vd', 'd', '0', { type: 'dc', value: -5 });
  c.addVoltageSource('vg', 'g', '0', { type: 'dc', value: -5 });
  c.addModel({ name: 'p1', type: 'PHFET', params: { VTO: -1.2, BETA: 1e-4 } });
  c.addZDevice('z1', 'd', 'g', '0', 'p1');
  c.addAnalysis('op');
  return c;
}

function failure(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error('expected a throw');
}

describe('model types through the Circuit API (#544)', () => {
  it('rejects an unsupported model type in addModel with a typed error', () => {
    const error = failure(phfetCircuit);
    expect(error).toBeInstanceOf(UnsupportedCircuitModelTypeError);
    expect(error).toBeInstanceOf(InvalidCircuitError);
    expect(error).toMatchObject({
      name: 'UnsupportedCircuitModelTypeError',
      code: 'UNSUPPORTED_MODEL_TYPE',
      modelName: 'p1',
      modelType: 'PHFET',
    });
    expect((error as Error).message).toContain(".model 'p1' has unsupported type 'PHFET'");
  });

  it('rejects an unsupported model type declared inside an API subcircuit body', async () => {
    const c = new Circuit();
    c.addSubcircuit({
      name: 'cell', ports: ['a'], params: {},
      body: ['r1 a 0 1k', '.model p1 phfet vto=-1'],
    });
    c.addVoltageSource('v1', 'in', '0', { type: 'dc', value: 1 });
    c.addSubcircuitInstance('x1', ['in'], 'cell');
    c.addAnalysis('op');
    await expect(simulate(c)).rejects.toMatchObject({
      code: 'UNSUPPORTED_MODEL_TYPE', modelName: 'p1', modelType: 'PHFET',
    });
  });

  it('accepts lower-case supported types and resolves them like the parser', async () => {
    const api = new Circuit();
    api.addVoltageSource('vd', 'd', '0', { type: 'dc', value: -5 });
    api.addVoltageSource('vg', 'g', '0', { type: 'dc', value: -5 });
    api.addModel({ name: 'mp', type: 'pmos', params: { VTO: -1, KP: 2e-5 } });
    api.addMOSFET('m1', 'd', 'g', '0', 'mp');
    api.addAnalysis('op');
    const parsed = await simulate(`pmos
vd d 0 -5
vg g 0 -5
m1 d g 0 mp
.model mp pmos vto=-1 kp=2e-5
.op
.end
`);
    const fromApi = await simulate(api);
    expect(fromApi.dc!.current('vd')).toBeCloseTo(parsed.dc!.current('vd'), 15);
    // PMOS polarity: vd sources current out of its + terminal (|Id| = KP/2 * 16).
    expect(Math.abs(fromApi.dc!.current('vd'))).toBeGreaterThan(1e-4);
  });

  it('simulates the issue VDMOS API repro like ngspice-47 (VDMOS is implemented since #506)', async () => {
    // ngspice-47 `.model p1 vdmos vto=-1.2 kp=2` is n-channel: vd=-5 V forward
    // biases the body diode and ngspice prints i(vd) = 9.002319e+69. The #544
    // report predates #506; this pins API/parser/ngspice agreement.
    const c = new Circuit();
    c.addVoltageSource('vd', 'd', '0', { type: 'dc', value: -5 });
    c.addVoltageSource('vg', 'g', '0', { type: 'dc', value: -5 });
    c.addModel({ name: 'p1', type: 'VDMOS', params: { VTO: -1.2, KP: 2 } });
    c.addMOSFET('m1', 'd', 'g', '0', 'p1');
    c.addAnalysis('op');
    const result = await simulate(c);
    expect(result.dc!.current('vd') / 9.002319e69).toBeCloseTo(1, 6);
  });
});

describe('model/device-kind mismatch (#544)', () => {
  const cases: Array<[string, string, string, string]> = [
    ['M', 'NPN', 'vd d 0 5\nvg g 0 2\nm1 d g 0 q1\n.model q1 npn', 'm1'],
    ['D', 'NMOS', 'v1 a 0 1\nd1 a 0 m1\n.model m1 nmos', 'd1'],
    ['Q', 'D', 'vc c 0 5\nvb b 0 0.7\nq1 c b 0 d1\n.model d1 d', 'q1'],
    ['J', 'PMOS', 'vd d 0 5\nvg g 0 0\nj1 d g 0 mp\n.model mp pmos', 'j1'],
    ['Z', 'NPN', 'vd d 0 5\nvg g 0 0\nz1 d g 0 q1\n.model q1 npn', 'z1'],
    ['R', 'D', 'v1 a 0 1\nr1 a 0 1k d1\n.model d1 d', 'r1'],
    ['C', 'L', 'v1 a 0 1\nr1 a b 1k\nc1 b 0 1p l1\n.model l1 l', 'c1'],
    ['L', 'C', 'v1 a 0 1\nr1 a b 1k\nl1 b 0 1u c1\n.model c1 c', 'l1'],
    ['S', 'CSW', 'vc c 0 1\nr1 c o 1k\ns1 o 0 c 0 w1\n.model w1 csw', 's1'],
    ['W', 'SW', 'vc c 0 1\nr1 c o 1k\nw1 o 0 vc s1\n.model s1 sw', 'w1'],
  ];

  it.each(cases)('%s instance on a %s model raises MODEL_TYPE_MISMATCH', async (kind, type, body, device) => {
    const error = await simulate(`mismatch\n${body}\n.op\n.end\n`).then(
      () => { throw new Error('expected a rejection'); },
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(ModelTypeMismatchError);
    expect(error).toBeInstanceOf(InvalidCircuitError);
    expect(error).toMatchObject({
      name: 'ModelTypeMismatchError',
      code: 'MODEL_TYPE_MISMATCH',
      deviceName: device,
      deviceKind: kind,
      modelType: type,
    });
  });

  it('rejects an API MOSFET referencing an NPN model', async () => {
    const c = new Circuit();
    c.addVoltageSource('vd', 'd', '0', { type: 'dc', value: 5 });
    c.addModel({ name: 'q1', type: 'NPN', params: {} });
    c.addMOSFET('m1', 'd', 'd', '0', 'q1');
    c.addAnalysis('op');
    await expect(simulate(c)).rejects.toMatchObject({
      code: 'MODEL_TYPE_MISMATCH',
      deviceName: 'm1',
      modelName: 'q1',
      modelType: 'NPN',
      expectedTypes: ['NMOS', 'PMOS', 'VDMOS', 'VDMOSN', 'VDMOSP'],
    });
  });

  it('keeps the parser-time UnsupportedModelTypeError for netlists', () => {
    const error = failure(() => root.parse('t\nj1 d g s p1\n.model p1 phfet\n.op\n.end\n'));
    expect(error).toBeInstanceOf(root.UnsupportedModelTypeError);
    expect(error).toBeInstanceOf(ParseError);
    expect(root.SUPPORTED_MODEL_TYPES.has('NMOS')).toBe(true);
  });
});

describe('model types through the JSON protocol (#544)', () => {
  function documentRequest(model: { name: string; type: string }, component: unknown): SimulationRequestV1 {
    return {
      apiVersion: '1',
      input: {
        format: 'spice-ts',
        document: {
          format: 'spice-ts', schemaVersion: '1.0',
          circuit: {
            nets: ['a'],
            components: [
              { type: 'V', id: 'V1', name: 'V1', ports: [{ name: 'p', net: 'a' }, { name: 'n', net: '0' }], params: { waveform: 'dc', dc: 1 } },
              component,
            ],
          },
          analyses: [{ type: 'op' }],
          models: [{ ...model, params: {} }],
          subcircuits: [],
        },
      },
    } as unknown as SimulationRequestV1;
  }

  it('returns a structured ok:false diagnostic for an unsupported model type', async () => {
    const envelope = await executeProtocolV1(documentRequest(
      { name: 'P1', type: 'PHFET' },
      { type: 'D', id: 'D1', name: 'D1', ports: [{ name: 'anode', net: 'a' }, { name: 'cathode', net: '0' }], params: {}, model: 'P1' },
    ));
    expect(envelope.ok).toBe(false);
    if (envelope.ok) return;
    expect(envelope.error).toMatchObject({
      code: 'UNSUPPORTED_FEATURE',
      phase: 'validation',
      retryable: false,
      details: { reason: 'UNSUPPORTED_MODEL_TYPE', modelName: 'P1', modelType: 'PHFET' },
    });
  });

  it('returns a structured ok:false diagnostic for a model/device-kind mismatch', async () => {
    const envelope = await executeProtocolV1(documentRequest(
      { name: 'M1', type: 'NMOS' },
      { type: 'D', id: 'D1', name: 'D1', ports: [{ name: 'anode', net: 'a' }, { name: 'cathode', net: '0' }], params: {}, model: 'M1' },
    ));
    expect(envelope.ok).toBe(false);
    if (envelope.ok) return;
    expect(envelope.error).toMatchObject({
      code: 'INVALID_CIRCUIT',
      phase: 'compile',
      details: {
        reason: 'MODEL_TYPE_MISMATCH', deviceName: 'D1', deviceKind: 'D',
        modelName: 'M1', modelType: 'NMOS', expectedTypes: ['D'],
      },
    });
  });
});
