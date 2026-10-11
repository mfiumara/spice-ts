/**
 * ngspice numparam extensions handled by the preprocessor: `.func` user
 * functions and `.if/.elseif` conditions.
 *
 * ngspice (inpcom.c, inp_expand_macros_in_deck) expands `.func` calls
 * textually in every card, so a function body may appear in `.param` values,
 * brace/quoted expressions and B-source expressions alike. A call `f(a, b)` is
 * replaced by `(body)` with each formal parameter replaced by `(argument)`.
 * Functions defined inside a `.subckt` are visible only in that subcircuit
 * and the subcircuits nested in it; top-level functions are visible everywhere.
 */

export interface UserFunction {
  name: string;
  params: string[];
  body: string;
}

/** Function definitions visible in one scope, keyed by lower-case name. */
export type FunctionScope = ReadonlyMap<string, UserFunction>;

const MAX_EXPANSION_DEPTH = 64;
const IDENTIFIER = /[A-Za-z_]\w*/g;
const FUNC_CARD = /^\s*\.func\s+([A-Za-z_]\w*)\s*\(([^()]*)\)\s*(?:=\s*)?(.*)$/i;

/**
 * Parse `.func name(arg1, arg2) body` (also `name(a b)`, `= body`, and a body
 * in `{...}` or `'...'`). Throws an Error describing a malformed card.
 */
export function parseFuncCard(card: string): UserFunction {
  const match = FUNC_CARD.exec(card);
  if (!match) {
    throw new Error("Malformed .func card: expected '.func name(arg, ...) expression'");
  }
  const [, name, rawParams, rawBody] = match;
  const params = rawParams.split(/[\s,]+/).filter(Boolean);
  for (const param of params) {
    if (!/^[A-Za-z_]\w*$/.test(param)) {
      throw new Error(`Malformed .func card: '${param}' is not a parameter name`);
    }
  }
  const lowered = params.map(param => param.toLowerCase());
  if (new Set(lowered).size !== lowered.length) {
    throw new Error(`Malformed .func card: duplicate parameter in '${name}'`);
  }
  let body = rawBody.trim();
  if (body.length >= 2 && ((body.startsWith('{') && body.endsWith('}')) || (body.startsWith("'") && body.endsWith("'")))) {
    body = body.slice(1, -1);
  }
  // Expressions ignore whitespace; a compact body keeps an expanded subcircuit
  // value a single token for the subcircuit tokenizer.
  body = body.replace(/\s+/g, '');
  if (body === '') throw new Error(`Malformed .func card: '${name}' has no expression`);
  return { name, params: lowered, body };
}

/** Expand every call of a function in `functions` inside `text`. */
export function expandUserFunctions(text: string, functions: FunctionScope): string {
  if (functions.size === 0) return text;
  return expand(text, functions, 0);
}

function expand(text: string, functions: FunctionScope, depth: number): string {
  if (depth > MAX_EXPANSION_DEPTH) {
    throw new Error(`.func expansion exceeds ${MAX_EXPANSION_DEPTH} levels (recursion?)`);
  }
  let output = '';
  let cursor = 0;
  IDENTIFIER.lastIndex = 0;
  for (;;) {
    IDENTIFIER.lastIndex = cursor;
    const match = IDENTIFIER.exec(text);
    if (!match) break;
    const start = match.index;
    const name = match[0];
    const after = start + name.length;
    const fn = functions.get(name.toLowerCase());
    const precededByWord = start > 0 && /[\w.@#$]/.test(text[start - 1]);
    let open = after;
    while (open < text.length && (text[open] === ' ' || text[open] === '\t')) open++;
    if (!fn || precededByWord || text[open] !== '(') {
      output += text.slice(cursor, after);
      cursor = after;
      continue;
    }
    const close = matchingParen(text, open);
    if (close < 0) throw new Error(`Unbalanced parentheses in call of .func '${fn.name}'`);
    const inner = text.slice(open + 1, close);
    const args = inner.trim() === '' ? [] : splitTopLevel(inner);
    if (args.length !== fn.params.length) {
      throw new Error(`.func '${fn.name}' expects ${fn.params.length} arguments, got ${args.length}`);
    }
    const values = args.map(arg => expand(arg.trim(), functions, depth + 1));
    const body = fn.body.replace(IDENTIFIER, (identifier, offset: number, whole: string) => {
      if (offset > 0 && /[\w.@#$]/.test(whole[offset - 1])) return identifier;
      const index = fn.params.indexOf(identifier.toLowerCase());
      return index < 0 ? identifier : `(${values[index]})`;
    });
    output += text.slice(cursor, start) + `(${expand(body, functions, depth + 1)})`;
    cursor = close + 1;
  }
  return output + text.slice(cursor);
}

function matchingParen(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) return i;
  }
  return -1;
}

function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/**
 * Condition of a `.if`/`.elseif` card. ngspice numparam also reads a single
 * `=` as equality there (`.elseif (select2 = 2)` in ngspice's if-elseif.cir).
 */
export function conditionExpression(condition: string): string {
  return condition.replace(/(?<![=!<>])=(?!=)/g, '==');
}
