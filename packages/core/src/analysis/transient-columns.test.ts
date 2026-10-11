import { describe, expect, it } from 'vitest';
import { ColumnRecorder, defaultRowsPerChunk } from './transient-columns.js';

// Issue #609: transient result columns are buffered point-major in a typed
// chunk and appended to the per-name number[] columns a chunk at a time.
// The recorded columns must equal per-point pushes bit for bit.

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function solutions(count: number, size: number, seed: number): Float64Array[] {
  const random = lcg(seed);
  const special = [0, -0, NaN, Infinity, -Infinity, Number.MIN_VALUE, -Number.MAX_VALUE];
  const out: Float64Array[] = [];
  for (let s = 0; s < count; s++) {
    const solution = new Float64Array(size);
    for (let i = 0; i < size; i++) {
      const r = random();
      solution[i] = r < 0.1 ? special[Math.floor(random() * special.length)] : (r - 0.5) * 10 ** (random() * 20 - 10);
    }
    out.push(solution);
  }
  return out;
}

function expectSameColumns(actual: number[][], expected: number[][]): void {
  expect(actual.length).toBe(expected.length);
  for (let k = 0; k < expected.length; k++) {
    expect(actual[k].length).toBe(expected[k].length);
    for (let i = 0; i < expected[k].length; i++) {
      if (!Object.is(actual[k][i], expected[k][i])) {
        throw new Error(`column ${k} index ${i}: ${actual[k][i]} is not bit-identical to ${expected[k][i]}`);
      }
    }
  }
}

describe('ColumnRecorder (#609)', () => {
  // Duplicate and out-of-order slots, as a name map with aliases produces.
  const slots = [3, 0, 1, 5, 5, 2, 7, 4];
  const size = 8;

  for (const rowsPerChunk of [1, 2, 3, 7, 64]) {
    for (const points of [0, 1, rowsPerChunk - 1, rowsPerChunk, rowsPerChunk + 1, 5 * rowsPerChunk + 2]) {
      if (points < 0) continue;
      it(`matches per-point pushes: ${points} points, ${rowsPerChunk} rows per chunk`, () => {
        const reference = slots.map(() => [] as number[]);
        const columns = slots.map(() => [] as number[]);
        const recorder = new ColumnRecorder(columns, slots, rowsPerChunk);
        for (const solution of solutions(points, size, points * 31 + rowsPerChunk)) {
          for (let k = 0; k < slots.length; k++) reference[k].push(solution[slots[k]]);
          recorder.record(solution);
          // The caller may reuse or mutate the vector after recording.
          solution.fill(42);
        }
        recorder.flush();
        expectSameColumns(columns, reference);
        // A second flush with nothing buffered appends nothing.
        recorder.flush();
        expectSameColumns(columns, reference);
      });
    }
  }

  it('appends after values already in the columns and keeps recording after a flush', () => {
    const reference = slots.map(k => [k, -0]);
    const columns = slots.map(k => [k, -0]);
    const recorder = new ColumnRecorder(columns, slots, 4);
    const all = solutions(11, size, 7);
    for (const [index, solution] of all.entries()) {
      for (let k = 0; k < slots.length; k++) reference[k].push(solution[slots[k]]);
      recorder.record(solution);
      if (index === 5) recorder.flush();
    }
    recorder.flush();
    expectSameColumns(columns, reference);
  });

  it('handles a recorder without columns', () => {
    const recorder = new ColumnRecorder([], [], 3);
    for (let i = 0; i < 10; i++) recorder.record(new Float64Array(2));
    recorder.flush();
  });

  it('bounds the chunk by size and by row count', () => {
    expect(defaultRowsPerChunk(0)).toBe(64);
    expect(defaultRowsPerChunk(10)).toBe(64);
    expect(defaultRowsPerChunk(50_000)).toBeGreaterThanOrEqual(8);
    expect(defaultRowsPerChunk(50_000) * 50_000).toBeLessThanOrEqual(1 << 21);
    expect(defaultRowsPerChunk(10_000_000)).toBe(1);
  });
});
