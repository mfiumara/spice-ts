import type { ACAnalysis } from '../types.js';

type FrequencySweep = Pick<ACAnalysis, 'variation' | 'points' | 'startFreq' | 'stopFreq'>;

/**
 * Which ngspice analysis owns the sweep. ngspice-47 `.ac` (acan.c) stretches DEC sweeps that
 * span at least one decade so the last point lands on stop, and builds every grid by
 * accumulation (see {@link acanGrid}); `.noise` (noisean.c) always steps by 10^(1/N) up to stop
 * plus a reltol tolerance; `.sens` (cktsens.c `count_steps`) also steps
 * by 10^(1/N) but counts `(int)(N * log10(stop/start) + 1.01)` points (see
 * {@link sensitivityPointCount} for OCT and LIN). `.sp` (span.c) steps DEC/OCT like `.noise`
 * and LIN like `.ac`.
 */
export type FrequencySweepKind = 'ac' | 'noise' | 'sens' | 'sp';

/** A log sweep advances by `base^(1/steps)` per point: point i is `start * base^(i/steps)`. */
interface LogStep {
  base: number;
  steps: number;
}

function logStep(sweep: FrequencySweep): LogStep {
  return { base: sweep.variation === 'oct' ? 2 : 10, steps: sweep.points };
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
  if (kind === 'ac') return acanPointCount(sweep, relativeTolerance);
  if (kind === 'sens') return sensitivityPointCount(sweep);
  if (sweep.variation === 'lin') return kind === 'sp' && sweep.points === 2 ? 1 : sweep.points;
  const { base, steps } = logStep(sweep);
  const tolerance = Math.pow(base, 1 / steps) * sweep.stopFreq * relativeTolerance;
  const span = Math.log((sweep.stopFreq + tolerance) / sweep.startFreq) / Math.log(base);
  return Number.isFinite(span) ? Math.max(0, Math.floor(span * steps + 1e-12)) + 1 : 0;
}

/**
 * cktsens.c `count_steps`: a non-increasing DEC/OCT sweep spans one base period (decade/octave)
 * from start, and the count truncates `N * periods + 1.01`, so it may include one point past
 * stop. ngspice-47 counts OCT periods as `log(stop/start) / M_LOG2E` (not `* M_LOG2E`), and a
 * LIN sweep has exactly N points.
 */
function sensitivityPointCount(sweep: FrequencySweep): number {
  const steps = Math.max(1, sweep.points);
  if (sweep.variation === 'lin') return steps;
  const base = sweep.variation === 'oct' ? 2 : 10;
  const stop = sweep.stopFreq > sweep.startFreq ? sweep.stopFreq : base * sweep.startFreq;
  const periods = sweep.variation === 'oct'
    ? Math.log(stop / sweep.startFreq) / Math.LOG2E
    : Math.log10(stop / sweep.startFreq);
  const count = Math.trunc(steps * periods + 1.01);
  return Number.isFinite(count) ? Math.max(1, count) : 0;
}

/**
 * cktsens.c sweep: the first point is start and each next one is `inc_freq(freq)`. ngspice-47
 * `inc_freq` adds the step only for the noise/distortion `LINEAR` constant, never for
 * `SENS_LINEAR`, so a LIN sweep multiplies by its step `(stop - start) / N` (`sens ac lin 3 1e6
 * 1.3e6` gives 1e6, 1e11, 1e16). DEC/OCT points are `start * base^(i/N)`.
 */
function sensitivityGrid(sweep: FrequencySweep): number[] {
  const count = sensitivityPointCount(sweep);
  if (sweep.variation !== 'lin') {
    const { base, steps } = logStep(sweep);
    return Array.from({ length: count }, (_, index) => sweep.startFreq * Math.pow(base, index / steps));
  }
  const step = (sweep.stopFreq - sweep.startFreq) / Math.max(1, sweep.points);
  const frequencies = [sweep.startFreq];
  while (frequencies.length < count) frequencies.push(frequencies[frequencies.length - 1] * step);
  return frequencies;
}

/** Frequencies of an ngspice `.ac`/`.noise`/`.sens` sweep; see {@link frequencyPointCount}. */
export function frequencyGrid(
  sweep: FrequencySweep,
  relativeTolerance: number,
  kind: FrequencySweepKind,
): number[] {
  if (kind === 'ac') return acanGrid(sweep, relativeTolerance);
  if (kind === 'sens') return sensitivityGrid(sweep);
  const count = frequencyPointCount(sweep, relativeTolerance, kind);
  if (sweep.variation === 'lin') {
    if (count <= 1) return [sweep.startFreq];
    const step = (sweep.stopFreq - sweep.startFreq) / (count - 1);
    return Array.from({ length: count }, (_, index) =>
      index === count - 1 ? sweep.stopFreq : sweep.startFreq + index * step);
  }
  const { base, steps } = logStep(sweep);
  return Array.from({ length: count }, (_, index) => sweep.startFreq * Math.pow(base, index / steps));
}

