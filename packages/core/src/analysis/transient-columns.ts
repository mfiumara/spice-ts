/**
 * Chunked recording of transient result columns (#609).
 *
 * `solveTransient` returns one `number[]` per node voltage and branch
 * current. Pushing every saved point straight into those arrays touches one
 * array per column per point: on a 50k-node deck that is 50k scattered
 * array headers and backing stores per timepoint, plus their growth copies,
 * and it was the single hottest line of the RC-ladder profile.
 *
 * The recorder instead copies each saved point contiguously into a
 * point-major `Float64Array` chunk and, when the chunk is full (or on
 * {@link ColumnRecorder.flush}), appends the buffered rows to each column in
 * turn. The values are copied verbatim (Float64 to Float64), so the columns
 * hold exactly the numbers per-point pushes would, in the same order.
 */

/** Upper bound on buffered values per chunk (16 MiB of Float64). */
const MAX_CHUNK_VALUES = 1 << 21;
/** Rows per chunk on small circuits, where the size bound does not bite. */
const MAX_ROWS_PER_CHUNK = 64;

/** Rows buffered per chunk for a given column count. */
export function defaultRowsPerChunk(columnCount: number): number {
  if (columnCount <= 0) return MAX_ROWS_PER_CHUNK;
  return Math.max(1, Math.min(MAX_ROWS_PER_CHUNK, Math.floor(MAX_CHUNK_VALUES / columnCount)));
}

export class ColumnRecorder {
  private readonly columnCount: number;
  private readonly slots: Int32Array;
  private readonly rowsPerChunk: number;
  private chunk: Float64Array | undefined;
  private rows = 0;

  /**
   * @param columns - Destination arrays; column `k` receives `solution[slots[k]]`.
   * @param slots - Solution-vector index read for each column.
   * @param rowsPerChunk - Points buffered before they are appended to the columns.
   */
  constructor(
    private readonly columns: readonly number[][],
    slots: readonly number[],
    rowsPerChunk = defaultRowsPerChunk(columns.length),
  ) {
    if (slots.length !== columns.length) throw new Error('ColumnRecorder: one slot per column required');
    if (!Number.isInteger(rowsPerChunk) || rowsPerChunk < 1) {
      throw new Error('ColumnRecorder: rowsPerChunk must be a positive integer');
    }
    this.columnCount = columns.length;
    this.slots = Int32Array.from(slots);
    this.rowsPerChunk = rowsPerChunk;
  }

  /** Buffer one point; the solution vector may be reused after the call. */
  record(solution: Float64Array): void {
    const count = this.columnCount;
    if (count === 0) return;
    // Allocated on first use, so a run that saves nothing allocates nothing.
    const chunk = this.chunk ??= new Float64Array(this.rowsPerChunk * count);
    const slots = this.slots;
    const base = this.rows * count;
    for (let k = 0; k < count; k++) chunk[base + k] = solution[slots[k]];
    if (++this.rows === this.rowsPerChunk) this.flush();
  }

  /** Append every buffered point to the columns. */
  flush(): void {
    const rows = this.rows;
    if (rows === 0) return;
    const chunk = this.chunk!;
    const count = this.columnCount;
    const columns = this.columns;
    // Column-outer: each column takes its rows in one burst. The strided
    // reads of neighbouring columns share the same `rows` cache lines.
    for (let k = 0; k < count; k++) {
      const column = columns[k];
      for (let r = 0, p = k; r < rows; r++, p += count) column.push(chunk[p]);
    }
    this.rows = 0;
  }
}
