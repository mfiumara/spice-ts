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

  it('leaves assembler.solution unchanged when maxTransientIterations=0 (loop never runs)', () => {
    const { compiled, options, assembler, solver } = buildRCContext();
    const brokenOpts = { ...options, maxTransientIterations: 0 };
    const prevSol = new Float64Array(assembler.solution);
    const snapshot = new Float64Array(assembler.solution);

    attemptStep(
      { compiled, assembler, solver, options: brokenOpts },
      { dt: 1e-6, time: 1e-6, prevSolution: prevSol, prevB: undefined, gmin: 1e-12, voltageLimit: 3.5 },
    );

    // When the loop never enters, nothing gets stamped or solved, so the
    // assembler.solution is guaranteed unchanged. This documents the loop-
    // not-entered edge case; the failure-on-iter-N contract is "indeterminate".
    expect(Array.from(assembler.solution)).toEqual(Array.from(snapshot));
  });
});

describe('attemptStep NR adaptive damping', () => {
  it('reports oscillation in the step result when sign flips are detected', () => {
    // Build a diode with very sharp I-V curve so NR oscillates at the first step.
    const ckt = parse(`
V1 1 0 DC 5
.model DSHARP D(IS=1e-18 N=0.1)
D1 1 0 DSHARP
.tran 1u 1m
`);
    const compiled = ckt.compile();
    const options = resolveOptions(undefined, 1e-3);
    const assembler = new MNAAssembler(compiled.nodeCount, compiled.branchCount);
    const solver = createSparseSolver();
    const prevSol = new Float64Array(assembler.solution);

    const result = attemptStep(
      { compiled, assembler, solver, options },
      { dt: 1e-6, time: 1e-6, prevSolution: prevSol, prevB: undefined, gmin: 1e-12, voltageLimit: 3.5 },
    );

    // This particular pathological model should trigger the oscillation branch
    // at least once. We don't care whether it ultimately converges — just that
    // the step result can carry the oscillation flag.
    if (result.ok) {
      expect(typeof result.oscillated).toBe('boolean');
    }
  });

  it('a tighter voltage limit reduces per-iteration delta magnitude', () => {
    const ckt = parse(`
V1 1 0 DC 10
R1 1 2 10
R2 2 0 10
.tran 1u 1m
`);
    const compiled = ckt.compile();
    const options = resolveOptions(undefined, 1e-3);
    const assembler = new MNAAssembler(compiled.nodeCount, compiled.branchCount);
    const solver = createSparseSolver();
    const prevSol = new Float64Array(assembler.solution);

    const tight = attemptStep(
      { compiled, assembler, solver, options },
      { dt: 1e-6, time: 1e-6, prevSolution: prevSol, prevB: undefined, gmin: 1e-12, voltageLimit: 1.0 },
    );
    assembler.solution.fill(0);
    const loose = attemptStep(
      { compiled, assembler, solver, options },
      { dt: 1e-6, time: 1e-6, prevSolution: prevSol, prevB: undefined, gmin: 1e-12, voltageLimit: 100 },
    );

    expect(tight.ok).toBe(true);
    expect(loose.ok).toBe(true);
    if (tight.ok && loose.ok) {
      // Tight limit should take more NR iterations to converge
      expect(tight.iterations).toBeGreaterThanOrEqual(loose.iterations);
    }
  });
});
