// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { parse } from '../parser/index.js';
import { resolveOptions } from '../types.js';
import { solveDCOperatingPoint } from './dc.js';

// Self-written reduction. A diode's junction gmin does not anchor common mode.
// ngspice-47 recovers this zero-charge state through its final OPtran fallback.
const deck = `Floating diode island
V1 supply 0 1
R1 supply 0 1k
C1 a 0 3
C2 k 0 4
D1 k a ordinary
.model ordinary D(IS=1e-14)
.op
.end`;

// Keep the unmasked RED runnable without making evidence-only main fail CI.
// This is an expected failure, not a shipped recovery implementation.
const recoveryTest = process.env.EXPECT_FLOATING_DIODE_SUCCESS === '1' ? it : it.fails;

describe('floating diode operating point (#917)', () => {
  recoveryTest('known gap: recovers the native zero-charge OPtran state without a permanent ground shunt', () => {
    const compiled = parse(deck).compile();
    const { result } = solveDCOperatingPoint(compiled, resolveOptions({}));
    expect(result.voltage('supply')).toBeCloseTo(1, 12);
    expect(result.voltage('a')).toBeCloseTo(0, 12);
    expect(result.voltage('k')).toBeCloseTo(0, 12);
  });
});
