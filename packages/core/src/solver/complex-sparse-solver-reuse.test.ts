import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SparseMatrix } from './sparse-matrix.js';
import { toCsc, type CscMatrix } from './csc-matrix.js';
import { ComplexSparseSolver } from './complex-sparse-solver.js';
import { SingularMatrixError } from '../errors.js';
import { simulate } from '../simulate.js';

/**
 * Issue #769: across the frequencies of one sweep, ComplexSparseSolver reuses
 * the pivot sequence and L/U pattern of its last full factorization (ngspice
 * NIacIter: SMPcReorder once, then SMPcLUfac; KLU: klu_refactor). The reuse
 * only succeeds when the full kernel would make exactly the same decisions,
 * so every result must be bit-identical (Object.is) to a solver that runs the
 * full factorization at every frequency.
 */

type Vec = [Float64Array, Float64Array];

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface AcSystem { G: CscMatrix; C: CscMatrix; label: string }

/** MNA-shaped random system with voltage sources and VCVS branches (#732 shapes). */
function randomMna(seed: number, nodes: number): AcSystem {
  const next = rng(seed);
  const vsrc = 1 + Math.floor(next() * 3);
  const vcvs = Math.floor(next() * 3);
  const n = nodes + vsrc + vcvs;
  const G = new SparseMatrix(n);
  const C = new SparseMatrix(n);
  const node = () => Math.floor(next() * nodes);
  const conductance = (a: number, b: number, g: number, m: SparseMatrix) => {
    m.add(a, a, g); m.add(b, b, g); m.add(a, b, -g); m.add(b, a, -g);
  };
  for (let i = 1; i < nodes; i++) conductance(i, Math.floor(next() * i), 10 ** (-1 - 4 * next()), G);
  for (let e = 0; e < nodes; e++) {
    const a = node();
    const b = node();
    if (a === b) continue;
    if (next() < 0.5) conductance(a, b, 10 ** (-1 - 5 * next()), G);
    else conductance(a, b, 10 ** (-15 + 6 * next()), C);
  }
  for (let i = 0; i < nodes; i++) {
    if (next() < 0.3) C.add(i, i, 10 ** (-15 + 6 * next()));
    G.add(i, i, 1e-12);
    if (next() < 0.1) G.add(i, i, 10 ** (-3 * next()));
  }
  const driven = new Set<number>();
  const freshNode = () => {
    let a = node();
    while (driven.has(a)) a = (a + 1) % nodes;
    driven.add(a);
    return a;
  };
  let branch = nodes;
  for (let v = 0; v < vsrc; v++, branch++) {
    const a = freshNode();
    G.add(a, branch, 1); G.add(branch, a, 1);
    if (next() < 0.5 && driven.size < nodes) { const b = freshNode(); G.add(b, branch, -1); G.add(branch, b, -1); }
  }
  for (let v = 0; v < vcvs; v++, branch++) {
    const out = freshNode();
    const ctrl = node();
    G.add(out, branch, 1); G.add(branch, out, 1);
    if (ctrl !== out) G.add(branch, ctrl, -(1 + 10 * next()));
  }
  if (nodes > 3) { G.touch(0, nodes - 1); G.touch(nodes - 1, 0); }
  return { G: toCsc(G).csc, C: toCsc(C).csc, label: `random seed ${seed} n=${n}` };
}

/** 2-D RC mesh driven by a voltage source branch at one corner. */
function rcMesh(side: number): AcSystem {
  const nodes = side * side;
  const n = nodes + 1;
  const G = new SparseMatrix(n);
  const C = new SparseMatrix(n);
  const id = (r: number, c: number) => r * side + c;
  const edge = (a: number, b: number) => {
    G.add(a, a, 1e-3); G.add(b, b, 1e-3); G.add(a, b, -1e-3); G.add(b, a, -1e-3);
  };
  for (let r = 0; r < side; r++) {
    for (let c = 0; c < side; c++) {
      if (c + 1 < side) edge(id(r, c), id(r, c + 1));
      if (r + 1 < side) edge(id(r, c), id(r + 1, c));
      C.add(id(r, c), id(r, c), 1e-12);
      G.add(id(r, c), id(r, c), 1e-12);
    }
  }
  G.add(nodes - 1, nodes - 1, 1e-3);
  G.add(0, nodes, 1); G.add(nodes, 0, 1);
  return { G: toCsc(G).csc, C: toCsc(C).csc, label: `rc mesh ${side}x${side}` };
}

