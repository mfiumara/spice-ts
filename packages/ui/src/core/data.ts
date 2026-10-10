import type { TransientDataset, ACDataset, DCSweepDataset } from './types.js';

interface TransientResultLike {
  time: number[];
  voltage(node: string): number[];
  current(source: string): number[];
}

interface ACResultLike {
  frequencies: number[];
  voltage(node: string): { magnitude: number; phase: number }[];
  current(source: string): { magnitude: number; phase: number }[];
}

export interface DCSweepResultLike {
  sweepValues: ArrayLike<number>;
  voltage(node: string): ArrayLike<number>;
  current(source: string): ArrayLike<number>;
}

interface ParsedSignal {
  kind: 'voltage' | 'current';
  target: string;
}

/** Accept both legacy bare names and explicit probe expressions. */
export function parseProbeSignal(name: string): ParsedSignal | null {
  const match = /^(V|I)\((.+)\)$/.exec(name);
  if (!match) return null;
  return { kind: match[1] === 'V' ? 'voltage' : 'current', target: match[2] };
}

function readRealSignal(
  data: { voltage(node: string): ArrayLike<number>; current(source: string): ArrayLike<number> },
  name: string,
): number[] {
  const probe = parseProbeSignal(name);
  if (probe?.kind === 'voltage') return Array.from(data.voltage(probe.target));
  if (probe?.kind === 'current') return Array.from(data.current(probe.target));
  try { return Array.from(data.voltage(name)); } catch { return Array.from(data.current(name)); }
}

function isTransientResultLike(data: unknown): data is TransientResultLike {
  return (
    typeof data === 'object' && data !== null &&
    'time' in data && Array.isArray((data as TransientResultLike).time) &&
    'voltage' in data && typeof (data as TransientResultLike).voltage === 'function'
  );
}

function isACResultLike(data: unknown): data is ACResultLike {
  return (
    typeof data === 'object' && data !== null &&
    'frequencies' in data && Array.isArray((data as ACResultLike).frequencies) &&
    'voltage' in data && typeof (data as ACResultLike).voltage === 'function'
  );
}

export function normalizeTransientData(data: unknown, signals: string[]): TransientDataset[] {
  if (Array.isArray(data)) return data as TransientDataset[];
  if (!isTransientResultLike(data)) throw new Error('Invalid transient data: expected TransientResult or TransientDataset[]');

  const signalMap = new Map<string, number[]>();
  for (const name of signals) {
    const probe = parseProbeSignal(name);
    if (probe?.kind === 'voltage' && probe.target === '0') {
      signalMap.set(name, data.time.map(() => 0));
      continue;
    }
    try { signalMap.set(name, readRealSignal(data, name)); } catch { /* skip */ }
  }
  return [{ time: data.time, signals: signalMap, label: '' }];
}

export function normalizeACData(data: unknown, signals: string[]): ACDataset[] {
  if (Array.isArray(data)) return data as ACDataset[];
  if (!isACResultLike(data)) throw new Error('Invalid AC data: expected ACResult or ACDataset[]');

  const magnitudes = new Map<string, number[]>();
  const phases = new Map<string, number[]>();
  for (const name of signals) {
    const parsed = parseProbeSignal(name);
    if (parsed?.kind === 'voltage' && parsed.target === '0') {
      magnitudes.set(name, data.frequencies.map(() => -600));
      phases.set(name, data.frequencies.map(() => 0));
      continue;
    }
    try {
      const phasors = parsed?.kind === 'current'
        ? data.current(parsed.target)
        : data.voltage(parsed?.target ?? name);
      magnitudes.set(name, phasors.map(p => 20 * Math.log10(Math.max(p.magnitude, 1e-30))));
      phases.set(name, phasors.map(p => p.phase));
    } catch {
      if (parseProbeSignal(name)) continue;
      try {
        const phasors = data.current(name);
        magnitudes.set(name, phasors.map(p => 20 * Math.log10(Math.max(p.magnitude, 1e-30))));
        phases.set(name, phasors.map(p => p.phase));
      } catch { /* skip */ }
    }
  }
  return [{ frequencies: data.frequencies, magnitudes, phases, label: '' }];
}

export function normalizeDCSweepData(
  data: DCSweepDataset[] | DCSweepResultLike,
  signals: string[],
): DCSweepDataset[] {
  if (Array.isArray(data)) return data;
  const signalMap = new Map<string, number[]>();
  for (const name of signals) {
    const probe = parseProbeSignal(name);
    if (probe?.kind === 'voltage' && probe.target === '0') {
      signalMap.set(name, Array.from(data.sweepValues, () => 0));
      continue;
    }
    try { signalMap.set(name, readRealSignal(data, name)); } catch { /* skip */ }
  }
  return [{ sweepValues: Array.from(data.sweepValues), signals: signalMap, label: '' }];
}
