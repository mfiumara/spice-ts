/**
 * Sorted, deduped monotonic queue of transient-analysis breakpoint times.
 *
 * The transient driver consumes breakpoints in ascending order: it peeks the
 * head, clamps the next step so it lands exactly at or before the head, and
 * pops once the step has landed on (or passed) the head.
 */
export class BreakpointQueue {
  private readonly times: number[];
  private head = 0;
  private readonly temporary = new Map<object, readonly number[]>();

  constructor(times: readonly number[], private readonly tolerance: number) {
    const filtered = times.filter(t => Number.isFinite(t) && t > 0);
    filtered.sort((a, b) => a - b);
    const deduped: number[] = [];
    for (const t of filtered) {
      if (deduped.length === 0 || t - deduped[deduped.length - 1] > tolerance) {
        deduped.push(t);
      }
    }
    this.times = deduped;
  }

  peek(): number | undefined {
    let next = this.times[this.head];
    for (const times of this.temporary.values()) {
      for (const time of times) if (next === undefined || time < next) next = time;
    }
    return next;
  }

  pop(): void {
    const next = this.peek();
    if (next === undefined) return;
    if (this.times[this.head] <= next + this.tolerance) this.head++;
    for (const [owner, times] of this.temporary) {
      const future = times.filter(time => time > next + this.tolerance);
      if (future.length) this.temporary.set(owner, future);
      else this.temporary.delete(owner);
    }
  }

  /** Predictions move with the controlling signal; old predictions are not permanent events. */
  replaceTemporary(owner: object, times: readonly number[], now: number): void {
    const future = times.filter(time => Number.isFinite(time) && time - now > this.tolerance);
    if (future.length) this.temporary.set(owner, future);
    else this.temporary.delete(owner);
  }

  /** True when `time` is within tolerance of the current head. */
  isNear(time: number): boolean {
    const next = this.peek();
    if (next === undefined) return false;
    return Math.abs(time - next) <= this.tolerance;
  }

  /**
   * Add a breakpoint created during the run (ngspice CKTsetBreak). A time at
   * or within tolerance after `now` is dropped; of two breakpoints within
   * tolerance the earlier one is kept.
   */
  insert(time: number, now: number): void {
    if (!Number.isFinite(time) || time - now <= this.tolerance) return;
    const times = this.times;
    let index = this.head;
    while (index < times.length && times[index] <= time) index++;
    if (index < times.length && times[index] - time <= this.tolerance) {
      times[index] = time;
      return;
    }
    if (index > this.head && time - times[index - 1] <= this.tolerance) return;
    times.splice(index, 0, time);
  }

  /** Test-only — returns the remaining breakpoints in order. */
  remaining(): readonly number[] {
    return [...this.times.slice(this.head), ...[...this.temporary.values()].flat()].sort((a, b) => a - b);
  }
}
