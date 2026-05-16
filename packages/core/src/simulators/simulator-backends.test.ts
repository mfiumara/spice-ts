import { describe, expect, it } from 'vitest';
import { Circuit } from '../circuit.js';
import { DCResult } from '../results.js';
import { createSimulator, simulate, simulateStepStream, simulateStream } from '../simulate.js';
import type { SimulatorAdapter } from '../types.js';

describe('swappable simulator backends', () => {
  it('routes simulate() through a custom adapter', async () => {
    const adapter: SimulatorAdapter = {
      name: 'test-adapter',
      async simulate() {
        return {
          dc: new DCResult(new Map([['out', 1.25]]), new Map()),
          warnings: [{ type: 'test', message: 'adapter used' }],
        };
      },
    };

    const result = await simulate('V1 out 0 DC 1\n.op', { simulator: adapter });

    expect(result.dc!.voltage('out')).toBe(1.25);
    expect(result.warnings[0]).toEqual({ type: 'test', message: 'adapter used' });
  });

  it('keeps the TypeScript simulator as the default backend', async () => {
    const simulator = createSimulator('spice-ts');
    const result = await simulator.simulate(`
      V1 1 0 DC 5
      R1 1 2 1k
      R2 2 0 2k
      .op
      .end
    `);

    expect(result.dc!.voltage('2')).toBeCloseTo(10 / 3, 6);
  });

  it('runs a DC operating point through ngspice WASM', async () => {
    const result = await simulate(`
      V1 1 0 DC 5
      R1 1 2 1k
      R2 2 0 2k
      .op
      .end
    `, { simulator: 'ngspice-wasm' });

    expect(result.dc!.voltage('1')).toBeCloseTo(5, 6);
    expect(result.dc!.voltage('2')).toBeCloseTo(10 / 3, 6);
    expect(result.dc!.current('V1')).toBeCloseTo(-1 / 600, 6);
  });

  it('runs a programmatic Circuit through ngspice WASM', async () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('V1', 'in', '0', { dc: 3 });
    ckt.addResistor('R1', 'in', 'out', 1000);
    ckt.addResistor('R2', 'out', '0', 2000);
    ckt.addAnalysis('op');

    const result = await simulate(ckt, { simulator: 'ngspice-wasm' });

    expect(result.dc!.voltage('out')).toBeCloseTo(2, 6);
  });

  it('preprocesses includes before running ngspice WASM', async () => {
    const result = await simulate(`
      .include 'divider.inc'
      V1 1 0 DC 6
      .op
      .end
    `, {
      simulator: 'ngspice-wasm',
      resolveInclude: async (path) => {
        expect(path).toBe('divider.inc');
        return 'R1 1 2 1k\nR2 2 0 2k';
      },
    });

    expect(result.dc!.voltage('2')).toBeCloseTo(4, 6);
  });

  it('maps ngspice WASM DC sweep, transient, and AC result shapes', async () => {
    const dc = await simulate(`
      V1 in 0 DC 0
      R1 in 0 1k
      .dc V1 0 2 1
      .end
    `, { simulator: 'ngspice-wasm' });

    expect([...dc.dcSweep!.sweepValues]).toEqual([0, 1, 2]);
    expect([...dc.dcSweep!.voltage('in')]).toEqual([0, 1, 2]);

    const tran = await simulate(`
      V1 in 0 PULSE(0 5 0 1n 1n 5u 10u)
      R1 in out 1k
      C1 out 0 1u
      .tran 1u 2u
      .end
    `, { simulator: 'ngspice-wasm' });

    expect(tran.transient!.time.length).toBeGreaterThan(2);
    expect(tran.transient!.voltage('out').length).toBe(tran.transient!.time.length);

    const ac = await simulate(`
      V1 in 0 AC 1
      R1 in out 1k
      C1 out 0 1u
      .ac dec 2 1 100
      .end
    `, { simulator: 'ngspice-wasm' });

    expect(ac.ac!.frequencies).toHaveLength(5);
    expect(ac.ac!.voltage('in')[0].magnitude).toBeCloseTo(1, 6);
  });

  it('streams result points from external backends', async () => {
    const points = [];
    for await (const point of simulateStream(`
      V1 in 0 PULSE(0 1 0 1n 1n 5u 10u)
      R1 in out 1k
      C1 out 0 1u
      .tran 1u 1u
      .end
    `, { simulator: 'ngspice-wasm' })) {
      points.push(point);
    }

    expect(points.length).toBeGreaterThan(1);
    expect('time' in points[0]).toBe(true);
  });

  it('maps ngspice WASM .step result sets', async () => {
    const result = await simulate(`
      V1 1 0 DC 10
      R1 1 2 1k
      R2 2 0 1k
      .op
      .step param R2 list 1k 4k
      .end
    `, { simulator: 'ngspice-wasm' });

    expect(result.steps).toHaveLength(2);
    expect(result.dc).toBeUndefined();
    expect(result.steps![0].paramName).toBe('R2');
    expect(result.steps![0].paramValue).toBeCloseTo(1000);
    expect(result.steps![0].dc!.voltage('2')).toBeCloseTo(5, 6);
    expect(result.steps![1].paramValue).toBeCloseTo(4000);
    expect(result.steps![1].dc!.voltage('2')).toBeCloseTo(8, 6);
  });

  it('streams ngspice WASM .step points with metadata', async () => {
    const events = [];
    for await (const event of simulateStepStream(`
      V1 in 0 AC 1
      R1 in out 1k
      C1 out 0 1u
      .ac lin 1 1 2
      .step param R1 list 1k 2k
      .end
    `, { simulator: 'ngspice-wasm' })) {
      events.push(event);
    }

    expect(events).toHaveLength(2);
    expect(events[0].stepIndex).toBe(0);
    expect(events[0].paramName).toBe('R1');
    expect(events[0].paramValue).toBeCloseTo(1000);
    expect('frequency' in events[0].point).toBe(true);
    expect(events[1].stepIndex).toBe(1);
    expect(events[1].paramValue).toBeCloseTo(2000);
  });
});
