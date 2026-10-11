import type { ACAnalysis } from '../types.js';

type FrequencySweep = Pick<ACAnalysis, 'variation' | 'points' | 'startFreq' | 'stopFreq'>;

/**
 * Which ngspice analysis owns the sweep. ngspice-47 `.ac` (acan.c) stretches DEC sweeps that
 * span at least one decade so the last point lands on stop; `.noise` (noisean.c) always steps
 * by 10^(1/N) up to stop plus a reltol tolerance; `.sens` (cktsens.c `count_steps`) also steps
 * by 10^(1/N) but counts `(int)(N * log10(stop/start) + 1.01)` points. `.sp` (span.c) steps
 * DEC/OCT like `.noise` and LIN like `.ac`.
 */
export type FrequencySweepKind = 'ac' | 'noise' | 'sens' | 'sp';

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
 * Number of points in an ngspice `.ac`/`.noise`/`.sens` sweep: LIN is N total points, except
 * that `.ac` (acan.c) only steps when `N - 1 > 1`, so `.ac lin 2` is the single start point;
 * DEC/OCT step by the analysis' ratio (see {@link FrequencySweepKind}); `.ac`/`.noise` keep
 * every point up to stop plus ngspice's `ratio * stop * reltol` tolerance.
 */
export function frequencyPointCount(
  sweep: FrequencySweep,
  relativeTolerance: number,
  kind: FrequencySweepKind,
): number {
  if (sweep.variation === 'lin') return (kind === 'ac' || kind === 'sp') && sweep.points === 2 ? 1 : sweep.points;
  if (kind === 'sens') return sensitivityPointCount(sweep);
  const { base, steps } = logStep(sweep, kind);
  const tolerance = Math.pow(base, 1 / steps) * sweep.stopFreq * relativeTolerance;
  const span = Math.log((sweep.stopFreq + tolerance) / sweep.startFreq) / Math.log(base);
  return Number.isFinite(span) ? Math.max(0, Math.floor(span * steps + 1e-12)) + 1 : 0;
}

/**
 * cktsens.c `count_steps`: a non-increasing sweep spans one base period (decade/octave) from
 * start, and the count truncates `N * periods + 1.01`, so it may include one point past stop.
 */
function sensitivityPointCount(sweep: FrequencySweep): number {
  const base = sweep.variation === 'oct' ? 2 : 10;
  const stop = sweep.stopFreq > sweep.startFreq ? sweep.stopFreq : base * sweep.startFreq;
  const periods = Math.log(stop / sweep.startFreq) / Math.log(base);
  const count = Math.trunc(sweep.points * periods + 1.01);
  return Number.isFinite(count) ? Math.max(1, count) : 0;
}

/** Frequencies of an ngspice `.ac`/`.noise`/`.sens` sweep; see {@link frequencyPointCount}. */
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
