import { describe, it, expect } from 'vitest';
import { normalizeTransientData, normalizeACData } from './data.js';
import type { TransientDataset, ACDataset } from './types.js';

function mockTransientResult(time: number[], voltages: Record<string, number[]>) {
  const voltageMap = new Map(Object.entries(voltages));
  return {
    time,
    voltage(node: string) { const v = voltageMap.get(node); if (!v) throw new Error(`Unknown node: ${node}`); return v; },
    current(_source: string) { return []; },
  };
}

function mockACResult(frequencies: number[], voltages: Record<string, { magnitude: number; phase: number }[]>) {
  const voltageMap = new Map(Object.entries(voltages));
  return {
    frequencies,
    voltage(node: string) { const v = voltageMap.get(node); if (!v) throw new Error(`Unknown node: ${node}`); return v; },
    current(_source: string) { return []; },
  };
}

describe('normalizeTransientData', () => {
  it('normalizes a single TransientResult', () => {
    const result = mockTransientResult([0, 1, 2], { out: [0, 2.5, 5] });
    const datasets = normalizeTransientData(result, ['out']);
    expect(datasets).toHaveLength(1);
    expect(datasets[0].label).toBe('');
    expect(datasets[0].time).toEqual([0, 1, 2]);
    expect(datasets[0].signals.get('out')).toEqual([0, 2.5, 5]);
  });

  it('normalizes an array of TransientDatasets (pass-through)', () => {
    const ds: TransientDataset[] = [
      { time: [0, 1], signals: new Map([['out', [0, 5]]]), label: 'R=1k' },
      { time: [0, 1], signals: new Map([['out', [0, 3]]]), label: 'R=10k' },
    ];
    const datasets = normalizeTransientData(ds, ['out']);
    expect(datasets).toHaveLength(2);
    expect(datasets[0].label).toBe('R=1k');
    expect(datasets[1].label).toBe('R=10k');
  });

  it('extracts only requested signals', () => {
    const result = mockTransientResult([0, 1], { out: [0, 5], mid: [0, 2.5] });
    const datasets = normalizeTransientData(result, ['out']);
    expect(datasets[0].signals.has('out')).toBe(true);
    expect(datasets[0].signals.has('mid')).toBe(false);
  });
});

describe('normalizeACData', () => {
  it('normalizes a single ACResult into magnitude/phase arrays', () => {
    const result = mockACResult([100, 1000, 10000], {
      out: [
        { magnitude: 1, phase: 0 },
        { magnitude: 0.707, phase: -45 },
        { magnitude: 0.1, phase: -84 },
      ],
    });
    const datasets = normalizeACData(result, ['out']);
    expect(datasets).toHaveLength(1);
    expect(datasets[0].frequencies).toEqual([100, 1000, 10000]);
    const mags = datasets[0].magnitudes.get('out')!;
    expect(mags[0]).toBeCloseTo(0, 1);
    expect(mags[1]).toBeCloseTo(-3.01, 1);
    expect(datasets[0].phases.get('out')).toEqual([0, -45, -84]);
  });

  it('normalizes an array of ACDatasets (pass-through)', () => {
    const ds: ACDataset[] = [{
      frequencies: [100, 1000],
      magnitudes: new Map([['out', [0, -3]]]),
      phases: new Map([['out', [0, -45]]]),
      label: 'C=1n',
    }];
    const datasets = normalizeACData(ds, ['out']);
    expect(datasets).toHaveLength(1);
    expect(datasets[0].label).toBe('C=1n');
  });
});
