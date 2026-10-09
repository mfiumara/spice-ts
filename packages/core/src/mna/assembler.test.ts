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

  it('lockTopology enables fast-path stamping', () => {
    const asm = new MNAAssembler(2, 0);
    const ctx1 = asm.getStampContext();
    ctx1.stampG(0, 0, 1); ctx1.stampG(0, 1, -1);
    ctx1.stampG(1, 0, -1); ctx1.stampG(1, 1, 1);
    ctx1.stampC(0, 0, 0.5);
    asm.lockTopology();
    expect(asm.isFastPath).toBe(true);

    asm.clear();
    const ctx2 = asm.getStampContext();
    ctx2.stampG(0, 0, 2); ctx2.stampG(0, 1, -2);
    ctx2.stampG(1, 0, -2); ctx2.stampG(1, 1, 2);
    expect(asm.gValues[asm.diagIdx[0]]).toBe(2);
    expect(asm.gValues[asm.diagIdx[1]]).toBe(2);
  });

  it('getCscMatrix returns valid CSC with fast-path values', () => {
    const asm = new MNAAssembler(2, 0);
    const ctx = asm.getStampContext();
    ctx.stampG(0, 0, 3); ctx.stampG(0, 1, 1);
    ctx.stampG(1, 0, 1); ctx.stampG(1, 1, 3);
    asm.lockTopology();
    const csc = asm.getCscMatrix();
    expect(csc.size).toBe(2);
    expect(csc.colPtr.length).toBe(3);
    const vals = Array.from(csc.values);
    expect(vals).toContain(3);
    expect(vals).toContain(1);
  });

  it('clear resets gValues and cValues when fast-path active', () => {
    const asm = new MNAAssembler(2, 0);
    const ctx = asm.getStampContext();
    ctx.stampG(0, 0, 5);
    ctx.stampC(0, 0, 1);
    asm.lockTopology();
    expect(asm.gValues[asm.diagIdx[0]]).toBe(5);
    asm.clear();
    expect(asm.gValues[asm.diagIdx[0]]).toBe(0);
    expect(asm.cValues[asm.diagIdx[0]]).toBe(0);
  });

  it('stores topology lookup data proportional to structural nonzeros', () => {
    const asm = new MNAAssembler(10_000, 0);
    const ctx = asm.getStampContext();
    ctx.stampG(3, 9_999, 1);
    ctx.stampG(9_999, 3, 2);
    ctx.stampC(4_321, 123, 3);

    asm.lockTopology();

    expect('posMap' in asm).toBe(false);
    expect(asm.topologyNnz).toBe(3);
    expect(asm.stampIndex(3, 9_999)).toBeGreaterThanOrEqual(0);
    expect(asm.stampIndex(9_999, 3)).toBeGreaterThanOrEqual(0);
    expect(asm.stampIndex(4_321, 123)).toBeGreaterThanOrEqual(0);
  });

  it('preserves arbitrary locked topology for direct G and C stamping', () => {
    const asm = new MNAAssembler(8, 1);
    const initial = asm.getStampContext();
    initial.stampG(0, 8, 0);
    initial.stampC(7, 2, 0);
    asm.lockTopology();

    asm.clear();
    const locked = asm.getStampContext();
    locked.stampG(0, 8, 4.5);
    locked.stampC(7, 2, -2.25);

    expect(asm.gValues[asm.stampIndex(0, 8)]).toBe(4.5);
    expect(asm.cValues[asm.stampIndex(7, 2)]).toBe(-2.25);
    expect(() => locked.stampG(1, 6, 1)).toThrow(/locked topology/);
  });
});
