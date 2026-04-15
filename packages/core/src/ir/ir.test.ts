import { describe, it, expect } from 'vitest';
import type { CircuitIR, IRComponent, IRPort, ComponentType } from './types.js';
import { Circuit } from '../circuit.js';

describe('IR types', () => {
  it('should construct a valid circuit', () => {
    const circuit: CircuitIR = {
      components: [
        {
          type: 'R' as ComponentType,
          id: 'R1',
          name: 'R1',
          ports: [
            { name: 'p', net: '1' },
            { name: 'n', net: '0' },
          ],
          params: { resistance: 1000 },
          displayValue: '1k',
        },
        {
          type: 'V' as ComponentType,
          id: 'V1',
          name: 'V1',
          ports: [
            { name: 'p', net: '1' },
            { name: 'n', net: '0' },
          ],
          params: { waveform: 'dc', dc: 5 },
          displayValue: 'DC 5',
        },
      ],
      nets: ['1'],
    };

    expect(circuit.components).toHaveLength(2);
    expect(circuit.nets).toEqual(['1']);
    expect(circuit.components[0].ports[0].name).toBe('p');
  });

  it('should construct MOSFET with named ports', () => {
    const mosfet: IRComponent = {
      type: 'M',
      id: 'M1',
      name: 'M1',
      ports: [
        { name: 'drain', net: 'vdd' },
        { name: 'gate', net: 'in' },
        { name: 'source', net: '0' },
      ],
      params: { modelName: 'NMOD', channelType: 'n', W: 10e-6, L: 1e-6 },
    };

    expect(mosfet.ports.find(p => p.name === 'gate')?.net).toBe('in');
    expect(mosfet.params.channelType).toBe('n');
  });
});

