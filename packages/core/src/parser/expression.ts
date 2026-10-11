/**
 * Recursive-descent expression evaluator for SPICE .param (ngspice numparam)
 * expressions.
 *
 * Grammar (lowest to highest precedence, following ngspice numparam):
 *   ternary  → or ('?' ternary ':' ternary)?
 *   or       → and ('||' and)*
 *   and      → equality ('&&' equality)*
 *   equality → relation (('==' | '!=' | '<>') relation)*
 *   relation → expr (('<' | '<=' | '>' | '>=') expr)*
 *   expr     → ('+' | '-')? term (('+' | '-') term)*   (leading sign = 0 ± term)
 *   term     → exp (('*' | '/' | '%') exp)*
 *   exp      → unary (('**' | '^') unary)*             (left-associative, |base|)
 *   unary    → ('-' | '+' | '!') unary | call          (after an operator)
 *   call     → IDENT '(' ternary (',' ternary)* ')' | primary
 *   primary  → NUMBER | IDENT | '(' ternary ')'
 *
 * Comparisons and logical operators yield 1 or 0, as in ngspice.
 *
 * Known divergence: after an operator, ngspice-47 only folds a minus into a
 * following number literal (`3*-2^2` = (-2)^2*3 = 12, matched here). Before a
 * name, function or parenthesis it reports "wrongly determined negation"
 * (`3*-x`) or moves the sign to the next literal (`3*-x^2` = 3*x^-2); spice-ts
 * negates the operand instead (`3*-x` = -6, `3*-x^2` = 12).
 */

// SI suffix exponents — case-sensitive for m (milli) vs M (mega)
const SI_EXPONENTS: Record<string, string> = {
  T: 'e12', t: 'e12', G: 'e9', g: 'e9',
  K: 'e3', k: 'e3', M: 'e6', m: 'e-3',
  U: 'e-6', u: 'e-6', N: 'e-9', n: 'e-9',
  P: 'e-12', p: 'e-12', F: 'e-15', f: 'e-15',
};

/** Round half to even, like C `nearbyint` in ngspice's `nint`. */
function nint(x: number): number {
  const rounded = Math.round(x);
  return Math.abs(x % 1) === 0.5 && rounded % 2 !== 0 ? rounded - 1 : rounded;
}

/**
 * ngspice numparam built-in functions (xpressn.c). `log` is the natural
 * logarithm in ngspice numparam, as in its B-source expressions.
 */
const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  sqrt: Math.sqrt,
  sqr: x => x * x,
  abs: Math.abs,
  log: Math.log,
  ln: Math.log,
  log10: Math.log10,
  exp: Math.exp,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
  // ngspice-47 numparam: pwr(-2,3) = 8, pwr(-4,0.5) = 2.
  pwr: (x, y) => Math.abs(x) ** y,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  arctan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  asinh: Math.asinh,
  acosh: Math.acosh,
  atanh: Math.atanh,
  sgn: Math.sign,
  int: Math.trunc,
  nint,
  floor: Math.floor,
  ceil: Math.ceil,
  ternary_fcn: (condition, whenTrue, whenFalse) => (condition !== 0 ? whenTrue : whenFalse),
};

export function evaluateExpression(input: string, vars: Record<string, number>): number {
  const parser = new ExprParser(input.trim(), vars);
  const result = parser.parseTernary();
  parser.skipWhitespace();
  if (parser.pos < parser.src.length) {
    throw new Error(`Unexpected character '${parser.src[parser.pos]}' at position ${parser.pos} in expression: ${input}`);
  }
  return result;
}

const truth = (value: boolean): number => (value ? 1 : 0);

class ExprParser {
  pos = 0;

  constructor(
    public readonly src: string,
    private readonly vars: Record<string, number>,
  ) {}

  parseTernary(): number {
    const condition = this.parseOr();
    if (!this.accept('?')) return condition;
    const whenTrue = this.parseTernary();
    if (!this.accept(':')) throw new Error(`Expected ':' in conditional expression`);
    const whenFalse = this.parseTernary();
    return condition !== 0 ? whenTrue : whenFalse;
  }

  private parseOr(): number {
    let left = this.parseAnd();
    while (this.accept('||')) {
      const right = this.parseAnd();
      left = truth(left !== 0 || right !== 0);
    }
    return left;
  }

  private parseAnd(): number {
    let left = this.parseEquality();
    while (this.accept('&&')) {
      const right = this.parseEquality();
      left = truth(left !== 0 && right !== 0);
    }
    return left;
  }

  private parseEquality(): number {
    let left = this.parseRelation();
    for (;;) {
      if (this.accept('==')) left = truth(left === this.parseRelation());
      else if (this.accept('!=') || this.accept('<>')) left = truth(left !== this.parseRelation());
      else return left;
    }
  }

  private parseRelation(): number {
    let left = this.parseExpr();
    for (;;) {
      if (this.accept('<=')) left = truth(left <= this.parseExpr());
      else if (this.accept('>=')) left = truth(left >= this.parseExpr());
      else if (this.peekIs('<') && !this.peekIs('<>')) { this.pos++; left = truth(left < this.parseExpr()); }
      else if (this.accept('>')) left = truth(left > this.parseExpr());
      else return left;
    }
  }

  private parseExpr(): number {
    // ngspice numparam has no prefix minus at the start of a (sub-)formula: a
    // leading sign is the binary operator applied to an empty accumulator, so
    // `-2^2` is `0 - 2^2` = -4 and `-3^2+1` is -8 (ngspice-47).
    this.skipWhitespace();
    const ch = this.src[this.pos];
    let left = (ch === '+' || ch === '-') && this.atFormulaStart() ? 0 : this.parseTerm();
    while (this.pos < this.src.length) {
      this.skipWhitespace();
      const ch = this.src[this.pos];
      if (ch === '+') { this.pos++; left = left + this.parseTerm(); }
      else if (ch === '-') { this.pos++; left = left - this.parseTerm(); }
      else break;
    }
    return left;
  }

