import { ParseError } from '../errors.js';
import type { PoleZeroAnalysis } from '../types.js';
import { assertSupportedPoleZero, BOUNDED_POLE_ZERO_FORM } from '../validation/pole-zero.js';

/** Parse the bounded ngspice `.pz in 0 out 0 cur {pol|pz}` slice. */
export function parsePoleZero(tokens: string[], lineNumber: number): PoleZeroAnalysis {
  if (tokens.length !== 7) {
    throw new ParseError(
      `Unsupported .pz form; expected '${BOUNDED_POLE_ZERO_FORM}'`,
      lineNumber,
      tokens.join(' '),
    );
  }

  const analysis = {
    type: 'pz',
    inputPositive: tokens[1],
    inputNegative: tokens[2],
    outputPositive: tokens[3],
    outputNegative: tokens[4],
    inputType: tokens[5]?.toLowerCase(),
    mode: tokens[6]?.toLowerCase(),
  } as PoleZeroAnalysis;
  assertSupportedPoleZero(analysis);
  return analysis;
}
