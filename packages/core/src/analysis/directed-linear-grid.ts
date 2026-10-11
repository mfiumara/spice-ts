/** Count an inclusive directed linear grid without stepping past its stop. */
export function directedLinearPointCount(start: number, stop: number, step: number): number {
  if (![start, stop, step].every(Number.isFinite) || step === 0) return 0;

  const intervals = (stop - start) / step;
  if (intervals < 0) return 0;

  const roundingTolerance = Number.EPSILON * Math.max(1, intervals) * 8;
  let count = Math.floor(intervals + roundingTolerance) + 1;
  const lastValue = start + (count - 1) * step;
  const crossedStop = step > 0 ? lastValue > stop : lastValue < stop;
  if (crossedStop && Math.abs(lastValue - stop) > endpointTolerance(start, stop, lastValue)) {
    count--;
  }
  return count;
}

function endpointTolerance(start: number, stop: number, value: number): number {
  return Number.EPSILON * Math.max(1, Math.abs(start), Math.abs(stop), Math.abs(value)) * 2;
}

/** dctrcurv.c stops a sweep level once `SGN(step) * (value - stop)` exceeds this. */
const DCTRCURV_STOP_TOLERANCE = Number.EPSILON * 1e3;

/**
 * Grids longer than this are only ever sized for a pre-solve limit check; they are counted in
 * closed form rather than accumulated point by point.
 */
const MAX_ACCUMULATED_POINTS = 10_000_000;

/**
 * Number of values in an ngspice-47 `.dc` sweep level (dctrcurv.c): the source starts at
 * `start` and repeatedly adds `step` while `SGN(step) * (value - stop) <= DBL_EPSILON * 1e3`.
 * The absolute stop tolerance means the accumulated rounding, not the nominal grid, decides
 * whether the endpoint is kept.
 */
export function accumulatedLinearPointCount(start: number, stop: number, step: number): number {
  if (![start, stop, step].every(Number.isFinite) || step === 0) return 0;
  const nominal = directedLinearPointCount(start, stop, step);
  if (nominal > MAX_ACCUMULATED_POINTS) return nominal;
  let count = 0;
  forEachAccumulatedValue(start, stop, step, () => { count++; });
  return count;
}

/** Values of an ngspice-47 `.dc` sweep level; see {@link accumulatedLinearPointCount}. */
export function accumulatedLinearGrid(start: number, stop: number, step: number): number[] {
  const values: number[] = [];
  if (![start, stop, step].every(Number.isFinite) || step === 0) return values;
  forEachAccumulatedValue(start, stop, step, value => { values.push(value); });
  return values;
}

function forEachAccumulatedValue(
  start: number, stop: number, step: number, visit: (value: number) => void,
): void {
  const direction = Math.sign(step);
  for (let value = start; direction * (value - stop) <= DCTRCURV_STOP_TOLERANCE;) {
    visit(value);
    const next = value + step;
    if (next === value) return;
    value = next;
  }
}
