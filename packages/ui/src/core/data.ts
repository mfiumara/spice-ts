import type { TransientDataset, ACDataset } from './types.js';

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
    try { signalMap.set(name, data.voltage(name)); } catch {
      try { signalMap.set(name, data.current(name)); } catch { /* skip */ }
    }
  }
  return [{ time: data.time, signals: signalMap, label: '' }];
}

export function normalizeACData(data: unknown, signals: string[]): ACDataset[] {
  if (Array.isArray(data)) return data as ACDataset[];
  if (!isACResultLike(data)) throw new Error('Invalid AC data: expected ACResult or ACDataset[]');

  const magnitudes = new Map<string, number[]>();
  const phases = new Map<string, number[]>();
  for (const name of signals) {
    try {
      const phasors = data.voltage(name);
      magnitudes.set(name, phasors.map(p => 20 * Math.log10(Math.max(p.magnitude, 1e-30))));
      phases.set(name, phasors.map(p => p.phase));
    } catch {
      try {
        const phasors = data.current(name);
        magnitudes.set(name, phasors.map(p => 20 * Math.log10(Math.max(p.magnitude, 1e-30))));
        phases.set(name, phasors.map(p => p.phase));
      } catch { /* skip */ }
    }
  }
  return [{ frequencies: data.frequencies, magnitudes, phases, label: '' }];
}
