import { ParseError } from '../errors.js';
import { translatePspiceModelTemperatures } from './pspice-model-temperature.js';
import { parseNumber } from './tokenizer.js';

/**
 * ngspice-47 resistor instance keywords (res.c RESpTable) that spice-ts
 * simulates, plus the spice-ts `TNOM` instance extension. `R`/`RESISTANCE`,
 * `TC`/`TC1` and `NOISY`/`NOISE` are aliases. `BV_MAX` only drives ngspice
 * safe-operating-area warnings and does not change any result. `TEMP` is the
 * instance temperature and `DTEMP` its offset from the circuit temperature
 * (restemp.c: a given TEMP ignores DTEMP).
 */
const INSTANCE_PARAMETERS: ReadonlySet<string> = new Set([
  'R', 'RESISTANCE', 'AC', 'L', 'W', 'M', 'SCALE',
  'TC', 'TC1', 'TC2', 'TCE', 'TNOM', 'TEMP', 'DTEMP',
  'NOISY', 'NOISE', 'BV_MAX',
]);

/**
 * ngspice-47 resistor `.model` parameters (res.c RESmPTable), the instance
 * defaults a `.model R` card may carry (inpgmod.c), and `M`/`LEVEL`, which
 * ngspice reads and discards on model cards.
 */
const MODEL_PARAMETERS: ReadonlySet<string> = new Set([
  'RSH', 'NARROW', 'DW', 'SHORT', 'DLR',
  'TC1', 'TC1R', 'TC2', 'TC2R', 'TCE',
  'DEFW', 'W', 'L', 'KF', 'AF', 'LF', 'WF', 'EF',
  'TNOM', 'R', 'RES', 'BV_MAX',
  'RESISTANCE', 'AC', 'TC', 'SCALE', 'NOISY', 'NOISE', 'TEMP', 'DTEMP',
  'M', 'LEVEL',
]);

/**
 * Thrown for a resistor card or `.model R` parameter that spice-ts does not
 * simulate (for example PSpice `T_REL_LOCAL`, or a quoted
 * behavioral expression such as `R='res + V(x)'`). The card is rejected rather
 * than simulated without the parameter.
 */
export class UnsupportedResistorParameterError extends ParseError {
  /** Stable machine-readable error code. */
  readonly code = 'UNSUPPORTED_RESISTOR_PARAMETER';

  constructor(
    /** Resistor instance or `.model` name */
    public readonly elementName: string,
    /** Upper-cased unsupported parameter names (or the offending value token) */
    public readonly parameters: readonly string[],
    line: number,
    context: string,
    detail?: string,
  ) {
    super(
      `Unsupported resistor parameters: '${parameters.join(' ')}'${detail ? ` (${detail})` : ''}`,
      line,
      context,
    );
    this.name = 'UnsupportedResistorParameterError';
  }
}

export interface ParsedResistorElement {
  /** Positional or `R=`/`RESISTANCE=` resistance, when given on the card. */
  value?: number;
  modelName?: string;
  /** Upper-cased keyword parameters with aliases folded (`TC`→`TC1`, `NOISE`→`NOISY`, `RESISTANCE`→`R`). */
  params: Record<string, number>;
}

const INSTANCE_ALIASES: Record<string, string> = { RESISTANCE: 'R', TC: 'TC1', NOISE: 'NOISY' };

