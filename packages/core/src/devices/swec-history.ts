import type { StampContext } from './device.js';

/**
 * Shared pieces of the ngspice-47 SWEC transmission-line ports (TXL and CPL):
 * the integer-picosecond port history (`VI_list` / `VI_list_txl`) and its
 * delayed lookup (`get_pvs_vi` / `get_pvs_vi_txl`).
 */

/** ngspice TXL/CPL history timestamps: `(int) (CKTtime * 1e12)`. */
export function swecTimePs(time: number): number {
  return Math.trunc(time * 1e12);
}

/** ngspice TXLload/CPLload add `0.1 * CKTgmin` between the port nodes. */
export function swecGmin(deviceGmin: number): number {
  return 0.1 * deviceGmin;
}

/** ngspice sets CKTmaxStep to 0.9 tau (tau in ps) when a step exceeds a line delay. */
export function maxStepAfterDelay(taulPs: number): number {
  return 0.9 * taulPs * 1e-12;
}

/** Stamp a matrix entry unless the row or column is the ground node (-1). */
export function addConductance(ctx: StampContext, row: number, col: number, value: number): void {
  if (row < 0 || col < 0) return;
  ctx.stampG(row, col, value);
}

/** Delayed port quantities for every mode (rows) and line (columns). */
export interface SwecDelayed {
  /** True when some mode's delay ends inside the step (ngspice `ext`). */
  ext: boolean;
  /** Per mode: fraction of the step after the delayed instant (ngspice `ratio`). */
  readonly ratio: Float64Array;
  /** Values at t1 - tau (`v1_*`, `i1_*`) and t2 - tau (`v2_*`, `i2_*`), index mode * lines + line. */
  readonly v1i: Float64Array;
  readonly v2i: Float64Array;
  readonly i1i: Float64Array;
  readonly i2i: Float64Array;
  readonly v1o: Float64Array;
  readonly v2o: Float64Array;
  readonly i1o: Float64Array;
  readonly i2o: Float64Array;
}

/**
 * Accepted port voltages and branch currents at integer-picosecond times.
 * Records older than the one bracketing `t - max(tau)` are dropped, which is
 * what ngspice's `vi_head` advance in `get_pvs_vi` achieves.
 */
export class SwecHistory {
  private times: number[] = [];
  private values: number[] = [];
  private start = 0;
  private readonly delayedResult: SwecDelayed;

  constructor(readonly lines: number, readonly modes: number = lines) {
    const size = modes * lines;
    this.delayedResult = {
      ext: false,
      ratio: new Float64Array(modes),
      v1i: new Float64Array(size),
      v2i: new Float64Array(size),
      i1i: new Float64Array(size),
      i2i: new Float64Array(size),
      v1o: new Float64Array(size),
      v2o: new Float64Array(size),
      i1o: new Float64Array(size),
      i2o: new Float64Array(size),
    };
  }

  get length(): number {
    return this.times.length - this.start;
  }

  clear(): void {
    this.times = [];
    this.values = [];
    this.start = 0;
  }

  /** Absolute index of the newest record. */
  tail(): number {
    return this.times.length - 1;
  }

  tailTime(): number {
    return this.times[this.times.length - 1];
  }

  vIn(record: number, line: number): number {
    return this.values[(record * 4) * this.lines + line];
  }

  vOut(record: number, line: number): number {
    return this.values[(record * 4 + 1) * this.lines + line];
  }

  iIn(record: number, line: number): number {
    return this.values[(record * 4 + 2) * this.lines + line];
  }

  iOut(record: number, line: number): number {
    return this.values[(record * 4 + 3) * this.lines + line];
  }

  push(
    time: number,
    vIn: ArrayLike<number>,
    vOut: ArrayLike<number>,
    iIn: ArrayLike<number>,
    iOut: ArrayLike<number>,
  ): void {
    this.times.push(time);
    for (const quantity of [vIn, vOut, iIn, iOut]) {
      for (let line = 0; line < this.lines; line++) this.values.push(quantity[line]);
    }
  }

