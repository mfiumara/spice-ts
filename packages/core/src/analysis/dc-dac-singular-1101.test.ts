// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { parse } from '../parser/index.js';
import { resolveOptions } from '../types.js';
import { solveDCOperatingPoint } from './dc.js';

// Self-written reduction: grounded nonlinear stage plus a capacitor-only node.
// No copied fixture model cards or permanent DC shunts.
const deck = `Capacitive-only DC nullspace with MOS2 inverter
Vdd supply 0 5
Vin input 0 0
M1 output input 0 0 N W=10u L=1u
M2 output input supply supply P W=20u L=1u
.model N NMOS level=2 vto=0.7 kp=50u
.model P PMOS level=2 vto=-0.7 kp=25u
Cload output 0 1p
Cisolated isolated 0 1f
.op
.end`;

describe('MOS2 capacitive-only DC recovery (#1101)', () => {
  it.each(['0', 'PWL(0 0 1u 5 10u 5)'])('holds the source at its OP value for %s', source => {
    const compiled = parse(deck.replace('Vin input 0 0', `Vin input 0 ${source}`)).compile();
    const { result } = solveDCOperatingPoint(compiled, resolveOptions());
    expect(result.voltage('supply')).toBe(5);
    expect(result.voltage('input')).toBe(0);
    expect(result.voltage('output')).toBeCloseTo(5, 6);
    expect(result.voltage('isolated')).toBe(0);
  });
});
