import { ParseError } from '../errors.js';
import type { PoleZeroAnalysis } from '../types.js';

/** Parse the bounded ngspice `.pz in 0 out 0 cur {pol|pz}` slice. */
export function parsePoleZero(tokens: string[], lineNumber: number): PoleZeroAnalysis {
  const inputType = tokens[5]?.toLowerCase();
  const mode = tokens[6]?.toLowerCase();
  const supported = tokens.length === 7
    && tokens[2] === '0'
    && tokens[4] === '0'
    && inputType === 'cur'
    && (mode === 'pol' || mode === 'pz');

  if (!supported) {
    throw new ParseError(
      "Unsupported .pz form; expected '.pz input 0 output 0 cur {pol|pz}'",
      lineNumber,
      tokens.join(' '),
    );
  }

  return {
    type: 'pz',
    inputPositive: tokens[1],
    inputNegative: tokens[2],
    outputPositive: tokens[3],
    outputNegative: tokens[4],
    inputType: 'cur',
    mode: mode as 'pol' | 'pz',
  };
}
