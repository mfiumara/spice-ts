import { parseNumber } from './tokenizer.js';
import type {
  ACExcitation, DistortionExcitation, SourceWaveform, PulseSource, SinSource, PWLSource,
} from '../types.js';

const UNSUPPORTED_WAVEFORMS = new Set(['EXP', 'SFFM', 'AM', 'TRNOISE', 'EXTERNAL']);

export function parseSourceWaveform(tokens: string[], startIdx: number): SourceWaveform {
  const normalizedTokens = normalizeSourceAssignments(tokens, startIdx);
  const { baseTokens, distortionF1, distortionF2 } = extractDistortionTerms(
    normalizedTokens,
    startIdx,
  );
  return {
    ...parseBaseSourceWaveform(baseTokens, startIdx),
    ...(distortionF1 ? { distortionF1 } : {}),
    ...(distortionF2 ? { distortionF2 } : {}),
  } as SourceWaveform;
}

function parseBaseSourceWaveform(tokens: string[], startIdx: number): SourceWaveform {
  if (startIdx >= tokens.length) return { type: 'dc', value: 0 };

  // Scan for AC keyword anywhere in the remaining tokens (e.g. "DC 1.5 AC 1").
  // In SPICE syntax the DC operating-point value and AC small-signal
  // excitation coexist; the DC bias must still be used for .op/.tran and as
  // the linearization point for .ac.
  const upper = tokens.slice(startIdx).map(t => t.toUpperCase());
  const dcIdx = upper.indexOf('DC');
  const acIdx = upper.indexOf('AC');
  const waveformOffset = upper.findIndex(token =>
    token === 'PULSE'
    || token === 'SIN'
    || token === 'SINE'
    || token === 'PWL'
    || UNSUPPORTED_WAVEFORMS.has(token));
  const ac = acIdx >= 0 ? parseACExcitation(tokens, startIdx + acIdx) : undefined;
  const dc = parseOperatingPoint(tokens, startIdx, dcIdx, acIdx, waveformOffset);

  if (ac && waveformOffset < 0) {
    return { type: 'ac', dc: dc ?? 0, ...ac };
  }

  // A transient waveform may follow operating-point and AC terms. Prefer that
  // waveform for transient evaluation while retaining every coexisting term.
  const waveformIdx = waveformOffset >= 0 ? startIdx + waveformOffset : startIdx;
  const keyword = tokens[waveformIdx].toUpperCase();

  if (keyword === 'DC') {
    return { type: 'dc', value: parseNumber(tokens[startIdx + 1]) };
  }

  if (keyword === 'AC') {
    const magnitude = parseNumber(tokens[startIdx + 1]);
    const phase = tokens[startIdx + 2] ? parseNumber(tokens[startIdx + 2]) : 0;
    return { type: 'ac', magnitude, phase };
  }

  if (keyword === 'PULSE') {
    // ngspice-47 reads up to eight PULSE fields; the eighth is NP, the number
    // of pulses (vsrcload.c, outside the `ngbehavior=xs` phase mode).
    const args = parseWaveformArguments(
      tokens, waveformIdx, acIdx >= 0 ? startIdx + acIdx : -1, 8, 'PULSE',
    );
    return {
      ...(dc !== undefined ? { dc } : {}),
      ...(ac ? { ac } : {}),
      type: 'pulse', v1: args[0] ?? 0, v2: args[1] ?? 0,
      // ngspice vsrcload.c: an omitted TR/TF defaults like an explicit 0, to
      // TSTEP in transient analysis (see effectivePulse).
      delay: args[2] ?? 0, rise: args[3] ?? 0, fall: args[4] ?? 0,
      width: args[5] ?? Infinity, period: args[6] ?? Infinity,
      ...(args[7] !== undefined ? { pulses: args[7] } : {}),
    } satisfies PulseSource;
  }

  if (keyword === 'SIN' || keyword === 'SINE') {
    const args = parseWaveformArguments(
      tokens, waveformIdx, acIdx >= 0 ? startIdx + acIdx : -1, 6, keyword,
    );
    return {
      ...(dc !== undefined ? { dc } : {}),
      ...(ac ? { ac } : {}),
      type: 'sin', offset: args[0] ?? 0, amplitude: args[1] ?? 0,
      frequency: args[2] ?? 0, delay: args[3], damping: args[4], phase: args[5],
    } satisfies SinSource;
  }

  if (keyword === 'PWL') {
    const args = parseWaveformArguments(
      tokens, waveformIdx, acIdx >= 0 ? startIdx + acIdx : -1, Infinity, 'PWL',
    );
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
    return {
      ...(dc !== undefined ? { dc } : {}),
      ...(ac ? { ac } : {}),
      type: 'pwl',
      points,
    } satisfies PWLSource;
  }

  if (UNSUPPORTED_WAVEFORMS.has(keyword)) {
    throw new Error(`Unsupported source waveform '${keyword}'`);
  }

  return { type: 'dc', value: parseNumber(tokens[startIdx]) };
}

