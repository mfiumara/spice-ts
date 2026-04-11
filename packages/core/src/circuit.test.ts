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

  describe('subcircuit expansion', () => {
    it('expands a simple subcircuit with correct nodes', () => {
      const ckt = new Circuit();
      ckt.addSubcircuit({
        name: 'mydiv',
        ports: ['a', 'b'],
        params: {},
        body: ['R1 a b 1k'],
      });
      ckt.addSubcircuitInstance('X1', ['1', '0'], 'mydiv');
      ckt.addVoltageSource('V1', '1', '0', { dc: 5 });
      ckt.addAnalysis('op');
      const compiled = ckt.compile();
      expect(compiled.devices).toHaveLength(2);
    });

    it('prefixes internal nodes', () => {
      const ckt = new Circuit();
      ckt.addSubcircuit({
        name: 'buf',
        ports: ['in', 'out'],
        params: {},
        body: ['R1 in mid 1k', 'R2 mid out 1k'],
      });
      ckt.addSubcircuitInstance('X1', ['1', '2'], 'buf');
      ckt.addVoltageSource('V1', '1', '0', { dc: 5 });
      ckt.addResistor('RL', '2', '0', 1e3);
      ckt.addAnalysis('op');
      const compiled = ckt.compile();
      expect(compiled.nodeNames).toContain('X1.mid');
    });

    it('never prefixes ground node', () => {
      const ckt = new Circuit();
      ckt.addSubcircuit({
        name: 'grounded',
        ports: ['a'],
        params: {},
        body: ['R1 a 0 1k'],
      });
      ckt.addSubcircuitInstance('X1', ['1'], 'grounded');
      ckt.addVoltageSource('V1', '1', '0', { dc: 5 });
      ckt.addAnalysis('op');
      const compiled = ckt.compile();
      expect(compiled.nodeNames).not.toContain('X1.0');
    });

    it('applies parameter overrides', () => {
      const ckt = new Circuit();
      ckt.addSubcircuit({
        name: 'paramres',
        ports: ['a', 'b'],
        params: { R: 1000 },
        body: ['R1 a b {R}'],
      });
      ckt.addSubcircuitInstance('X1', ['1', '0'], 'paramres', { R: 2000 });
      ckt.addVoltageSource('V1', '1', '0', { dc: 5 });
      ckt.addAnalysis('op');
      const compiled = ckt.compile();
      expect(compiled.devices).toHaveLength(2);
    });

    it('throws on undefined subcircuit', () => {
      const ckt = new Circuit();
      ckt.addSubcircuitInstance('X1', ['1', '0'], 'nonexistent');
      ckt.addVoltageSource('V1', '1', '0', { dc: 5 });
      ckt.addAnalysis('op');
      expect(() => ckt.compile()).toThrow('nonexistent');
    });

    it('throws on wrong port count', () => {
      const ckt = new Circuit();
      ckt.addSubcircuit({
        name: 'twoport',
        ports: ['a', 'b'],
        params: {},
        body: ['R1 a b 1k'],
      });
      ckt.addSubcircuitInstance('X1', ['1', '2', '3'], 'twoport');
      ckt.addVoltageSource('V1', '1', '0', { dc: 5 });
      ckt.addAnalysis('op');
      expect(() => ckt.compile()).toThrow('port');
    });

    it('handles nested subcircuit expansion', () => {
      const ckt = new Circuit();
      ckt.addSubcircuit({
        name: 'inner',
        ports: ['a', 'b'],
        params: {},
        body: ['R1 a b 1k'],
      });
      ckt.addSubcircuit({
        name: 'outer',
        ports: ['x', 'y'],
        params: {},
        body: ['X1 x mid inner', 'X2 mid y inner'],
      });
      ckt.addSubcircuitInstance('X0', ['1', '0'], 'outer');
      ckt.addVoltageSource('V1', '1', '0', { dc: 5 });
      ckt.addAnalysis('op');
      const compiled = ckt.compile();
      // Should have V1 + 2 resistors from nested expansion
      const resistors = compiled.devices.filter(d => d.name.includes('X0'));
      expect(resistors.length).toBe(2);
      expect(compiled.nodeNames).toContain('X0.mid');
    });

    it('scopes local .model to subcircuit', () => {
      const ckt = new Circuit();
      ckt.addSubcircuit({
        name: 'withmodel',
        ports: ['a', 'b'],
        params: {},
        body: [
          '.model DLOCAL D(IS=1e-14)',
          'D1 a b DLOCAL',
        ],
      });
      ckt.addSubcircuitInstance('X1', ['1', '0'], 'withmodel');
      ckt.addVoltageSource('V1', '1', '0', { dc: 0.7 });
      ckt.addAnalysis('op');
      const compiled = ckt.compile();
      expect(compiled.devices).toHaveLength(2);
    });
  });
});
