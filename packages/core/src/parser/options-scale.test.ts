import { describe, expect, it } from 'vitest';
import { MOSFET } from '../devices/mosfet.js';
import { Resistor } from '../devices/resistor.js';
import { Capacitor } from '../devices/capacitor.js';
import { parse, parseAsync } from './index.js';

const mos = 'M1 d g 0 0 nn L=2 W=8 AD=12 AS=16 PD=10 PS=14 M=3 NRD=4 NRS=5';
const model = '.model nn nmos level=1 kp=20u ld=1n';
const deck = (body: string) => `scale regression #1173\n${body}\n${model}\n.end`;

function transistor(text: string): MOSFET {
  const device = parse(text).compile().devices.find(device => device instanceof MOSFET);
  expect(device).toBeInstanceOf(MOSFET);
  return device as MOSFET;
}

describe('ngspice .options scale', () => {
  it.each(['.option scale = 1e-6', '.options SCALE=1u'])('scales explicit MOS geometry with %s after the device', option => {
    const device = transistor(deck(`${mos}\n${option}`));
    for (const [key, value] of Object.entries({ L: 2e-6, W: 8e-6, AD: 12e-12, AS: 16e-12, PD: 10e-6, PS: 14e-6 })) {
      expect(device.suppliedParams[key]).toBeCloseTo(value, 20);
    }
    expect(device.suppliedParams).toMatchObject({ M: 3, NRD: 4, NRS: 5, LD: 1e-9 });
    expect(device.suppliedParams.KP).toBeCloseTo(20e-6, 20);
  });

  it('keeps scale=1 identical to the default', () => {
    expect(transistor(deck(`${mos}\n.options scale=1`)).suppliedParams)
      .toEqual(transistor(deck(mos)).suppliedParams);
  });

  it('does not scale omitted MOS dimensions or model parameters', () => {
    expect(transistor(deck('M1 d g 0 0 nn\n.options scale=1u')).params)
      .toEqual(transistor(deck('M1 d g 0 0 nn')).params);
  });

  it('scales parameterized nested subcircuits once and compiles idempotently', async () => {
    const text = deck(`.param s=1u\n.options scale={s}\n.subckt cell d g params: width=8\n${mos.replace('W=8', 'W={width}')}\n.ends\n.subckt outer d g\nXinner d g cell width=10\n.ends\nXouter d g outer`);
    for (const circuit of [parse(text), await parseAsync(text)]) {
      for (let i = 0; i < 2; i++) {
        const device = circuit.compile().devices.find(device => device instanceof MOSFET) as MOSFET;
        expect(device.params.W).toBeCloseTo(10e-6, 20);
        expect(device.params.L).toBeCloseTo(2e-6, 20);
      }
      expect(transistor(circuit.toNetlist()).suppliedParams).toEqual(
        (circuit.compile().devices.find(device => device instanceof MOSFET) as MOSFET).suppliedParams,
      );
    }
  });

  it('scales R/C instance L/W, not electrical values, instance SCALE, or model defaults', () => {
    const body = `Rgeom a 0 rm L=2 W=4\nRvalue b 0 100 scale=3\nRdefault c 0 rm L=2\nCgeom a 0 cm L=2 W=4\nCvalue b 0 1p scale=3\nCdefault c 0 cm L=2\n.model rm R rsh=100 w=8u narrow=1u\n.model cm C cj=1e-3 cjsw=1e-9 defw=8u narrow=1u`;
    const scaled = parse(deck(`${body}\n.options scale=1u`)).compile().devices;
    const explicit = parse(deck(body.replaceAll('L=2', 'L=2u').replaceAll('W=4', 'W=4u'))).compile().devices;
    for (const device of scaled) {
      const reference = explicit.find(candidate => candidate.name === device.name);
      if (device instanceof Resistor) expect(device.conductance).toBe((reference as Resistor).conductance);
      if (device instanceof Capacitor) expect(device.capacitance).toBe((reference as Capacitor).capacitance);
    }
    // ngspice-47 `show`: Rgeom=100, Rdefault=33.3333; Cgeom=1.6e-14,
    // Cdefault=3.2e-14. Omitted W comes from the unscaled model default.
    expect((scaled.find(device => device.name === 'Rgeom') as Resistor).conductance).toBeCloseTo(0.01, 15);
    expect((scaled.find(device => device.name === 'Rdefault') as Resistor).conductance).toBeCloseTo(0.03, 15);
    expect((scaled.find(device => device.name === 'Cgeom') as Capacitor).capacitance).toBeCloseTo(1.6e-14, 25);
    expect((scaled.find(device => device.name === 'Cdefault') as Capacitor).capacitance).toBeCloseTo(3.2e-14, 25);
  });

  it('does not scale diode AREA/PJ or JFET/BJT multiplicity', () => {
    const body = 'D1 a 0 dd area=2 pj=3 m=4\nJ1 a g 0 jj\nQ1 a g 0 qq area=2 m=3\n.model dd D\n.model jj NJF\n.model qq NPN';
    const plain = parse(deck(body)).compile().devices;
    const scaled = parse(deck(`${body}\n.options scale=1u`)).compile().devices;
    expect(scaled).toEqual(plain);
  });
});
