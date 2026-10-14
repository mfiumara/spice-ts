import type { EngineAnalysis } from './corpus/classic/report.js';

/** Stable engine plot ID when exported, otherwise one-to-one descriptive-name occurrence. */
export interface PlotIdentity { type: EngineAnalysis['type']; plotName: string; plotId?: string }
export interface PlotPair<T> { left?: T; right?: T }
export function pairPlots<T extends PlotIdentity>(left: readonly T[], right: readonly T[]): PlotPair<T>[] {
  const identity = (plot: T): string | undefined => plot.plotId ?? (new RegExp(`^${plot.type}\\d+$`, 'i').test(plot.plotName) ? plot.plotName : undefined);
  const remaining = new Set(right);
  const pairs: PlotPair<T>[] = [];
  for (const own of left) {
    const candidates = [...remaining].filter(candidate => candidate.type === own.type);
    const id = identity(own);
    if (id?.startsWith('dot:')) {
      // ngspice-47 batch raw order reverses source rank within each ac/dc/op/tran
      // type. Plotname is not unique. Evidence: repeated-dot-1009/README.md.
      const occurrence = id.match(/^dot:(ac|dc|op|tran):([1-9]\d*)$/);
      const target = occurrence?.[1] === own.type
        ? right.filter(candidate => candidate.type === own.type)[Number(occurrence[2]) - 1]
        : undefined;
      const paired = occurrence?.[1] === own.type
        ? candidates.find(candidate => identity(candidate) === id)
          ?? (target && remaining.has(target) && identity(target) === undefined ? target : undefined)
        : undefined;
      if (paired) remaining.delete(paired);
      pairs.push({ left: own, right: paired });
      continue;
    }
    const reference = id !== undefined
      ? candidates.find(candidate => identity(candidate)?.toLowerCase() === id.toLowerCase())
      : candidates.find(candidate => candidate.plotName.toLowerCase() === own.plotName.toLowerCase());
    // A legacy raw header has a descriptive title, not a control ID. Fall back to occurrence
    // only when neither side has IDs. Never pair dc6 with dc1 by analysis type alone.
    const paired = reference ?? (id === undefined && candidates.every(candidate => identity(candidate) === undefined) ? candidates[0] : undefined);
    if (paired) remaining.delete(paired);
    pairs.push({ left: own, right: paired });
  }
  for (const reference of remaining) pairs.push({ right: reference });
  return pairs;
}
