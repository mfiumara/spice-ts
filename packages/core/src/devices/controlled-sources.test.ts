import { describe, it, expect } from 'vitest';
import { MNAAssembler } from '../mna/assembler.js';
import { VCCS } from './vccs.js';

describe('VCCS (G element)', () => {
  it('stamps transconductance gm between output and control nodes', () => {
    // 4 nodes: 0=out+, 1=out-, 2=ctrl+, 3=ctrl-
    const asm = new MNAAssembler(4, 0);
    const g = new VCCS('G1', [0, 1, 2, 3], 0.01);
    g.stamp(asm.getStampContext());

    // G(out+, ctrl+) += gm
    expect(asm.G.get(0, 2)).toBeCloseTo(0.01);
    // G(out+, ctrl-) -= gm
    expect(asm.G.get(0, 3)).toBeCloseTo(-0.01);
    // G(out-, ctrl+) -= gm
    expect(asm.G.get(1, 2)).toBeCloseTo(-0.01);
    // G(out-, ctrl-) += gm
    expect(asm.G.get(1, 3)).toBeCloseTo(0.01);
  });

  it('handles ground node (-1) on output side', () => {
    // out- is ground: nodes [0, -1, 1, -1] => ctrl- also ground
    const asm = new MNAAssembler(2, 0);
    const g = new VCCS('G1', [0, -1, 1, -1], 0.005);
    g.stamp(asm.getStampContext());

    expect(asm.G.get(0, 1)).toBeCloseTo(0.005);
    // No stamps into ground rows/cols
    expect(asm.G.get(0, 0)).toBeCloseTo(0);
  });

  it('is linear with no branches', () => {
    const g = new VCCS('G1', [0, 1, 2, 3], 0.01);
    expect(g.isNonlinear).toBe(false);
    expect(g.branches).toEqual([]);
  });

  it('stampAC produces identical stamps', () => {
    const asm = new MNAAssembler(4, 0);
    const g = new VCCS('G1', [0, 1, 2, 3], 0.01);
    g.stampAC!(asm.getStampContext(), 2 * Math.PI * 1000);

    expect(asm.G.get(0, 2)).toBeCloseTo(0.01);
    expect(asm.G.get(0, 3)).toBeCloseTo(-0.01);
    expect(asm.G.get(1, 2)).toBeCloseTo(-0.01);
    expect(asm.G.get(1, 3)).toBeCloseTo(0.01);
  });
});
