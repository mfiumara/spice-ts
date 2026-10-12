import { describe, it, expect } from 'vitest';
import { simulate } from '../simulate.js';
import { Diode } from './diode.js';

// Issue #829: ngspice-47 diotemp.c scales the diode series resistance with
// RS(T) = RS * (1 + TRS1*dT + TRS2*dT^2), dT = T - TNOM (TRS is an alias of
// TRS1). The model card is SnapLED150.mod from ngspice ticket 761.

const MODEL = 'IS=1.601E-18 N=1.989E+00 RS=3.201E+00 XTI=9.456E+00 EG=2.062E+00 '
  + 'TRS1=-6.313E-03 TRS2=3.164E-05 TNOM=25';

const deck = (temperature: number, extra = '', instance = '') => `trs deck
.model DLED D(${MODEL} ${extra})
V1 in 0 3.2
D1 in 0 DLED ${instance}
.options temp=${temperature}
.op
.end
`;

// Both simulators stop Newton at RELTOL-level convergence, which leaves 1e-6..2.4e-6
// relative disagreement even at T = TNOM where the TRS law is exactly 1. Ignoring
// TRS1/TRS2 instead moves the ngspice-47 I(V1) by 1.2% at 27 C and 28% at 150 C.
const TOLERANCE = 1e-5;

const relativeError = (actual: number, expected: number) => Math.abs(actual - expected) / Math.abs(expected);

// ngspice-47 `ngspice -b` with `print v1#branch` (numdgt=12) on the identical deck.
// The two-terminal and CJO=10p (RS expanded onto a prime node) variants agree in
// ngspice to every printed digit, since .op ignores the junction charge.
const NGSPICE47_I_V1: ReadonlyArray<readonly [number, number]> = [
  [-40, -2.27703986133e-1],
  [25, -3.61757734796e-1],
  [27, -3.66676645428e-1],
  [85, -5.07711983956e-1],
  [150, -5.56313769800e-1],
];

describe('diode RS temperature coefficients TRS1/TRS2 (#829)', () => {
  it.each(NGSPICE47_I_V1)('matches ngspice-47 at TEMP=%d C without junction charge', async (temperature, ngspice47) => {
    const result = await simulate(deck(temperature));
    expect(relativeError(result.dc!.current('V1'), ngspice47)).toBeLessThan(TOLERANCE);
  });

  it.each(NGSPICE47_I_V1)('matches ngspice-47 at TEMP=%d C with RS on a prime node (CJO=10p)', async (temperature, ngspice47) => {
    const result = await simulate(deck(temperature, 'CJO=10p'));
    expect(relativeError(result.dc!.current('V1'), ngspice47)).toBeLessThan(TOLERANCE);
  });

  it.each([
    // ngspice-47 on the same deck with TRS=... (alias of TRS1), CJO=10p and area=2.
    [85, -1.01542472313],
    [-40, -4.55407441575e-1],
  ])('accepts the TRS alias with AREA scaling at TEMP=%d C like ngspice-47', async (temperature, ngspice47) => {
    const result = await simulate(deck(temperature, 'CJO=10p', 'area=2').replace('TRS1=', 'TRS='));
    expect(relativeError(result.dc!.current('V1'), ngspice47)).toBeLessThan(TOLERANCE);
  });

  it('scales the two-terminal RS by 1 + TRS1*dT + TRS2*dT^2 and restores it at TNOM', () => {
    const diode = new Diode('D1', [0, -1], { RS: 10, TRS1: 2e-3, TRS2: 1e-5, TNOM: 25 });
    // Default device temperature 27 C: dT = 2 K.
    expect(diode.params.RS).toBeCloseTo(10 * (1 + 2e-3 * 2 + 1e-5 * 4), 12);
    diode.setTemperature(125);
    expect(diode.params.RS).toBeCloseTo(10 * (1 + 2e-3 * 100 + 1e-5 * 100 * 100), 12);
    diode.setTemperature(25);
    expect(diode.params.RS).toBe(10);
  });
});
