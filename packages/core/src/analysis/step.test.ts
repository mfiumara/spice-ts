import { describe, it, expect } from 'vitest';
import { Resistor } from '../devices/resistor.js';
import { Capacitor } from '../devices/capacitor.js';
import { Inductor } from '../devices/inductor.js';
import { generateStepValues } from './step.js';
import type { StepAnalysis } from '../types.js';

describe('Device parameter setters', () => {
  it('Resistor set/get parameter', () => {
    const r = new Resistor('R1', [0, 1], 1000);
    expect(r.getParameter()).toBe(1000);
    r.setParameter(2000);
    expect(r.getParameter()).toBe(2000);
    expect(r.resistance).toBe(2000);
  });

  it('Capacitor set/get parameter', () => {
    const c = new Capacitor('C1', [0, 1], 1e-9);
    expect(c.getParameter()).toBe(1e-9);
    c.setParameter(2e-9);
    expect(c.getParameter()).toBe(2e-9);
    expect(c.capacitance).toBe(2e-9);
  });

  it('Inductor set/get parameter', () => {
    const l = new Inductor('L1', [0, 1], 0, 1e-3);
    expect(l.getParameter()).toBe(1e-3);
    l.setParameter(2e-3);
    expect(l.getParameter()).toBe(2e-3);
    expect(l.inductance).toBe(2e-3);
  });
});

describe('generateStepValues', () => {
  it('generates linear sweep values', () => {
    const step: StepAnalysis = {
      type: 'step', param: 'R1', sweepMode: 'lin',
      start: 1000, stop: 5000, increment: 1000,
    };
    const values = generateStepValues(step);
    expect(values).toEqual([1000, 2000, 3000, 4000, 5000]);
  });

  it('generates decade sweep values', () => {
    const step: StepAnalysis = {
      type: 'step', param: 'C1', sweepMode: 'dec',
      start: 1e-12, stop: 1e-9, points: 3,
    };
    const values = generateStepValues(step);
    // 3 decades (1p to 1n), 3 points per decade = 9 intervals + 1 = 10 points
    expect(values.length).toBe(10);
    expect(values[0]).toBeCloseTo(1e-12, 20);
    expect(values[values.length - 1]).toBeCloseTo(1e-9, 18);
  });

  it('generates octave sweep values', () => {
    const step: StepAnalysis = {
      type: 'step', param: 'C1', sweepMode: 'oct',
      start: 100, stop: 800, points: 1,
    };
    const values = generateStepValues(step);
    // 3 octaves (100->200->400->800), 1 point per octave = 3 intervals + 1 = 4 points
    expect(values.length).toBe(4);
    expect(values[0]).toBeCloseTo(100);
    expect(values[1]).toBeCloseTo(200);
    expect(values[2]).toBeCloseTo(400);
    expect(values[3]).toBeCloseTo(800);
  });

  it('generates list sweep values', () => {
    const step: StepAnalysis = {
      type: 'step', param: 'R1', sweepMode: 'list',
      values: [1000, 4700, 10000],
    };
    const values = generateStepValues(step);
    expect(values).toEqual([1000, 4700, 10000]);
  });

  it('single-value list returns one value', () => {
    const step: StepAnalysis = {
      type: 'step', param: 'R1', sweepMode: 'list',
      values: [1000],
    };
    const values = generateStepValues(step);
    expect(values).toEqual([1000]);
  });
});

import { Circuit } from '../circuit.js';
import { parse } from '../parser/index.js';

describe('Circuit.addStep', () => {
  it('stores step and includes it in compiled output', () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('V1', '1', '0', { dc: 5 });
    ckt.addResistor('R1', '1', '0', 1000);
    ckt.addAnalysis('op');
    ckt.addStep('R1', { start: 1000, stop: 5000, step: 1000 });

    const compiled = ckt.compile();
    expect(compiled.steps.length).toBe(1);
    expect(compiled.steps[0].param).toBe('R1');
    expect(compiled.steps[0].sweepMode).toBe('lin');
  });

  it('stores decade sweep step', () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('V1', '1', '0', { dc: 5 });
    ckt.addCapacitor('C1', '1', '0', 1e-12);
    ckt.addAnalysis('op');
    ckt.addStep('C1', { mode: 'dec', start: 1e-12, stop: 1e-6, points: 10 });

    const compiled = ckt.compile();
    expect(compiled.steps[0].sweepMode).toBe('dec');
    expect(compiled.steps[0].points).toBe(10);
  });

  it('stores list sweep step', () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('V1', '1', '0', { dc: 5 });
    ckt.addResistor('R1', '1', '0', 1000);
    ckt.addAnalysis('op');
    ckt.addStep('R1', { values: [1000, 10000, 100000] });

    const compiled = ckt.compile();
    expect(compiled.steps[0].sweepMode).toBe('list');
    expect(compiled.steps[0].values).toEqual([1000, 10000, 100000]);
  });
});