function isExpression(token: string): boolean {
  return /['"{}]/.test(token);
}

function tryNumber(token: string): number | undefined {
  try {
    return parseNumber(token);
  } catch {
    return undefined;
  }
}

/**
 * Parse an ngspice-47 resistor card (inp2r.c):
 * `Rname n+ n- [value] [model] [r=val] [ac=val] [l=val] [w=val] [m=val]
 * [scale=val] [tc1=val] [tc2=val] [tce=val] [noisy=0|1]`.
 * `tc=a b` is read as `tc1=a tc2=b`, as ngspice does.
 */
export function parseResistorElement(
  tokens: string[],
  lineNumber: number,
  context: string,
): ParsedResistorElement {
  const name = tokens[0];
  const rest = tokens.slice(3).filter(token => token !== '(' && token !== ')');
  const expression = rest.find(isExpression);
  if (expression !== undefined) {
    throw new UnsupportedResistorParameterError(
      name, [expression], lineNumber, context,
      'quoted or brace expression resistor values are not supported',
    );
  }

  let value: number | undefined;
  let modelName: string | undefined;
  const params: Record<string, number> = {};
  const unsupported: string[] = [];

  for (let index = 0; index < rest.length; index++) {
    const token = rest[index];
    const eq = token.indexOf('=');
    if (eq < 0) {
      const numeric = tryNumber(token);
      if (numeric !== undefined && value === undefined && params.R === undefined) {
        value = numeric;
      } else if (numeric !== undefined && value !== undefined && params.R === undefined
        && (index === 1 || (index === 2 && modelName !== undefined))) {
        // inp2r.c: an unlabeled number where INPdevParse starts (after the
        // value, or after value and model) is its "waslead" resistance and
        // replaces the value, so `R1 a b 3k 2k` is 2 kOhm (#837).
        value = numeric;
      } else if (numeric === undefined && modelName === undefined && index <= 1) {
        modelName = token;
      } else {
        throw new ParseError(`Unexpected resistor token '${token}'`, lineNumber, context);
      }
      continue;
    }

    const rawKey = token.slice(0, eq).toUpperCase();
    if (!INSTANCE_PARAMETERS.has(rawKey)) {
      unsupported.push(rawKey);
      continue;
    }
    const key = INSTANCE_ALIASES[rawKey] ?? rawKey;
    params[key] = parseNumber(token.slice(eq + 1));
    // ngspice inp2r.c rewrites `tc=a b` to `tc=a tc2=b`.
    const next = rest[index + 1];
    if (rawKey === 'TC' && next !== undefined && !next.includes('=') && /^[+\-\d]/.test(next)) {
      params.TC2 = parseNumber(next);
      index++;
    }
  }

  if (unsupported.length > 0) {
    throw new UnsupportedResistorParameterError(name, unsupported, lineNumber, context);
  }
  if (params.R !== undefined) {
    value = params.R;
    delete params.R;
  }
  // ngspice-47 inp2r.c ignores a bare `Rname n1 n2` line; a card with keyword
  // parameters but no value or model defaults to 1 mOhm (see resolveResistor).
  if (value === undefined && modelName === undefined && Object.keys(params).length === 0) {
    throw new ParseError(
      `Resistor '${name}' has no resistance value or model`,
      lineNumber,
      context,
    );
  }
  return { value, modelName, params };
}

/** Reject `.model R` (or PSpice `RES`) parameters that spice-ts does not simulate. */
export function assertSupportedResistorModel(tokens: string[], lineNumber: number, context: string): void {
  const type = tokens[2]?.toUpperCase();
  if (type !== 'R' && type !== 'RES') return;
  const unsupported: string[] = [];
  // PSpice T_ABS/T_REL_GLOBAL/T_MEASURED: renamed (or dropped) as in parseModelCard.
  for (const token of translatePspiceModelTemperatures(tokens.slice(3)).body) {
    if (isExpression(token)) {
      throw new UnsupportedResistorParameterError(
        tokens[1], [token], lineNumber, context,
        'quoted or brace expression model values are not supported',
      );
    }
    const eq = token.indexOf('=');
    if (eq <= 0) continue;
    const key = token.slice(0, eq).toUpperCase();
    if (!MODEL_PARAMETERS.has(key)) unsupported.push(key);
  }
  if (unsupported.length > 0) {
    throw new UnsupportedResistorParameterError(tokens[1], unsupported, lineNumber, context);
  }
}
