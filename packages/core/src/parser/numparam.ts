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

/**
 * ngspice-47 inpcom.c `inp_fix_macro_param_func_paren_io`: a `.param` card
 * whose first token (up to whitespace or `=`) holds `(` defines a function,
 * `.param f(a, b) = 'expr'` being `.func f(a, b) 'expr'`. Returns the
 * equivalent `.func` card text, or undefined for an ordinary `.param` card.
 */
export function paramCardAsFunc(card: string): string | undefined {
  const match = /^\s*\.para\w*\s+/i.exec(card);
  if (!match) return undefined;
  const rest = card.slice(match[0].length);
  const first = /^[^\s=]*/.exec(rest)![0];
  if (!first.includes('(')) return undefined;
  return `.func ${rest.replace('=', ' ')}`;
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

/** One physical deck line as the preprocessor holds it (`+` continuations are separate lines). */
export interface DeckLine {
  text: string;
  /** A line inside a `.control` block, which numparam never reads. */
  control?: boolean;
}

/** End of the card text before an end-of-line comment (`;`, `$` or `//`). */
function cardEnd(line: string): number {
  const starts = [line.indexOf(';'), line.indexOf('$'), line.indexOf('//')].filter(index => index >= 0);
  return starts.length === 0 ? line.length : Math.min(...starts);
}

const PARAM_NAME = /([A-Za-z_]\w*)\s*=/g;
/** A subcircuit header assignment `name=`, ahead of a value. */
const HEADER_PARAM_NAME = /([A-Za-z_]\w*)\s*=\s*(?:\{[^{}]*\}|'[^']*'|\S+)/g;
/** An isolated identifier inside one unbraced token, as inp_quote_params accepts it. */
const ISOLATED_IDENTIFIER = /(^|[=,])([A-Za-z_]\w*)(?=$|[,)])/g;

interface ParamFrame {
  names: Set<string>;
  parent: ParamFrame | null;
}

/**
 * ngspice-47 inpcom.c `inp_quote_params` ("auto braces", on unless
 * `no_auto_braces` is set): before numparam runs, every isolated parameter
 * name after the nodes of an element card is wrapped in braces, so a bare
 * `.param` or subcircuit parameter name works as a value: `R1 in o rv` is
 * `R1 in o {rv}` and `C1 o 0 cap ic=vinit` is `C1 o 0 {cap} ic={vinit}`
 * (#837). The name is braced even when a `.model` of the same name exists, so
 * the parameter wins and the card no longer references the model.
 *
 * spice-ts applies the rule to R, C and L cards (including their `+`
 * continuation lines). Top-level `.param` names (`topLevel`, upper case) are
 * visible deck-wide; the header parameters and `.param` cards of a
 * `.subckt` are visible in its body and in the definitions nested in it,
 * wherever in the body the `.param` card sits. Text inside `{...}` or
 * `'...'`, `.control` blocks and comments is left alone. Returns the
 * rewritten text of every line.
 */
export function braceBareParameters(lines: readonly DeckLine[], topLevel: ReadonlySet<string>): string[] {
  const root: ParamFrame = { names: new Set(topLevel), parent: null };
  const frames = collectParamFrames(lines, root);

  const output = lines.map(line => line.text);
  let active = false;
  let skip = 0;
  for (const [index, line] of lines.entries()) {
    const trimmed = line.text.trim();
    if (trimmed === '' || trimmed.startsWith('*')) continue;
    const continuation = trimmed.startsWith('+');
    if (!continuation) {
      active = !line.control && /^[rcl]/i.test(trimmed);
      skip = 3; // element name and two nodes
    }
    if (!active || line.control) continue;
    const frame = frames[index];
    const visible = (name: string) => {
      const upper = name.toUpperCase();
      for (let at: ParamFrame | null = frame; at; at = at.parent) if (at.names.has(upper)) return true;
      return false;
    };
    const end = cardEnd(line.text);
    const start = continuation ? line.text.indexOf('+') + 1 : 0;
    const state = { skip };
    const braced = braceTokens(line.text.slice(start, end), visible, state);
    skip = state.skip;
    output[index] = line.text.slice(0, start) + braced + line.text.slice(end);
  }
  return output;
}

/** The parameter scope of every line: a frame per `.subckt`, the root for the top level. */
function collectParamFrames(lines: readonly DeckLine[], root: ParamFrame): ParamFrame[] {
  const frames: ParamFrame[] = [];
  let current = root;
  // Logical card being read: a `.subckt` header or `.param` card collects names on `+` lines too.
  let collecting: { frame: ParamFrame; header: boolean } | null = null;
  for (const line of lines) {
    const trimmed = line.text.trim();
    if (line.control || trimmed === '' || trimmed.startsWith('*')) {
      frames.push(current);
      continue;
    }
    const text = trimmed.slice(0, cardEnd(trimmed));
    if (trimmed.startsWith('+')) {
      if (collecting) addNames(collecting.frame, text.slice(1), collecting.header);
      frames.push(current);
      continue;
    }
    collecting = null;
    if (/^\.subckt\s/i.test(text)) {
      current = { names: new Set(), parent: current };
      // Ports and the subcircuit name carry no `=`; only header assignments name parameters.
      addNames(current, text, true);
      collecting = { frame: current, header: true };
      frames.push(current);
      continue;
    }
    if (/^\.ends\b/i.test(text)) {
      frames.push(current);
      if (current.parent) current = current.parent;
      continue;
    }
    if (current !== root && /^\.param\s/i.test(text)) {
      addNames(current, text.slice(6), false);
      collecting = { frame: current, header: false };
    }
    frames.push(current);
  }
  return frames;
}

function addNames(frame: ParamFrame, text: string, header: boolean): void {
  const pattern = header ? HEADER_PARAM_NAME : PARAM_NAME;
  for (const match of text.matchAll(pattern)) frame.names.add(match[1].toUpperCase());
}

/**
 * Brace the visible parameter names in the whitespace-separated tokens of
 * `segment`, after skipping `state.skip` leading tokens (the element name and
 * nodes; a lone `(` or `)` of a node pair does not count). A token holding
 * `{` or `'` is an expression already and is left as is.
 */
function braceTokens(segment: string, visible: (name: string) => boolean, state: { skip: number }): string {
  let output = '';
  let index = 0;
  while (index < segment.length) {
    if (/\s/.test(segment[index])) {
      output += segment[index++];
      continue;
    }
    let end = index;
    let depth = 0;
    let quoted = false;
    for (; end < segment.length; end++) {
      const ch = segment[end];
      if (quoted) {
        if (ch === "'") quoted = false;
      } else if (ch === "'") quoted = true;
      else if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (depth <= 0 && /\s/.test(ch)) break;
    }
    const token = segment.slice(index, end);
    index = end;
    if (token === '(' || token === ')') {
      output += token;
    } else if (state.skip > 0) {
      state.skip--;
      output += token;
    } else if (/[{']/.test(token)) {
      output += token;
    } else {
      output += token.replace(ISOLATED_IDENTIFIER, (match, lead: string, name: string) =>
        visible(name) ? `${lead}{${name}}` : match);
    }
  }
  return output;
}

/**
 * Condition of a `.if`/`.elseif` card. ngspice numparam also reads a single
 * `=` as equality there (`.elseif (select2 = 2)` in ngspice's if-elseif.cir).
 */
export function conditionExpression(condition: string): string {
  return condition.replace(/(?<![=!<>])=(?!=)/g, '==');
}
