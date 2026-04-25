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
    return this.times[this.head];
  }

  pop(): void {
    if (this.head < this.times.length) this.head++;
  }

  /** True when `time` is within tolerance of the current head. */
  isNear(time: number): boolean {
    const next = this.peek();
    if (next === undefined) return false;
    return Math.abs(time - next) <= this.tolerance;
  }

  /** Test-only — returns the remaining breakpoints in order. */
  remaining(): readonly number[] {
    return this.times.slice(this.head);
  }
}
