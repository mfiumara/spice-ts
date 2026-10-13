import { ParseError } from '../errors.js';

/**
 * Reject an unlowered PSpice E/G TABLE card before it can become a linear
 * source. ngspice-47 inpcom.c lowers these to an ASRC input, a smoothed and
 * input-limited XSPICE PWL transfer, and an E/G output. Hard interpolation
 * alone is not equivalent. Until that lowering exists, report unsupported
 * syntax rather than allocating TABLE and {expr} as control nodes (#917).
 *
 * Parentheses are separators here, including paired output/control nodes.
 * A genuine linear control node named `table` remains legal: it has exactly
 * two control nodes and a gain, with no expression or assignment syntax.
 */
export function assertNoControlledTable(tokens: readonly string[], lineNumber: number, raw: string): void {
  if (!/^[eg]/i.test(tokens[0] ?? '')) return;
  const fields = tokens.filter(token => token !== '(' && token !== ')');
  if (!/^table(?:=|$)/i.test(fields[3] ?? '')) return;
  if (fields.length === 6 && !/[{}=]/.test(fields[4]) && !fields.slice(3).some(token => token.includes('='))) return;
  throw new ParseError(
    `Controlled source '${tokens[0]}': TABLE syntax is not supported; `
      + 'ngspice-compatible smoothed, clamped transfer lowering is required',
    lineNumber, raw,
  );
}
