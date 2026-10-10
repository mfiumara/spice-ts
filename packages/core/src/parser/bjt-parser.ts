import { ParseError } from '../errors.js';

export interface ParsedBJTInstance {
  collector: string;
  base: string;
  emitter: string;
  modelName: string;
}

/**
 * Parse the bounded classic Q-card forms used by the public benchmark corpus.
 *
 * Supported forms are the ordinary three-terminal card, its trailing OFF
 * startup hint, and the four-node substrate form (optionally with OFF). Prior
 * grounded-substrate compatibility forms retain their historical model selection.
 * OFF is consumed as an initial-state
 * hint: the solver already starts nonlinear
 * devices from its zero solution, so it must not disable the transistor at the
 * converged operating point. The substrate has no stamp while the bounded BJT
 * model has no substrate-junction parameters; such parameters remain explicit
 * model errors.
 */
export function parseBJTInstance(
  tokens: string[],
  lineNumber: number,
): ParsedBJTInstance {
  const unsupported = (): never => {
    throw new ParseError(
      `Unsupported BJT Q-card form: '${tokens.join(' ')}'`,
      lineNumber,
      tokens.join(' '),
    );
  };

  if (tokens.length < 5 || tokens.length > 7) unsupported();

  let modelName: string;
  if (tokens.length === 5) {
    modelName = tokens[4];
  } else if (tokens.length === 6) {
    if (tokens[5].toUpperCase() === 'OFF') {
      modelName = tokens[4];
    } else {
      if (tokens[5].includes('=')) unsupported();
      modelName = tokens[4] === '0' ? tokens[4] : tokens[5];
    }
  } else {
    const startupHint = tokens[6].toUpperCase();
    if (
      (startupHint !== 'OFF' && startupHint !== 'OFF=1')
      || tokens[5].includes('=')
    ) unsupported();
    if (startupHint === 'OFF=1') {
      if (tokens[4] !== '0') unsupported();
      modelName = tokens[4];
    } else {
      modelName = tokens[5];
    }
  }

  if (!modelName || modelName.includes('=')) unsupported();

  return {
    collector: tokens[1],
    base: tokens[2],
    emitter: tokens[3],
    modelName,
  };
}