  private parseTerm(): number {
    let left = this.parseExp();
    while (this.pos < this.src.length) {
      this.skipWhitespace();
      const ch = this.src[this.pos];
      if (ch === '*' && this.src[this.pos + 1] !== '*') { this.pos++; left = left * this.parseExp(); }
      else if (ch === '/') { this.pos++; left = left / this.parseExp(); }
      else if (ch === '%') { this.pos++; left = left % this.parseExp(); }
      else break;
    }
    return left;
  }

  private parseExp(): number {
    // ngspice numparam accumulates `^`/`**` left to right like every other
    // binary level: `2^3^2` is (2^3)^2 = 64 (ngspice-47). Its default power is
    // pow(fabs(x), y), so `(-2)^3` is 8.
    let left = this.parseUnary();
    while (this.accept('**') || this.accept('^')) {
      left = Math.abs(left) ** this.parseUnary();
    }
    return left;
  }

  /** True when only whitespace, '(' or ',' precede the cursor in this formula. */
  private atFormulaStart(): boolean {
    let i = this.pos - 1;
    while (i >= 0 && (this.src[i] === ' ' || this.src[i] === '\t')) i--;
    return i < 0 || this.src[i] === '(' || this.src[i] === ',';
  }

  private parseUnary(): number {
    this.skipWhitespace();
    if (this.src[this.pos] === '-') {
      this.pos++;
      return -this.parseUnary();
    }
    if (this.src[this.pos] === '+') {
      this.pos++;
      return this.parseUnary();
    }
    if (this.src[this.pos] === '!' && this.src[this.pos + 1] !== '=') {
      this.pos++;
      return truth(this.parseUnary() === 0);
    }
    return this.parseCall();
  }

  private parseCall(): number {
    this.skipWhitespace();
    const identMatch = this.src.slice(this.pos).match(/^([a-zA-Z_]\w*)/);
    if (identMatch) {
      const name = identMatch[1];
      const afterIdent = this.pos + name.length;
      let peek = afterIdent;
      while (peek < this.src.length && this.src[peek] === ' ') peek++;
      if (this.src[peek] === '(') {
        const fn = FUNCTIONS[name.toLowerCase()];
        if (!fn) throw new Error(`Unknown function '${name}'`);
        this.pos = peek + 1;
        const args: number[] = [this.parseTernary()];
        this.skipWhitespace();
        while (this.src[this.pos] === ',') {
          this.pos++;
          args.push(this.parseTernary());
          this.skipWhitespace();
        }
        if (this.src[this.pos] !== ')') {
          throw new Error(`Expected ')' after function arguments in expression`);
        }
        this.pos++;
        return fn(...args);
      }
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    this.skipWhitespace();

    if (this.src[this.pos] === '(') {
      this.pos++;
      const val = this.parseTernary();
      this.skipWhitespace();
      if (this.src[this.pos] !== ')') {
        throw new Error(`Expected ')' in expression`);
      }
      this.pos++;
      return val;
    }

    const numMatch = this.src.slice(this.pos).match(/^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/);
    if (numMatch) {
      this.pos += numMatch[0].length;
      const numStr = numMatch[0];
      // Check for SI suffix immediately after the number (no space)
      // Case-sensitive: m = milli, M = mega; MEG/meg = mega
      const suffixMatch = this.src.slice(this.pos).match(/^([Mm][Ee][Gg]|[TtGgKkMmUuNnPpFf])/);
      if (suffixMatch) {
        const suffix = suffixMatch[0];
        const afterSuffix = this.pos + suffix.length;
        // Check for embedded fractional digits (e.g., 3k3 = 3.3k = 3300)
        const fracMatch = this.src.slice(afterSuffix).match(/^(\d+)/);
        let fullNumStr = numStr;
        let endPos = afterSuffix;
        if (fracMatch && !numStr.includes('.') && !numMatch[2]) {
          fullNumStr = numStr + '.' + fracMatch[1];
          endPos = afterSuffix + fracMatch[1].length;
        }
        // Only consume if not followed by alphanumeric (not part of an identifier)
        const nextChar = this.src[endPos];
        if (!nextChar || !/[a-zA-Z0-9_]/.test(nextChar)) {
          const exp = suffix.length === 3 ? 'e6' : SI_EXPONENTS[suffix];
          this.pos = endPos;
          return Number(fullNumStr + exp);
        }
      }
      return Number(numStr);
    }

    const varMatch = this.src.slice(this.pos).match(/^([a-zA-Z_]\w*)/);
    if (varMatch) {
      const name = varMatch[1];
      this.pos += name.length;
      const upper = name.toUpperCase();
      if (upper in this.vars) return this.vars[upper];
      if (name in this.vars) return this.vars[name];
      throw new Error(`Undefined variable '${name}'`);
    }

    throw new Error(`Unexpected character '${this.src[this.pos] ?? 'EOF'}' at position ${this.pos}`);
  }

  private peekIs(token: string): boolean {
    this.skipWhitespace();
    return this.src.startsWith(token, this.pos);
  }

  private accept(token: string): boolean {
    if (!this.peekIs(token)) return false;
    this.pos += token.length;
    return true;
  }

  skipWhitespace(): void {
    while (this.pos < this.src.length && (this.src[this.pos] === ' ' || this.src[this.pos] === '\t')) this.pos++;
  }
}
