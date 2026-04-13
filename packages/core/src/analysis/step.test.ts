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
