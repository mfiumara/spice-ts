import { ParseError } from '../errors.js';

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
 * Reject a linear E/G/F/H card that lacks its nodes or gain, or uses the
 * POLY form, with a ParseError naming the card and its expected shape.
 * Behavioural `value=`/`vol=`/`cur=` cards are rewritten to B-sources by the
 * preprocessor before they reach this check.
 */
export function assertControlledSourceCard(tokens: readonly string[], lineNumber: number, raw: string): void {
  const type = tokens[0][0].toUpperCase();
  const shape = CONTROLLED_SOURCE_FORMS[type];
  if (!shape) return;
  if (/^poly(?:\(|$)/i.test(tokens[3] ?? '')) {
    throw new ParseError(
      `Unsupported POLY form on controlled source '${tokens[0]}': spice-ts implements the linear form ${shape.form}`,
      lineNumber, raw,
    );
  }
  if (tokens.length < shape.tokens) {
    throw new ParseError(
      `Controlled source '${tokens[0]}' needs ${shape.tokens - 1} fields after the name: ${shape.form}`,
      lineNumber, raw,
    );
  }
}