function rhsFor(n: number, seed: number): Vec {
  const next = rng(seed);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) { re[i] = next() - 0.5; im[i] = next() < 0.3 ? next() - 0.5 : 0; }
  return [re, im];
}

/** A log sweep from 1 Hz to 10 GHz, then back down and through omega = 0. */
function sweep(pointsPerDecade: number): number[] {
  const up: number[] = [];
  for (let k = 0; k <= 10 * pointsPerDecade; k++) up.push(2 * Math.PI * 10 ** (k / pointsPerDecade));
  return [...up, ...[...up].reverse(), 0, up[0]];
}

function freshSolve(G: CscMatrix, C: CscMatrix, omega: number, b: Vec): { x: Vec; swaps: number; nnz: number } {
  const solver = new ComplexSparseSolver();
  solver.analyzePattern(G, C);
  solver.factorize(G, C, omega);
  return { x: solver.solve(b[0], b[1]), swaps: solver.rowSwaps(), nnz: solver.factorNonzeros() };
}

function expectIdentical(actual: Vec, expected: Vec, label: string): void {
  for (let part = 0; part < 2; part++) {
    for (let i = 0; i < actual[part].length; i++) {
      if (!Object.is(actual[part][i], expected[part][i])) {
        throw new Error(`${label}: x[${i}].${part === 0 ? 're' : 'im'} = ${actual[part][i]} but a full factorization gives ${expected[part][i]}`);
      }
    }
  }
}

