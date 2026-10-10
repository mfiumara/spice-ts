import type { ACAnalysis } from '../types.js';

type FrequencySweep = Pick<ACAnalysis, 'variation' | 'points' | 'startFreq' | 'stopFreq'>;

/**
 * Number of points in an ngspice `.ac`/`.noise` sweep: LIN is N total points; DEC/OCT step by
 * base^(1/N) and keep every point up to stop plus ngspice's `ratio * stop * reltol` tolerance.
 */
export function frequencyPointCount(sweep: FrequencySweep, relativeTolerance: number): number {
  if (sweep.variation === 'lin') return sweep.points;
  const base = sweep.variation === 'dec' ? 10 : 2;
  const tolerance = Math.pow(base, 1 / sweep.points) * sweep.stopFreq * relativeTolerance;
  const ratio = (sweep.stopFreq + tolerance) / sweep.startFreq;
  const span = sweep.variation === 'dec' ? Math.log10(ratio) : Math.log2(ratio);
  return Number.isFinite(span) ? Math.max(0, Math.floor(span * sweep.points + 1e-12)) + 1 : 0;
}

/** Frequencies of an ngspice `.ac`/`.noise` sweep; see {@link frequencyPointCount}. */
export function frequencyGrid(sweep: FrequencySweep, relativeTolerance: number): number[] {
  const count = frequencyPointCount(sweep, relativeTolerance);
  if (sweep.variation === 'lin') {
    if (count <= 1) return [sweep.startFreq];
    const step = (sweep.stopFreq - sweep.startFreq) / (count - 1);
    return Array.from({ length: count }, (_, index) =>
      index === count - 1 ? sweep.stopFreq : sweep.startFreq + index * step);
  }
  const base = sweep.variation === 'dec' ? 10 : 2;
  return Array.from({ length: count }, (_, index) => sweep.startFreq * Math.pow(base, index / sweep.points));
}
