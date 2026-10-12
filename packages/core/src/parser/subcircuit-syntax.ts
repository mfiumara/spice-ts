import { parseNumber } from './tokenizer.js';

/**
 * ngspice's `params:` keyword, which may separate the ports from the
 * parameters on both `.subckt` definition lines and X instance lines.
 */
const PARAMS_KEYWORD = /^params:$/i;

/** `name = value`, where value is `{...}`, `'...'` or a whitespace-free token. */
const HEADER_ASSIGNMENT = /([A-Za-z_]\w*)\s*=\s*(\{[^{}]*\}|'[^']*'|\S+)/g;

export interface SubcircuitHeader {
  name: string;
  ports: string[];
  /**
   * Default parameter values in declaration order. A string is a numparam
   * expression, evaluated per instance (see {@link SubcktDefinition}).
   */
  params: Record<string, number | string>;
}

/**
 * Parse a `.subckt name port... [params:] name=value...` card (the logical,
 * comment-stripped line). Ports end at the first `params:` keyword or
 * `name=` assignment. A default value that is not a plain SPICE number is
 * kept as an expression (`beta=20e3/stime`, `p2={p1*2}`, `p3='a+b'`), as in
 * ngspice-47, where numparam evaluates subcircuit defaults per instance.
 */
export function parseSubcircuitHeader(raw: string): SubcircuitHeader {
  const text = raw.trim().replace(/^\.subckt\s+/i, '');
  const nameMatch = /^\S+/.exec(text);
  const name = nameMatch ? nameMatch[0] : '';
  let rest = text.slice(name.length);

  // Ports run until the first `params:` or `name=` (spaces around `=` allowed).
  const ports: string[] = [];
  for (;;) {
    const portMatch = /^\s*(\S+)/.exec(rest);
    if (!portMatch) break;
    const token = portMatch[1];
    if (PARAMS_KEYWORD.test(token)) {
      rest = rest.slice(portMatch[0].length);
      break;
    }
    if (token.includes('=') || /^\s*=/.test(rest.slice(portMatch[0].length))) break;
    ports.push(token);
    rest = rest.slice(portMatch[0].length);
  }

  const params: Record<string, number | string> = {};
  for (const [, key, value] of rest.matchAll(HEADER_ASSIGNMENT)) {
    params[key.toUpperCase()] = defaultValue(value);
  }
  return { name, ports, params };
}

function defaultValue(value: string): number | string {
  const delimited = (value.startsWith('{') && value.endsWith('}'))
    || (value.length >= 2 && value.startsWith("'") && value.endsWith("'"));
  const expression = delimited ? value.slice(1, -1).trim() : value;
  try {
    return parseNumber(expression);
  } catch {
    return expression;
  }
}

export interface SubcircuitCall {
  /** Index of the subcircuit-name token. */
  nameIndex: number;
  /** Index of the first parameter token (after any `params:` keyword). */
  paramStart: number;
}

/**
 * Locate the subcircuit name on a tokenized X line
 * `X<name> <port>... <subckt> [params:] [name=value...]`: the last token
 * that is neither an assignment nor ngspice's `params:` keyword.
 */
export function locateSubcircuitCall(tokens: readonly string[]): SubcircuitCall {
  let index = tokens.length - 1;
  while (index > 1 && tokens[index].includes('=')) index--;
  if (index > 1 && PARAMS_KEYWORD.test(tokens[index])) return { nameIndex: index - 1, paramStart: index + 1 };
  return { nameIndex: index, paramStart: index + 1 };
}
