import { describe, it, expect } from 'vitest';
import { Circuit } from '../circuit.js';
import { simulate } from '../simulate.js';
import { resolveStepTarget } from '../analysis/step.js';
import { MNAAssembler } from '../mna/assembler.js';
import { parse } from '../parser/index.js';
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

  it('uses IBV as the reverse current at the nominal breakdown voltage', () => {
    const diode = new Diode('D1', [0, -1], {
      IS: 1e-14,
      N: 1,
      BV: 7.255,
      IBV: 1e-3,
    });
    const solution = new Float64Array([-7.255]);

    expect(diode.noiseOperatingPoint(solution).current).toBeCloseTo(-1e-3, 6);
  });

  it.each([
    [-55, 7.175222569],
    [25, 7.253112249],
    [72, 7.29670718125],
  ])('applies TBV1 and TBV2 to breakdown at %s C', (temperature, breakdownVoltage) => {
    const diode = new Diode('D1', [0, -1], {
      IS: 1e-14,
      N: 1,
      BV: 7.255,
      IBV: 1e-3,
      TBV1: 0.00013,
      TBV2: -5e-8,
      TNOM: 27,
    });

    diode.setTemperature(temperature);

    expect(diode.noiseOperatingPoint(new Float64Array([-breakdownVoltage])).current)
      .toBeCloseTo(-1e-3, 6);
    expect(diode.params.BV).toBe(7.255);
    expect(diode.getTemperature()).toBe(temperature);
  });

  it('includes series resistance in the reverse-breakdown load line', () => {
    const diode = new Diode('D1', [0, -1], {
      IS: 1e-14,
      N: 1,
      BV: 7.255,
      IBV: 1e-3,
      RS: 10,
    });

    expect(diode.noiseOperatingPoint(new Float64Array([-7.265])).current)
      .toBeCloseTo(-1e-3, 6);
  });

  it('participates in shared TEMP target restoration without mutating nominal BV', () => {
    const circuit = new Circuit();
    circuit.addModel({
      name: 'DZR',
      type: 'D',
      params: { BV: 7.255, IBV: 1e-3, TBV1: 0.00013, TBV2: -5e-8 },
    });
    circuit.addDiode('D1', 'out', '0', 'DZR');
    const compiled = circuit.compile();
    const diode = compiled.devices[0] as Diode;
    const target = resolveStepTarget(compiled, {
      type: 'step',
      param: 'TEMP',
      sweepMode: 'list',
      values: [-55],
    });

    target.set(-55);
    expect(diode.getTemperature()).toBe(-55);
    expect(diode.params.BV).toBe(7.255);

    target.restore();
    expect(diode.getTemperature()).toBe(27);
    expect(diode.params.BV).toBe(7.255);
  });

  it.each(['NBV', 'IBVL', 'NBVL', 'TLEV', 'TRS1', 'TRS2'])(
    'rejects unsupported level-2 breakdown field %s explicitly',
    (parameter) => {
      expect(() => parse(`unsupported diode level-2 field
        D1 out 0 DMOD
        .model DMOD D(BV=7.255 IBV=1m TBV1=0.00013 TBV2=-5e-8 ${parameter}=1)
        .op
      `).compile()).toThrow(
        `Unsupported bounded diode breakdown-temperature model parameter: '${parameter}'`,
      );
    },
  );

  it('scales model parameters by instance area, perimeter, and multiplier', () => {
    const diode = new Diode('D1', [0, -1], {
      IS: 2,
      JSW: 3,
      RS: 12,
      CJ0: 5,
      CJSW: 7,
      M: 0.4,
    }, false, { AREA: 4, PJ: 6, M: 2 });

    // AREAeff=AREA*M=8; PJeff=PJ*M=12.
    expect(diode.params.IS).toBe(2 * 8 + 3 * 12);
    expect(diode.params.RS).toBe(12 / 8);
    expect(diode.params.CJ0).toBe(5 * 8);
    expect(diode.params.CJSW).toBe(7 * 12);
    expect(diode.params.M).toBe(0.4);
  });

  it('preserves default geometry behavior', () => {
    const diode = new Diode('D1', [0, -1], {
      IS: 2e-14,
      RS: 12,
      CJ0: 5e-12,
    });

    expect(diode.params.IS).toBe(2e-14);
    expect(diode.params.RS).toBe(12);
    expect(diode.params.CJ0).toBe(5e-12);
    expect(diode.params.CJSW).toBe(0);
  });

  it('adds area and sidewall zero-bias capacitance', () => {
    const diode = new Diode('D1', [0, -1], {
      CJ0: 5e-12,
      CJSW: 7e-12,
    }, false, { AREA: 4, PJ: 6 });
    const asm = new MNAAssembler(1, 0);

    diode.stampDynamic(asm.getStampContext());

    expect(asm.C.get(0, 0)).toBeCloseTo(62e-12, 12);
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
