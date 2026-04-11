import { describe, it, expect } from 'vitest';
import { MNAAssembler } from '../mna/assembler.js';
import { VCCS } from './vccs.js';
import { VCVS } from './vcvs.js';

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

describe('VCVS (E element)', () => {
  it('stamps branch equation with gain coupling', () => {
    // 4 nodes: 0=out+, 1=out-, 2=ctrl+, 3=ctrl-. 1 branch at index 0.
    const asm = new MNAAssembler(4, 1);
    const e = new VCVS('E1', [0, 1, 2, 3], 0, 10);
    e.stamp(asm.getStampContext());

    const bi = 4; // numNodes + branchIndex = 4 + 0

    // KCL coupling
    expect(asm.G.get(0, bi)).toBe(1);
    expect(asm.G.get(1, bi)).toBe(-1);

    // KVL constraint row
    expect(asm.G.get(bi, 0)).toBe(1);
    expect(asm.G.get(bi, 1)).toBe(-1);

    // Control coupling: -gain on ctrl+, +gain on ctrl-
    expect(asm.G.get(bi, 2)).toBe(-10);
    expect(asm.G.get(bi, 3)).toBe(10);

    // RHS = 0
    expect(asm.b[bi]).toBe(0);
  });

  it('handles ground on output negative node', () => {
    // out- = ground, ctrl- = ground: nodes [0, -1, 1, -1], 1 branch
    const asm = new MNAAssembler(2, 1);
    const e = new VCVS('E1', [0, -1, 1, -1], 0, 5);
    e.stamp(asm.getStampContext());

    const bi = 2; // numNodes(2) + branchIndex(0)

    expect(asm.G.get(0, bi)).toBe(1);
    expect(asm.G.get(bi, 0)).toBe(1);
    expect(asm.G.get(bi, 1)).toBe(-5);
  });

  it('is linear with one branch', () => {
    const e = new VCVS('E1', [0, 1, 2, 3], 0, 10);
    expect(e.isNonlinear).toBe(false);
    expect(e.branches).toEqual([0]);
  });

  it('stampAC produces identical stamps', () => {
    const asm = new MNAAssembler(4, 1);
    const e = new VCVS('E1', [0, 1, 2, 3], 0, 10);
    e.stampAC!(asm.getStampContext(), 2 * Math.PI * 1000);

    const bi = 4;
    expect(asm.G.get(0, bi)).toBe(1);
    expect(asm.G.get(bi, 2)).toBe(-10);
  });
});
