import { parseNumber } from './tokenizer.js';
import type { SourceWaveform, PulseSource, SinSource, PWLSource } from '../types.js';

const UNSUPPORTED_WAVEFORMS = new Set(['EXP', 'SFFM', 'AM', 'TRNOISE', 'EXTERNAL']);

export function parseSourceWaveform(tokens: string[], startIdx: number): SourceWaveform {
  if (startIdx >= tokens.length) return { type: 'dc', value: 0 };

  // Scan for AC keyword anywhere in the remaining tokens (e.g. "DC 1.5 AC 1").
  // In SPICE syntax the DC operating-point value and AC small-signal
  // excitation coexist; the DC bias must still be used for .op/.tran and as
  // the linearization point for .ac.
  const upper = tokens.slice(startIdx).map(t => t.toUpperCase());
  const dcIdx = upper.indexOf('DC');
  const acIdx = upper.indexOf('AC');
  if (acIdx >= 0) {
    const absIdx = startIdx + acIdx;
    const magnitude = parseNumber(tokens[absIdx + 1]);
    const maybePhase = tokens[absIdx + 2]?.toUpperCase();
    const phase = (maybePhase && maybePhase !== 'DC' && !maybePhase.startsWith('.'))
      ? parseNumber(tokens[absIdx + 2])
      : 0;
    let dc = 0;
    if (dcIdx >= 0) {
      dc = parseNumber(tokens[startIdx + dcIdx + 1]);
    } else if (acIdx > 0) {
      try {
        dc = parseNumber(tokens[startIdx]);
      } catch {
        dc = 0;
      }
    }
    return { type: 'ac', dc, magnitude, phase };
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

  if (keyword === 'PWL') {
    const parenStart = tokens.indexOf('(', startIdx);
    const parenEnd = tokens.indexOf(')', startIdx);
    if (parenStart !== startIdx + 1 || parenEnd < parenStart) {
      throw new Error('PWL source requires a parenthesized list of time/value pairs');
    }
    if (parenEnd !== tokens.length - 1) {
      throw new Error(`Unsupported PWL source parameters: '${tokens.slice(parenEnd + 1).join(' ')}'`);
    }
    const args = tokens.slice(parenStart + 1, parenEnd).map(parseNumber);
    if (args.length < 2 || args.length % 2 !== 0) {
      throw new Error('PWL source requires one or more complete time/value pairs');
    }
    const points: PWLSource['points'] = [];
    for (let i = 0; i < args.length; i += 2) {
      const point = { time: args[i], value: args[i + 1] };
      if (points.length > 0 && point.time < points[points.length - 1].time) {
        throw new Error('PWL source times must be non-decreasing');
      }
      points.push(point);
    }
    return { type: 'pwl', points } satisfies PWLSource;
  }

  if (UNSUPPORTED_WAVEFORMS.has(keyword)) {
    throw new Error(`Unsupported source waveform '${keyword}'`);
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
