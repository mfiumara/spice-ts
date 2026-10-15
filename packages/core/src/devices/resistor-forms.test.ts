import { describe, expect, it } from 'vitest';
import { InvalidCircuitError, ParseError } from '../errors.js';
import { parse, parseTitleless, parseTitlelessAsync } from '../parser/index.js';
import { UnsupportedResistorParameterError } from '../parser/resistor-parser.js';
import { simulate } from '../simulate.js';
import { Resistor } from './resistor.js';

const BOLTZMANN_4KT = 4 * 1.380649e-23 * 300.15;

function resistor(netlist: string, name: string): Resistor {
  const device = parseTitleless(netlist).compile().devices.find(candidate => candidate.name === name);
  expect(device).toBeInstanceOf(Resistor);
  return device as Resistor;
}

function relativeError(actual: number, expected: number): number {
  return Math.abs(actual / expected - 1);
}

// Reference values are ngspice-47 resistor semantics (restemp.c RESupdate_conduct,
// inp2r.c, resload.c RESacload, resnoise.c) on the same cards.
describe('ngspice-47 resistor card forms (#498)', () => {
  it('reads the keyword resistance forms r=, R = and resistance=', async () => {
    const result = await simulate(`
      V1 1 0 DC 1
      r1 1 2 r=1k
      RLoad 2 3 r = 1k
      R3 3 0 resistance=2k
      .op
    `);
    expect(result.dc!.voltage('2')).toBeCloseTo(0.75, 12);
    expect(result.dc!.voltage('3')).toBeCloseTo(0.5, 12);
  });

  it('resolves a .model R default value (r=) and model instance defaults (resistance=)', async () => {
    const loop = await simulate(`
      R1 n1 0 1k
      R2 n2 n1 rmod
      .model rmod r (r=1k)
      V1 n2 0 1
      .op
    `);
    expect(loop.dc!.voltage('n1')).toBeCloseTo(0.5, 12);

    // tests/regression/model/instance-defaults.cir: i(v1) must be -0.5 mA.
    const defaults = await simulate(`
      v1 1 0 dc=1
      r1 1 0 myres
      .model myres r(resistance=2k)
      .op
    `);
    expect(relativeError(defaults.dc!.current('v1'), -0.5e-3)).toBeLessThan(1e-12);
  });

  it('derives resistance from RSH, L, W, SHORT and NARROW and lets an instance value win', () => {
    const model = '.model rpoly R RSH=1000 NARROW=0.5u SHORT=1u';
    expect(resistor(`R1 1 0 rpoly L=11u W=4u\n${model}`, 'R1').resistance)
      .toBeCloseTo((11e-6 - 2e-6) / (4e-6 - 1e-6) * 1000, 9);
    // Defaults: W = L = 10u (ngspice RESsetup), DEFW overrides the width.
    expect(resistor(`R1 1 0 rpoly\n${model}`, 'R1').resistance)
      .toBeCloseTo((10e-6 - 2e-6) / (10e-6 - 1e-6) * 1000, 9);
    expect(resistor(`R1 1 0 rpoly\n.model rpoly R RSH=100 DEFW=2u L=20u`, 'R1').resistance)
      .toBeCloseTo(1000, 9);
    expect(resistor(`R1 1 0 50 rpoly L=11u W=4u\n${model}`, 'R1').resistance).toBe(50);
    // A zero effective width gives ngspice an infinite resistance: zero conductance.
    expect(resistor(`R3 4 0 rmodel1 L=11u W=2u\n.model rmodel1 R RSH=1000 NARROW=1u`, 'R3').conductance).toBe(0);
  });

  it('uses ac= only in small-signal analyses (res_partition.cir)', async () => {
    const result = await simulate(`
      vin 1 0 DC 1V AC 1V
      r1 1 2 5K
      r2 2 0 5K ac=15k
      .op
      .ac dec 10 1 10K
    `);
    expect(result.dc!.voltage('2')).toBeCloseTo(0.5, 12);
    for (const point of result.ac!.voltage('2')) {
      expect(relativeError(point.magnitude, 0.75)).toBeLessThan(1e-12);
    }
  });

  it('applies M and SCALE to both the DC and AC conductance (res_array.cir)', () => {
    const r4 = resistor('R4 5 0 10K ac=5k m=2', 'R4');
    expect(r4.conductance).toBeCloseTo(2 / 10e3, 15);
    expect(r4.acConductance).toBeCloseTo(2 / 5e3, 15);
    const r5 = resistor('R5 6 0 10 ac=5 scale=1K', 'R5');
    expect(r5.conductance).toBeCloseTo(1 / 10e3, 15);
    expect(r5.acConductance).toBeCloseTo(1 / 5e3, 15);
  });

  it('places the pole with the AC resistance (pz/ac-resistance.cir)', async () => {
    const deck = `check for proper use of ac resistance
      Vin 1 0 dc 5.0 ac 3.0
      R1 1 2 1k ac=4k
      C2 2 0 1n
      R2 2 0 4k
      .op
      .ac lin 3 100kHz 200kHz
    `;
    const result = await simulate(deck);
    expect(relativeError(result.dc!.voltage('2'), 5 / (1 + 1 / 4))).toBeLessThan(1e-12);
    const tau = 1 / (1 / 4e3 + 1 / 4e3) * 1e-9;
    result.ac!.frequencies.forEach((frequency, index) => {
      const omegaTau = 2 * Math.PI * frequency * tau;
      const expected = 1.5 / Math.sqrt(1 + omegaTau * omegaTau);
      expect(relativeError(result.ac!.voltage('2')[index].magnitude, expected)).toBeLessThan(1e-12);
    });
    // spice-ts .pz vol accepts only R, L and C, so the pole check drops the source.
    const poleZero = await simulate(`pz
      R1 1 2 1k ac=4k
      C2 2 0 1n
      R2 2 0 4k
      .pz 1 0 2 0 vol pz
    `);
    expect(relativeError(poleZero.poleZero!.poles[0].real, -1 / tau)).toBeLessThan(1e-12);
  });

  it('makes noisy=0 resistors noiseless and keeps thermal noise on the DC value (resdiv.cir)', async () => {
    const noisy = await simulate(`
      V1 1 0 dc 0 ac 1
      R1 1 2 10k
      R2 2 0 10k
      .noise v(2) V1 dec 10 1 100k 1
    `);
    const quiet = await simulate(`
      V11 11 0 dc 0 ac 1
      R11 11 12 10k
      R12 12 0 10k noisy=0
      .noise v(12) V11 dec 10 1 100k
    `);
    const both = noisy.noise!.outputNoiseDensity[0] ** 2;
    const one = quiet.noise!.outputNoiseDensity[0] ** 2;
    expect(relativeError(both, BOLTZMANN_4KT * 5e3)).toBeLessThan(1e-9);
    expect(relativeError(one, BOLTZMANN_4KT * 2.5e3)).toBeLessThan(1e-9);

    // ac= changes the network but not the thermal source: 4kT/R(dc) through Rac || R1.
    const ac = await simulate(`
      V1 1 0 dc 0 ac 1
      R1 1 2 10k noisy=0
      R2 2 0 10k ac=30k
      .noise v(2) V1 dec 1 1k 1k
    `);
    const parallel = 1 / (1 / 10e3 + 1 / 30e3);
    expect(relativeError(ac.noise!.outputNoiseDensity[0] ** 2, BOLTZMANN_4KT / 10e3 * parallel ** 2))
      .toBeLessThan(1e-9);
  });

  it('applies TC1/TC2/TCE with instance precedence and 1.01^(TCE*dT) (temper-res-1.cir)', () => {
    const deck = `
      r1 1 0 1k tc1=2m tc2=30u
      .model rtest r r=1000 tc1=2m tc2=30u tce=700m
      r2 2 0 rtest
      r3 3 0 1k tc1=2m tc2=30u tce=700m
      r4 4 0 1k tc=2m 30u
      r5 5 0 rtest tc1=1m
    `;
    for (const temperature of [10, 55, 100]) {
      const difference = temperature - 27;
      const devices = parseTitleless(deck).compile().devices as Resistor[];
      for (const device of devices) device.setTemperature(temperature);
      const [r1, r2, r3, r4, r5] = devices;
      const polynomial = 1000 * ((30e-6 * difference + 2e-3) * difference + 1);
      const exponential = 1000 * 1.01 ** (0.7 * difference);
      expect(relativeError(r1.resistance, polynomial)).toBeLessThan(1e-14);
      expect(relativeError(r2.resistance, exponential)).toBeLessThan(1e-14);
      expect(relativeError(r3.resistance, exponential)).toBeLessThan(1e-14);
      expect(relativeError(r4.resistance, polynomial)).toBeLessThan(1e-14);
      // The model TCE still selects the exponential law over an instance TC1.
      expect(relativeError(r5.resistance, exponential)).toBeLessThan(1e-14);
    }
  });

  it('expands r=, ac= and model references inside subcircuits', async () => {
    const result = await simulate(`
      .subckt div in out
      R1 in out r=1k
      R2 out 0 rsub ac=3k
      .model rsub r r=1k
      .ends div
      V1 a 0 DC 1 AC 1
      X1 a b div
      .op
      .ac lin 1 1k 1k
    `);
    expect(result.dc!.voltage('b')).toBeCloseTo(0.5, 12);
    expect(result.ac!.voltage('b')[0].magnitude).toBeCloseTo(0.75, 12);
  });

  it.each([
    // Instance TEMP/DTEMP are simulated since #846 (pspice-model-temperature-846.test.ts).
    ['PSpice T_REL_LOCAL model parameter', 'R1 1 0 rx\n.model rx RES(R=1k T_REL_LOCAL=5)', 'T_REL_LOCAL'],
    ['unknown instance keyword', 'R1 1 0 1k foo=1', 'FOO'],
    ['unknown model parameter', 'R1 1 0 rx\n.model rx r r=1k xyz=2', 'XYZ'],
  ])('rejects %s with a typed error', (_label, card, parameter) => {
    let error: unknown;
    try {
      parseTitleless(`${card}\nV1 1 0 1\n.op`);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(UnsupportedResistorParameterError);
    expect(error).toBeInstanceOf(ParseError);
    expect((error as UnsupportedResistorParameterError).code).toBe('UNSUPPORTED_RESISTOR_PARAMETER');
    expect((error as UnsupportedResistorParameterError).parameters.join(' ')).toContain(parameter);
  });

  it('takes a v()-dependent resistor value to the B-source path in parse() as in simulate() (#510)', async () => {
    const deck = "R2 4 6 R = 'res + 0.033 * res*V(r2)'\nV1 1 0 1\n.op";
    let error: unknown;
    try {
      parseTitleless(deck);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ParseError);
    expect((error as ParseError).message).toContain("Unsupported behavioral expression token 'res'");
    await expect(parseTitlelessAsync(deck)).rejects.toThrow((error as ParseError).message);
  });

  it('rejects an unresolvable resistor model and defaults an empty model', () => {
    expect(() => parseTitleless('R1 1 0 rmissing\nV1 1 0 1\n.op').compile())
      .toThrow(InvalidCircuitError);
    // ngspice-47 restemp.c: a model without R or RSH defaults to 1 mOhm (#574).
    expect(resistor('R1 1 0 rempty\n.model rempty r tc1=1m\nV1 1 0 1\n.op', 'R1').resistance)
      .toBe(1e-3);
  });

  it('accepts .noise for a resistor model with flicker noise', async () => {
    const result = await simulate(`
      V1 1 0 dc 0 ac 1
      R1 1 0 rk
      .model rk r r=1k kf=1e-20
      .noise v(1) V1 dec 1 1k 1k
    `);
    // An ideal voltage source shorts both the thermal and flicker output noise.
    expect(result.noise!.outputNoiseDensity[0]).toBe(0);
  });

  it('round-trips model and keyword parameters through toNetlist', () => {
    const circuit = parse('title\nR1 1 0 rmod ac=2k m=2\n.model rmod r r=1k\nV1 1 0 1\n.op');
    expect(circuit.toNetlist()).toMatch(/R1 1 0 rmod (AC=2000 M=2|M=2 AC=2000)/);
  });
});
