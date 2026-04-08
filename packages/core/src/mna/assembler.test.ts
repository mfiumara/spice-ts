import { describe, it, expect } from 'vitest';
import { MNAAssembler } from './assembler.js';

describe('MNAAssembler', () => {
  it('creates matrices of correct size for node count + branch count', () => {
    const asm = new MNAAssembler(3, 1);
    expect(asm.G.size).toBe(4);
    expect(asm.C.size).toBe(4);
    expect(asm.b.length).toBe(4);
  });

  it('provides a StampContext that stamps into G and b', () => {
    const asm = new MNAAssembler(2, 0);
    const ctx = asm.getStampContext();
    ctx.stampG(0, 0, 1.5);
    ctx.stampG(0, 1, -0.5);
    ctx.stampB(1, 3.0);
    expect(asm.G.get(0, 0)).toBe(1.5);
    expect(asm.G.get(0, 1)).toBe(-0.5);
    expect(asm.b[1]).toBe(3.0);
  });

  it('StampContext reads solution vector', () => {
    const asm = new MNAAssembler(2, 1);
    asm.solution[0] = 5.0;
    asm.solution[1] = 3.0;
    asm.solution[2] = 0.001;
    const ctx = asm.getStampContext();
    expect(ctx.getVoltage(0)).toBe(5.0);
    expect(ctx.getVoltage(1)).toBe(3.0);
    expect(ctx.getCurrent(0)).toBe(0.001);
  });

  it('clear resets G, C, and b but preserves solution', () => {
    const asm = new MNAAssembler(2, 0);
    const ctx = asm.getStampContext();
    ctx.stampG(0, 0, 5);
    ctx.stampB(0, 3);
    asm.solution[0] = 2.5;
    asm.clear();
    expect(asm.G.get(0, 0)).toBe(0);
    expect(asm.b[0]).toBe(0);
    expect(asm.solution[0]).toBe(2.5);
  });
});
