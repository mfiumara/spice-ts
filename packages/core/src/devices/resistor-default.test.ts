import { describe, expect, it } from 'vitest';
import { parse, parseTitleless } from '../parser/index.js';
import { simulate } from '../simulate.js';

function relativeError(actual: number, expected: number): number {
  return Math.abs(actual / expected - 1);
}

function modelWarnings(warnings: { type: string; message: string }[]): string[] {
  return warnings.filter(warning => warning.type === 'model').map(warning => warning.message);
}

// Reference values: ngspice-47 (`ngspice -b deck.cir`) on the identical decks.
// restemp.c RESupdate_conduct sets RESresist = 1 mOhm with the warning
// "<name>: resistance too low or not given, set to 1 mOhm" when no instance
// value is given, L*W*RSH <= 0 and the model R is not given (resmpar.c only
// records R > 0). resparam.c RES_RESIST clamps 0 < |R| < RESMIN = 1e-12.
describe('ngspice-47 resistor default and too-low clamp (#574)', () => {
  it('defaults a model resistor without R or RSH to 1 mOhm and warns', async () => {
    const result = await simulate(`
      V1 1 0 DC 1
      R1 1 0 rx
      .model rx r kf=0
      .op
    `);
    // ngspice-47: i(v1) = -1.00000e+03
    expect(relativeError(result.dc!.current('V1'), -1000)).toBeLessThan(1e-12);
    expect(modelWarnings(result.warnings)).toEqual([
      'R1: resistance too low or not given, set to 1 mOhm',
    ]);
  });

  it('treats a non-positive model R and a zero-area RSH as not given', async () => {
    const result = await simulate(`
      V1 1 0 DC 1
      R1 1 2 1k
      R2 2 3 rz
      R3 3 4 rn
      R4 4 0 rs w=0
      .model rz r r=0
      .model rn r r=-5
      .model rs r rsh=100
      .op
    `);
    // ngspice-47: v(2)=2.999991e-06 v(3)=1.999994e-06 v(4)=9.999970e-07 i(v1)=-9.99997e-04
    const total = 1000 + 3e-3;
    expect(relativeError(result.dc!.voltage('2'), 3e-3 / total)).toBeLessThan(1e-9);
    expect(relativeError(result.dc!.voltage('3'), 2e-3 / total)).toBeLessThan(1e-9);
    expect(relativeError(result.dc!.voltage('4'), 1e-3 / total)).toBeLessThan(1e-9);
    expect(relativeError(result.dc!.current('V1'), -1 / total)).toBeLessThan(1e-12);
    expect(modelWarnings(result.warnings).sort()).toEqual([
      'R2: resistance too low or not given, set to 1 mOhm',
      'R3: resistance too low or not given, set to 1 mOhm',
      'R4: resistance too low or not given, set to 1 mOhm',
    ]);
  });

  it('defaults a keyword-only resistor card without value or model to 1 mOhm', async () => {
    const result = await simulate(`
      V1 1 0 DC 1
      R1 1 2 1k
      R2 2 0 l=1u
      R3 1 3 1k
      R4 3 0 tc1=1m
      .op
    `);
    // ngspice-47: v(2)=9.999990e-07 v(3)=9.999990e-07 i(v1)=-2.00000e-03
    expect(relativeError(result.dc!.voltage('2'), 1e-3 / (1000 + 1e-3))).toBeLessThan(1e-9);
    expect(relativeError(result.dc!.voltage('3'), 1e-3 / (1000 + 1e-3))).toBeLessThan(1e-9);
    expect(relativeError(result.dc!.current('V1'), -2 / (1000 + 1e-3))).toBeLessThan(1e-12);
    expect(modelWarnings(result.warnings).sort()).toEqual([
      'R2: resistance too low or not given, set to 1 mOhm',
      'R4: resistance too low or not given, set to 1 mOhm',
    ]);
  });

  it('clamps a nonzero instance value below 1e-12 ohm to +/-1e-12 and warns', async () => {
    const result = await simulate(`
      V1 1 0 DC 1
      R1 1 2 1
      R2 2 0 1e-15
      R3 1 3 1
      R4 3 0 -1e-15
      .op
    `);
    // ngspice-47: v(2)=1.000000e-12 v(3)=-1.00000e-12 i(v1)=-2.00000e+00
    expect(relativeError(result.dc!.voltage('2'), 1e-12)).toBeLessThan(1e-6);
    expect(relativeError(result.dc!.voltage('3'), -1e-12)).toBeLessThan(1e-6);
    expect(relativeError(result.dc!.current('V1'), -2)).toBeLessThan(1e-9);
    expect(modelWarnings(result.warnings).sort()).toEqual([
      'Value of resistor R2 is too small, set to 1.000000e-12',
      'Value of resistor R4 is too small, set to -1.000000e-12',
    ]);
  });

  it('emits no resistor warning for an ordinary or zero-ohm resistor', async () => {
    const result = await simulate(`
      V1 1 0 DC 1
      R1 1 2 1k
      R2 2 0 0
      .op
    `);
    expect(modelWarnings(result.warnings)).toEqual([]);
  });

  it('round-trips a keyword-only resistor card through toNetlist', async () => {
    const netlist = 'title\nR1 1 0 l=1u\nV1 1 0 1\n.op';
    const emitted = parse(netlist).toNetlist();
    expect(emitted).toMatch(/^R1 1 0 L=0.000001$/m);
    const result = await simulate(emitted);
    expect(relativeError(result.dc!.current('V1'), -1000)).toBeLessThan(1e-12);
  });

  it('ignores a bare two-node resistor card with a structured warning', async () => {
    const circuit = parseTitleless('R1 a 0\nV1 a 0 1\n.op');
    expect(circuit.toNetlist()).not.toMatch(/^R1 /m);
    const result = await simulate(circuit);
    expect(result.dc!.voltage('a')).toBe(1);
    expect(result.dc!.current('V1')).toBe(0);
    expect(result.warnings).toContainEqual({
      type: 'parse', code: 'IGNORED_BARE_RESISTOR', line: 1,
      message: "'R1 a 0' is not a valid resistor instance line, ignored! (line 1)",
    });
  });

  it('also ignores bare resistor cards inside subcircuits', async () => {
    const result = await simulate('title\n.subckt cell a\nR1 a 0\n.ends\nX1 a cell\nV1 a 0 1\n.op');
    expect(result.dc!.voltage('a')).toBe(1);
    expect(result.dc!.current('V1')).toBe(0);
    expect(result.warnings).toContainEqual(expect.objectContaining({
      type: 'parse', code: 'IGNORED_BARE_RESISTOR', line: 3,
    }));
  });
});