/** Sweeps longer than this are only sized for a pre-solve limit check, in closed form. */
const MAX_ACCUMULATED_POINTS = 10_000_000;

/**
 * acan.c frequency increment: DEC/OCT multiply by `ACfreqDelta`, LIN adds it. A DEC sweep
 * spanning at least a decade uses `floor(decades * N)` intervals with the ratio stretched to
 * `exp(log(stop / start) / intervals)`; a narrower one steps by `exp(log(10) / N)`, and
 * `start == stop` gives a ratio of 1 (one point). LIN only steps when `N - 1 > 1`.
 */
function acanIncrement(sweep: FrequencySweep): { multiply: boolean; delta: number } {
  const steps = Math.max(1, sweep.points);
  const { startFreq: start, stopFreq: stop } = sweep;
  if (sweep.variation === 'lin') {
    return { multiply: false, delta: steps - 1 > 1 ? (stop - start) / (steps - 1) : 0 };
  }
  if (sweep.variation === 'oct') return { multiply: true, delta: Math.exp(Math.log(2) / steps) };
  if (stop / 10 < start) {
    return { multiply: true, delta: stop === start ? 1 : Math.exp(Math.log(10) / steps) };
  }
  const intervals = Math.floor(Math.abs(Math.log10(stop / start)) * steps);
  return { multiply: true, delta: Math.exp(Math.log(stop / start) / intervals) };
}

/**
 * Visit the ngspice-47 `.ac` frequencies in order (acan.c main loop): start at `start`, run
 * while `freq <= stop + freqTol`, and accumulate `freq *= delta` (DEC/OCT, tolerance
 * `delta * stop * reltol`) or `freq += delta` (LIN, tolerance `delta * reltol`). A unit ratio
 * or zero LIN delta ends the sweep after its first point; acan.c rejects a DEC/OCT start <= 0,
 * which visits nothing here. `visit` returns false to stop early.
 */
function forEachAcanFrequency(
  sweep: FrequencySweep,
  relativeTolerance: number,
  visit: (frequency: number) => boolean,
): void {
  const { multiply, delta } = acanIncrement(sweep);
  const tolerance = multiply ? delta * sweep.stopFreq * relativeTolerance : delta * relativeTolerance;
  const limit = sweep.stopFreq + tolerance;
  if (!Number.isFinite(delta) || !Number.isFinite(limit)) return;
  if (multiply && !(sweep.startFreq > 0)) return;
  for (let frequency = sweep.startFreq; frequency <= limit;) {
    if (!visit(frequency)) return;
    if (multiply ? delta === 1 : delta === 0) return;
    const next = multiply ? frequency * delta : frequency + delta;
    if (next === frequency || next === 0) return;
    frequency = next;
  }
}

/** Frequencies of an ngspice-47 `.ac` sweep, accumulated exactly as acan.c does. */
function acanGrid(sweep: FrequencySweep, relativeTolerance: number): number[] {
  const frequencies: number[] = [];
  forEachAcanFrequency(sweep, relativeTolerance, frequency => {
    frequencies.push(frequency);
    return true;
  });
  return frequencies;
}

/** Length of {@link acanGrid}, capped to a closed-form estimate for oversized sweeps. */
function acanPointCount(sweep: FrequencySweep, relativeTolerance: number): number {
  let count = 0;
  forEachAcanFrequency(sweep, relativeTolerance, () => ++count <= MAX_ACCUMULATED_POINTS);
  return count > MAX_ACCUMULATED_POINTS ? closedFormAcanPointCount(sweep, relativeTolerance) : count;
}

function closedFormAcanPointCount(sweep: FrequencySweep, relativeTolerance: number): number {
  const { multiply, delta } = acanIncrement(sweep);
  const stop = sweep.stopFreq + (multiply ? delta * sweep.stopFreq : delta) * relativeTolerance;
  const span = multiply
    ? Math.log(stop / sweep.startFreq) / Math.log(delta)
    : (stop - sweep.startFreq) / delta;
  return Number.isFinite(span) ? Math.max(0, Math.floor(span + 1e-12)) + 1 : 0;
}
