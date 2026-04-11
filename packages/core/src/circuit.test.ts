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

  describe('controlled source API', () => {
    it('addVCCS registers 4 nodes and no branches', () => {
      const ckt = new Circuit();
      ckt.addVCCS('G1', 'out', '0', 'in', '0', 0.01);
      expect(ckt.nodeCount).toBe(2);
      expect(ckt.branchCount).toBe(0);
    });

    it('addVCVS registers 4 nodes and 1 branch', () => {
      const ckt = new Circuit();
      ckt.addVCVS('E1', 'out', '0', 'in', '0', 10);
      expect(ckt.nodeCount).toBe(2);
      expect(ckt.branchCount).toBe(1);
    });

    it('addCCCS registers 2 output nodes and no branch', () => {
      const ckt = new Circuit();
      ckt.addVoltageSource('Vsense', '1', '0', { dc: 0 });
      ckt.addCCCS('F1', 'out', '0', 'Vsense', 3);
      expect(ckt.branchCount).toBe(1);
    });

    it('addCCVS registers 2 output nodes and 1 branch', () => {
      const ckt = new Circuit();
      ckt.addVoltageSource('Vsense', '1', '0', { dc: 0 });
      ckt.addCCVS('H1', 'out', '0', 'Vsense', 1000);
      expect(ckt.branchCount).toBe(2);
    });
  });

  describe('controlled source compilation', () => {
    it('compiles VCCS into a device', () => {
      const ckt = new Circuit();
      ckt.addVoltageSource('V1', '1', '0', { dc: 1 });
      ckt.addVCCS('G1', '2', '0', '1', '0', 0.01);
      ckt.addResistor('RL', '2', '0', 1e3);
      ckt.addAnalysis('op');
      const compiled = ckt.compile();
      expect(compiled.devices.find(d => d.name === 'G1')).toBeDefined();
    });

    it('compiles VCVS with a branch', () => {
      const ckt = new Circuit();
      ckt.addVoltageSource('V1', '1', '0', { dc: 1 });
      ckt.addVCVS('E1', '2', '0', '1', '0', 10);
      ckt.addResistor('RL', '2', '0', 1e3);
      ckt.addAnalysis('op');
      const compiled = ckt.compile();
      expect(compiled.branchCount).toBe(2);
      expect(compiled.devices.find(d => d.name === 'E1')).toBeDefined();
    });

    it('compiles CCCS resolving controlling V-source', () => {
      const ckt = new Circuit();
      ckt.addVoltageSource('Vsense', '1', '2', { dc: 0 });
      ckt.addResistor('R1', '2', '0', 1e3);
      ckt.addCCCS('F1', '3', '0', 'Vsense', 5);
      ckt.addResistor('RL', '3', '0', 1e3);
      ckt.addVoltageSource('V1', '1', '0', { dc: 1 });
      ckt.addAnalysis('op');
      const compiled = ckt.compile();
      expect(compiled.devices.find(d => d.name === 'F1')).toBeDefined();
    });

    it('compiles CCVS with own branch + controlling reference', () => {
      const ckt = new Circuit();
      ckt.addVoltageSource('Vsense', '1', '2', { dc: 0 });
      ckt.addResistor('R1', '2', '0', 1e3);
      ckt.addCCVS('H1', '3', '0', 'Vsense', 1000);
      ckt.addResistor('RL', '3', '0', 1e3);
      ckt.addVoltageSource('V1', '1', '0', { dc: 1 });
      ckt.addAnalysis('op');
      const compiled = ckt.compile();
      expect(compiled.branchCount).toBe(3);
      expect(compiled.devices.find(d => d.name === 'H1')).toBeDefined();
    });

    it('throws when CCCS references undefined V-source', () => {
      const ckt = new Circuit();
      ckt.addCCCS('F1', '1', '0', 'Vnope', 5);
      ckt.addResistor('R1', '1', '0', 1e3);
      ckt.addAnalysis('op');
      expect(() => ckt.compile()).toThrow('Vnope');
    });

    it('throws when CCVS references undefined V-source', () => {
      const ckt = new Circuit();
      ckt.addCCVS('H1', '1', '0', 'Vnope', 1000);
      ckt.addResistor('R1', '1', '0', 1e3);
      ckt.addAnalysis('op');
      expect(() => ckt.compile()).toThrow('Vnope');
    });
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

    it('expands subcircuit with BJT (Q device)', () => {
      const ckt = new Circuit();
      ckt.addModel({ name: 'QMOD', type: 'NPN', params: { BF: 100, IS: 1e-15 } });
      ckt.addSubcircuit({
        name: 'amp',
        ports: ['c', 'b', 'e'],
        params: {},
        body: ['Q1 c b e QMOD'],
      });
      ckt.addSubcircuitInstance('X1', ['3', '2', '0'], 'amp');
      ckt.addVoltageSource('V1', '3', '0', { dc: 5 });
      ckt.addVoltageSource('V2', '2', '0', { dc: 0.7 });
      ckt.addAnalysis('op');
      const compiled = ckt.compile();
      const bjt = compiled.devices.find(d => d.name === 'X1.Q1');
      expect(bjt).toBeDefined();
    });

    it('expands subcircuit with MOSFET (M device)', () => {
      const ckt = new Circuit();
      ckt.addModel({ name: 'NMOD', type: 'NMOS', params: { VTO: 0.5, KP: 120e-6 } });
      ckt.addSubcircuit({
        name: 'inv',
        ports: ['in', 'out', 'vdd', 'vss'],
        params: { W: 1e-6, L: 100e-9 },
        body: ['M1 out in vss NMOD W={W} L={L}'],
      });
      ckt.addSubcircuitInstance('X1', ['1', '2', '3', '0'], 'inv');
      ckt.addVoltageSource('V1', '3', '0', { dc: 1.8 });
      ckt.addVoltageSource('V2', '1', '0', { dc: 0.9 });
      ckt.addResistor('RL', '2', '0', 1e3);
      ckt.addAnalysis('op');
      const compiled = ckt.compile();
      const mosfet = compiled.devices.find(d => d.name === 'X1.M1');
      expect(mosfet).toBeDefined();
    });

    it('expands subcircuit with 4-terminal MOSFET (bulk node)', () => {
      const ckt = new Circuit();
      ckt.addModel({ name: 'PMOD', type: 'PMOS', params: { VTO: -0.5, KP: 60e-6 } });
      ckt.addSubcircuit({
        name: 'pgate',
        ports: ['in', 'out', 'vdd'],
        params: {},
        body: ['M1 out in vdd vdd PMOD W=2u L=100n'],
      });
      ckt.addSubcircuitInstance('X1', ['1', '2', '3'], 'pgate');
      ckt.addVoltageSource('V1', '3', '0', { dc: 1.8 });
      ckt.addVoltageSource('V2', '1', '0', { dc: 0.9 });
      ckt.addResistor('RL', '2', '0', 1e3);
      ckt.addAnalysis('op');
      const compiled = ckt.compile();
      const mosfet = compiled.devices.find(d => d.name === 'X1.M1');
      expect(mosfet).toBeDefined();
    });

    it('expands subcircuit with current source (I device)', () => {
      const ckt = new Circuit();
      ckt.addSubcircuit({
        name: 'isrc',
        ports: ['p', 'n'],
        params: {},
        body: ['I1 p n DC 1m'],
      });
      ckt.addSubcircuitInstance('X1', ['1', '0'], 'isrc');
      ckt.addResistor('R1', '1', '0', 1e3);
      ckt.addAnalysis('op');
      const compiled = ckt.compile();
      const csrc = compiled.devices.find(d => d.name === 'X1.I1');
      expect(csrc).toBeDefined();
    });

    it('expands subcircuit with voltage source waveform', () => {
      const ckt = new Circuit();
      ckt.addSubcircuit({
        name: 'vgen',
        ports: ['p', 'n'],
        params: {},
        body: ['V1 p n PULSE ( 0 5 0 1n 1n 5u 10u )'],
      });
      ckt.addSubcircuitInstance('X1', ['1', '0'], 'vgen');
      ckt.addResistor('R1', '1', '0', 1e3);
      ckt.addAnalysis('op');
      const compiled = ckt.compile();
      const vsrc = compiled.devices.find(d => d.name === 'X1.V1');
      expect(vsrc).toBeDefined();
    });

    it('expands subcircuit with .param inside body', () => {
      const ckt = new Circuit();
      ckt.addSubcircuit({
        name: 'paramtest',
        ports: ['a', 'b'],
        params: {},
        body: ['.param rval = 2k', 'R1 a b {rval}'],
      });
      ckt.addSubcircuitInstance('X1', ['1', '0'], 'paramtest');
      ckt.addVoltageSource('V1', '1', '0', { dc: 5 });
      ckt.addAnalysis('op');
      const compiled = ckt.compile();
      expect(compiled.devices).toHaveLength(2);
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

    it('expands subcircuit with VCCS (G device)', () => {
      const ckt = new Circuit();
      ckt.addSubcircuit({
        name: 'gamp',
        ports: ['inp', 'out', 'gnd'],
        params: {},
        body: ['G1 out gnd inp gnd 10m', 'R1 out gnd 1k'],
      });
      ckt.addSubcircuitInstance('X1', ['1', '2', '0'], 'gamp');
      ckt.addVoltageSource('V1', '1', '0', { dc: 1 });
      ckt.addAnalysis('op');
      const compiled = ckt.compile();
      expect(compiled.devices.find(d => d.name === 'X1.G1')).toBeDefined();
    });

    it('expands subcircuit with VCVS (E device)', () => {
      const ckt = new Circuit();
      ckt.addSubcircuit({
        name: 'eamp',
        ports: ['inp', 'out', 'gnd'],
        params: {},
        body: ['E1 out gnd inp gnd 10'],
      });
      ckt.addSubcircuitInstance('X1', ['1', '2', '0'], 'eamp');
      ckt.addVoltageSource('V1', '1', '0', { dc: 1 });
      ckt.addResistor('RL', '2', '0', 1e3);
      ckt.addAnalysis('op');
      const compiled = ckt.compile();
      expect(compiled.devices.find(d => d.name === 'X1.E1')).toBeDefined();
    });

    it('expands subcircuit with CCCS (F device)', () => {
      const ckt = new Circuit();
      ckt.addSubcircuit({
        name: 'famp',
        ports: ['inp', 'out', 'gnd'],
        params: {},
        body: ['Vs inp mid DC 0', 'R1 mid gnd 1k', 'F1 out gnd Vs 5'],
      });
      ckt.addSubcircuitInstance('X1', ['1', '2', '0'], 'famp');
      ckt.addVoltageSource('V1', '1', '0', { dc: 1 });
      ckt.addResistor('RL', '2', '0', 1e3);
      ckt.addAnalysis('op');
      const compiled = ckt.compile();
      expect(compiled.devices.find(d => d.name === 'X1.F1')).toBeDefined();
    });

    it('expands subcircuit with CCVS (H device)', () => {
      const ckt = new Circuit();
      ckt.addSubcircuit({
        name: 'hamp',
        ports: ['inp', 'out', 'gnd'],
        params: {},
        body: ['Vs inp mid DC 0', 'R1 mid gnd 1k', 'H1 out gnd Vs 1k'],
      });
      ckt.addSubcircuitInstance('X1', ['1', '2', '0'], 'hamp');
      ckt.addVoltageSource('V1', '1', '0', { dc: 1 });
      ckt.addResistor('RL', '2', '0', 1e3);
      ckt.addAnalysis('op');
      const compiled = ckt.compile();
      expect(compiled.devices.find(d => d.name === 'X1.H1')).toBeDefined();
    });
  });
});
