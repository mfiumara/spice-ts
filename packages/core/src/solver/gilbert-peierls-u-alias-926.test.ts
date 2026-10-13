import { describe, expect, it } from 'vitest';
import { GilbertPeierlsSolver } from './gilbert-peierls.js';
import { SparseMatrix } from './sparse-matrix.js';
import { toCsc } from './csc-matrix.js';
import { SingularMatrixError } from '../errors.js';

interface Storage {
  lColPtr: Int32Array; lRows: Int32Array; lValues: Float64Array;
  uColPtr: Int32Array; uRows: Int32Array; uValues: Float64Array;
  perm: Int32Array; colPerm: Int32Array; kernelState: Int32Array;
  applySupernode(first: number, last: number, settled: number, dormant: number): void;
  growUFactors(required: number): void;
}
const storage = (solver: GilbertPeierlsSolver) => solver as unknown as Storage;
const bits = (values: Float64Array) => Array.from(new BigUint64Array(values.slice().buffer));
function factors(solver: GilbertPeierlsSolver, n: number) {
  const s = storage(solver);
  const ln = s.lColPtr[n], un = s.uColPtr[n];
  return {
    lPtr: Array.from(s.lColPtr), lRows: Array.from(s.lRows.subarray(0, ln)),
    lBits: bits(s.lValues.subarray(0, ln)),
    uPtr: Array.from(s.uColPtr), uRows: Array.from(s.uRows.subarray(0, un)),
    uBits: bits(s.uValues.subarray(0, un)), perm: Array.from(s.perm), order: Array.from(s.colPerm),
  };
}
function matrix(pivot: boolean, cancel: boolean) {
  const m = new SparseMatrix(12);
  for (let j = 0; j < 12; j++) for (let i = 0; i < 12; i++) {
    m.touch(i, j);
    m.add(i, j, i === j ? 32 : 1 + ((i + j) % 3) / 8);
  }
  if (pivot) m.add(0, 0, -32 + 1e-9);
  if (cancel) {
    // Without the pivot control, exactly cancel row 1 in column 2.
    // With it, stress the same entry under an off-diagonal pivot.
    m.add(1, 2, -1 + (1.125 * 1.25 / (pivot ? 1e-9 : 32)));
  }
  return toCsc(m).csc;
}

describe('issue 926 growth-safe supernode U aliases', () => {
  for (const pivot of [false, true]) for (const cancel of [false, true]) {
    it(`preserves complete factors and IEEE solutions with growth inside the block (pivot=${pivot}, cancellation=${cancel})`, () => {
      const csc = matrix(pivot, cancel);
      const reference = new GilbertPeierlsSolver({ ordering: 'natural' });
      const forced = new GilbertPeierlsSolver({ ordering: 'natural' });
      reference.analyzePattern(csc); forced.analyzePattern(csc);
      const s = storage(forced);
      const apply = s.applySupernode.bind(forced), grow = s.growUFactors.bind(forced);
      let inBlock = false, blockGrowths = 0;
      s.growUFactors = (required) => { if (inBlock) blockGrowths++; grow(required); };
      s.applySupernode = (first, last, settled, dormant) => {
        // Allow one write, then replace both arrays midway through this block.
        const capacity = s.kernelState[0] + 1;
        s.uRows = s.uRows.slice(0, capacity);
        s.uValues = s.uValues.slice(0, capacity);
        inBlock = true;
        try { apply(first, last, settled, dormant); } finally { inBlock = false; }
      };
      reference.factorize(csc); forced.factorize(csc);
      const r = storage(reference);
      if (pivot) expect(r.perm[0]).not.toBe(0);
      if (cancel && !pivot) {
        expect(Array.from(r.uRows.subarray(r.uColPtr[2], r.uColPtr[3]))).not.toContain(1);
      }
      expect(blockGrowths).toBeGreaterThan(0);
      expect(forced.supernodalUpdates).toBeGreaterThan(0);
      expect(factors(forced, csc.size)).toEqual(factors(reference, csc.size));
      const rhs = Float64Array.from({ length: csc.size }, (_, i) => i === 0 ? -0 : i - 4.25);
      expect(bits(forced.solve(rhs.slice()))).toEqual(bits(reference.solve(rhs.slice())));
      // Same-pattern changed values exercise pivot reuse or its full fallback.
      for (let p = 0; p < csc.values.length; p++) csc.values[p] *= 1.125;
      reference.factorize(csc); forced.factorize(csc);
      expect(factors(forced, csc.size)).toEqual(factors(reference, csc.size));
      expect(bits(forced.solve(rhs.slice()))).toEqual(bits(reference.solve(rhs.slice())));
    });
  }
  it('preserves singular classification after exact dense cancellation', () => {
    const m = new SparseMatrix(6);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) m.add(i, j, 1);
    const csc = toCsc(m).csc;
    const solver = new GilbertPeierlsSolver({ ordering: 'natural' });
    solver.analyzePattern(csc);
    expect(() => solver.factorize(csc)).toThrow(SingularMatrixError);
    expect(() => solver.solve(new Float64Array(6))).toThrow(/factorize/);
  });
});
