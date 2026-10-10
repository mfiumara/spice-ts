import { ParseError } from '../errors.js';
import type { ModelParams } from '../types.js';
import { parseNumber } from './tokenizer.js';

export interface ParsedTransmissionLine {
  impedance: number;
  delay: number;
}

export interface ParsedLossyTransmissionLine {
  modelName: string;
}

const LTRA_NUMERIC_PARAMETERS = new Set([
  'R', 'L', 'G', 'C', 'LEN', 'REL', 'COMPACTREL', 'COMPACTABS',
]);
const LTRA_FLAG_PARAMETERS = new Set([
  'STEPLIMIT', 'NOCONTROL', 'NOPRINT', 'QUADINTERP',
]);

/** Parse the bounded O-card: four nodes and one LTRA model name. */
export function parseLossyTransmissionLine(
  tokens: string[],
  lineNumber: number,
): ParsedLossyTransmissionLine {
  if (tokens.length !== 6) {
    throw new ParseError(
      "Unsupported LTRA O-card; expected 'Oname p1+ reference p2+ reference model' without instance parameters",
      lineNumber,
      tokens.join(' '),
    );
  }
  if (tokens[2].toUpperCase() !== tokens[4].toUpperCase()) {
    throw new ParseError(
      'Unsupported LTRA O-card: both ports must use a common reference node',
      lineNumber,
      tokens.join(' '),
    );
  }
  return { modelName: tokens[5] };
}

/** Parse and validate the benchmark-bounded RLC LTRA model card. */
export function parseLtraModelCard(tokens: string[], lineNumber: number): ModelParams {
  const params: Record<string, number> = {};
  for (const token of tokens.slice(3)) {
    if (token === '(' || token === ')') continue;
    const separator = token.indexOf('=');
    const key = (separator < 0 ? token : token.slice(0, separator)).toUpperCase();
    if (LTRA_FLAG_PARAMETERS.has(key) && separator < 0) {
      params[key] = 1;
      continue;
    }
    if (!LTRA_NUMERIC_PARAMETERS.has(key) || separator <= 0 || separator === token.length - 1) {
      throw new ParseError(`Unsupported LTRA model parameter: '${token}'`, lineNumber, tokens.join(' '));
    }
    if (params[key] !== undefined) {
      throw new ParseError(`Duplicate LTRA model parameter: '${key}'`, lineNumber, tokens.join(' '));
    }
    params[key] = parseNumber(token.slice(separator + 1));
  }
  return { name: tokens[1], type: 'LTRA', params };
}

/** Parse the bounded lossless T-card subset: four nodes plus Z0 and TD. */
export function parseTransmissionLine(
  tokens: string[],
  lineNumber: number,
): ParsedTransmissionLine {
  if (tokens.length !== 7) {
    throw new ParseError(
      "Unsupported lossless transmission line form; expected 'Tname p1+ p1- p2+ p2- Z0=value TD=value'",
      lineNumber,
      tokens.join(' '),
    );
  }

  const params = new Map<string, number>();
  for (const token of tokens.slice(5)) {
    const separator = token.indexOf('=');
    const key = separator > 0 ? token.slice(0, separator).toUpperCase() : '';
    if ((key !== 'Z0' && key !== 'TD') || params.has(key)) {
      throw new ParseError(
        "Unsupported lossless transmission line parameter; only Z0 and TD are supported (F/NL/IC/REL/ABS are unsupported)",
        lineNumber,
        tokens.join(' '),
      );
    }
    params.set(key, parseNumber(token.slice(separator + 1)));
  }

  const impedance = params.get('Z0');
  const delay = params.get('TD');
  if (
    impedance === undefined
    || delay === undefined
    || !Number.isFinite(impedance)
    || !Number.isFinite(delay)
    || impedance <= 0
    || delay <= 0
  ) {
    throw new ParseError(
      'Lossless transmission line requires positive Z0 and TD values',
      lineNumber,
      tokens.join(' '),
    );
  }

  return { impedance, delay };
}