describe('ComplexSparseSolver pivot reuse across frequencies (#769)', () => {
  it('is bit-identical to a full factorization at every frequency of random MNA sweeps', () => {
    let reused = 0;
    let full = 0;
    let fallbackSystems = 0;
    let swappedSystems = 0;
    const omegas = sweep(3);
    for (let seed = 1; seed <= 60; seed++) {
      const { G, C, label } = randomMna(seed, 8 + (seed % 37));
      const solver = new ComplexSparseSolver();
      solver.analyzePattern(G, C);
      let swapped = false;
      for (const [index, omega] of omegas.entries()) {
        const b = rhsFor(G.size, seed * 31 + index);
        solver.factorize(G, C, omega);
        const fresh = freshSolve(G, C, omega, b);
        expectIdentical(solver.solve(b[0], b[1]), fresh.x, `${label} omega=${omega}`);
        expect(solver.rowSwaps(), `${label} omega=${omega} row swaps`).toBe(fresh.swaps);
        expect(solver.factorNonzeros(), `${label} omega=${omega} factor nnz`).toBe(fresh.nnz);
        if (fresh.swaps > 0) swapped = true;
      }
      expect(solver.numericFactorizations).toBe(omegas.length);
      reused += solver.pivotReuseFactorizations;
      full += solver.numericFactorizations - solver.pivotReuseFactorizations;
      if (solver.numericFactorizations - solver.pivotReuseFactorizations > 1) fallbackSystems++;
      if (swapped) swappedSystems++;
    }
    // Both paths are exercised: most frequencies reuse the pivots, and the
    // pivot decision changes along some sweeps, forcing a full factorization.
    expect(reused).toBeGreaterThan(full);
    expect(fallbackSystems).toBeGreaterThan(5);
    expect(swappedSystems).toBeGreaterThan(20);
    console.log(`#769 random sweeps: ${reused} reused, ${full} full factorizations, ${fallbackSystems}/60 systems with a pivot change, ${swappedSystems}/60 with row swaps`);
  });

  it('reuses the first factorization for every later point of an RC mesh sweep', () => {
    const { G, C, label } = rcMesh(24);
    const solver = new ComplexSparseSolver();
    solver.analyzePattern(G, C);
    const omegas = sweep(2).filter(omega => omega > 0);
    for (const [index, omega] of omegas.entries()) {
      const b = rhsFor(G.size, index);
      solver.factorize(G, C, omega);
      expectIdentical(solver.solve(b[0], b[1]), freshSolve(G, C, omega, b).x, `${label} omega=${omega}`);
    }
    expect(solver.numericFactorizations).toBe(omegas.length);
    expect(solver.pivotReuseFactorizations).toBe(omegas.length - 1);
  });

  it('falls back to a full factorization when a reused U entry cancels exactly', () => {
    // A = [[1, -jw], [1, 3 + jw]] with G[0,1] stored as an explicit zero, so
    // U[0,1] = -jw: nonzero for omega > 0 and exactly zero at omega = 0,
    // where the full kernel skips L[:,0] in column 1.
    const G = new SparseMatrix(2);
    G.add(0, 0, 1); G.touch(0, 1); G.add(1, 0, 1); G.add(1, 1, 3);
    const C = new SparseMatrix(2);
    C.add(0, 1, -1); C.add(1, 1, 1);
    const g = toCsc(G).csc;
    const c = toCsc(C).csc;
    const solver = new ComplexSparseSolver({ ordering: 'natural' });
    solver.analyzePattern(g, c);
    const b: Vec = [Float64Array.from([1, 2]), Float64Array.from([0, 1])];
    for (const omega of [1, 0, 2, 0]) {
      solver.factorize(g, c, omega);
      expectIdentical(solver.solve(b[0], b[1]), freshSolve(g, c, omega, b).x, `omega=${omega}`);
    }
    expect(solver.numericFactorizations).toBe(4);
    // 1 -> 0 cancels U[0,1] (full); 0 -> 2 needs the fill again (full);
    // 2 -> 0 cancels again (full).
    expect(solver.pivotReuseFactorizations).toBe(0);
  });

  it('falls back when an L entry cancels exactly, keeping the factor pattern of a full factorization', () => {
    // Column 0 is [2, jw]^T with G[1,0] an explicit zero: L[1,0] = jw/2
    // vanishes at omega = 0, where the full kernel stores no L entry.
    const G = new SparseMatrix(2);
    G.add(0, 0, 2); G.touch(1, 0); G.add(0, 1, 1); G.add(1, 1, 3);
    const C = new SparseMatrix(2);
    C.add(1, 0, 1);
    const g = toCsc(G).csc;
    const c = toCsc(C).csc;
    const solver = new ComplexSparseSolver({ ordering: 'natural' });
    solver.analyzePattern(g, c);
    const b: Vec = [Float64Array.from([1, 2]), Float64Array.from([0, 1])];
    for (const omega of [1, 2, 0]) {
      solver.factorize(g, c, omega);
      const fresh = freshSolve(g, c, omega, b);
      expectIdentical(solver.solve(b[0], b[1]), fresh.x, `omega=${omega}`);
      expect(solver.factorNonzeros(), `omega=${omega} factor nnz`).toBe(fresh.nnz);
    }
    expect(solver.pivotReuseFactorizations).toBe(1); // 1 -> 2 only
  });

  it('resolves a magnitude tie of the column maximum like the full kernel (first found wins)', () => {
    // Column 0: preferred row 0 holds an explicit zero, so the pivot is the
    // column maximum of row 1 (1 + jw, |re|+|im| = 1 + w, found first) and
    // row 2 (2). Row 2 wins below w = 1, the two tie at w = 1 exactly, and
    // the full kernel then takes row 1, the first one found.
    const G = new SparseMatrix(3);
    G.touch(0, 0); G.add(1, 0, 1); G.add(2, 0, 2);
    G.add(0, 1, 1); G.add(1, 1, 3);
    G.add(0, 2, 2); G.add(1, 2, 1); G.add(2, 2, 5);
    const C = new SparseMatrix(3);
    C.add(1, 0, 1);
    const g = toCsc(G).csc;
    const c = toCsc(C).csc;
    const b: Vec = [Float64Array.from([1, 2, 3]), Float64Array.from([0, 1, 0])];
    const run = (omegas: number[]) => {
      const solver = new ComplexSparseSolver({ ordering: 'natural' });
      solver.analyzePattern(g, c);
      for (const omega of omegas) {
        solver.factorize(g, c, omega);
        const fresh = freshSolve(g, c, omega, b);
        expectIdentical(solver.solve(b[0], b[1]), fresh.x, `omega=${omega}`);
        expect(solver.rowSwaps(), `omega=${omega} row swaps`).toBe(fresh.swaps);
      }
      return solver.pivotReuseFactorizations;
    };
    expect(run([0.5, 0.6])).toBe(1); // row 2 stays the strict maximum
    expect(run([0.5, 1])).toBe(0);   // tie: row 1 comes first
    expect(run([1, 1.5])).toBe(1);   // row 1 is now the strict maximum
    expect(run([1, 0.5])).toBe(0);   // row 2 overtakes row 1
  });

  it('reuses on a content-equal pattern but not across analyzePattern or a different pattern', () => {
    const { G, C } = rcMesh(6);
    const solver = new ComplexSparseSolver();
    solver.analyzePattern(G, C);
    solver.factorize(G, C, 1e3);
    // A rebuilt CSC with the same structure (AC with dispersive devices
    // assembles a new conductance matrix at every frequency).
    const G2: CscMatrix = { size: G.size, colPtr: new Int32Array(G.colPtr), rowIdx: new Int32Array(G.rowIdx), values: new Float64Array(G.values) };
    solver.factorize(G2, C, 2e3);
    expect(solver.pivotReuseFactorizations).toBe(1);

    solver.analyzePattern(G, C);
    solver.factorize(G, C, 3e3);
    expect(solver.pivotReuseFactorizations).toBe(1);

    const other = new SparseMatrix(G.size);
    for (let j = 0; j < G.size; j++) {
      for (let p = G.colPtr[j]; p < G.colPtr[j + 1]; p++) other.add(G.rowIdx[p], j, G.values[p]);
    }
    other.add(0, G.size - 2, 1e-6);
    other.add(G.size - 2, 0, 1e-6);
    const G3 = toCsc(other).csc;
    solver.factorize(G3, C, 4e3);
    expect(solver.pivotReuseFactorizations).toBe(1);
    // Same column order (analyzed on G), full factorization of G3.
    const reference = new ComplexSparseSolver();
    reference.analyzePattern(G, C);
    reference.factorize(G3, C, 4e3);
    const b = rhsFor(G.size, 5);
    expectIdentical(solver.solve(b[0], b[1]), reference.solve(b[0], b[1]), 'different pattern');

    // Same column pointers, one row index moved (column 0: row 6 -> row 7).
    solver.factorize(G, C, 5e3);
    const reused = solver.pivotReuseFactorizations;
    const rowIdx = new Int32Array(G.rowIdx);
    const moved = rowIdx.subarray(G.colPtr[0], G.colPtr[1]).indexOf(6) + G.colPtr[0];
    expect(rowIdx[moved]).toBe(6);
    rowIdx[moved] = 7;
    const G4: CscMatrix = { size: G.size, colPtr: new Int32Array(G.colPtr), rowIdx, values: new Float64Array(G.values) };
    solver.factorize(G4, C, 6e3);
    expect(solver.pivotReuseFactorizations).toBe(reused);
    const reference4 = new ComplexSparseSolver();
    reference4.analyzePattern(G, C);
    reference4.factorize(G4, C, 6e3);
    expectIdentical(solver.solve(b[0], b[1]), reference4.solve(b[0], b[1]), 'moved row index');

    // analyzePattern on a different system drops the old pivots.
    const small = rcMesh(5);
    solver.analyzePattern(small.G, small.C);
    solver.factorize(small.G, small.C, 7e3);
    expect(solver.pivotReuseFactorizations).toBe(reused);
    const bs = rhsFor(small.G.size, 6);
    expectIdentical(solver.solve(bs[0], bs[1]), freshSolve(small.G, small.C, 7e3, bs).x, 'after re-analysis');
  });

  it('does not reuse after a failed factorization', () => {
    const G = new SparseMatrix(2);
    G.add(0, 0, 1); G.add(0, 1, 1); G.add(1, 0, 1); G.add(1, 1, 1);
    const C = new SparseMatrix(2);
    C.add(0, 0, 1);
    const g = toCsc(G).csc;
    const c = toCsc(C).csc;
    const solver = new ComplexSparseSolver();
    solver.analyzePattern(g, c);
    solver.factorize(g, c, 1);
    expect(() => solver.factorize(g, c, 0)).toThrow(SingularMatrixError);
    expect(() => solver.solve(new Float64Array(2), new Float64Array(2))).toThrow(/factorize/);
    expect(() => solver.factorize(g, c, 0)).toThrow(SingularMatrixError);
    solver.factorize(g, c, 1);
    const b: Vec = [Float64Array.from([1, 0]), Float64Array.from([0, 0])];
    expectIdentical(solver.solve(b[0], b[1]), freshSolve(g, c, 1, b).x, 'after singular');
  });
});

