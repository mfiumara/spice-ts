import { ParseError } from '../errors.js';
import type { SensitivityAnalysis } from '../types.js';
import {
  assertSupportedSensitivity,
  BOUNDED_SENSITIVITY_FORMS,
} from '../validation/sensitivity.js';
import { parseNumber } from './tokenizer.js';

/** Parse the bounded single-ended DC or DEC AC `.sens` forms. */
export function parseSensitivity(tokens: string[], lineNumber: number): SensitivityAnalysis {
  const isVoltageOutput = tokens[1]?.toUpperCase() === 'V'
    && tokens[2] === '('
    && tokens[4] === ')';
  if (!isVoltageOutput) throw unsupported(tokens, lineNumber);

  let analysis: SensitivityAnalysis;
  if (tokens.length === 5) {
    analysis = { type: 'sens', outputNode: tokens[3], mode: 'dc' };
  } else if (
    tokens.length === 10
    && tokens[5]?.toUpperCase() === 'AC'
    && tokens[6]?.toUpperCase() === 'DEC'
  ) {
    analysis = {
      type: 'sens',
      outputNode: tokens[3],
      mode: 'ac',
      variation: 'dec',
      points: Number.parseInt(tokens[7], 10),
      startFreq: parseNumber(tokens[8]),
      stopFreq: parseNumber(tokens[9]),
    };
  } else {
    throw unsupported(tokens, lineNumber);
  }

  try {
    assertSupportedSensitivity(analysis);
  } catch {
    throw unsupported(tokens, lineNumber);
  }
  return analysis;
}

function unsupported(tokens: string[], lineNumber: number): ParseError {
  return new ParseError(
    `Unsupported .sens form; expected ${BOUNDED_SENSITIVITY_FORMS}`,
    lineNumber,
    tokens.join(' '),
  );
}
