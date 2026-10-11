import { ParseError } from '../errors.js';
import type { PoleZeroAnalysis } from '../types.js';
import { assertSupportedPoleZero, POLE_ZERO_FORM } from '../validation/pole-zero.js';

/** Parse the ngspice `.pz in+ in- out+ out- {cur|vol} {pol|zer|pz}` directive. */
export function parsePoleZero(tokens: string[], lineNumber: number): PoleZeroAnalysis {
  if (tokens.length !== 7) {
    throw new ParseError(
      `Unsupported .pz form; expected '${POLE_ZERO_FORM}'`,
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
