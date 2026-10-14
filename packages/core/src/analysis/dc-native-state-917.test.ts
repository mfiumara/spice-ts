// SPDX-License-Identifier: MIT
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from '../parser/index.js';
import { resolveOptions } from '../types.js';
import { solveDCOperatingPoint } from './dc.js';
import { Diode } from '../devices/diode.js';
import { MNAAssembler } from '../mna/assembler.js';

const deck = readFileSync(new URL('../../../../benchmarks/native-state-917/island.cir', import.meta.url), 'utf8');

describe('series diode hidden-state/reorder reduction (#917)', () => {
  it('loads the native critical-voltage junction conductance at INITJCT', () => {
    const compiled = parse(deck).compile();
    const assembler = new MNAAssembler(compiled.nodeCount, compiled.branchCount);
    assembler.sourceScale = 0;
    assembler.operatingPointPhase = 'junction';
    for (const d of compiled.devices) d.beginOperatingPoint?.();
    const diode = compiled.devices.find((d): d is Diode => d instanceof Diode)!;
    diode.stamp(assembler.getStampContext());
    // ngspice-47 vcrit makes IS*exp(vcrit/vt)/vt = 1/sqrt(2).
    expect(assembler.G.get(diode.nodes[0], diode.nodes[0])).toBeCloseTo(Math.SQRT1_2 + 1e-12, 12);
  });

  it('recovers the native floating island without altering its netlist', () => {
    const { result } = solveDCOperatingPoint(parse(deck).compile(), resolveOptions({}));
    expect(result.voltage('supply')).toBeCloseTo(1, 12);
    expect(result.voltage('a')).toBeCloseTo(0, 12);
    expect(result.voltage('k')).toBeCloseTo(0, 12);
  });
});