  /**
   * Drop records that no later lookup can reach: everything before the last
   * record older than `cutoff` (the next step's smallest t1 - tau). ngspice
   * keeps the head at t=0 while any delayed instant is still before t=0.
   */
  trimBefore(cutoff: number): void {
    if (!(cutoff > 0)) return;
    let keep = this.start;
    while (keep + 1 < this.times.length && this.times[keep + 1] < cutoff) keep++;
    this.start = keep;
    if (this.start > 1024 && this.start * 2 > this.times.length) {
      this.times = this.times.slice(this.start);
      this.values = this.values.slice(this.start * 4 * this.lines);
      this.start = 0;
    }
  }

  /**
   * ngspice get_pvs_vi: port quantities one delay before the last accepted
   * time `t1` and the trial time `t2` (both integer ps) for each mode delay.
   */
  delayed(
    t1: number,
    t2: number,
    taul: ArrayLike<number>,
    dc1: ArrayLike<number>,
    dc2: ArrayLike<number>,
  ): SwecDelayed {
    const result = this.delayedResult;
    const lines = this.lines;
    const times = this.times;
    const tail = times.length - 1;
    result.ext = false;
    for (let mode = 0; mode < this.modes; mode++) {
      const ta = t1 - taul[mode];
      const tb = t2 - taul[mode];
      const base = mode * lines;
      result.ratio[mode] = 0;
      if (tb <= 0) {
        for (let line = 0; line < lines; line++) {
          result.i1i[base + line] = 0;
          result.i2i[base + line] = 0;
          result.i1o[base + line] = 0;
          result.i2o[base + line] = 0;
          result.v1i[base + line] = dc1[line];
          result.v2i[base + line] = dc1[line];
          result.v1o[base + line] = dc2[line];
          result.v2o[base + line] = dc2[line];
        }
        continue;
      }

      let before = this.start;
      let after = before + 1;
      if (ta <= 0) {
        for (let line = 0; line < lines; line++) {
          result.i1i[base + line] = 0;
          result.i1o[base + line] = 0;
          result.v1i[base + line] = dc1[line];
          result.v1o[base + line] = dc2[line];
        }
      } else {
        while (times[after] < ta) {
          before = after;
          after++;
          if (after > tail) throw new Error('transmission-line history does not cover the line delay');
        }
        this.interpolate(before, after, ta, base, result.v1i, result.v1o, result.i1i, result.i1o);
      }

      if (tb > t1) {
        result.ext = true;
        const ratio = (tb - t1) / (t2 - t1);
        result.ratio[mode] = ratio;
        const scale = 1 - ratio;
        for (let line = 0; line < lines; line++) {
          result.v2i[base + line] = this.vIn(tail, line) * scale;
          result.v2o[base + line] = this.vOut(tail, line) * scale;
          result.i2i[base + line] = this.iIn(tail, line) * scale;
          result.i2o[base + line] = this.iOut(tail, line) * scale;
        }
      } else {
        while (times[after] < tb) {
          before = after;
          after++;
          if (after > tail) throw new Error('transmission-line history does not cover the line delay');
        }
        this.interpolate(before, after, tb, base, result.v2i, result.v2o, result.i2i, result.i2o);
      }
    }
    return result;
  }

  private interpolate(
    before: number,
    after: number,
    time: number,
    base: number,
    vIn: Float64Array,
    vOut: Float64Array,
    iIn: Float64Array,
    iOut: Float64Array,
  ): void {
    const f = (time - this.times[before]) / (this.times[after] - this.times[before]);
    for (let line = 0; line < this.lines; line++) {
      const v1 = this.vIn(before, line);
      vIn[base + line] = v1 + f * (this.vIn(after, line) - v1);
      const o1 = this.vOut(before, line);
      vOut[base + line] = o1 + f * (this.vOut(after, line) - o1);
      const i1 = this.iIn(before, line);
      iIn[base + line] = i1 + f * (this.iIn(after, line) - i1);
      const j1 = this.iOut(before, line);
      iOut[base + line] = j1 + f * (this.iOut(after, line) - j1);
    }
  }
}