const CORPUS = fileURLToPath(new URL('../../../../benchmarks/corpus/', import.meta.url));
const CORPUS_AC_DECKS = [
  'ngspice/fixtures/tests/filters/lowpass.cir',
  'ngspice/fixtures/tests/vbic/CEamp.cir',
  'ngspice/fixtures/examples/probe/ac-test.cir',
  'classic/fixtures/spice3f5/rca3040.cir',
  'corpus-e/fixtures/tests/d_bjt-diffpair-ccs.ckt',
  'corpus-e/fixtures/tests/d_coil.1.ckt',
];

/** The #732 deck shape: an RC ladder with a VCVS buffer every 50 stages. */
function vcvsLadderDeck(stages: number): string {
  const lines = ['* RC ladder with VCVS buffers (#732 shape)', 'VIN n0 0 AC 1'];
  let prev = 'n0';
  for (let i = 1; i <= stages; i++) {
    lines.push(`R${i} ${prev} n${i} 100`, `C${i} n${i} 0 1p`);
    prev = `n${i}`;
    if (i % 50 === 0) {
      lines.push(`E${i} b${i} 0 n${i} 0 2`, `RL${i} b${i} m${i} 1k`, `VM${i} m${i} x${i} 0`, `CX${i} x${i} 0 1p`);
      prev = `x${i}`;
    }
  }
  lines.push('.ac dec 5 1 1g', '.end');
  return lines.join('\n');
}

