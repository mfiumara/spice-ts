import { ParseError } from '../errors.js';

export interface ParsedBJTInstance {
  collector: string;
  base: string;
  emitter: string;
  modelName: string;
  /** Fourth terminal; absent for the three-terminal card. */
  substrate?: string;
  /** Fifth (thermal) terminal; only VBIC/HICUM accept it in ngspice-47. */
  thermal?: string;
}

/**
 * Parse the bounded classic Q-card forms used by the public benchmark corpus.
 *
 * Supported forms are the ordinary three-terminal card, its trailing OFF
 * startup hint, the four-node substrate form (optionally with OFF), and the
 * five-node substrate+thermal form (optionally with OFF). As in
 * ngspice-47, a grounded substrate (`Qx c b e 0 MODEL`) is a node like any other:
 * the model is always the token after the substrate, never the substrate itself.
 * OFF is consumed as an initial-state
 * hint: the solver already starts nonlinear
 * devices from its zero solution, so it must not disable the transistor at the
 * converged operating point. The substrate and thermal terminals are returned
 * to the circuit, which knows the model: bounded VBIC (LEVEL=4) stamps the
 * substrate, the bounded Gummel-Poon BJT has no substrate-junction parameters
 * (such parameters remain explicit model errors), and a thermal terminal is
 * rejected with a typed error until self-heating exists.
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

  if (tokens.length < 5 || tokens.length > 8) unsupported();

  let modelName: string;
  let substrate: string | undefined;
  let thermal: string | undefined;
  if (tokens.length === 5) {
    modelName = tokens[4];
  } else if (tokens.length === 6) {
    if (tokens[5].toUpperCase() === 'OFF') {
      modelName = tokens[4];
    } else {
      if (tokens[5].includes('=')) unsupported();
      substrate = tokens[4];
      modelName = tokens[5];
    }
  } else if (tokens.length === 7) {
    const last = tokens[6].toUpperCase();
    if (last === 'OFF' || last === 'OFF=1') {
      if (tokens[5].includes('=')) unsupported();
      if (last === 'OFF=1' && tokens[4] !== '0') unsupported();
      substrate = tokens[4];
      modelName = tokens[5];
    } else {
      // Five-node form: collector base emitter substrate thermal model.
      if (tokens[5].includes('=') || tokens[6].includes('=')) unsupported();
      substrate = tokens[4];
      thermal = tokens[5];
      modelName = tokens[6];
    }
  } else {
    if (tokens[7].toUpperCase() !== 'OFF' || tokens[6].includes('=')) unsupported();
    if (tokens[5].includes('=')) unsupported();
    substrate = tokens[4];
    thermal = tokens[5];
    modelName = tokens[6];
  }

  if (!modelName || modelName.includes('=')) unsupported();

  return {
    collector: tokens[1],
    base: tokens[2],
    emitter: tokens[3],
    modelName,
    ...(substrate !== undefined ? { substrate } : {}),
    ...(thermal !== undefined ? { thermal } : {}),
  };
}
