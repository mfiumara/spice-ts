// SPDX-License-Identifier: MIT
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from '../parser/index.js';
import { resolveOptions } from '../types.js';
import { solveDCOperatingPoint } from './dc.js';

describe('series diode hidden-state/reorder reduction (#917)', () => {
  it('recovers the native floating island without altering its netlist', () => {
    const deck = readFileSync(new URL('../../../../../benchmarks/native-state-917/island.cir', import.meta.url), 'utf8');
    const { result } = solveDCOperatingPoint(parse(deck).compile(), resolveOptions({}));
    expect(result.voltage('supply')).toBeCloseTo(1, 12);
    expect(result.voltage('a')).toBeCloseTo(0, 12);
    expect(result.voltage('k')).toBeCloseTo(0, 12);
  });
});