describe('ComplexSparseSolver pivot reuse on corpus AC systems (#769)', () => {
  afterEach(() => vi.restoreAllMocks());

  const decks: Array<[string, () => string]> = [
    ...CORPUS_AC_DECKS.map((path): [string, () => string] => [path, () => readFileSync(CORPUS + path, 'utf8')]),
    ['generated VCVS ladder (200 stages)', () => vcvsLadderDeck(200)],
  ];
  for (const [label, read] of decks) {
    it(`matches a full factorization bit for bit on every system of ${label}`, async () => {
      const cloneCsc = (m: CscMatrix): CscMatrix => ({
        size: m.size, colPtr: new Int32Array(m.colPtr), rowIdx: new Int32Array(m.rowIdx), values: new Float64Array(m.values),
      });
      const originalFactorize = ComplexSparseSolver.prototype.factorize;
      const originalSolve = ComplexSparseSolver.prototype.solve;
      // Each solve is checked against the factorization that preceded it on
      // the same solver instance, with copies of every input.
      const last = new Map<ComplexSparseSolver, [CscMatrix, CscMatrix, number]>();
      const solvers = new Set<ComplexSparseSolver>();
      const checks: Array<{ G: CscMatrix; C: CscMatrix; omega: number; b: Vec; x: Vec }> = [];
      vi.spyOn(ComplexSparseSolver.prototype, 'factorize').mockImplementation(function (this: ComplexSparseSolver, G, C, omega) {
        solvers.add(this);
        last.set(this, [cloneCsc(G), cloneCsc(C), omega]);
        return originalFactorize.call(this, G, C, omega);
      });
      vi.spyOn(ComplexSparseSolver.prototype, 'solve').mockImplementation(function (this: ComplexSparseSolver, bRe, bIm) {
        const b: Vec = [new Float64Array(bRe), new Float64Array(bIm)];
        const [xRe, xIm] = originalSolve.call(this, bRe, bIm);
        const [G, C, omega] = last.get(this)!;
        checks.push({ G, C, omega, b, x: [new Float64Array(xRe), new Float64Array(xIm)] });
        return [xRe, xIm];
      });
      await simulate(read());
      vi.restoreAllMocks();
      expect(checks.length).toBeGreaterThan(0);
      for (const [s, { G, C, omega, b, x }] of checks.entries()) {
        expectIdentical(x, freshSolve(G, C, omega, b).x, `${label}: solve ${s + 1} at omega=${omega}`);
      }
      let reused = 0;
      let factorizations = 0;
      for (const solver of solvers) {
        reused += solver.pivotReuseFactorizations;
        factorizations += solver.numericFactorizations;
      }
      expect(reused).toBeGreaterThan(0);
      console.log(`#769 ${label}: ${checks.length} solves, ${factorizations} factorizations, ${reused} reused pivots`);
    });
  }
});
