import { describe, expect, it, vi } from 'vitest';
import { parse } from '../parser/index.js';
import type { DeviceModel } from '../devices/device.js';
import { Capacitor } from '../devices/capacitor.js';
import { MOSFET } from '../devices/mosfet.js';
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
R7 a c 3.3k m=3 scale=0.7 tc1=1e-3 tc2=2e-6
R8 d b 7.77k tce=0.5
C4 c 0 3p
.tran 50n 12u
`;

// #625: consecutive level-1 MOSFETs (NMOS and PMOS, bulk on source, rail or
// its own node, a grounded source) interleaved with resistors and sources
// that share their nodes, so slot addition order matters.
const MOS_NETLIST = `
VDD vdd 0 3.3
VIN in 0 PULSE(0 3.3 1n 100p 100p 2n 5n)
M1 out in 0 0 NM W=2u L=1u
M2 out in vdd vdd PM W=4u L=1u
R1 out mid 1k
M3 o2 out 0 0 NM W=2u L=1u
M4 o2 out vdd vdd PM W=4u L=1u
M5 o3 o2 mid sub NM W=1u L=0.5u
M6 mid o3 o2 o2 PM W=3u L=1u
R2 o3 0 10k
R3 sub 0 1meg
C1 o3 0 10f
M7 vdd o3 o2 0 NM W=1u L=1u
.model NM NMOS(VTO=0.7 KP=110u GAMMA=0.4 LAMBDA=0.04 PHI=0.65 CBD=2f CBS=2f)
.model PM PMOS(VTO=-0.7 KP=50u GAMMA=0.57 LAMBDA=0.05 PHI=0.65)
.tran 0.1n 10n
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
      if (device instanceof Resistor) device.setTemperature(61.3);
    }
    expectSamePass(actual, expected, compiled.devices);
  });

  it('picks up direct conductance and capacitance writes between passes (#890)', () => {
    const { compiled, expected, actual } = setup();
    expectSamePass(actual, expected, compiled.devices);
    for (const device of compiled.devices) {
      if (device instanceof Resistor) device.conductance *= 1.5;
      if (device instanceof Capacitor) device.capacitance *= 0.75;
    }
    expectSamePass(actual, expected, compiled.devices);
    // Writing a single device of each kind must still refresh its run.
    const r = compiled.devices.find(d => d instanceof Resistor && d.name.toLowerCase() === 'r3') as Resistor;
    const c = compiled.devices.find(d => d instanceof Capacitor && d.name.toLowerCase() === 'c2') as Capacitor;
    r.conductance = 1 / 123;
    c.capacitance = 4.7e-9;
    expectSamePass(actual, expected, compiled.devices);
  });

  it('reads no device value in a pass when none changed (#890)', () => {
    // A large two-terminal run, as on the M2 RC ladder. Once the program is
    // built and filled, the kernels read conductances/capacitances from typed
    // arrays, not from one device object per entry.
    const n = 64;
    const lines = ['V1 n0 0 1'];
    for (let i = 1; i < n; i++) lines.push(`R${i} n${i - 1} n${i} 1k`, `C${i} n${i} 0 1p`);
    const compiled = parse(`${lines.join('\n')}\n.tran 1n 10n\n`).compile();
    const assembler = new MNAAssembler(compiled.nodeCount, compiled.branchCount);
    genericPass(assembler, compiled.devices);
    assembler.lockTopology();
    const dyn = dynamic(compiled.devices);
    for (let pass = 0; pass < 4; pass++) programPass(assembler, compiled.devices, dyn);
    let reads = 0;
    const counted: [DeviceModel, string][] = [];
    for (const device of compiled.devices) {
      const key = device instanceof Resistor ? 'conductance' : device instanceof Capacitor ? 'capacitance' : undefined;
      if (key === undefined) continue;
      const record = device as unknown as Record<string, number>;
      const value = record[key];
      Object.defineProperty(device, key, {
        configurable: true,
        get: () => { reads++; return value; },
      });
      counted.push([device, key]);
    }
    expect(counted.length).toBe(2 * (n - 1));
    programPass(assembler, compiled.devices, dyn);
    expect(reads).toBe(0);
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

  it('stamps level-1 MOSFET runs bit for bit in netlist order (#625)', () => {
    // Two independent compiles: MOSFETs carry Newton state (lastVbs/lastVbd/
    // lastVon), so each side needs its own instances.
    const expectedDevices = parse(MOS_NETLIST).compile();
    const actualDevices = parse(MOS_NETLIST).compile();
    const mosfets = actualDevices.devices.filter(d => d instanceof MOSFET);
    expect(mosfets.length).toBeGreaterThanOrEqual(5);
    const make = (compiled: typeof expectedDevices) => {
      const assembler = new MNAAssembler(compiled.nodeCount, compiled.branchCount);
      assembler.clear();
      const ctx = assembler.getStampContext();
      for (const device of compiled.devices) device.stamp(ctx);
      assembler.lockTopology();
      assembler.deviceGmin = 3.7e-11;
      return assembler;
    };
    const expected = make(expectedDevices);
    const actual = make(actualDevices);
    const stampSpy = vi.spyOn(MOSFET.prototype, 'stamp');
    for (let repeat = 0; repeat < 8; repeat++) {
      // Solutions that swing every MOSFET through forward, reverse (vds < 0),
      // cut-off and limited-junction regions.
      for (const assembler of [expected, actual]) {
        for (let i = 0; i < assembler.systemSize; i++) {
          assembler.solution[i] = 2.5 * Math.sin(1.3 * i + 0.9 * repeat) - 0.4 * ((i + repeat) % 3);
        }
      }
      expected.clear();
      const ctxE = expected.getStampContext(1);
      for (const device of expectedDevices.devices) device.stamp(ctxE);
      stampSpy.mockClear();
      actual.clear();
      stampStaticDevices(actual, actualDevices.devices, actual.getStampContext(1));
      if (repeat >= 3) expect(stampSpy).not.toHaveBeenCalled();
      expectIdentical(actual.gValues, expected.gValues);
      expectIdentical(actual.b, expected.b);
    }
    stampSpy.mockRestore();
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
