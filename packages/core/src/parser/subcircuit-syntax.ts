import type { SubcktDefinition } from '../types.js';
import { parseNumber, type ParsedLine } from './tokenizer.js';

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
  let rest = withoutPortListParens(text.slice(name.length));

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

/**
 * ngspice-47 inpcom.c (`inp_fix_macro_param_func_paren_io`) rewrites
 * `.subckt name (1 2 3)` to `.subckt name 1 2 3`: when the port list (the
 * text after the subcircuit name) starts with `(`, that `(` and the first `)`
 * after it become spaces. Nothing else on the card is touched (#864).
 */
function withoutPortListParens(afterName: string): string {
  const open = afterName.search(/\S/);
  if (open < 0 || afterName[open] !== '(') return afterName;
  const close = afterName.indexOf(')', open + 1);
  return close < 0
    ? ' ' + afterName.slice(open + 1)
    : ' ' + afterName.slice(open + 1, close) + ' ' + afterName.slice(close + 1);
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

/**
 * `name = value` on an X card whose value is a single bare token: not
 * braced or quoted, and free of `,` (comma lists are a separate gap, #797).
 */
const CALL_ASSIGNMENT = /([A-Za-z_]\w*)\s*=\s*([^\s{}'",=]+)(?=\s|$)/g;

/**
 * ngspice-47 inpcom.c (`inp_fix_param_values`) wraps the bare right-hand side
 * of every `name=value` on an X card in braces unless it is a number, so
 * numparam evaluates `R=R1` (or `R=RB*2`) as `R={R1}` against the visible
 * `.param` and subcircuit parameters (#788). Applied to the comment-free part
 * of an X card or one of its `+` continuation lines; numbers are left as-is.
 */
export function bracedSubcircuitCallValues(line: string, commentStart: number): string {
  const card = line.slice(0, commentStart);
  if (!card.includes('=')) return line;
  const braced = card.replace(CALL_ASSIGNMENT, (match, name: string, value: string) => {
    try {
      parseNumber(value);
      return match;
    } catch {
      return `${name}={${value}}`;
    }
  });
  return braced + line.slice(commentStart);
}

export interface SubcircuitCall {
  /** Index of the subcircuit-name token. */
  nameIndex: number;
  /** Index of the first parameter token (after any `params:` keyword). */
  paramStart: number;
  /** Port (actual node) tokens, without a parenthesised port list's `(` and `)`. */
  ports: string[];
}

/**
 * Locate the subcircuit name on a tokenized X line
 * `X<name> <port>... <subckt> [params:] [name=value...]`: the last token
 * that is neither an assignment nor ngspice's `params:` keyword.
 */
export function locateSubcircuitCall(tokens: readonly string[]): SubcircuitCall {
  let index = tokens.length - 1;
  while (index > 1 && tokens[index].includes('=')) index--;
  const nameIndex = index > 1 && PARAMS_KEYWORD.test(tokens[index]) ? index - 1 : index;
  return { nameIndex, paramStart: index + 1, ports: callPorts(tokens.slice(1, nameIndex)) };
}

/**
 * ngspice-47 inpcom.c (`inp_fix_macro_param_func_paren_io`) rewrites
 * `x1 (1 2 3) name` to `x1 1 2 3 name`: when the token after the instance
 * name opens with `(`, that `(` and the first `)` after it are dropped (#864).
 * The tokenizer splits parentheses into their own tokens.
 */
function callPorts(tokens: string[]): string[] {
  if (tokens[0] !== '(') return tokens;
  const close = tokens.indexOf(')', 1);
  return close < 0 ? tokens.slice(1) : [...tokens.slice(1, close), ...tokens.slice(close + 1)];
}

/** A subcircuit body with its directly nested `.subckt` blocks split out. */
export interface SubcircuitBodyScope {
  /** Body lines of the enclosing definition, nested definitions removed. */
  lines: ParsedLine[];
  /** Directly nested definitions, keyed by upper-case name. */
  definitions: Map<string, SubcktDefinition>;
}

/**
 * Split the `.subckt ... .ends` blocks nested directly in a subcircuit body
 * out of it. ngspice-47 (subckt.c) scopes such a definition to the enclosing
 * subcircuit: X cards of that body (and of definitions nested deeper) see it,
 * ahead of a top-level definition of the same name, while its own lines are
 * never instantiated as devices of the enclosing body. Deeper levels stay in
 * the nested definition's body and are split when it is expanded.
 */
export function splitNestedSubcircuits(lines: readonly ParsedLine[]): SubcircuitBodyScope {
  const body: ParsedLine[] = [];
  const definitions = new Map<string, SubcktDefinition>();
  let nested: SubcktDefinition | null = null;
  let depth = 0;
  for (const line of lines) {
    const first = line.tokens[0]?.toUpperCase();
    if (nested === null) {
      if (first === '.SUBCKT') nested = { ...parseSubcircuitHeader(line.raw), body: [] };
      else body.push(line);
      continue;
    }
    if (first === '.ENDS' && depth === 0) {
      definitions.set(nested.name.toUpperCase(), nested);
      nested = null;
      continue;
    }
    if (first === '.SUBCKT') depth++;
    else if (first === '.ENDS') depth--;
    nested.body.push(line.raw);
  }
  if (nested !== null) {
    throw new Error(`Missing .ends for subcircuit '${nested.name}'`);
  }
  return { lines: body, definitions };
}
