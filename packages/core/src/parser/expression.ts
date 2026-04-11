/**
 * Recursive-descent expression evaluator for SPICE .param expressions.
 *
 * Grammar:
 *   expr     → term (('+' | '-') term)*
 *   term     → exp (('*' | '/') exp)*
 *   exp      → unary ('**' unary)*
 *   unary    → '-' unary | call
 *   call     → IDENT '(' expr (',' expr)* ')' | primary
 *   primary  → NUMBER | IDENT | '(' expr ')'
 */

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  log: Math.log10,
  ln: Math.log,
  exp: Math.exp,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
};

export function evaluateExpression(input: string, vars: Record<string, number>): number {
  const parser = new ExprParser(input.trim(), vars);
  const result = parser.parseExpr();
  if (parser.pos < parser.src.length) {
    throw new Error(`Unexpected character '${parser.src[parser.pos]}' at position ${parser.pos} in expression: ${input}`);
  }
  return result;
}

class ExprParser {
  pos = 0;

  constructor(
    public readonly src: string,
    private readonly vars: Record<string, number>,
  ) {}

  parseExpr(): number {
    let left = this.parseTerm();
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
      else break;
    }
    return left;
  }

  private parseExp(): number {
    let left = this.parseUnary();
    while (this.pos < this.src.length) {
      this.skipWhitespace();
      if (this.src[this.pos] === '*' && this.src[this.pos + 1] === '*') {
        this.pos += 2;
        left = left ** this.parseUnary();
      } else break;
    }
    return left;
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
        const args: number[] = [this.parseExpr()];
        this.skipWhitespace();
        while (this.src[this.pos] === ',') {
          this.pos++;
          args.push(this.parseExpr());
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
      const val = this.parseExpr();
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
      return Number(numMatch[0]);
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

  skipWhitespace(): void {
    while (this.pos < this.src.length && this.src[this.pos] === ' ') this.pos++;
  }
}