describe('.step netlist parsing', () => {
  it('parses linear step', () => {
    const ckt = parse(`
      V1 1 0 DC 5
      R1 1 0 1k
      .op
      .step param R1 1k 100k 10k
    `);
    const compiled = ckt.compile();
    expect(compiled.steps.length).toBe(1);
    expect(compiled.steps[0].param).toBe('R1');
    expect(compiled.steps[0].sweepMode).toBe('lin');
    expect(compiled.steps[0].start).toBeCloseTo(1000);
    expect(compiled.steps[0].stop).toBeCloseTo(100000);
    expect(compiled.steps[0].increment).toBeCloseTo(10000);
  });

  it('parses decade step', () => {
    const ckt = parse(`
      V1 1 0 DC 5
      C1 1 0 1p
      .op
      .step dec param C1 1p 1u 10
    `);
    const compiled = ckt.compile();
    expect(compiled.steps[0].sweepMode).toBe('dec');
    expect(compiled.steps[0].start).toBeCloseTo(1e-12);
    expect(compiled.steps[0].stop).toBeCloseTo(1e-6);
    expect(compiled.steps[0].points).toBe(10);
  });

  it('parses octave step', () => {
    const ckt = parse(`
      V1 1 0 DC 5
      C1 1 0 1p
      .op
      .step oct param C1 100 800 1
    `);
    const compiled = ckt.compile();
    expect(compiled.steps[0].sweepMode).toBe('oct');
    expect(compiled.steps[0].points).toBe(1);
  });

  it('parses list step', () => {
    const ckt = parse(`
      V1 1 0 DC 5
      R1 1 0 1k
      .op
      .step param R1 list 1k 10k 100k
    `);
    const compiled = ckt.compile();
    expect(compiled.steps[0].sweepMode).toBe('list');
    expect(compiled.steps[0].values).toEqual([1000, 10000, 100000]);
  });
});

import { simulate, simulateStream } from '../simulate.js';
import type { StepStreamEvent } from '../types.js';

describe('.step + .op integration', () => {
  it('sweeps resistor in voltage divider', async () => {
    const result = await simulate(`
      V1 1 0 DC 10
      R1 1 2 1k
      R2 2 0 1k
      .op
      .step param R2 1k 5k 1k
    `);

    expect(result.steps).toBeDefined();
    expect(result.steps!.length).toBe(5); // 1k, 2k, 3k, 4k, 5k
    expect(result.dc).toBeUndefined();

    for (let i = 0; i < 5; i++) {
      const step = result.steps![i];
      const r2 = 1000 + i * 1000;
      expect(step.paramName).toBe('R2');
      expect(step.paramValue).toBeCloseTo(r2);
      expect(step.dc).toBeDefined();
      const expected = 10 * r2 / (1000 + r2);
      expect(step.dc!.voltage('2')).toBeCloseTo(expected, 4);
    }
  });

  it('sweeps with list mode', async () => {
    const result = await simulate(`
      V1 1 0 DC 10
      R1 1 2 1k
      R2 2 0 1k
      .op
      .step param R2 list 1k 10k
    `);

    expect(result.steps!.length).toBe(2);
    expect(result.steps![0].paramValue).toBeCloseTo(1000);
    expect(result.steps![1].paramValue).toBeCloseTo(10000);

    expect(result.steps![0].dc!.voltage('2')).toBeCloseTo(10 * 1000 / 2000, 4);
    expect(result.steps![1].dc!.voltage('2')).toBeCloseTo(10 * 10000 / 11000, 4);
  });
});

describe('.step + .ac integration', () => {
  it('sweeps capacitor in RC low-pass filter', async () => {
    // RC low-pass: V1 -> R1 -> out -> C1 -> GND
    // Cutoff freq = 1 / (2*pi*R*C)
    const result = await simulate(`
      V1 1 0 AC 1 0
      R1 1 2 1k
      C1 2 0 1n
      .ac dec 10 1k 10Meg
      .step param C1 list 1n 10n
    `);

    expect(result.steps).toBeDefined();
    expect(result.steps!.length).toBe(2);
    expect(result.ac).toBeUndefined();

    // With C=1n, fc ~ 159kHz; with C=10n, fc ~ 15.9kHz
    // At 1kHz both should be near unity gain
    const step1 = result.steps![0];
    const step2 = result.steps![1];
    expect(step1.ac).toBeDefined();
    expect(step2.ac).toBeDefined();

    // First frequency point (1kHz) should have near-unity magnitude for both
    const v1_1k = step1.ac!.voltage('2')[0];
    const v2_1k = step2.ac!.voltage('2')[0];
    expect(v1_1k.magnitude).toBeGreaterThan(0.9);
    expect(v2_1k.magnitude).toBeGreaterThan(0.9);

    // At high frequencies, larger C should have lower magnitude
    const lastIdx = step1.ac!.frequencies.length - 1;
    const v1_high = step1.ac!.voltage('2')[lastIdx];
    const v2_high = step2.ac!.voltage('2')[lastIdx];
    expect(v2_high.magnitude).toBeLessThan(v1_high.magnitude);
  });
});

