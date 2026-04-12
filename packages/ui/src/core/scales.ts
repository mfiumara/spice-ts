import { scaleLinear, scaleLog, type ScaleLinear, type ScaleLogarithmic } from 'd3-scale';
import { bisector } from 'd3-array';

export type LinearScale = ScaleLinear<number, number>;
export type LogScale = ScaleLogarithmic<number, number>;

export function createLinearScale(domain: [number, number], range: [number, number]): LinearScale {
  return scaleLinear().domain(domain).range(range);
}

export function createLogScale(domain: [number, number], range: [number, number]): LogScale {
  return scaleLog().base(10).domain(domain).range(range);
}

export function computeYExtent(signalArrays: number[][]): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const arr of signalArrays) {
    for (const v of arr) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (!isFinite(min) || !isFinite(max)) return [-1, 1];
  if (min === max) return [min - 1, max + 1];
  const padding = (max - min) * 0.1;
  return [min - padding, max + padding];
}

const xBisector = bisector<number, number>((d) => d).center;

export function bisectData(sortedX: number[], target: number): number {
  if (sortedX.length === 0) return 0;
  const idx = xBisector(sortedX, target);
  return Math.max(0, Math.min(idx, sortedX.length - 1));
}
