import { describe, it, expect } from 'vitest';
import { parse } from '../parser/index.js';
import { MNAAssembler } from '../mna/assembler.js';
import { createSparseSolver } from '../solver/sparse-solver.js';
import { resolveOptions } from '../types.js';
import { attemptStep } from './transient-step.js';

function buildRCContext() {
  const ckt = parse(`
V1 1 0 DC 5
R1 1 2 1k
C1 2 0 1u
.tran 1u 1m
`);
  const compiled = ckt.compile();
  const options = resolveOptions(undefined, 1e-3);
  const assembler = new MNAAssembler(compiled.nodeCount, compiled.branchCount);
  const solver = createSparseSolver();
  return { compiled, options, assembler, solver };
}

describe('attemptStep', () => {
  it('converges in a small number of iterations for a linear RC circuit', () => {
    const { compiled, options, assembler, solver } = buildRCContext();
    const prevSol = new Float64Array(assembler.solution);

    const result = attemptStep(
      { compiled, assembler, solver, options },
      { dt: 1e-6, time: 1e-6, prevSolution: prevSol, prevB: undefined, gmin: 1e-12, voltageLimit: 3.5 },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.iterations).toBeLessThanOrEqual(5);
      expect(result.solution.length).toBe(compiled.nodeCount + compiled.branchCount);
    }
  });

  it('returns ok=false with reason="nr-divergence" when NR cannot converge', () => {
    const { compiled, options, assembler, solver } = buildRCContext();
    // Force failure by setting maxTransientIterations to 0
    const brokenOpts = { ...options, maxTransientIterations: 0 };
    const prevSol = new Float64Array(assembler.solution);

    const result = attemptStep(
      { compiled, assembler, solver, options: brokenOpts },
      { dt: 1e-6, time: 1e-6, prevSolution: prevSol, prevB: undefined, gmin: 1e-12, voltageLimit: 3.5 },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('nr-divergence');
    }
  });

  it('does not modify the input assembler.solution on failure', () => {
    const { compiled, options, assembler, solver } = buildRCContext();
    const brokenOpts = { ...options, maxTransientIterations: 0 };
    const prevSol = new Float64Array(assembler.solution);
    const snapshot = new Float64Array(assembler.solution);

    attemptStep(
      { compiled, assembler, solver, options: brokenOpts },
      { dt: 1e-6, time: 1e-6, prevSolution: prevSol, prevB: undefined, gmin: 1e-12, voltageLimit: 3.5 },
    );

    expect(Array.from(assembler.solution)).toEqual(Array.from(snapshot));
  });
});
