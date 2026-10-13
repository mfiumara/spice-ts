import { ParseError } from '../errors.js';
import { polyExpression } from './spice2poly.js';

const CONTROLLED_SOURCE_FORMS: Record<string, { tokens: number; form: string }> = {
  E: { tokens: 6, form: 'Exxx n+ n- nc+ nc- gain (or Exxx n+ n- value={expr})' },
  G: { tokens: 6, form: 'Gxxx n+ n- nc+ nc- transconductance (or Gxxx n+ n- value={expr})' },
  F: { tokens: 5, form: 'Fxxx n+ n- vcontrol gain' },
  H: { tokens: 5, form: 'Hxxx n+ n- vcontrol transresistance' },
};

/** Number of node fields before the controlling source or gain on a linear card. */
const CONTROLLED_SOURCE_NODE_FIELDS: Record<string, number> = { E: 4, G: 4, F: 2, H: 2 };

/**
 * Drop the parentheses of `(n+ n-)` node pairs on an E/G/F/H card. ngspice-47
 * INPgetNetTok skips '(' before a node name and stops at ')', so
 * `E1 (out 0) (in 0) -10` is `E1 out 0 in 0 -10` (#790). Only the node fields
 * are rewritten; a POLY keyword ends them, so POLY(n) keeps its parentheses.
 */
export function withoutNodePairParentheses(tokens: readonly string[]): string[] {
  const nodeFields = CONTROLLED_SOURCE_NODE_FIELDS[tokens[0]?.[0]?.toUpperCase() ?? ''];
  if (nodeFields === undefined || !tokens.slice(1).some(token => token === '(' || token === ')')) {
    return [...tokens];
  }
  const result = [tokens[0]];
  let nodes = 0;
  let index = 1;
  for (; index < tokens.length; index++) {
    const token = tokens[index];
    if (token === '(' || token === ')') continue;
    if (nodes === nodeFields || /^poly$/i.test(token)) break;
    result.push(token);
    nodes++;
  }
  return [...result, ...tokens.slice(index)];
}

/**
 * Translate a SPICE2 `POLY(n)` E/F/G/H card into the B-source that computes
 * the same polynomial as the XSPICE spice2poly instance ngspice-47 runs it as
 * (src/xspice/enh/enhtrans.c ENHtranslate_poly), or return undefined when the
 * card is not a POLY source:
 *
 *   Exxx n+ n- POLY(n) nc1+ nc1- ... p0 p1 ...  ->  bExxx n+ n- v = poly(v(nc1+,nc1-), ...)
 *   Gxxx n+ n- POLY(n) nc1+ nc1- ... p0 p1 ...  ->  bGxxx n+ n- i = poly(v(nc1+,nc1-), ...)
 *   Fxxx n+ n- POLY(n) v1 ... p0 p1 ...         ->  bFxxx n+ n- i = poly(i(v1), ...)
 *   Hxxx n+ n- POLY(n) v1 ... p0 p1 ...         ->  bHxxx n+ n- v = poly(i(v1), ...)
 *
 * with the coefficient order of {@link polyExpression}. As in MIFgettok, `(`,
 * `)` and `,` only separate tokens, so `POLY(2) (1,0) (2,0)` reads like
 * `POLY 2 1 0 2 0`. Every token after the controls is a coefficient; terms
 * without one are zero. An `m=` multiplier scales G and F sources and is
 * ignored on E and H sources, as ngspice-47 does (with a warning there).
 *
 * @param tokens - the card's tokens as tokenizeLine returns them
 * @returns the B-card, or undefined
 * @throws {@link ParseError} for a POLY card whose dimension, controls or
 *   coefficients do not fit, which ngspice-47 rejects too
 */
export function translatePolySource(tokens: readonly string[], lineNumber: number, raw: string): string | undefined {
  const name = tokens[0];
  const type = name?.[0]?.toUpperCase();
  if (type === undefined || !(type in CONTROLLED_SOURCE_FORMS)) return undefined;
  const fields = tokens.filter(token => token !== '(' && token !== ')');
  if (!/^poly$/i.test(fields[3] ?? '')) return undefined;
  const fail = (message: string): never => {
    throw new ParseError(`POLY source '${name}': ${message}`, lineNumber, raw);
  };
  const multiplierIndex = fields.findIndex((token, index) => index > 4 && /^m=/i.test(token));
  const multiplier = multiplierIndex < 0 ? undefined : fields.splice(multiplierIndex, 1)[0].slice(2);
  const dimension = Number.parseInt(fields[4] ?? '', 10);
  if (!(dimension > 0)) fail(`the argument of POLY() is not a positive integer: '${fields[4] ?? ''}'`);
  const voltageControlled = type === 'E' || type === 'G';
  const controls = fields.slice(5, 5 + (voltageControlled ? 2 * dimension : dimension));
  const inputs = voltageControlled
    ? Array.from({ length: dimension }, (_, i) => `v(${controls[2 * i]},${controls[2 * i + 1]})`)
    : controls.map(source => `i(${source})`);
  const coefficients = fields.slice(5 + controls.length);
  // spice2poly's coef vector needs at least two values (ifspec.ifs Vector_Bounds [2 -]).
  if (coefficients.length < 2) {
    fail(`POLY(${dimension}) needs ${voltageControlled ? 2 * dimension : dimension} controls and at least 2 `
      + `coefficients (p0 p1 ...), found ${fields.length - 5} fields after POLY(${dimension})`);
  }
  const output = type === 'E' || type === 'H' ? 'v' : 'i';
  const scale = type === 'G' || type === 'F' ? multiplier : undefined;
  return `b${name} ${fields[1]} ${fields[2]} ${output} = ${polyExpression(inputs, coefficients, scale)}`;
}

/**
 * Reject a linear E/G/F/H card that lacks its nodes or gain with a ParseError
 * naming the card and its expected shape. Behavioural `value=`/`vol=`/`cur=`
 * cards are rewritten to B-sources by the preprocessor, and POLY cards by the
 * tokenizer ({@link translatePolySource}), before they reach this check.
 */
export function assertControlledSourceCard(tokens: readonly string[], lineNumber: number, raw: string): void {
  const type = tokens[0][0].toUpperCase();
  const shape = CONTROLLED_SOURCE_FORMS[type];
  if (!shape) return;
  if (tokens.length < shape.tokens) {
    throw new ParseError(
      `Controlled source '${tokens[0]}' needs ${shape.tokens - 1} fields after the name: ${shape.form}`,
      lineNumber, raw,
    );
  }
}
