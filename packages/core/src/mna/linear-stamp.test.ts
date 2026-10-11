import { describe, expect, it } from 'vitest';
import { parse } from '../parser/index.js';
import type { DeviceModel } from '../devices/device.js';
import { Capacitor } from '../devices/capacitor.js';
import { Resistor } from '../devices/resistor.js';
import { MNAAssembler } from './assembler.js';
import { stampDynamicDevices, stampStaticDevices } from './linear-stamp.js';

// Issue #570: plain resistors and capacitors are stamped from precomputed
// value slots instead of one ctx.stampG / ctx.stampC call per entry. The
// result must be bit-identical to calling each device's own stamp in netlist
// order, because every slot receives the same additions in the same order.

const NETLIST = `
V1 in 0 PULSE(0 1 1u 100n 100n 2u 5u)
R1 in a 1k
R2 0 a 3.3k
C1 a 0 1n
C2 0 b 2.2n
R3 a b 470
D1 b 0 DMOD
.model DMOD D(CJO=1p)
R4 b c 10k
C3 b c 10p
L1 c d 1m
R5 d 0 1e-3
I1 0 c DC 1m
R6 c 0 5k
C4 c 0 3p
.tran 50n 12u
`;

const dynamic = (devices: readonly DeviceModel[]) => devices.filter(device => (
  device.stampDynamic !== undefined && !device.integratesTransientCharge
  && device.storesCharge !== false
));

function genericPass(assembler: MNAAssembler, devices: readonly DeviceModel[]): void {
  assembler.clear();
  const ctx = assembler.getStampContext();
  for (const device of devices) device.stamp(ctx);
  for (const device of dynamic(devices)) device.stampDynamic!(ctx);
}

function programPass(assembler: MNAAssembler, devices: readonly DeviceModel[], dyn: readonly DeviceModel[]): void {
  assembler.clear();
  const ctx = assembler.getStampContext();
  stampStaticDevices(assembler, devices, ctx);
  stampDynamicDevices(assembler, dyn, ctx);
}

function setup() {
  const compiled = parse(NETLIST).compile();
  const make = () => {
    const assembler = new MNAAssembler(compiled.nodeCount, compiled.branchCount);
    genericPass(assembler, compiled.devices);
    assembler.lockTopology();
    // A deterministic, non-trivial operating point for the diode.
    for (let i = 0; i < assembler.systemSize; i++) assembler.solution[i] = 0.1 * ((i * 7) % 5) - 0.13;
    return assembler;
  };
  return { compiled, expected: make(), actual: make() };
}

function expectIdentical(actual: Float64Array, expected: Float64Array): void {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    if (!Object.is(actual[i], expected[i])) {
      throw new Error(`entry ${i}: ${actual[i]} !== ${expected[i]}`);
    }
  }
}

function expectSamePass(
  actual: MNAAssembler, expected: MNAAssembler, devices: readonly DeviceModel[],
): void {
  const dyn = dynamic(devices);
  for (let repeat = 0; repeat < 5; repeat++) {
    genericPass(expected, devices);
    programPass(actual, devices, dyn);
    expectIdentical(actual.gValues, expected.gValues);
    expectIdentical(actual.cValues, expected.cValues);
    expectIdentical(actual.b, expected.b);
  }
}

describe('linear stamp programs (#570)', () => {
  it('fixture exercises the resistor and capacitor kernels', () => {
    const { compiled } = setup();
    expect(compiled.devices.filter(d => d instanceof Resistor).length).toBeGreaterThanOrEqual(5);
    expect(compiled.devices.filter(d => d instanceof Capacitor).length).toBeGreaterThanOrEqual(4);
  });

  it('matches per-device stamping bit for bit', () => {
    const { compiled, expected, actual } = setup();
    expectSamePass(actual, expected, compiled.devices);
  });

  it('reads resistance and capacitance at stamp time', () => {
    const { compiled, expected, actual } = setup();
    expectSamePass(actual, expected, compiled.devices);
    for (const device of compiled.devices) {
      if (device instanceof Resistor || device instanceof Capacitor) {
        device.setParameter(device.getParameter() * 1.37);
      }
    }
    expectSamePass(actual, expected, compiled.devices);
  });

  it('rebuilds its slots after the topology is relocked', () => {
    const { compiled, expected, actual } = setup();
    expectSamePass(actual, expected, compiled.devices);
    for (const assembler of [expected, actual]) {
      assembler.invalidateTopology();
      genericPass(assembler, compiled.devices);
      assembler.lockTopology();
    }
    expectSamePass(actual, expected, compiled.devices);
  });

  it('keeps netlist order across sub-lists and on the unlocked path', () => {
    const { compiled } = setup();
    const subset = compiled.devices.filter((_, index) => index % 2 === 1);
    const expected = new MNAAssembler(compiled.nodeCount, compiled.branchCount);
    const actual = new MNAAssembler(compiled.nodeCount, compiled.branchCount);
    // Unlocked (Map-based) path delegates to the devices themselves.
    genericPass(expected, compiled.devices);
    programPass(actual, compiled.devices, dynamic(compiled.devices));
    for (let row = 0; row < expected.systemSize; row++) {
      expect([...actual.G.getRow(row)]).toEqual([...expected.G.getRow(row)]);
      expect([...actual.C.getRow(row)]).toEqual([...expected.C.getRow(row)]);
    }
    expected.lockTopology();
    actual.lockTopology();
    expectSamePass(actual, expected, subset);
    expectSamePass(actual, expected, compiled.devices);
  });
});
