import { parseNumber } from './tokenizer.js';
import type { SourceWaveform, PulseSource, SinSource } from '../types.js';

export function parseSourceWaveform(tokens: string[], startIdx: number): SourceWaveform {
  if (startIdx >= tokens.length) return { type: 'dc', value: 0 };

  // Scan for AC keyword anywhere in the remaining tokens (e.g. "DC 0 AC 1")
  const upper = tokens.slice(startIdx).map(t => t.toUpperCase());
  const acIdx = upper.indexOf('AC');
  if (acIdx >= 0) {
    const absIdx = startIdx + acIdx;
    const magnitude = parseNumber(tokens[absIdx + 1]);
    const maybePhase = tokens[absIdx + 2]?.toUpperCase();
    const phase = (maybePhase && maybePhase !== 'DC' && !maybePhase.startsWith('.'))
      ? parseNumber(tokens[absIdx + 2])
      : 0;
    return { type: 'ac', magnitude, phase };
  }

  const keyword = tokens[startIdx].toUpperCase();

  if (keyword === 'DC') {
    return { type: 'dc', value: parseNumber(tokens[startIdx + 1]) };
  }

  if (keyword === 'AC') {
    const magnitude = parseNumber(tokens[startIdx + 1]);
    const phase = tokens[startIdx + 2] ? parseNumber(tokens[startIdx + 2]) : 0;
    return { type: 'ac', magnitude, phase };
  }

  if (keyword === 'PULSE') {
    const parenStart = tokens.indexOf('(', startIdx);
    const parenEnd = tokens.indexOf(')', startIdx);
    const args = tokens.slice(parenStart + 1, parenEnd).map(parseNumber);
    return {
      type: 'pulse', v1: args[0] ?? 0, v2: args[1] ?? 0,
      delay: args[2] ?? 0, rise: args[3] ?? 1e-12, fall: args[4] ?? 1e-12,
      width: args[5] ?? Infinity, period: args[6] ?? Infinity,
    } satisfies PulseSource;
  }

  if (keyword === 'SIN') {
    const parenStart = tokens.indexOf('(', startIdx);
    const parenEnd = tokens.indexOf(')', startIdx);
    const args = tokens.slice(parenStart + 1, parenEnd).map(parseNumber);
    return {
      type: 'sin', offset: args[0] ?? 0, amplitude: args[1] ?? 0,
      frequency: args[2] ?? 0, delay: args[3], damping: args[4], phase: args[5],
    } satisfies SinSource;
  }

  return { type: 'dc', value: parseNumber(tokens[startIdx]) };
}

/**
 * Parse key=value instance parameters such as W=10u L=1u.
 * Returns a map of uppercase keys to numeric values.
 */
export function parseInstanceParams(tokens: string[], startIdx: number): Record<string, number> {
  const params: Record<string, number> = {};
  for (let i = startIdx; i < tokens.length; i++) {
    const eqIdx = tokens[i].indexOf('=');
    if (eqIdx > 0) {
      const key = tokens[i].slice(0, eqIdx).toUpperCase();
      const val = parseNumber(tokens[i].slice(eqIdx + 1));
      params[key] = val;
    }
  }
  return params;
}