describe('.step + .tran integration', () => {
  it('sweeps resistor in RC circuit transient', async () => {
    // RC charging: V1(step) -> R1 -> out -> C1 -> GND
    const result = await simulate(`
      V1 1 0 PULSE(0 5 0 1n 1n 10m 20m)
      R1 1 2 1k
      C1 2 0 1u
      .tran 10u 5m
      .step param R1 list 1k 10k
    `);

    expect(result.steps).toBeDefined();
    expect(result.steps!.length).toBe(2);
    expect(result.transient).toBeUndefined();

    const step1 = result.steps![0]; // R=1k, tau=1ms
    const step2 = result.steps![1]; // R=10k, tau=10ms

    expect(step1.transient).toBeDefined();
    expect(step2.transient).toBeDefined();

    // At t=5ms (~5*tau for R=1k, ~0.5*tau for R=10k)
    // R=1k should be closer to 5V, R=10k should be lower
    const v1 = step1.transient!.voltage('2');
    const v2 = step2.transient!.voltage('2');
    const lastIdx = v1.length - 1;
    expect(v1[lastIdx]).toBeGreaterThan(v2[lastIdx]);
  });
});

describe('.step streaming', () => {
  it('streams step events for .ac', async () => {
    const events: StepStreamEvent[] = [];
    for await (const event of simulateStream(`
      V1 1 0 AC 1 0
      R1 1 2 1k
      C1 2 0 1n
      .ac dec 5 1k 100k
      .step param C1 list 1n 10n
    `)) {
      events.push(event as StepStreamEvent);
    }

    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      expect(e.stepIndex).toBeDefined();
      expect(e.paramName).toBe('C1');
      expect(e.paramValue).toBeDefined();
    }

    const stepIndices = new Set(events.map(e => e.stepIndex));
    expect(stepIndices.size).toBe(2);
    expect(stepIndices.has(0)).toBe(true);
    expect(stepIndices.has(1)).toBe(true);

    // Step 0 events should come before step 1 events
    const firstStep1Idx = events.findIndex(e => e.stepIndex === 1);
    const lastStep0Idx = events.length - 1 - [...events].reverse().findIndex(e => e.stepIndex === 0);
    expect(lastStep0Idx).toBeLessThan(firstStep1Idx);
  });

  it('streams step events for .tran', async () => {
    const events: StepStreamEvent[] = [];
    for await (const event of simulateStream(`
      V1 1 0 PULSE(0 5 0 1n 1n 1m 2m)
      R1 1 2 1k
      C1 2 0 100n
      .tran 10u 500u
      .step param R1 list 1k 10k
    `)) {
      events.push(event as StepStreamEvent);
    }

    expect(events.length).toBeGreaterThan(0);
    const stepIndices = new Set(events.map(e => e.stepIndex));
    expect(stepIndices.size).toBe(2);
  });
});

describe('.step via Circuit builder API', () => {
  it('sweeps resistor using addStep', async () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('V1', '1', '0', { dc: 10 });
    ckt.addResistor('R1', '1', '2', 1000);
    ckt.addResistor('R2', '2', '0', 1000);
    ckt.addAnalysis('op');
    ckt.addStep('R2', { start: 1000, stop: 3000, step: 1000 });

    const result = await simulate(ckt);

    expect(result.steps).toBeDefined();
    expect(result.steps!.length).toBe(3);

    for (let i = 0; i < 3; i++) {
      const r2 = 1000 + i * 1000;
      const expected = 10 * r2 / (1000 + r2);
      expect(result.steps![i].dc!.voltage('2')).toBeCloseTo(expected, 4);
    }
  });

  it('sweeps capacitor with decade mode using addStep', async () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('V1', '1', '0', { type: 'ac', magnitude: 1, phase: 0 });
    ckt.addResistor('R1', '1', '2', 1000);
    ckt.addCapacitor('C1', '2', '0', 1e-9);
    ckt.addAnalysis('ac', { variation: 'dec', points: 5, startFreq: 1000, stopFreq: 1e6 });
    ckt.addStep('C1', { mode: 'dec', start: 1e-9, stop: 1e-7, points: 1 });

    const result = await simulate(ckt);

    expect(result.steps).toBeDefined();
    expect(result.steps!.length).toBe(3);
    for (const step of result.steps!) {
      expect(step.ac).toBeDefined();
      expect(step.ac!.frequencies.length).toBeGreaterThan(0);
    }
  });
});
