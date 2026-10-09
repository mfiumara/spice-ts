import { describe, it, expect } from 'vitest';
import { Circuit } from '../circuit.js';
import { simulate } from '../simulate.js';
import { MNAAssembler } from '../mna/assembler.js';
import { Diode } from './diode.js';

describe('Diode', () => {
  it('stamps linearized conductance and current', () => {
    const asm = new MNAAssembler(2, 0);
    asm.solution[0] = 0.7;
    asm.solution[1] = 0.0;

    const diode = new Diode('D1', [0, 1], { IS: 1e-14, N: 1, BV: 100 });
    diode.stamp(asm.getStampContext());

    expect(asm.G.get(0, 0)).toBeGreaterThan(0);
    expect(asm.G.get(1, 1)).toBeGreaterThan(0);
    expect(asm.b[0]).not.toBe(0);
  });

  it('is nonlinear', () => {
    const diode = new Diode('D1', [0, 1], { IS: 1e-14, N: 1, BV: 100 });
    expect(diode.isNonlinear).toBe(true);
  });

  it('includes model series resistance in the terminal conductance', () => {
    const asm = new MNAAssembler(1, 0);
    asm.solution[0] = 1;

    const diode = new Diode('D1', [0, -1], { IS: 1e-14, N: 1, RS: 10 });
    diode.stamp(asm.getStampContext());

    expect(diode.params.RS).toBe(10);
    expect(asm.G.get(0, 0)).toBeLessThanOrEqual(1 / diode.params.RS + 1e-12);
    expect(asm.G.get(0, 0)).toBeGreaterThan(0.05);
  });

  it('matches ngspice low-frequency terminal capacitance with RS and TT', () => {
    const asm = new MNAAssembler(1, 0);
    asm.solution[0] = 1;

    const transitTime = 1e-6;
    const diode = new Diode('D1', [0, -1], {
      IS: 1e-14,
      N: 1,
      RS: 10,
      TT: transitTime,
    });
    const dynamicAsm = new MNAAssembler(1, 0);
    dynamicAsm.solution[0] = 1;
    diode.stampDynamic(dynamicAsm.getStampContext());

    // ngspice-47, `.op` followed by `.ac lin 1 1 1` at Vd=1 V:
    // imag(i(V1)) / (2*pi*1 Hz) = 8.2148938e-9 F.
    const ngspiceCapacitance = 8.2148938e-9;
    const relativeError = Math.abs(dynamicAsm.C.get(0, 0) - ngspiceCapacitance)
      / ngspiceCapacitance;
    expect(relativeError).toBeLessThan(0.002);
  });

  it('compiles series resistance as an internal junction node', () => {
    const circuit = new Circuit();
    circuit.addModel({ name: 'DTT', type: 'D', params: { IS: 1e-14, RS: 10, TT: 1e-6 } });
    circuit.addDiode('D1', 'in', '0', 'DTT');

    const compiled = circuit.compile();

    expect(compiled.nodeNames).toContain('D1.rs');
    expect(compiled.devices.map(device => device.name)).toEqual(['D1.RS', 'D1']);
    expect((compiled.devices[1] as Diode).params.RS).toBe(0);
  });

  it('preserves the RS and junction-charge pole in AC analysis', async () => {
    const result = await simulate(`
      V1 in 0 DC 1 AC 1
      D1 in 0 DTT
      .model DTT D(IS=1e-14 N=1 RS=10 TT=1u)
      .op
      .ac lin 1 1 1
      .end
    `);
    const sourceCurrent = result.ac!.current('V1')[0]!;
    const imaginaryCurrent = sourceCurrent.magnitude
      * Math.sin(sourceCurrent.phase * Math.PI / 180);
    const terminalCapacitance = Math.abs(imaginaryCurrent) / (2 * Math.PI);

    // ngspice-47: |I(V1)|=9.09696e-2 A and Cterminal=8.2148938e-9 F.
    expect(sourceCurrent.magnitude).toBeCloseTo(9.09696e-2, 4);
    expect(Math.abs(terminalCapacitance - 8.2148938e-9) / 8.2148938e-9)
      .toBeLessThan(0.002);
  });
});

describe('Diode in circuit', () => {
  it('forward biased diode has ~0.6-0.7V drop', async () => {
    const result = await simulate(`
      V1 1 0 DC 5
      R1 1 2 1k
      .model DMOD D(IS=1e-14 N=1)
      D1 2 0 DMOD
      .op
      .end
    `);

    const vd = result.dc!.voltage('2');
    expect(vd).toBeGreaterThan(0.55);
    expect(vd).toBeLessThan(0.75);
  });

  it('reverse biased diode blocks current', async () => {
    const result = await simulate(`
      V1 1 0 DC -5
      R1 1 2 1k
      .model DMOD D(IS=1e-14 N=1)
      D1 2 0 DMOD
      .op
      .end
    `);

    const vd = result.dc!.voltage('2');
    expect(vd).toBeCloseTo(-5, 0);
  });
});
