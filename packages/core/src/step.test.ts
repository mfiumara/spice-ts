import { describe, it, expect } from 'vitest';
import { simulate, parse, Circuit } from './index.js';

describe('.step directive', () => {
  describe('parsing', () => {
    it('parses linear step: .step param R1 1k 10k 1k', () => {
      const ckt = parse(`
        V1 1 0 DC 5
        R1 1 2 1k
        R2 2 0 1k
        .step param R1 1k 10k 1k
        .op
      `);
      const compiled = ckt.compile();
      expect(compiled.steps).toHaveLength(1);
      expect(compiled.steps[0]).toEqual({
        sweepType: 'linear',
        paramName: 'R1',
        start: 1000,
        stop: 10000,
        step: 1000,
      });
    });

    it('parses list step: .step param R1 list 1k 10k 100k', () => {
      const ckt = parse(`
        V1 1 0 DC 5
        R1 1 2 1k
        R2 2 0 1k
        .step param R1 list 1k 10k 100k
        .op
      `);
      const compiled = ckt.compile();
      expect(compiled.steps).toHaveLength(1);
      expect(compiled.steps[0]).toEqual({
        sweepType: 'list',
        paramName: 'R1',
        values: [1000, 10000, 100000],
      });
    });

    it('parses logarithmic (dec) step: .step dec param C1 1p 1u 10', () => {
      const ckt = parse(`
        V1 1 0 DC 5
        R1 1 0 1k
        C1 1 0 1p
        .step dec param C1 1p 1u 10
        .op
      `);
      const compiled = ckt.compile();
      expect(compiled.steps).toHaveLength(1);
      expect(compiled.steps[0]).toEqual({
        sweepType: 'dec',
        paramName: 'C1',
        start: 1e-12,
        stop: 1e-6,
        pointsPerDecade: 10,
      });
    });

    it('parses logarithmic (oct) step: .step oct param R1 1k 8k 5', () => {
      const ckt = parse(`
        V1 1 0 DC 5
        R1 1 0 1k
        .step oct param R1 1k 8k 5
        .op
      `);
      const compiled = ckt.compile();
      expect(compiled.steps).toHaveLength(1);
      expect(compiled.steps[0]).toEqual({
        sweepType: 'oct',
        paramName: 'R1',
        start: 1000,
        stop: 8000,
        pointsPerOctave: 5,
      });
    });

    it('is case-insensitive for .step keywords', () => {
      const ckt = parse(`
        V1 1 0 DC 5
        R1 1 2 1k
        R2 2 0 1k
        .STEP PARAM R1 LIST 1k 2k
        .op
      `);
      const compiled = ckt.compile();
      expect(compiled.steps).toHaveLength(1);
      expect(compiled.steps[0].sweepType).toBe('list');
    });
  });

  describe('programmatic API', () => {
    it('adds a linear step via addStep()', () => {
      const ckt = new Circuit();
      ckt.addVoltageSource('V1', '1', '0', { dc: 5 });
      ckt.addResistor('R1', '1', '2', 1000);
      ckt.addResistor('R2', '2', '0', 1000);
      ckt.addStep({ sweepType: 'linear', paramName: 'R1', start: 1000, stop: 3000, step: 1000 });
      ckt.addAnalysis('op');

      const compiled = ckt.compile();
      expect(compiled.steps).toHaveLength(1);
      expect(compiled.steps[0].sweepType).toBe('linear');
    });

    it('adds a list step via addStep()', () => {
      const ckt = new Circuit();
      ckt.addVoltageSource('V1', '1', '0', { dc: 5 });
      ckt.addResistor('R1', '1', '2', 1000);
      ckt.addResistor('R2', '2', '0', 1000);
      ckt.addStep({ sweepType: 'list', paramName: 'R1', values: [1000, 2000, 5000] });
      ckt.addAnalysis('op');

      const compiled = ckt.compile();
      expect(compiled.steps).toHaveLength(1);
      expect(compiled.steps[0].sweepType).toBe('list');
    });
  });

  describe('simulation with .step', () => {
    it('runs .op with linear step on resistor', async () => {
      // V1=5V, R1 varies, R2=1k — voltage divider V(2) = 5 * R2 / (R1 + R2)
      const result = await simulate(`
        V1 1 0 DC 5
        R1 1 2 1k
        R2 2 0 1k
        .step param R1 1k 3k 1k
        .op
      `);

      expect(result.steps).toBeDefined();
      expect(result.steps).toHaveLength(3);

      // R1=1k: V(2) = 5 * 1k / (1k + 1k) = 2.5
      expect(result.steps![0].paramName).toBe('R1');
      expect(result.steps![0].paramValue).toBe(1000);
      expect(result.steps![0].dc).toBeDefined();
      expect(result.steps![0].dc!.voltage('2')).toBeCloseTo(2.5, 6);

      // R1=2k: V(2) = 5 * 1k / (2k + 1k) = 5/3
      expect(result.steps![1].paramValue).toBe(2000);
      expect(result.steps![1].dc!.voltage('2')).toBeCloseTo(5 / 3, 6);

      // R1=3k: V(2) = 5 * 1k / (3k + 1k) = 1.25
      expect(result.steps![2].paramValue).toBe(3000);
      expect(result.steps![2].dc!.voltage('2')).toBeCloseTo(1.25, 6);
    });

    it('runs .op with list step', async () => {
      const result = await simulate(`
        V1 1 0 DC 5
        R1 1 2 1k
        R2 2 0 1k
        .step param R1 list 1k 4k
        .op
      `);

      expect(result.steps).toHaveLength(2);

      // R1=1k: V(2) = 2.5
      expect(result.steps![0].paramValue).toBe(1000);
      expect(result.steps![0].dc!.voltage('2')).toBeCloseTo(2.5, 6);

      // R1=4k: V(2) = 5 * 1k / (4k + 1k) = 1.0
      expect(result.steps![1].paramValue).toBe(4000);
      expect(result.steps![1].dc!.voltage('2')).toBeCloseTo(1.0, 6);
    });

    it('runs .op with logarithmic (dec) step', async () => {
      const result = await simulate(`
        V1 1 0 DC 5
        R1 1 2 1k
        R2 2 0 1k
        .step dec param R1 1k 10k 1
        .op
      `);

      // 1 decade from 1k to 10k, 1 point per decade => values: 1k, 10k
      expect(result.steps).toBeDefined();
      expect(result.steps!.length).toBe(2);
      expect(result.steps![0].paramValue).toBeCloseTo(1000, 0);
      expect(result.steps![1].paramValue).toBeCloseTo(10000, 0);
    });

    it('runs .op with logarithmic (oct) step', async () => {
      const result = await simulate(`
        V1 1 0 DC 5
        R1 1 2 1k
        R2 2 0 1k
        .step oct param R1 1k 2k 1
        .op
      `);

      // 1 octave from 1k to 2k, 1 point per octave => values: 1k, 2k
      expect(result.steps).toBeDefined();
      expect(result.steps!.length).toBe(2);
      expect(result.steps![0].paramValue).toBeCloseTo(1000, 0);
      expect(result.steps![1].paramValue).toBeCloseTo(2000, 0);
    });

    it('runs .ac with step on capacitor', async () => {
      // RC low-pass filter, sweep capacitor value
      const result = await simulate(`
        V1 in 0 AC 1
        R1 in out 1k
        C1 out 0 1u
        .step param C1 list 1u 10u
        .ac dec 5 1 10k
      `);

      expect(result.steps).toBeDefined();
      expect(result.steps).toHaveLength(2);

      // Both steps should have AC results
      expect(result.steps![0].ac).toBeDefined();
      expect(result.steps![1].ac).toBeDefined();

      // Larger capacitor => lower cutoff freq => lower magnitude at same frequency
      // At 100Hz, 10u cap should have lower magnitude than 1u cap
      const mag1u = result.steps![0].ac!.voltage('out');
      const mag10u = result.steps![1].ac!.voltage('out');
      // Find the entry closest to 100Hz
      const freq1u = result.steps![0].ac!.frequencies;
      const idx100 = freq1u.findIndex(f => f >= 100);
      expect(mag1u[idx100].magnitude).toBeGreaterThan(mag10u[idx100].magnitude);
    });

    it('runs .tran with step on resistor', async () => {
      const result = await simulate(`
        V1 1 0 PULSE(0 5 0 1n 1n 500u 1m)
        R1 1 2 1k
        C1 2 0 1u
        .step param R1 list 1k 10k
        .tran 10u 1m
      `);

      expect(result.steps).toBeDefined();
      expect(result.steps).toHaveLength(2);

      // Both steps should have transient results
      expect(result.steps![0].transient).toBeDefined();
      expect(result.steps![1].transient).toBeDefined();

      // Both should have time arrays
      expect(result.steps![0].transient!.time.length).toBeGreaterThan(0);
      expect(result.steps![1].transient!.time.length).toBeGreaterThan(0);
    });

    it('runs .dc sweep with step on resistor', async () => {
      const result = await simulate(`
        V1 1 0 DC 0
        R1 1 2 1k
        R2 2 0 1k
        .step param R1 list 1k 2k
        .dc V1 0 5 1
      `);

      expect(result.steps).toBeDefined();
      expect(result.steps).toHaveLength(2);

      // Both steps should have DC sweep results
      expect(result.steps![0].dcSweep).toBeDefined();
      expect(result.steps![1].dcSweep).toBeDefined();
    });

    it('does not populate top-level results when .step is used', async () => {
      const result = await simulate(`
        V1 1 0 DC 5
        R1 1 2 1k
        R2 2 0 1k
        .step param R1 list 1k 2k
        .op
      `);

      // Top-level dc/transient/ac should be undefined when steps are present
      expect(result.dc).toBeUndefined();
      expect(result.transient).toBeUndefined();
      expect(result.ac).toBeUndefined();
      // Steps should be populated
      expect(result.steps).toBeDefined();
      expect(result.steps!.length).toBe(2);
    });

    it('works with programmatic Circuit API', async () => {
      const ckt = new Circuit();
      ckt.addVoltageSource('V1', '1', '0', { dc: 5 });
      ckt.addResistor('R1', '1', '2', 1000);
      ckt.addResistor('R2', '2', '0', 1000);
      ckt.addStep({ sweepType: 'list', paramName: 'R1', values: [1000, 4000] });
      ckt.addAnalysis('op');

      const result = await simulate(ckt);

      expect(result.steps).toHaveLength(2);
      expect(result.steps![0].dc!.voltage('2')).toBeCloseTo(2.5, 6);
      expect(result.steps![1].dc!.voltage('2')).toBeCloseTo(1.0, 6);
    });

    it('backward compatible — no steps without .step directive', async () => {
      const result = await simulate(`
        V1 1 0 DC 5
        R1 1 2 1k
        R2 2 0 2k
        .op
      `);

      expect(result.steps).toBeUndefined();
      expect(result.dc).toBeDefined();
      expect(result.dc!.voltage('2')).toBeCloseTo(10 / 3, 6);
    });
  });
});
