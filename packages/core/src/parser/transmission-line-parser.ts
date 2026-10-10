import { ParseError } from '../errors.js';
import { parseNumber } from './tokenizer.js';

export interface ParsedTransmissionLine {
  impedance: number;
  delay: number;
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
