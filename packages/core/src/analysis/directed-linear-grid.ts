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

/** Resolve a directed-grid coordinate, snapping a floating-point endpoint to its stop. */
export function directedLinearPointValue(
  start: number, stop: number, step: number, index: number,
): number {
  const value = start + index * step;
  return Math.abs(value - stop) <= endpointTolerance(start, stop, value) ? stop : value;
}

function endpointTolerance(start: number, stop: number, value: number): number {
  return Number.EPSILON * Math.max(1, Math.abs(start), Math.abs(stop), Math.abs(value)) * 2;
}
