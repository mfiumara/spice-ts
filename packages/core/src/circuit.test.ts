import { describe, it, expect } from 'vitest';
import { Circuit } from './circuit.js';

describe('Circuit', () => {
  it('maps node names to indices, with ground at -1', () => {
    const ckt = new Circuit();
    ckt.addResistor('R1', '1', '0', 1000);
    ckt.addResistor('R2', '1', '2', 2000);

    expect(ckt.getNodeIndex('0')).toBe(-1);
    expect(ckt.getNodeIndex('1')).toBeGreaterThanOrEqual(0);
    expect(ckt.getNodeIndex('2')).toBeGreaterThanOrEqual(0);
    expect(ckt.nodeCount).toBe(2);
  });

  it('adds voltage source with branch index', () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('V1', '1', '0', { dc: 5 });
    expect(ckt.branchCount).toBe(1);
  });

  it('adds analysis commands', () => {
    const ckt = new Circuit();
    ckt.addResistor('R1', '1', '0', 1000);
    ckt.addAnalysis('op');
    expect(ckt.analyses).toHaveLength(1);
    expect(ckt.analyses[0]).toEqual({ type: 'op' });
  });

  it('adds transient analysis', () => {
    const ckt = new Circuit();
    ckt.addResistor('R1', '1', '0', 1000);
    ckt.addAnalysis('tran', { timestep: 1e-9, stopTime: 1e-6 });
    expect(ckt.analyses[0]).toEqual({
      type: 'tran',
      timestep: 1e-9,
      stopTime: 1e-6,
    });
  });

  it('builds device list with correct node indices', () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('V1', '1', '0', { dc: 5 });
    ckt.addResistor('R1', '1', '2', 1000);
    ckt.addResistor('R2', '2', '0', 2000);

    const compiled = ckt.compile();
    expect(compiled.devices).toHaveLength(3);
    expect(compiled.nodeCount).toBe(2);
    expect(compiled.branchCount).toBe(1);
    expect(compiled.nodeNames).toContain('1');
    expect(compiled.nodeNames).toContain('2');
  });

  it('provides node name to index mapping', () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('V1', '1', '0', { dc: 5 });
    ckt.addResistor('R1', '1', '2', 1000);

    const compiled = ckt.compile();
    const idx1 = compiled.nodeIndexMap.get('1')!;
    const idx2 = compiled.nodeIndexMap.get('2')!;
    expect(idx1).toBeGreaterThanOrEqual(0);
    expect(idx2).toBeGreaterThanOrEqual(0);
    expect(idx1).not.toBe(idx2);
  });
});
