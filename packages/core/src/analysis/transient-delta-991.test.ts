import { describe, it, expect } from 'vitest';
import { parse } from '../parser/index.js';
import { MNAAssembler } from '../mna/assembler.js';
import { resolveOptions } from '../types.js';
import { attemptStep } from './transient-step.js';

describe('transient delta candidate #991', () => {
  it('retains linear solutions and returned snapshots across later attempts', () => {
    const compiled = parse('* delta fixture\nV1 a 0 DC 5\nR1 a b 1k\nC1 b 0 1u\n.tran 1u 1m\n.end\n').compile();
    const assembler = new MNAAssembler(compiled.nodeCount, compiled.branchCount);
    const ctx = { compiled, assembler, options: resolveOptions(undefined, 1e-3) };
    const attempt = { dt: 1e-6, time: 1e-6, prevSolution: new Float64Array(assembler.solution), prevB: undefined, gmin: 0, voltageLimit: 3.5 };
    const first = attemptStep(ctx, attempt);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error('linear step failed');
    expect(first.iterations).toBe(2);
    expect(first.oscillated).toBe(false);
    expect(first.solution[0]).toBeCloseTo(5, 12);
    expect(first.solution[1]).toBeCloseTo(5 / 1001, 12);
    const saved = Array.from(first.solution);
    const next = attemptStep(ctx, { ...attempt, time: 2e-6, prevSolution: first.solution });
    expect(next.ok).toBe(true);
    expect(Array.from(first.solution)).toEqual(saved);
  });
});
