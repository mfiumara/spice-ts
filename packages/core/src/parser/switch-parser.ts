import { ParseError } from '../errors.js';

/** A parsed S (voltage-controlled) or W (current-controlled) switch card. */
export interface SwitchInstance {
  /** S: `[n+, n-, nc+, nc-]`; W: `[n+, n-]`. */
  readonly nodes: string[];
  /** W only: the voltage source whose current controls the switch. */
  readonly controlSource?: string;
  readonly modelName: string;
  /** Instance `ON` flag; ngspice defaults to `OFF`. */
  readonly initiallyOn: boolean;
}

/**
 * Parse an ngspice switch card:
 *
 *   SXXXXXXX N+ N- NC+ NC- MODEL [ON|OFF]
 *   WYYYYYYY N+ N- VNAME MODEL [ON|OFF]
 */
export function parseSwitchInstance(tokens: string[], lineNumber: number): SwitchInstance {
  const isVoltage = tokens[0][0].toUpperCase() === 'S';
  const modelIndex = isVoltage ? 5 : 4;
  const raw = tokens.join(' ');
  if (tokens.length <= modelIndex) {
    throw new ParseError(
      isVoltage
        ? 'S-element needs: S<name> n+ n- nc+ nc- model [ON|OFF]'
        : 'W-element needs: W<name> n+ n- vcontrol model [ON|OFF]',
      lineNumber, raw,
    );
  }
  let initiallyOn = false;
  for (const token of tokens.slice(modelIndex + 1)) {
    const flag = token.toUpperCase();
    if (flag === 'ON') initiallyOn = true;
    else if (flag === 'OFF') initiallyOn = false;
    else {
      throw new ParseError(`Unsupported switch instance parameter: '${token}'`, lineNumber, raw);
    }
  }
  return {
    nodes: tokens.slice(1, isVoltage ? 5 : 3),
    ...(isVoltage ? {} : { controlSource: tokens[3] }),
    modelName: tokens[modelIndex],
    initiallyOn,
  };
}
