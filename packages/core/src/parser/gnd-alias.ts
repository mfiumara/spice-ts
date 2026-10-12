/**
 * ngspice-47 `inp_fix_gnd_name` (src/frontend/inpcom.c): on every card after
 * the title, except comment cards, each `gnd` after the first token that is
 * preceded by whitespace, `(` or `,` and followed by whitespace, `)` or `,` is
 * replaced by node `0`. ngspice runs it on the lower-cased deck after
 * continuation lines are joined and before subcircuits are expanded, so it
 * also renames `gnd` in subcircuit bodies, `.subckt` port lists and
 * expressions such as `v(in,gnd)`. A `gnd` that ends the card (no delimiter
 * after it) or touches any other character (`gnd1`, `{gnd}`, `x=gnd`) is left
 * alone; ngspice-47 also inserts `.global gnd`, so such a leftover is one
 * global node named `gnd`, not ground (#772).
 *
 * The match is case-insensitive because ngspice lower-cases the deck first.
 * The replacement is `0` without the surrounding spaces ngspice writes; the
 * delimiters are kept, so tokenization is the same and a whitespace-free
 * `{...}` stays one token.
 */
// C isspace() in the "C" locale.
const C_SPACE = /[ \t\n\v\f\r]/;

export function fixGndName(card: string): string {
  if (!/gnd/i.test(card)) return card;
  // "a gnd node will not occur in the first token of the line"
  const firstTokenEnd = card.search(C_SPACE);
  if (firstTokenEnd < 0) return card;
  const lower = card.toLowerCase();
  let out = '';
  let copied = 0;
  for (let at = lower.indexOf('gnd', firstTokenEnd); at >= 0; at = lower.indexOf('gnd', at + 3)) {
    if (isLeadingDelimiter(card[at - 1]) && isTrailingDelimiter(card[at + 3])) {
      out += card.slice(copied, at) + '0';
      copied = at + 3;
    }
  }
  return copied === 0 ? card : out + card.slice(copied);
}

/** True when a card still has a `gnd` token, which ngspice-47's `.global gnd` makes global. */
export function hasGndToken(tokens: readonly string[]): boolean {
  return tokens.some(token => token.toLowerCase() === 'gnd');
}

function isLeadingDelimiter(char: string | undefined): boolean {
  return char !== undefined && (char === '(' || char === ',' || C_SPACE.test(char));
}

function isTrailingDelimiter(char: string | undefined): boolean {
  return char !== undefined && (char === ')' || char === ',' || C_SPACE.test(char));
}