describe('Circuit.toIR()', () => {
  it('should convert a resistor divider to IR', () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('V1', 'in', '0', { dc: 5 });
    ckt.addResistor('R1', 'in', 'out', 1000);
    ckt.addResistor('R2', 'out', '0', 2000);

    const ir = ckt.toIR();

    // Three components
    expect(ir.components).toHaveLength(3);

    // Voltage source
    const v1 = ir.components.find(c => c.id === 'V1')!;
    expect(v1.type).toBe('V');
    expect(v1.ports).toEqual([
      { name: 'p', net: 'in' },
      { name: 'n', net: '0' },
    ]);
    expect(v1.params).toEqual({ waveform: 'dc', dc: 5 });
    expect(v1.displayValue).toBe('DC 5');

    // R1
    const r1 = ir.components.find(c => c.id === 'R1')!;
    expect(r1.type).toBe('R');
    expect(r1.ports).toEqual([
      { name: 'p', net: 'in' },
      { name: 'n', net: 'out' },
    ]);
    expect(r1.params).toEqual({ resistance: 1000 });
    expect(r1.displayValue).toBe('1k');

    // R2
    const r2 = ir.components.find(c => c.id === 'R2')!;
    expect(r2.type).toBe('R');
    expect(r2.params).toEqual({ resistance: 2000 });
    expect(r2.displayValue).toBe('2k');

    // Nets — should exclude ground '0', sorted
    expect(ir.nets).toEqual(['in', 'out']);
  });

  it('should convert MOSFET with model to IR', () => {
    const ckt = new Circuit();
    ckt.addModel({ name: 'NMOD', type: 'NMOS', params: { VTO: 0.7, KP: 1e-4 } });
    ckt.addMOSFET('M1', 'vdd', 'in', '0', 'NMOD', { W: 10e-6, L: 1e-6 });

    const ir = ckt.toIR();
    const m1 = ir.components.find(c => c.id === 'M1')!;

    expect(m1.type).toBe('M');
    expect(m1.ports).toEqual([
      { name: 'drain', net: 'vdd' },
      { name: 'gate', net: 'in' },
      { name: 'source', net: '0' },
    ]);
    expect(m1.params.modelName).toBe('NMOD');
    expect(m1.params.channelType).toBe('n');
    expect(m1.params.W).toBe(10e-6);
    expect(m1.params.L).toBe(1e-6);
    expect(m1.displayValue).toContain('NMOD');
    expect(m1.displayValue).toContain('W=');
    expect(m1.displayValue).toContain('L=');
  });

  it('should convert MOSFET with 4 nodes (bulk) to IR', () => {
    const ckt = new Circuit();
    ckt.addModel({ name: 'PMOD', type: 'PMOS', params: {} });
    ckt.addMOSFET('M2', 'out', 'in', 'vss', 'PMOD', undefined, 'vdd');

    const ir = ckt.toIR();
    const m2 = ir.components.find(c => c.id === 'M2')!;

    expect(m2.ports).toHaveLength(4);
    expect(m2.ports[3]).toEqual({ name: 'bulk', net: 'vdd' });
    expect(m2.params.channelType).toBe('p');
  });

  it('should convert BJT with model to IR', () => {
    const ckt = new Circuit();
    ckt.addModel({ name: 'Q2N2222', type: 'NPN', params: { BF: 100, IS: 1e-14 } });
    ckt.addBJT('Q1', 'vcc', 'base', '0', 'Q2N2222');

    const ir = ckt.toIR();
    const q1 = ir.components.find(c => c.id === 'Q1')!;

    expect(q1.type).toBe('Q');
    expect(q1.ports).toEqual([
      { name: 'collector', net: 'vcc' },
      { name: 'base', net: 'base' },
      { name: 'emitter', net: '0' },
    ]);
    expect(q1.params.modelName).toBe('Q2N2222');
    expect(q1.params.type).toBe('npn');
    expect(q1.displayValue).toBe('Q2N2222');
  });

  it('should convert PNP BJT to IR with correct type', () => {
    const ckt = new Circuit();
    ckt.addModel({ name: 'Q2N2907', type: 'PNP', params: {} });
    ckt.addBJT('Q2', 'out', 'base', 'vcc', 'Q2N2907');

    const ir = ckt.toIR();
    const q2 = ir.components.find(c => c.id === 'Q2')!;
    expect(q2.params.type).toBe('pnp');
  });

  it('should convert diode to IR', () => {
    const ckt = new Circuit();
    ckt.addDiode('D1', 'anode_net', 'cathode_net', '1N4148');

    const ir = ckt.toIR();
    const d1 = ir.components.find(c => c.id === 'D1')!;

    expect(d1.type).toBe('D');
    expect(d1.ports).toEqual([
      { name: 'anode', net: 'anode_net' },
      { name: 'cathode', net: 'cathode_net' },
    ]);
    expect(d1.params.modelName).toBe('1N4148');
    expect(d1.displayValue).toBe('1N4148');
  });

  it('should convert all 4 controlled sources to IR', () => {
    const ckt = new Circuit();
    // VCVS (E)
    ckt.addVCVS('E1', 'o1', 'o2', 'c1', 'c2', 10);
    // VCCS (G)
    ckt.addVCCS('G1', 'o3', 'o4', 'c3', 'c4', 0.005);
    // CCVS (H)
    ckt.addVoltageSource('Vsense', 'a', 'b', { dc: 0 });
    ckt.addCCVS('H1', 'o5', 'o6', 'Vsense', 100);
    // CCCS (F)
    ckt.addCCCS('F1', 'o7', 'o8', 'Vsense', 50);

    const ir = ckt.toIR();

    // VCVS
    const e1 = ir.components.find(c => c.id === 'E1')!;
    expect(e1.type).toBe('E');
    expect(e1.ports).toEqual([
      { name: 'ctrlP', net: 'c1' },
      { name: 'ctrlN', net: 'c2' },
      { name: 'outP', net: 'o1' },
      { name: 'outN', net: 'o2' },
    ]);
    expect(e1.params).toEqual({ gain: 10 });
    expect(e1.displayValue).toBe('10');

    // VCCS
    const g1 = ir.components.find(c => c.id === 'G1')!;
    expect(g1.type).toBe('G');
    expect(g1.ports).toEqual([
      { name: 'ctrlP', net: 'c3' },
      { name: 'ctrlN', net: 'c4' },
      { name: 'outP', net: 'o3' },
      { name: 'outN', net: 'o4' },
    ]);
    expect(g1.params).toEqual({ gm: 0.005 });
    expect(g1.displayValue).toBe('0.005');

    // CCVS
    const h1 = ir.components.find(c => c.id === 'H1')!;
    expect(h1.type).toBe('H');
    expect(h1.ports).toEqual([
      { name: 'outP', net: 'o5' },
      { name: 'outN', net: 'o6' },
    ]);
    expect(h1.params).toEqual({ gain: 100, controlSource: 'Vsense' });
    expect(h1.displayValue).toBe('100');

    // CCCS
    const f1 = ir.components.find(c => c.id === 'F1')!;
    expect(f1.type).toBe('F');
    expect(f1.ports).toEqual([
      { name: 'outP', net: 'o7' },
      { name: 'outN', net: 'o8' },
    ]);
    expect(f1.params).toEqual({ gain: 50, controlSource: 'Vsense' });
    expect(f1.displayValue).toBe('50');
  });

  it('should flatten SIN waveform params', () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('V1', 'out', '0', {
      type: 'sin', offset: 0, amplitude: 1, frequency: 1000,
    });

    const ir = ckt.toIR();
    const v1 = ir.components.find(c => c.id === 'V1')!;

    expect(v1.params).toEqual({
      waveform: 'sin',
      offset: 0,
      amplitude: 1,
      frequency: 1000,
    });
    expect(v1.displayValue).toBe('SIN 1 1kHz');
  });

  it('should flatten SIN waveform with optional params', () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('V1', 'out', '0', {
      type: 'sin', offset: 2.5, amplitude: 5, frequency: 60,
      delay: 0.001, damping: 100, phase: 45,
    });

    const ir = ckt.toIR();
    const v1 = ir.components.find(c => c.id === 'V1')!;

    expect(v1.params.waveform).toBe('sin');
    expect(v1.params.offset).toBe(2.5);
    expect(v1.params.amplitude).toBe(5);
    expect(v1.params.frequency).toBe(60);
    expect(v1.params.delay).toBe(0.001);
    expect(v1.params.damping).toBe(100);
    expect(v1.params.phase).toBe(45);
  });

  it('should flatten PULSE waveform params', () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('V1', 'clk', '0', {
      type: 'pulse', v1: 0, v2: 5,
      delay: 0, rise: 1e-9, fall: 1e-9, width: 5e-6, period: 10e-6,
    });

    const ir = ckt.toIR();
    const v1 = ir.components.find(c => c.id === 'V1')!;

    expect(v1.params).toEqual({
      waveform: 'pulse',
      v1: 0, v2: 5,
      delay: 0, rise: 1e-9, fall: 1e-9, width: 5e-6, period: 10e-6,
    });
    expect(v1.displayValue).toBe('PULSE 0/5');
  });

  it('should flatten AC waveform params', () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('V1', 'in', '0', {
      type: 'ac', magnitude: 1, phase: 0,
    });

    const ir = ckt.toIR();
    const v1 = ir.components.find(c => c.id === 'V1')!;

    expect(v1.params).toEqual({
      waveform: 'ac',
      magnitude: 1,
      phase: 0,
    });
    expect(v1.displayValue).toBe('AC 1');
  });

  it('should handle DC waveform with type field', () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('V1', 'in', '0', { type: 'dc', value: 12 });

    const ir = ckt.toIR();
    const v1 = ir.components.find(c => c.id === 'V1')!;

    expect(v1.params).toEqual({ waveform: 'dc', dc: 12 });
    expect(v1.displayValue).toBe('DC 12');
  });

  it('should handle source with no waveform as DC 0', () => {
    const ckt = new Circuit();
    // Using empty object for waveform
    ckt.addVoltageSource('V1', 'in', '0', {});

    const ir = ckt.toIR();
    const v1 = ir.components.find(c => c.id === 'V1')!;

    expect(v1.params).toEqual({ waveform: 'dc', dc: 0 });
  });

  it('should convert capacitor and inductor with SI display values', () => {
    const ckt = new Circuit();
    ckt.addCapacitor('C1', 'a', 'b', 100e-12);
    ckt.addInductor('L1', 'c', 'd', 10e-3);

    const ir = ckt.toIR();

    const c1 = ir.components.find(c => c.id === 'C1')!;
    expect(c1.type).toBe('C');
    expect(c1.params).toEqual({ capacitance: 100e-12 });
    expect(c1.displayValue).toBe('100pF');

    const l1 = ir.components.find(c => c.id === 'L1')!;
    expect(l1.type).toBe('L');
    expect(l1.params).toEqual({ inductance: 10e-3 });
    expect(l1.displayValue).toBe('10mH');
  });

  it('should convert subcircuit instance to IR', () => {
    const ckt = new Circuit();
    ckt.addSubcircuitInstance('X1', ['in', 'out', '0'], 'OPAMP', { GAIN: 1e5 });

    const ir = ckt.toIR();
    const x1 = ir.components.find(c => c.id === 'X1')!;

    expect(x1.type).toBe('X');
    expect(x1.ports).toEqual([
      { name: 'port1', net: 'in' },
      { name: 'port2', net: 'out' },
      { name: 'port3', net: '0' },
    ]);
    expect(x1.params.subcircuit).toBe('OPAMP');
    expect(x1.params.GAIN).toBe(1e5);
    expect(x1.displayValue).toBe('OPAMP');
  });

  it('should collect and sort nets excluding ground', () => {
    const ckt = new Circuit();
    ckt.addResistor('R1', 'z_net', '0', 100);
    ckt.addResistor('R2', 'a_net', 'z_net', 200);
    ckt.addResistor('R3', 'm_net', '0', 300);

    const ir = ckt.toIR();
    expect(ir.nets).toEqual(['a_net', 'm_net', 'z_net']);
  });

  it('should convert current source to IR', () => {
    const ckt = new Circuit();
    ckt.addCurrentSource('I1', 'a', '0', { dc: 0.001 });

    const ir = ckt.toIR();
    const i1 = ir.components.find(c => c.id === 'I1')!;

    expect(i1.type).toBe('I');
    expect(i1.ports).toEqual([
      { name: 'p', net: 'a' },
      { name: 'n', net: '0' },
    ]);
    expect(i1.params).toEqual({ waveform: 'dc', dc: 0.001 });
    expect(i1.displayValue).toBe('DC 0.001');
  });
});