function parseWaveformArguments(
  tokens: string[],
  waveformIdx: number,
  acIdx: number,
  maximum: number,
  keyword: string,
): number[] {
  // Arguments run to the next source keyword. A `KEY=value` token (e.g. the
  // PWL `R=`/`TD=` repeat options) is not supported and ends the list.
  let end = waveformIdx + 1;
  while (
    end < tokens.length
    && !SOURCE_KEYWORDS.has(tokens[end].toUpperCase())
    && !tokens[end].includes('=')
  ) end++;
  const args = tokens.slice(waveformIdx + 1, end);
  if (args.length > maximum || (end !== tokens.length && end !== acIdx)) {
    const trailing = args.length > maximum ? args.slice(maximum) : tokens.slice(end);
    throw new Error(`Unsupported ${keyword} source parameters: '${trailing.join(' ')}'`);
  }
  return args.map(parseNumber);
}

function parseACExcitation(tokens: string[], acIdx: number): ACExcitation {
  let end = acIdx + 1;
  while (end < tokens.length && !SOURCE_KEYWORDS.has(tokens[end].toUpperCase())) end++;
  const values = tokens.slice(acIdx + 1, end);
  if (values.length > 2) {
    throw new Error(`Unsupported AC source parameters: '${values.slice(2).join(' ')}'`);
  }
  const magnitude = values[0] === undefined ? 1 : parseNumber(values[0]);
  const phase = values[1] === undefined ? 0 : parseNumber(values[1]);
  return { magnitude, phase };
}

function parseOperatingPoint(
  tokens: string[],
  startIdx: number,
  dcIdx: number,
  acIdx: number,
  waveformOffset: number,
): number | undefined {
  if (dcIdx >= 0) {
    if (waveformOffset === dcIdx + 1) return undefined;
    return parseNumber(tokens[startIdx + dcIdx + 1]);
  }
  if (acIdx > 0 || waveformOffset > 0) {
    try {
      return parseNumber(tokens[startIdx]);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

const SOURCE_KEYWORDS = new Set([
  'DC', 'AC', 'PULSE', 'SIN', 'SINE', 'PWL', 'DISTOF1', 'DISTOF2',
  ...UNSUPPORTED_WAVEFORMS,
]);

/**
 * Normalize the value part of a source card the way ngspice-47 reads it:
 * `DC=`/`AC=` split into keyword and value, and every '(' or ')' dropped.
 * ngspice's INPgetUTok skips parentheses (and commas) as separators, so
 * `0.7v (PWL 0 3 1n -6) (AC 1v)` and `PWL( (0 0) (1 1) )` are flat value lists.
 */
function normalizeSourceAssignments(tokens: string[], startIdx: number): string[] {
  return tokens.flatMap((token, index) => {
    if (index < startIdx) return token;
    if (token === '(' || token === ')') return [];
    const match = token.match(/^(DC|AC)=(.*)$/i);
    return match ? [match[1], match[2]] : token;
  });
}

function extractDistortionTerms(
  tokens: string[],
  startIdx: number,
): {
  baseTokens: string[];
  distortionF1?: DistortionExcitation;
  distortionF2?: DistortionExcitation;
} {
  const baseTokens = tokens.slice();
  let distortionF1: DistortionExcitation | undefined;
  let distortionF2: DistortionExcitation | undefined;
  for (let index = tokens.length - 1; index >= startIdx; index--) {
    const keyword = tokens[index].toUpperCase();
    if (keyword !== 'DISTOF1' && keyword !== 'DISTOF2') continue;
    const target = keyword === 'DISTOF1' ? distortionF1 : distortionF2;
    if (target) throw new Error(`Duplicate ${keyword} specification`);
    let end = index + 1;
    while (end < tokens.length && !SOURCE_KEYWORDS.has(tokens[end].toUpperCase())) end++;
    const valueTokens = tokens.slice(index + 1, end);
    if (valueTokens.length === 0) throw new Error(`${keyword} requires a magnitude`);
    if (valueTokens.length > 2) {
      throw new Error(`Unsupported ${keyword} parameters: '${valueTokens.slice(2).join(' ')}'`);
    }
    const values = valueTokens.map(parseNumber);
    const excitation = { magnitude: values[0], phase: values[1] ?? 0 };
    if (keyword === 'DISTOF1') distortionF1 = excitation;
    else distortionF2 = excitation;
    baseTokens.splice(index, end - index);
  }
  return { baseTokens, distortionF1, distortionF2 };
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
