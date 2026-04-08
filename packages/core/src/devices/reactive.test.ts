import { describe, it, expect } from 'vitest';
import { MNAAssembler } from '../mna/assembler.js';
import { Capacitor } from './capacitor.js';
import { Inductor } from './inductor.js';

describe('Capacitor', () => {
  it('stamps capacitance into C matrix', () => {
    const asm = new MNAAssembler(2, 0);
    const cap = new Capacitor('C1', [0, 1], 1e-9);
    cap.stampDynamic(asm.getStampContext());

    expect(asm.C.get(0, 0)).toBeCloseTo(1e-9);
    expect(asm.C.get(0, 1)).toBeCloseTo(-1e-9);
    expect(asm.C.get(1, 0)).toBeCloseTo(-1e-9);
    expect(asm.C.get(1, 1)).toBeCloseTo(1e-9);
  });

  it('does not stamp into G matrix (no DC path)', () => {
    const asm = new MNAAssembler(2, 0);
    const cap = new Capacitor('C1', [0, 1], 1e-9);
    cap.stamp(asm.getStampContext());

    expect(asm.G.get(0, 0)).toBe(0);
  });

  it('handles ground node', () => {
    const asm = new MNAAssembler(1, 0);
    const cap = new Capacitor('C1', [0, -1], 1e-9);
    cap.stampDynamic(asm.getStampContext());

    expect(asm.C.get(0, 0)).toBeCloseTo(1e-9);
  });
});

describe('Inductor', () => {
  it('stamps branch equation into G matrix', () => {
    // 2 nodes + 1 branch = system size 3
    // branchIndex = 0 (relative), absolute row = numNodes + 0 = 2
    const asm = new MNAAssembler(2, 1);
    const ind = new Inductor('L1', [0, 1], 0, 1e-6);
    ind.stamp(asm.getStampContext());

    // KCL: branch current enters node 0, leaves node 1
    expect(asm.G.get(0, 2)).toBe(1);
    expect(asm.G.get(1, 2)).toBe(-1);
    // Branch equation: V(0) - V(1) = 0 (DC short)
    expect(asm.G.get(2, 0)).toBe(1);
    expect(asm.G.get(2, 1)).toBe(-1);
  });

  it('handles ground node on negative terminal', () => {
    // 1 node + 1 branch = system size 2
    // branchIndex = 0 (relative), absolute row = numNodes + 0 = 1
    const asm = new MNAAssembler(1, 1);
    const ind = new Inductor('L1', [0, -1], 0, 1e-6);
    ind.stamp(asm.getStampContext());

    // KCL: branch current enters node 0 only (nMinus is ground)
    expect(asm.G.get(0, 1)).toBe(1);
    // Branch equation: V(0) = 0 (only nPlus stamps)
    expect(asm.G.get(1, 0)).toBe(1);
  });

  it('stamps inductance into C matrix for transient', () => {
    const asm = new MNAAssembler(2, 1);
    const ind = new Inductor('L1', [0, 1], 0, 1e-6);
    ind.stampDynamic(asm.getStampContext());

    // C[branchRow][branchRow] = -L, where branchRow = numNodes + branchIndex = 2
    expect(asm.C.get(2, 2)).toBeCloseTo(-1e-6);
  });
});
