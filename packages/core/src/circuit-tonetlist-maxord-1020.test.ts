import { describe, expect, it } from 'vitest';
import { parse } from './parser/index.js';
import { simulate } from './simulate.js';
import { WasmNgspiceSimulator } from './simulators/ngspice-wasm.js';
import type { SimulationOptions } from './types.js';

const RC = `MAXORD serialization regression
V1 in 0 PULSE(0 1 0 1n 1n 1m 2m)
R1 in out 1k
C1 out 0 1n
.tran 20n 1u
.end`;

function circuitWith(options: SimulationOptions) {
  const circuit = parse(RC);
  circuit.setSimulationOptions(options);
  return circuit;
}

const cases: Array<[string, SimulationOptions, string]> = [
  ['Gear order one', { integrationMethod: 'gear2', maxOrder: 1 }, '.options method=gear maxord=1'],
  ['Gear order two', { integrationMethod: 'gear2', maxOrder: 2 }, '.options method=gear maxord=2'],
  ['trapezoidal', { integrationMethod: 'trapezoidal', maxOrder: 2 }, '.options method=trap maxord=2'],
  ['Euler', { integrationMethod: 'euler' }, '.options method=trap maxord=1'],
  ['Euler with explicit order two', { integrationMethod: 'euler', maxOrder: 2 }, '.options method=trap maxord=1'],
];

describe('Circuit.toNetlist MAXORD serialization (#1020)', () => {
  it.each([1, 2, 6])('emits an independently specified maxOrder=%s', maxOrder => {
    expect(circuitWith({ maxOrder }).toNetlist()).toContain(`.options maxord=${maxOrder}\n`);
  });

  it.each(cases)('serializes %s as ngspice-compatible options', (_name, options, expected) => {
    const circuit = circuitWith(options);
    expect(circuit.toNetlist().split('\n').filter(line => line.startsWith('.options'))).toEqual([expected]);
    expect(circuit.simulationOptions).toEqual(options);
  });

  it.each([cases[0], cases[3], cases[4]])('round-trips %s without changing the native trajectory', async (_name, options) => {
    const circuit = circuitWith(options);
    const native = (await simulate(circuit)).transient!;
    const reparsed = parse(circuit.toNetlist());
    expect(reparsed.simulationOptions.maxOrder).toBe(1);
    const roundTrip = (await simulate(reparsed)).transient!;
    expect(roundTrip.time.length).toBeGreaterThan(1);
    expect(roundTrip.time).toEqual(native.time);
    for (const node of ['in', 'out']) expect(roundTrip.voltage(node)).toEqual(native.voltage(node));
    expect(roundTrip.current('V1')).toEqual(native.current('V1'));
  });

  it.each(cases)('propagates %s to the ngspice WASM input', async (_name, options, expected) => {
    const received: string[] = [];
    // Only the transport boundary is mocked. This is not waveform-parity evidence.
    class CapturingSimulation {
      async start() {}
      setNetList(netlist: string) { received.push(netlist); }
      async runSim() {
        return {
          numVariables: 2,
          numPoints: 1,
          dataType: 'real' as const,
          data: [
            { name: 'time', type: 'time', values: [0] },
            { name: 'v(out)', type: 'voltage', values: [0] },
          ],
        };
      }
      getError(): string[] { return []; }
    }
    const backend = new WasmNgspiceSimulator({ Simulation: CapturingSimulation });
    await simulate(circuitWith(options), { simulator: backend });
    expect(received).toHaveLength(1);
    expect(received[0].split('\n').filter(line => line.startsWith('.options'))).toEqual([expected]);
    expect(received[0]).not.toContain('method=euler');
    expect(received[0]).toContain('.tran ');
  });
});
