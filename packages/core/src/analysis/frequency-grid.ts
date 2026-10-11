import type { ACAnalysis } from '../types.js';

type FrequencySweep = Pick<ACAnalysis, 'variation' | 'points' | 'startFreq' | 'stopFreq'>;

/**
 * Which ngspice analysis owns the sweep. ngspice-47 `.ac` (acan.c) stretches DEC sweeps that
 * span at least one decade so the last point lands on stop; `.noise` (noisean.c) always steps
 * by 10^(1/N).
 */
export type FrequencySweepKind = 'ac' | 'noise';

/** A log sweep advances by `base^(1/steps)` per point: point i is `start * base^(i/steps)`. */
interface LogStep {
  base: number;
  steps: number;
}

function logStep(sweep: FrequencySweep, kind: FrequencySweepKind): LogStep {
  if (sweep.variation === 'oct') return { base: 2, steps: sweep.points };
  if (kind === 'ac' && sweep.stopFreq / 10 >= sweep.startFreq) {
    // acan.c: floor(decades * N) intervals, ratio stretched to (stop/start)^(1/intervals).
    // Expressed per decade so whole-decade sweeps keep exactly the plain 10^(i/N) grid.
    const decades = Math.abs(Math.log10(sweep.stopFreq / sweep.startFreq));
    return { base: 10, steps: Math.floor(decades * sweep.points) / decades };
  }
  return { base: 10, steps: sweep.points };
}

/**
 * Number of points in an ngspice `.ac`/`.noise` sweep: LIN is N total points; DEC/OCT step by
 * the analysis' ratio (see {@link FrequencySweepKind}) and keep every point up to stop plus
 * ngspice's `ratio * stop * reltol` tolerance.
 */
export function frequencyPointCount(
  sweep: FrequencySweep,
  relativeTolerance: number,
  kind: FrequencySweepKind,
): number {
  if (sweep.variation === 'lin') return sweep.points;
  const { base, steps } = logStep(sweep, kind);
  const tolerance = Math.pow(base, 1 / steps) * sweep.stopFreq * relativeTolerance;
  const span = Math.log((sweep.stopFreq + tolerance) / sweep.startFreq) / Math.log(base);
  return Number.isFinite(span) ? Math.max(0, Math.floor(span * steps + 1e-12)) + 1 : 0;
}

/** Frequencies of an ngspice `.ac`/`.noise` sweep; see {@link frequencyPointCount}. */
export function frequencyGrid(
  sweep: FrequencySweep,
  relativeTolerance: number,
  kind: FrequencySweepKind,
): number[] {
  const count = frequencyPointCount(sweep, relativeTolerance, kind);
  if (sweep.variation === 'lin') {
    if (count <= 1) return [sweep.startFreq];
    const step = (sweep.stopFreq - sweep.startFreq) / (count - 1);
    return Array.from({ length: count }, (_, index) =>
      index === count - 1 ? sweep.stopFreq : sweep.startFreq + index * step);
  }
  const { base, steps } = logStep(sweep, kind);
  return Array.from({ length: count }, (_, index) => sweep.startFreq * Math.pow(base, index / steps));
}
