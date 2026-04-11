# `.lib` File Loading & `.subckt` Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `.lib` file loading, `.subckt` subcircuit support, `.include` resolution, and `.param` expression evaluation to `@spice-ts/core`.

**Architecture:** Two-phase parsing pipeline — an async preprocessor handles text-level transforms (`.include`, `.lib`/`.endl`, `.param`), producing a flattened netlist. The existing parser is extended with `.subckt`/`.ends` collection and `X` device instantiation. Subcircuit expansion happens during `compile()`.

**Tech Stack:** TypeScript, vitest, tsup (ESM+CJS build)

**Spec:** `docs/superpowers/specs/2026-04-11-lib-subckt-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/core/src/parser/expression.ts` | Create | Recursive-descent math expression evaluator |
| `packages/core/src/parser/expression.test.ts` | Create | Tests for expression evaluator |
| `packages/core/src/parser/preprocessor.ts` | Create | `.param` substitution, `.include` resolution, `.lib`/`.endl` section selection |
| `packages/core/src/parser/preprocessor.test.ts` | Create | Tests for preprocessor |
| `packages/core/src/errors.ts` | Modify | Add `CycleError` class |
| `packages/core/src/errors.test.ts` | Modify | Add `CycleError` test |
| `packages/core/src/types.ts` | Modify | Add `SubcktDefinition`, `IncludeResolver` types |
| `packages/core/src/parser/index.ts` | Modify | Add `.subckt`/`.ends` parsing, `X` device parsing, `parseAsync()` |
| `packages/core/src/parser/parser.test.ts` | Modify | Tests for `.subckt`, `X`, `parseAsync` |
| `packages/core/src/circuit.ts` | Modify | `addSubcircuit()`, `addSubcircuitInstance()`, subcircuit expansion in `compile()` |
| `packages/core/src/circuit.test.ts` | Modify | Tests for subcircuit storage and expansion |
| `packages/core/src/simulate.ts` | Modify | Wire `resolveInclude` into `simulate()` |
| `packages/core/src/simulate.test.ts` | Modify | Tests for `simulate()` with resolver |
| `packages/core/src/index.ts` | Modify | Export new public API |

---

### Task 1: Expression Evaluator — Arithmetic & Operator Precedence

**Files:**
- Create: `packages/core/src/parser/expression.ts`
- Create: `packages/core/src/parser/expression.test.ts`

- [ ] **Step 1: Write failing tests for basic arithmetic**

In `packages/core/src/parser/expression.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { evaluateExpression } from './expression.js';

describe('evaluateExpression', () => {
  describe('basic arithmetic', () => {
    it('evaluates integer addition', () => {
      expect(evaluateExpression('1+2', {})).toBe(3);
    });

    it('evaluates subtraction', () => {
      expect(evaluateExpression('5-3', {})).toBe(2);
    });

    it('evaluates multiplication', () => {
      expect(evaluateExpression('3*4', {})).toBe(12);
    });

    it('evaluates division', () => {
      expect(evaluateExpression('10/4', {})).toBe(2.5);
    });

    it('evaluates exponentiation', () => {
      expect(evaluateExpression('2**3', {})).toBe(8);
    });

    it('respects operator precedence (mul before add)', () => {
      expect(evaluateExpression('2+3*4', {})).toBe(14);
    });

    it('respects operator precedence (div before sub)', () => {
      expect(evaluateExpression('10-6/3', {})).toBe(8);
    });

    it('handles parentheses overriding precedence', () => {
      expect(evaluateExpression('(2+3)*4', {})).toBe(20);
    });

    it('handles nested parentheses', () => {
      expect(evaluateExpression('((2+3)*(4-1))', {})).toBe(15);
    });

    it('handles unary minus', () => {
      expect(evaluateExpression('-5', {})).toBe(-5);
    });

    it('handles unary minus in expression', () => {
      expect(evaluateExpression('3*-2', {})).toBe(-6);
    });

    it('handles floating point numbers', () => {
      expect(evaluateExpression('1.5+2.5', {})).toBe(4);
    });

    it('handles scientific notation', () => {
      expect(evaluateExpression('1e-6*1e3', {})).toBeCloseTo(1e-3);
    });

    it('handles whitespace', () => {
      expect(evaluateExpression(' 2 + 3 ', {})).toBe(5);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core && npx vitest run src/parser/expression.test.ts`
Expected: FAIL — module `./expression.js` not found

- [ ] **Step 3: Implement the expression evaluator**

In `packages/core/src/parser/expression.ts`:

```typescript
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
    // Check for function call: ident followed by '('
    const identMatch = this.src.slice(this.pos).match(/^([a-zA-Z_]\w*)/);
    if (identMatch) {
      const name = identMatch[1];
      const afterIdent = this.pos + name.length;
      // Look ahead for '(' (skip whitespace)
      let peek = afterIdent;
      while (peek < this.src.length && this.src[peek] === ' ') peek++;
      if (this.src[peek] === '(') {
        const fn = FUNCTIONS[name.toLowerCase()];
        if (!fn) throw new Error(`Unknown function '${name}'`);
        this.pos = peek + 1; // skip '('
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
        this.pos++; // skip ')'
        return fn(...args);
      }
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    this.skipWhitespace();

    // Parenthesized expression
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

    // Number (including scientific notation)
    const numMatch = this.src.slice(this.pos).match(/^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/);
    if (numMatch) {
      this.pos += numMatch[0].length;
      return Number(numMatch[0]);
    }

    // Variable
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run src/parser/expression.test.ts`
Expected: All 15 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/parser/expression.ts packages/core/src/parser/expression.test.ts
git commit -m "feat: add expression evaluator for .param expressions"
```

---

### Task 2: Expression Evaluator — Variables & Functions

**Files:**
- Modify: `packages/core/src/parser/expression.test.ts`

- [ ] **Step 1: Write failing tests for variables and functions**

Append to `packages/core/src/parser/expression.test.ts`, inside the outer `describe`:

```typescript
  describe('variables', () => {
    it('resolves a variable', () => {
      expect(evaluateExpression('W', { W: 1e-6 })).toBe(1e-6);
    });

    it('resolves variable in expression', () => {
      expect(evaluateExpression('W*2', { W: 1e-6 })).toBeCloseTo(2e-6);
    });

    it('resolves multiple variables', () => {
      expect(evaluateExpression('W/L', { W: 10e-6, L: 1e-6 })).toBeCloseTo(10);
    });

    it('is case-insensitive for variable lookup', () => {
      expect(evaluateExpression('vdd', { VDD: 1.8 })).toBe(1.8);
    });

    it('throws on undefined variable', () => {
      expect(() => evaluateExpression('X', {})).toThrow("Undefined variable 'X'");
    });
  });

  describe('functions', () => {
    it('evaluates sqrt', () => {
      expect(evaluateExpression('sqrt(4)', {})).toBe(2);
    });

    it('evaluates abs', () => {
      expect(evaluateExpression('abs(-3)', {})).toBe(3);
    });

    it('evaluates log (base 10)', () => {
      expect(evaluateExpression('log(100)', {})).toBeCloseTo(2);
    });

    it('evaluates ln (natural log)', () => {
      expect(evaluateExpression('ln(1)', {})).toBe(0);
    });

    it('evaluates exp', () => {
      expect(evaluateExpression('exp(0)', {})).toBe(1);
    });

    it('evaluates min with two args', () => {
      expect(evaluateExpression('min(3,7)', {})).toBe(3);
    });

    it('evaluates max with two args', () => {
      expect(evaluateExpression('max(3,7)', {})).toBe(7);
    });

    it('evaluates pow', () => {
      expect(evaluateExpression('pow(2,10)', {})).toBe(1024);
    });

    it('evaluates nested function calls', () => {
      expect(evaluateExpression('sqrt(abs(-9))', {})).toBe(3);
    });

    it('evaluates function with expression argument', () => {
      expect(evaluateExpression('sqrt(W*L)', { W: 4, L: 9 })).toBe(6);
    });

    it('throws on unknown function', () => {
      expect(() => evaluateExpression('foo(1)', {})).toThrow("Unknown function 'foo'");
    });
  });

  describe('edge cases', () => {
    it('handles empty string', () => {
      expect(() => evaluateExpression('', {})).toThrow();
    });

    it('handles complex nested expression', () => {
      // 2 * (W + L) / sqrt(4)
      expect(evaluateExpression('2*(W+L)/sqrt(4)', { W: 3, L: 5 })).toBe(8);
    });
  });
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run src/parser/expression.test.ts`
Expected: All tests PASS (the implementation from Task 1 already handles variables and functions)

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/parser/expression.test.ts
git commit -m "test: add variable and function tests for expression evaluator"
```

---

### Task 3: CycleError & New Types

**Files:**
- Modify: `packages/core/src/errors.ts`
- Modify: `packages/core/src/errors.test.ts`
- Modify: `packages/core/src/types.ts`

- [ ] **Step 1: Write failing test for CycleError**

Append to the end of `packages/core/src/errors.test.ts`:

```typescript
describe('CycleError', () => {
  it('formats the dependency chain', () => {
    const err = new CycleError(['a.lib', 'b.lib', 'a.lib']);
    expect(err.name).toBe('CycleError');
    expect(err.message).toBe('Circular dependency detected: a.lib → b.lib → a.lib');
    expect(err.chain).toEqual(['a.lib', 'b.lib', 'a.lib']);
    expect(err).toBeInstanceOf(SpiceError);
  });
});
```

Add `CycleError` and `SpiceError` to the imports at the top of the file (alongside existing imports).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run src/errors.test.ts`
Expected: FAIL — `CycleError` is not exported

- [ ] **Step 3: Implement CycleError**

Append to `packages/core/src/errors.ts`:

```typescript
export class CycleError extends SpiceError {
  constructor(
    public readonly chain: string[],
  ) {
    super(`Circular dependency detected: ${chain.join(' → ')}`);
    this.name = 'CycleError';
  }
}
```

- [ ] **Step 4: Add new types to types.ts**

Append to `packages/core/src/types.ts`:

```typescript
/** Async resolver for .include and .lib file references */
export type IncludeResolver = (path: string) => Promise<string>;

/** Subcircuit definition parsed from .subckt/.ends block */
export interface SubcktDefinition {
  name: string;
  ports: string[];
  params: Record<string, number>;
  body: string[];
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run src/errors.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/errors.ts packages/core/src/errors.test.ts packages/core/src/types.ts
git commit -m "feat: add CycleError, SubcktDefinition, and IncludeResolver types"
```

---

### Task 4: Preprocessor — `.param` Substitution

**Files:**
- Create: `packages/core/src/parser/preprocessor.ts`
- Create: `packages/core/src/parser/preprocessor.test.ts`

- [ ] **Step 1: Write failing tests for .param substitution**

In `packages/core/src/parser/preprocessor.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { preprocess } from './preprocessor.js';

describe('preprocessor', () => {
  describe('.param substitution', () => {
    it('substitutes a simple param into a device value', async () => {
      const input = `.param rval = 1000\nR1 1 0 {rval}\n.op`;
      const result = await preprocess(input);
      expect(result).toContain('R1 1 0 1000');
      expect(result).not.toContain('.param');
      expect(result).not.toContain('{');
    });

    it('substitutes param with SI suffix', async () => {
      const input = `.param cap = 100n\nC1 1 0 {cap}\n.op`;
      const result = await preprocess(input);
      expect(result).toContain('C1 1 0 1e-7');
    });

    it('substitutes param expression', async () => {
      const input = `.param w = 1e-6\n.param w2 = {w*2}\nM1 d g s NMOD W={w2}\n.op`;
      const result = await preprocess(input);
      expect(result).toContain('W=0.000002');
    });

    it('handles multiple params', async () => {
      const input = `.param a = 2\n.param b = 3\nR1 1 0 {a+b}\n.op`;
      const result = await preprocess(input);
      expect(result).toContain('R1 1 0 5');
    });

    it('passes through netlist with no directives unchanged', async () => {
      const input = 'V1 1 0 DC 5\nR1 1 0 1k\n.op';
      const result = await preprocess(input);
      expect(result).toBe(input);
    });

    it('preserves .subckt blocks without evaluating internal params', async () => {
      const input = `.subckt inv in out W=1u\nR1 in out {W}\n.ends inv\n.op`;
      const result = await preprocess(input);
      expect(result).toContain('.subckt inv in out W=1u');
      expect(result).toContain('{W}');
    });

    it('handles .param with = sign and spaces', async () => {
      const input = `.param vdd = 1.8\nV1 1 0 DC {vdd}\n.op`;
      const result = await preprocess(input);
      expect(result).toContain('V1 1 0 DC 1.8');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core && npx vitest run src/parser/preprocessor.test.ts`
Expected: FAIL — module `./preprocessor.js` not found

- [ ] **Step 3: Implement the preprocessor with .param support**

In `packages/core/src/parser/preprocessor.ts`:

```typescript
import { evaluateExpression } from './expression.js';
import { parseNumber } from './tokenizer.js';
import { CycleError } from '../errors.js';
import type { IncludeResolver } from '../types.js';

const MAX_DEPTH = 64;

export async function preprocess(
  netlist: string,
  resolver?: IncludeResolver,
): Promise<string> {
  return preprocessInternal(netlist, resolver, new Set(), [], 0);
}

async function preprocessInternal(
  netlist: string,
  resolver: IncludeResolver | undefined,
  visited: Set<string>,
  chain: string[],
  depth: number,
): Promise<string> {
  if (depth > MAX_DEPTH) {
    throw new (await import('../errors.js')).ParseError(
      `Include depth limit exceeded (${MAX_DEPTH})`, 0, '',
    );
  }

  const lines = netlist.split('\n');
  const params: Record<string, number> = {};
  const output: string[] = [];
  let inSubckt = 0; // nesting depth

  for (const line of lines) {
    const trimmed = line.trim();
    const upper = trimmed.toUpperCase();

    // Track .subckt nesting — don't evaluate params inside subcircuits
    if (upper.startsWith('.SUBCKT ')) {
      inSubckt++;
      output.push(line);
      continue;
    }
    if (upper.startsWith('.ENDS')) {
      inSubckt--;
      output.push(line);
      continue;
    }

    // Inside a subcircuit — pass through without processing
    if (inSubckt > 0) {
      output.push(line);
      continue;
    }

    // .param at top level
    if (upper.startsWith('.PARAM ')) {
      const paramContent = trimmed.slice(7).trim(); // after ".param "
      const eqIdx = paramContent.indexOf('=');
      if (eqIdx > 0) {
        const name = paramContent.slice(0, eqIdx).trim().toUpperCase();
        let valStr = paramContent.slice(eqIdx + 1).trim();
        // Strip braces if present
        if (valStr.startsWith('{') && valStr.endsWith('}')) {
          valStr = valStr.slice(1, -1);
        }
        try {
          params[name] = evaluateExpression(valStr, params);
        } catch {
          // Try as a plain number with SI suffix
          params[name] = parseNumber(valStr);
        }
      }
      // .param lines are consumed, not passed through
      continue;
    }

    // Substitute {expr} in all other lines
    const substituted = substituteExpressions(line, params);
    output.push(substituted);
  }

  return output.join('\n');
}

function substituteExpressions(line: string, params: Record<string, number>): string {
  // Replace {expr} with evaluated result
  return line.replace(/\{([^}]+)\}/g, (_match, expr: string) => {
    const value = evaluateExpression(expr, params);
    return formatNumber(value);
  });
}

function formatNumber(value: number): string {
  // Use toPrecision to avoid floating point artifacts, but keep integers clean
  if (Number.isInteger(value)) return value.toString();
  // For very small/large numbers use exponential notation
  if (Math.abs(value) < 1e-3 || Math.abs(value) >= 1e6) {
    return value.toExponential();
  }
  return value.toString();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run src/parser/preprocessor.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/parser/preprocessor.ts packages/core/src/parser/preprocessor.test.ts
git commit -m "feat: add preprocessor with .param substitution"
```

---

### Task 5: Preprocessor — `.include` Resolution

**Files:**
- Modify: `packages/core/src/parser/preprocessor.ts`
- Modify: `packages/core/src/parser/preprocessor.test.ts`

- [ ] **Step 1: Write failing tests for .include**

Append to `packages/core/src/parser/preprocessor.test.ts`, inside the outer `describe`:

```typescript
  describe('.include resolution', () => {
    it('resolves a simple .include', async () => {
      const resolver: IncludeResolver = async (path) => {
        if (path === 'models.lib') return '.model DMOD D(IS=1e-14)';
        throw new Error(`Unknown file: ${path}`);
      };
      const input = `.include 'models.lib'\nD1 1 0 DMOD\n.op`;
      const result = await preprocess(input, resolver);
      expect(result).toContain('.model DMOD D(IS=1e-14)');
      expect(result).toContain('D1 1 0 DMOD');
      expect(result).not.toContain('.include');
    });

    it('strips quotes from include path', async () => {
      const paths: string[] = [];
      const resolver: IncludeResolver = async (path) => {
        paths.push(path);
        return '* empty';
      };
      await preprocess(`.include "file.lib"\n.op`, resolver);
      expect(paths).toEqual(['file.lib']);
    });

    it('handles unquoted include path', async () => {
      const paths: string[] = [];
      const resolver: IncludeResolver = async (path) => {
        paths.push(path);
        return '* empty';
      };
      await preprocess(`.include file.lib\n.op`, resolver);
      expect(paths).toEqual(['file.lib']);
    });

    it('resolves recursive includes', async () => {
      const resolver: IncludeResolver = async (path) => {
        if (path === 'a.lib') return `.include 'b.lib'\n.model A D(IS=1e-14)`;
        if (path === 'b.lib') return '.model B D(IS=2e-14)';
        throw new Error(`Unknown: ${path}`);
      };
      const result = await preprocess(`.include 'a.lib'\n.op`, resolver);
      expect(result).toContain('.model A D(IS=1e-14)');
      expect(result).toContain('.model B D(IS=2e-14)');
    });

    it('detects circular includes', async () => {
      const resolver: IncludeResolver = async (path) => {
        if (path === 'a.lib') return `.include 'b.lib'`;
        if (path === 'b.lib') return `.include 'a.lib'`;
        throw new Error(`Unknown: ${path}`);
      };
      await expect(preprocess(`.include 'a.lib'\n.op`, resolver))
        .rejects.toThrow('Circular dependency detected');
    });

    it('throws when resolver is not provided', async () => {
      await expect(preprocess(`.include 'file.lib'\n.op`))
        .rejects.toThrow();
    });

    it('throws on depth limit exceeded', async () => {
      // Each file includes the next: file0 -> file1 -> ... -> file65
      const resolver: IncludeResolver = async (path) => {
        const n = parseInt(path.replace('file', '').replace('.lib', ''));
        if (n < 65) return `.include 'file${n + 1}.lib'`;
        return '* end';
      };
      await expect(preprocess(`.include 'file0.lib'\n.op`, resolver))
        .rejects.toThrow();
    });
  });
```

Add the import for `IncludeResolver` at the top:

```typescript
import type { IncludeResolver } from '../types.js';
```

- [ ] **Step 2: Run tests to verify new tests fail**

Run: `cd packages/core && npx vitest run src/parser/preprocessor.test.ts`
Expected: FAIL — `.include` lines are passed through, not resolved

- [ ] **Step 3: Add .include handling to preprocessor**

In `packages/core/src/parser/preprocessor.ts`, add `.include` handling inside the `preprocessInternal` loop, after the `.param` block and before the substitution:

```typescript
    // .include directive
    if (upper.startsWith('.INCLUDE ')) {
      if (!resolver) {
        throw new ParseError(
          '.include directive requires a resolver. Use parseAsync() with a resolveInclude option.',
          0, trimmed,
        );
      }
      let path = trimmed.slice(9).trim();
      // Strip quotes
      if ((path.startsWith("'") && path.endsWith("'")) ||
          (path.startsWith('"') && path.endsWith('"'))) {
        path = path.slice(1, -1);
      }
      if (visited.has(path)) {
        throw new CycleError([...chain, path]);
      }
      visited.add(path);
      const content = await resolver(path);
      const processed = await preprocessInternal(
        content, resolver, visited, [...chain, path], depth + 1,
      );
      visited.delete(path);
      output.push(processed);
      continue;
    }
```

Also add the `ParseError` import at the top of the file:

```typescript
import { CycleError, ParseError } from '../errors.js';
```

And remove the dynamic import of `ParseError` from the depth check, replacing it with:

```typescript
  if (depth > MAX_DEPTH) {
    throw new ParseError(`Include depth limit exceeded (${MAX_DEPTH})`, 0, '');
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run src/parser/preprocessor.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/parser/preprocessor.ts packages/core/src/parser/preprocessor.test.ts
git commit -m "feat: add .include resolution to preprocessor"
```

---

### Task 6: Preprocessor — `.lib`/`.endl` Section Selection

**Files:**
- Modify: `packages/core/src/parser/preprocessor.ts`
- Modify: `packages/core/src/parser/preprocessor.test.ts`

- [ ] **Step 1: Write failing tests for .lib/.endl**

Append to `packages/core/src/parser/preprocessor.test.ts`, inside the outer `describe`:

```typescript
  describe('.lib/.endl section selection', () => {
    it('selects the requested section from a file', async () => {
      const libContent = [
        '.lib TT',
        '.model nch nmos(VTO=0.5 KP=120u)',
        '.endl TT',
        '.lib FF',
        '.model nch nmos(VTO=0.4 KP=140u)',
        '.endl FF',
      ].join('\n');
      const resolver: IncludeResolver = async () => libContent;
      const result = await preprocess(`.lib 'models.lib' TT\n.op`, resolver);
      expect(result).toContain('VTO=0.5');
      expect(result).not.toContain('VTO=0.4');
    });

    it('includes unconditional content outside sections', async () => {
      const libContent = [
        '* Shared content',
        '.param vdd = 1.8',
        '.lib TT',
        '.model nch nmos(VTO=0.5)',
        '.endl TT',
      ].join('\n');
      const resolver: IncludeResolver = async () => libContent;
      const result = await preprocess(`.lib 'models.lib' TT\n.op`, resolver);
      expect(result).toContain('VTO=0.5');
    });

    it('handles .lib with section containing .include', async () => {
      const topLib = [
        '.lib TT',
        `.include 'tt-models.lib'`,
        '.endl TT',
      ].join('\n');
      const resolver: IncludeResolver = async (path) => {
        if (path === 'top.lib') return topLib;
        if (path === 'tt-models.lib') return '.model nch nmos(VTO=0.5)';
        throw new Error(`Unknown: ${path}`);
      };
      const result = await preprocess(`.lib 'top.lib' TT\n.op`, resolver);
      expect(result).toContain('VTO=0.5');
    });

    it('detects circular .lib references', async () => {
      const resolver: IncludeResolver = async (path) => {
        if (path === 'a.lib') return `.lib TT\n.lib 'b.lib' TT\n.endl TT`;
        if (path === 'b.lib') return `.lib TT\n.lib 'a.lib' TT\n.endl TT`;
        throw new Error(`Unknown: ${path}`);
      };
      await expect(preprocess(`.lib 'a.lib' TT\n.op`, resolver))
        .rejects.toThrow('Circular dependency detected');
    });

    it('throws when resolver not provided for .lib with file', async () => {
      await expect(preprocess(`.lib 'models.lib' TT\n.op`))
        .rejects.toThrow();
    });
  });
```

- [ ] **Step 2: Run tests to verify new tests fail**

Run: `cd packages/core && npx vitest run src/parser/preprocessor.test.ts`
Expected: FAIL — `.lib` lines with filenames are not handled

- [ ] **Step 3: Add .lib/.endl handling to preprocessor**

In `packages/core/src/parser/preprocessor.ts`, add handling for `.lib` with two tokens (section start within a file) and `.lib` with a filename + section (fetch + filter). Add this after the `.include` block:

```typescript
    // .lib <filename> <section> — fetch file and extract section
    if (upper.startsWith('.LIB ')) {
      const libTokens = trimmed.slice(5).trim().split(/\s+/);
      if (libTokens.length >= 2) {
        // .lib 'filename' section
        if (!resolver) {
          throw new ParseError(
            '.lib directive with file requires a resolver. Use parseAsync() with a resolveInclude option.',
            0, trimmed,
          );
        }
        let filePath = libTokens.slice(0, -1).join(' ');
        const section = libTokens[libTokens.length - 1];
        // Strip quotes
        if ((filePath.startsWith("'") && filePath.endsWith("'")) ||
            (filePath.startsWith('"') && filePath.endsWith('"'))) {
          filePath = filePath.slice(1, -1);
        }
        const visitKey = `${filePath}:${section}`;
        if (visited.has(visitKey)) {
          throw new CycleError([...chain, visitKey]);
        }
        visited.add(visitKey);
        const content = await resolver(filePath);
        const extracted = extractLibSection(content, section);
        const processed = await preprocessInternal(
          extracted, resolver, visited, [...chain, visitKey], depth + 1,
        );
        visited.delete(visitKey);
        output.push(processed);
        continue;
      }
      // .lib <section> (section start marker within a file) — should not appear
      // at top level in user netlists; these are handled by extractLibSection.
      // If we encounter one here, skip it.
      continue;
    }

    // .endl — skip (handled by extractLibSection)
    if (upper.startsWith('.ENDL')) {
      continue;
    }
```

Add the `extractLibSection` function:

```typescript
function extractLibSection(content: string, section: string): string {
  const lines = content.split('\n');
  const output: string[] = [];
  let currentSection: string | null = null;
  const sectionUpper = section.toUpperCase();

  for (const line of lines) {
    const trimmed = line.trim();
    const upper = trimmed.toUpperCase();

    if (upper.startsWith('.LIB ')) {
      const tokens = trimmed.slice(5).trim().split(/\s+/);
      // .lib SECTION (one token, no filename) — section start
      if (tokens.length === 1) {
        currentSection = tokens[0].toUpperCase();
        continue;
      }
      // .lib 'file' section — this is a nested reference, include if in right section or unconditional
      if (currentSection === null || currentSection === sectionUpper) {
        output.push(line);
      }
      continue;
    }

    if (upper.startsWith('.ENDL')) {
      currentSection = null;
      continue;
    }

    // Include line if unconditional (outside sections) or in the requested section
    if (currentSection === null || currentSection === sectionUpper) {
      output.push(line);
    }
  }

  return output.join('\n');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run src/parser/preprocessor.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/parser/preprocessor.ts packages/core/src/parser/preprocessor.test.ts
git commit -m "feat: add .lib/.endl section selection to preprocessor"
```

---

### Task 7: Parser — `.subckt`/`.ends` Collection

**Files:**
- Modify: `packages/core/src/parser/index.ts`
- Modify: `packages/core/src/circuit.ts`
- Modify: `packages/core/src/parser/parser.test.ts`

- [ ] **Step 1: Write failing tests for .subckt parsing**

Append to `packages/core/src/parser/parser.test.ts`, inside the outer `describe`:

```typescript
  describe('.subckt parsing', () => {
    it('parses a simple subcircuit definition', () => {
      const ckt = parse(`
        .subckt inv in out vdd vss
        M1 out in vdd vdd PMOD
        M2 out in vss vss NMOD
        .ends inv
        .op
      `);
      const compiled = ckt.compile();
      expect(compiled.subcircuits.has('inv')).toBe(true);
      const sub = compiled.subcircuits.get('inv')!;
      expect(sub.ports).toEqual(['in', 'out', 'vdd', 'vss']);
      expect(sub.body).toHaveLength(2);
    });

    it('parses subcircuit with default parameters', () => {
      const ckt = parse(`
        .subckt inv in out vdd vss W=1u L=100n
        M1 out in vdd vdd PMOD W={W}
        .ends inv
        .op
      `);
      const compiled = ckt.compile();
      const sub = compiled.subcircuits.get('inv')!;
      expect(sub.params.W).toBeCloseTo(1e-6);
      expect(sub.params.L).toBeCloseTo(100e-9);
    });

    it('parses .ends without name', () => {
      const ckt = parse(`
        .subckt buf in out
        R1 in out 1k
        .ends
        .op
      `);
      const compiled = ckt.compile();
      expect(compiled.subcircuits.has('buf')).toBe(true);
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core && npx vitest run src/parser/parser.test.ts`
Expected: FAIL — `.subckt` is not handled in `parseDotCommand`; `compiled.subcircuits` doesn't exist

- [ ] **Step 3: Add subcircuit storage to Circuit**

In `packages/core/src/circuit.ts`, add import and storage:

Add to imports:
```typescript
import type { AnalysisCommand, SourceWaveform, ModelParams, SubcktDefinition } from './types.js';
```

Add to `Circuit` class:
```typescript
  private _subcircuits = new Map<string, SubcktDefinition>();

  addSubcircuit(def: SubcktDefinition): void {
    this._subcircuits.set(def.name.toUpperCase(), def);
  }
```

Add `subcircuits` to `CompiledCircuit` interface:
```typescript
export interface CompiledCircuit {
  devices: DeviceModel[];
  nodeCount: number;
  branchCount: number;
  nodeNames: string[];
  nodeIndexMap: Map<string, number>;
  branchNames: string[];
  analyses: AnalysisCommand[];
  models: Map<string, ModelParams>;
  subcircuits: Map<string, SubcktDefinition>;
}
```

Add `subcircuits: this._subcircuits` to the return object in `compile()`:
```typescript
    return {
      devices, nodeCount, branchCount: branchNames.length,
      nodeNames, nodeIndexMap, branchNames,
      analyses: this._analyses, models: this._models,
      subcircuits: this._subcircuits,
    };
```

- [ ] **Step 4: Add .subckt/.ends parsing to parser**

In `packages/core/src/parser/index.ts`, modify `parse()` to collect `.subckt`/`.ends` blocks. Replace the main `parse` function:

```typescript
export function parse(netlist: string): Circuit {
  const lines = tokenizeNetlist(netlist);
  const circuit = new Circuit();

  let subcktCollector: { name: string; ports: string[]; params: Record<string, number>; body: string[]; depth: number } | null = null;

  for (const { tokens, lineNumber, raw } of lines) {
    if (tokens.length === 0) continue;
    const first = tokens[0].toUpperCase();

    try {
      // Inside a .subckt — collect raw lines until .ends
      if (subcktCollector !== null) {
        if (first === '.SUBCKT') {
          subcktCollector.depth++;
          subcktCollector.body.push(raw);
        } else if (first === '.ENDS') {
          if (subcktCollector.depth > 0) {
            subcktCollector.depth--;
            subcktCollector.body.push(raw);
          } else {
            circuit.addSubcircuit({
              name: subcktCollector.name,
              ports: subcktCollector.ports,
              params: subcktCollector.params,
              body: subcktCollector.body,
            });
            subcktCollector = null;
          }
        } else {
          subcktCollector.body.push(raw);
        }
        continue;
      }

      if (first === '.SUBCKT') {
        const subcktName = tokens[1];
        const ports: string[] = [];
        const params: Record<string, number> = {};
        for (let i = 2; i < tokens.length; i++) {
          const eqIdx = tokens[i].indexOf('=');
          if (eqIdx > 0) {
            params[tokens[i].slice(0, eqIdx).toUpperCase()] = parseNumber(tokens[i].slice(eqIdx + 1));
          } else {
            ports.push(tokens[i]);
          }
        }
        subcktCollector = { name: subcktName, ports, params, body: [], depth: 0 };
        continue;
      }

      if (first.startsWith('.')) {
        parseDotCommand(circuit, tokens, lineNumber);
      } else {
        parseDevice(circuit, tokens, lineNumber);
      }
    } catch (e) {
      if (e instanceof ParseError) throw e;
      throw new ParseError((e as Error).message, lineNumber, raw);
    }
  }

  return circuit;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run src/parser/parser.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Run full test suite to check for regressions**

Run: `cd packages/core && npx vitest run`
Expected: All existing tests PASS

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/parser/index.ts packages/core/src/circuit.ts packages/core/src/parser/parser.test.ts
git commit -m "feat: add .subckt/.ends parsing and SubcktDefinition storage"
```

---

### Task 8: Parser — `X` Device Instantiation

**Files:**
- Modify: `packages/core/src/parser/index.ts`
- Modify: `packages/core/src/circuit.ts`
- Modify: `packages/core/src/parser/parser.test.ts`

- [ ] **Step 1: Write failing tests for X device parsing**

Append to `packages/core/src/parser/parser.test.ts`, inside the outer `describe`:

```typescript
  describe('X device parsing', () => {
    it('parses a subcircuit instance', () => {
      const ckt = parse(`
        .subckt res2 a b
        R1 a b 1k
        .ends res2
        X1 1 0 res2
        .op
      `);
      const compiled = ckt.compile();
      // X1 expands to R1 with prefixed nodes
      expect(compiled.devices.length).toBeGreaterThanOrEqual(1);
    });

    it('parses X device with parameter overrides', () => {
      const ckt = parse(`
        .subckt myres a b R=1k
        R1 a b {R}
        .ends myres
        X1 1 0 myres R=2k
        .op
      `);
      const compiled = ckt.compile();
      expect(compiled.devices.length).toBeGreaterThanOrEqual(1);
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core && npx vitest run src/parser/parser.test.ts`
Expected: FAIL — `X` device type not handled in `parseDevice`

- [ ] **Step 3: Add X device parsing and Circuit.addSubcircuitInstance()**

In `packages/core/src/circuit.ts`, add the `addSubcircuitInstance` method and `X` descriptor support:

```typescript
  addSubcircuitInstance(
    name: string,
    ports: string[],
    subcktName: string,
    params?: Record<string, number>,
  ): void {
    for (const p of ports) this.nodeSet.add(p);
    this.descriptors.push({
      type: 'X', name, nodes: ports, modelName: subcktName, params,
    });
  }
```

In `packages/core/src/parser/index.ts`, add `X` case to `parseDevice`:

```typescript
    case 'X': {
      // X<name> <port1> <port2> ... <subcktName> [param=val ...]
      // Find where ports end and subckt name begins:
      // Walk backwards from the end. Tokens with '=' are params.
      // The first non-param token from the right is the subckt name.
      // Everything between tokens[1] and subcktName is port connections.
      let subcktIdx = tokens.length - 1;
      while (subcktIdx > 1 && tokens[subcktIdx].includes('=')) {
        subcktIdx--;
      }
      const subcktName = tokens[subcktIdx];
      const ports = tokens.slice(1, subcktIdx);
      const instanceParams = parseInstanceParams(tokens, subcktIdx + 1);
      circuit.addSubcircuitInstance(name, ports, subcktName, instanceParams);
      break;
    }
```

- [ ] **Step 4: Add subcircuit expansion to compile()**

In `packages/core/src/circuit.ts`, add the expansion logic in the `compile()` method. Add this import at the top of the file:

```typescript
import { evaluateExpression } from './parser/expression.js';
import { tokenizeNetlist, parseNumber } from './parser/tokenizer.js';
```

Add a case for `'X'` in the `compile()` switch statement:

```typescript
        case 'X': {
          const subcktName = desc.modelName!.toUpperCase();
          const subckt = this._subcircuits.get(subcktName);
          if (!subckt) {
            throw new Error(`Undefined subcircuit '${desc.modelName}'`);
          }
          if (desc.nodes.length !== subckt.ports.length) {
            throw new Error(
              `Subcircuit '${subckt.name}' expects ${subckt.ports.length} ports, got ${desc.nodes.length}`,
            );
          }
          const expanded = expandSubcircuit(
            desc.name, desc.nodes, subckt, desc.params ?? {},
            this._subcircuits, this._models, 0,
          );
          for (const exp of expanded.devices) {
            // Re-resolve node indices for expanded devices
            const nodeIdxs = exp.nodes.map((n: string) => {
              if (n === GROUND_NODE) return -1;
              if (!nodeIndexMap.has(n)) {
                const idx = nodeCount + expandedNodeCount;
                expandedNodeCount++;
                nodeIndexMap.set(n, idx);
                nodeNames.push(n);
              }
              return nodeIndexMap.get(n)!;
            });
            // Instantiate the device using the same logic as top-level devices
            instantiateDevice(exp, nodeIdxs, devices, exp.models, this._models, branchNames, branchIndexRef);
          }
          break;
        }
```

This requires significant restructuring of `compile()` — the node count needs to be dynamic, and device instantiation needs to be factored out. Here is the full approach:

Add before the `compile()` method, a helper type and function:

```typescript
interface ExpandedDevice {
  type: string;
  name: string;
  nodes: string[];
  value?: number;
  waveform?: Partial<SourceWaveform> & { dc?: number };
  modelName?: string;
  params?: Record<string, number>;
  models: Map<string, ModelParams>;
}

interface ExpandedResult {
  devices: ExpandedDevice[];
}

function expandSubcircuit(
  instanceName: string,
  connectedPorts: string[],
  subckt: SubcktDefinition,
  instanceParams: Record<string, number>,
  allSubckts: Map<string, SubcktDefinition>,
  globalModels: Map<string, ModelParams>,
  depth: number,
): ExpandedResult {
  if (depth > 64) {
    throw new Error(`Subcircuit expansion depth exceeded for '${instanceName}'`);
  }

  // Merge params: subckt defaults + instance overrides
  const mergedParams: Record<string, number> = { ...subckt.params };
  for (const [k, v] of Object.entries(instanceParams)) {
    mergedParams[k.toUpperCase()] = v;
  }

  // Build port mapping: subckt port name -> connected node name
  const portMap = new Map<string, string>();
  for (let i = 0; i < subckt.ports.length; i++) {
    portMap.set(subckt.ports[i].toUpperCase(), connectedPorts[i]);
  }

  // Substitute params and map nodes in body lines
  const localModels = new Map<string, ModelParams>();
  const devices: ExpandedDevice[] = [];

  for (let rawLine of subckt.body) {
    // Substitute {expr} with merged params
    rawLine = rawLine.replace(/\{([^}]+)\}/g, (_m, expr: string) => {
      const value = evaluateExpression(expr, mergedParams);
      return Number.isInteger(value) ? value.toString() :
        (Math.abs(value) < 1e-3 || Math.abs(value) >= 1e6) ? value.toExponential() : value.toString();
    });

    const trimmed = rawLine.trim();
    if (trimmed === '' || trimmed.startsWith('*') || trimmed.startsWith(';')) continue;

    const upper = trimmed.toUpperCase();

    // .model inside subcircuit — local model
    if (upper.startsWith('.MODEL ')) {
      const normalized = trimmed.replace(/\(/g, ' ( ').replace(/\)/g, ' ) ').replace(/,/g, ' ');
      const tokens = normalized.split(/\s+/).filter(t => t.length > 0);
      // parseModelCard is imported at the top of circuit.ts (static ESM import)
      const model = parseModelCard(tokens, 0);
      localModels.set(model.name, model);
      continue;
    }

    // .param inside subcircuit — evaluate and add to mergedParams
    if (upper.startsWith('.PARAM ')) {
      const paramContent = trimmed.slice(7).trim();
      const eqIdx = paramContent.indexOf('=');
      if (eqIdx > 0) {
        const name = paramContent.slice(0, eqIdx).trim().toUpperCase();
        let valStr = paramContent.slice(eqIdx + 1).trim();
        if (valStr.startsWith('{') && valStr.endsWith('}')) {
          valStr = valStr.slice(1, -1);
        }
        try {
          mergedParams[name] = evaluateExpression(valStr, mergedParams);
        } catch {
          mergedParams[name] = parseNumber(valStr);
        }
      }
      continue;
    }

    // Skip other dot commands
    if (trimmed.startsWith('.')) continue;

    // Parse device line
    const normalized = trimmed.replace(/\(/g, ' ( ').replace(/\)/g, ' ) ').replace(/,/g, ' ');
    const tokens = normalized.split(/\s+/).filter(t => t.length > 0);
    if (tokens.length === 0) continue;

    const devName = `${instanceName}.${tokens[0]}`;
    const devType = tokens[0][0].toUpperCase();

    // Map node names: port nodes -> connected nodes, internal -> prefixed
    const mapNode = (nodeName: string): string => {
      if (nodeName === GROUND_NODE) return GROUND_NODE;
      const upperNode = nodeName.toUpperCase();
      // Check if this is a port
      if (portMap.has(upperNode)) return portMap.get(upperNode)!;
      // Internal node — prefix with instance name
      return `${instanceName}.${nodeName}`;
    };

    // Build expanded device descriptor based on type
    // (mirrors parseDevice logic but with node mapping)
    switch (devType) {
      case 'R':
        devices.push({
          type: 'R', name: devName,
          nodes: [mapNode(tokens[1]), mapNode(tokens[2])],
          value: parseNumber(tokens[3]), models: localModels,
        });
        break;
      case 'C':
        devices.push({
          type: 'C', name: devName,
          nodes: [mapNode(tokens[1]), mapNode(tokens[2])],
          value: parseNumber(tokens[3]), models: localModels,
        });
        break;
      case 'L':
        devices.push({
          type: 'L', name: devName,
          nodes: [mapNode(tokens[1]), mapNode(tokens[2])],
          value: parseNumber(tokens[3]), models: localModels,
        });
        break;
      case 'V': {
        // Parse waveform from remaining tokens (reuse parseSourceWaveform from parser)
        // parseSourceWaveform is imported at the top of circuit.ts
        const vWaveform = parseSourceWaveform(tokens, 3);
        devices.push({
          type: 'V', name: devName,
          nodes: [mapNode(tokens[1]), mapNode(tokens[2])],
          waveform: vWaveform, models: localModels,
        });
        break;
      }
      case 'I': {
        const iWaveform = parseSourceWaveform(tokens, 3);
        devices.push({
          type: 'I', name: devName,
          nodes: [mapNode(tokens[1]), mapNode(tokens[2])],
          waveform: iWaveform, models: localModels,
        });
        break;
      }
      case 'D':
        devices.push({
          type: 'D', name: devName,
          nodes: [mapNode(tokens[1]), mapNode(tokens[2])],
          modelName: tokens[3], models: localModels,
        });
        break;
      case 'Q':
        devices.push({
          type: 'Q', name: devName,
          nodes: [mapNode(tokens[1]), mapNode(tokens[2]), mapNode(tokens[3])],
          modelName: tokens[4], models: localModels,
        });
        break;
      case 'M': {
        let modelName: string;
        let instanceParamStart: number;
        let bulkNode: string | undefined;
        if (tokens[5] && !tokens[5].includes('=')) {
          bulkNode = mapNode(tokens[4]);
          modelName = tokens[5];
          instanceParamStart = 6;
        } else {
          modelName = tokens[4];
          instanceParamStart = 5;
        }
        const mParams: Record<string, number> = {};
        for (let i = instanceParamStart; i < tokens.length; i++) {
          const eqI = tokens[i].indexOf('=');
          if (eqI > 0) {
            mParams[tokens[i].slice(0, eqI).toUpperCase()] = parseNumber(tokens[i].slice(eqI + 1));
          }
        }
        const mNodes = bulkNode
          ? [mapNode(tokens[1]), mapNode(tokens[2]), mapNode(tokens[3]), bulkNode]
          : [mapNode(tokens[1]), mapNode(tokens[2]), mapNode(tokens[3])];
        devices.push({
          type: 'M', name: devName, nodes: mNodes,
          modelName, params: mParams, models: localModels,
        });
        break;
      }
      case 'X': {
        // Nested subcircuit instantiation
        let subIdx = tokens.length - 1;
        while (subIdx > 1 && tokens[subIdx].includes('=')) subIdx--;
        const nestedSubcktName = tokens[subIdx].toUpperCase();
        const nestedPorts = tokens.slice(1, subIdx).map(mapNode);
        const nestedParams: Record<string, number> = {};
        for (let i = subIdx + 1; i < tokens.length; i++) {
          const eqI = tokens[i].indexOf('=');
          if (eqI > 0) {
            nestedParams[tokens[i].slice(0, eqI).toUpperCase()] = parseNumber(tokens[i].slice(eqI + 1));
          }
        }
        const nestedSubckt = allSubckts.get(nestedSubcktName);
        if (!nestedSubckt) {
          throw new Error(`Undefined subcircuit '${tokens[subIdx]}'`);
        }
        const nested = expandSubcircuit(
          devName, nestedPorts, nestedSubckt, nestedParams,
          allSubckts, globalModels, depth + 1,
        );
        devices.push(...nested.devices);
        break;
      }
    }
  }

  return { devices };
}
```

**Important:** `circuit.ts` needs new static ESM imports for subcircuit expansion:

```typescript
import { parseModelCard } from './parser/model-parser.js';
import { parseSourceWaveform } from './parser/index.js';
```

`parseSourceWaveform` is currently a private function in `parser/index.ts` — it must be exported so `circuit.ts` can reuse it for parsing waveforms inside subcircuit bodies.

In `packages/core/src/parser/index.ts`, add `export` to `parseSourceWaveform`:
```typescript
export function parseSourceWaveform(tokens: string[], startIdx: number): SourceWaveform {
```

The device instantiation function (factored from compile) handles creating DeviceModel objects from ExpandedDevice descriptors. This is a refactor of the existing switch statement in `compile()` — extract it into a helper so both top-level and expanded devices use the same logic.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run src/parser/parser.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Run full test suite**

Run: `cd packages/core && npx vitest run`
Expected: All existing tests PASS

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/parser/index.ts packages/core/src/circuit.ts packages/core/src/parser/parser.test.ts
git commit -m "feat: add X device parsing and subcircuit expansion in compile()"
```

---

### Task 9: Subcircuit Expansion — Detailed Tests

**Files:**
- Modify: `packages/core/src/circuit.test.ts`

- [ ] **Step 1: Write tests for subcircuit expansion details**

Append to `packages/core/src/circuit.test.ts`, inside the outer `describe`:

```typescript
  describe('subcircuit expansion', () => {
    it('expands a simple subcircuit with correct nodes', () => {
      const ckt = new Circuit();
      ckt.addModel({ name: 'RMOD', type: 'R', params: {} });
      ckt.addSubcircuit({
        name: 'mydiv',
        ports: ['a', 'b'],
        params: {},
        body: ['R1 a b 1k'],
      });
      ckt.addSubcircuitInstance('X1', ['1', '0'], 'mydiv');
      ckt.addVoltageSource('V1', '1', '0', { dc: 5 });
      ckt.addAnalysis('op');
      const compiled = ckt.compile();
      // Should have V1 + expanded R1
      expect(compiled.devices).toHaveLength(2);
    });

    it('prefixes internal nodes', () => {
      const ckt = new Circuit();
      ckt.addSubcircuit({
        name: 'buf',
        ports: ['in', 'out'],
        params: {},
        body: ['R1 in mid 1k', 'R2 mid out 1k'],
      });
      ckt.addSubcircuitInstance('X1', ['1', '2'], 'buf');
      ckt.addVoltageSource('V1', '1', '0', { dc: 5 });
      ckt.addResistor('RL', '2', '0', 1e3);
      ckt.addAnalysis('op');
      const compiled = ckt.compile();
      expect(compiled.nodeNames).toContain('X1.mid');
    });

    it('never prefixes ground node', () => {
      const ckt = new Circuit();
      ckt.addSubcircuit({
        name: 'grounded',
        ports: ['a'],
        params: {},
        body: ['R1 a 0 1k'],
      });
      ckt.addSubcircuitInstance('X1', ['1'], 'grounded');
      ckt.addVoltageSource('V1', '1', '0', { dc: 5 });
      ckt.addAnalysis('op');
      const compiled = ckt.compile();
      expect(compiled.nodeNames).not.toContain('X1.0');
    });

    it('applies parameter overrides', () => {
      const ckt = new Circuit();
      ckt.addSubcircuit({
        name: 'paramres',
        ports: ['a', 'b'],
        params: { R: 1000 },
        body: ['R1 a b {R}'],
      });
      ckt.addSubcircuitInstance('X1', ['1', '0'], 'paramres', { R: 2000 });
      ckt.addVoltageSource('V1', '1', '0', { dc: 5 });
      ckt.addAnalysis('op');
      const compiled = ckt.compile();
      expect(compiled.devices).toHaveLength(2);
    });

    it('throws on undefined subcircuit', () => {
      const ckt = new Circuit();
      ckt.addSubcircuitInstance('X1', ['1', '0'], 'nonexistent');
      ckt.addVoltageSource('V1', '1', '0', { dc: 5 });
      ckt.addAnalysis('op');
      expect(() => ckt.compile()).toThrow("Undefined subcircuit 'nonexistent'");
    });

    it('throws on wrong port count', () => {
      const ckt = new Circuit();
      ckt.addSubcircuit({
        name: 'twoport',
        ports: ['a', 'b'],
        params: {},
        body: ['R1 a b 1k'],
      });
      ckt.addSubcircuitInstance('X1', ['1', '2', '3'], 'twoport');
      ckt.addVoltageSource('V1', '1', '0', { dc: 5 });
      ckt.addAnalysis('op');
      expect(() => ckt.compile()).toThrow('expects 2 ports, got 3');
    });

    it('handles nested subcircuit expansion', () => {
      const ckt = new Circuit();
      ckt.addSubcircuit({
        name: 'inner',
        ports: ['a', 'b'],
        params: {},
        body: ['R1 a b 1k'],
      });
      ckt.addSubcircuit({
        name: 'outer',
        ports: ['x', 'y'],
        params: {},
        body: ['X1 x mid inner', 'X2 mid y inner'],
      });
      ckt.addSubcircuitInstance('X0', ['1', '0'], 'outer');
      ckt.addVoltageSource('V1', '1', '0', { dc: 5 });
      ckt.addAnalysis('op');
      const compiled = ckt.compile();
      // Two resistors from nested expansion
      expect(compiled.devices.filter(d => d.name.startsWith('X0.')).length).toBe(2);
      expect(compiled.nodeNames).toContain('X0.mid');
    });

    it('scopes local .model to subcircuit', () => {
      const ckt = new Circuit();
      ckt.addSubcircuit({
        name: 'withmodel',
        ports: ['a', 'b'],
        params: {},
        body: [
          '.model DLOCAL D(IS=1e-14)',
          'D1 a b DLOCAL',
        ],
      });
      ckt.addSubcircuitInstance('X1', ['1', '0'], 'withmodel');
      ckt.addVoltageSource('V1', '1', '0', { dc: 0.7 });
      ckt.addAnalysis('op');
      const compiled = ckt.compile();
      expect(compiled.devices).toHaveLength(2); // V1 + D1
    });
  });
```

Add `SubcktDefinition` to the imports from types if not already present.

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run src/circuit.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/circuit.test.ts
git commit -m "test: add comprehensive subcircuit expansion tests"
```

---

### Task 10: `parseAsync()` and `preprocess` Export

**Files:**
- Modify: `packages/core/src/parser/index.ts`
- Modify: `packages/core/src/parser/parser.test.ts`

- [ ] **Step 1: Write failing tests for parseAsync**

Append to `packages/core/src/parser/parser.test.ts`, inside the outer `describe`:

```typescript
  describe('parseAsync', () => {
    it('parses a simple netlist without resolver', async () => {
      const ckt = await parseAsync(`
        V1 1 0 DC 5
        R1 1 0 1k
        .op
      `);
      const compiled = ckt.compile();
      expect(compiled.devices).toHaveLength(2);
    });

    it('resolves .include with resolver', async () => {
      const resolver = async (path: string) => {
        if (path === 'models.lib') return '.model DMOD D(IS=1e-14)';
        throw new Error(`Unknown: ${path}`);
      };
      const ckt = await parseAsync(`
        .include 'models.lib'
        V1 1 0 DC 0.7
        D1 1 0 DMOD
        .op
      `, resolver);
      const compiled = ckt.compile();
      expect(compiled.models.has('DMOD')).toBe(true);
    });

    it('throws ParseError on .include without resolver in sync parse', () => {
      expect(() => parse(`.include 'models.lib'\n.op`)).toThrow();
    });

    it('throws ParseError on .lib with file without resolver in sync parse', () => {
      expect(() => parse(`.lib 'models.lib' TT\n.op`)).toThrow();
    });
  });
```

Add `parseAsync` to imports at the top of the test file:

```typescript
import { parse, parseAsync } from './index.js';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core && npx vitest run src/parser/parser.test.ts`
Expected: FAIL — `parseAsync` not exported

- [ ] **Step 3: Implement parseAsync and sync parse guards**

In `packages/core/src/parser/index.ts`, add imports and the new function:

```typescript
import { preprocess } from './preprocessor.js';
import type { IncludeResolver } from '../types.js';

export async function parseAsync(
  netlist: string,
  resolver?: IncludeResolver,
): Promise<Circuit> {
  const preprocessed = await preprocess(netlist, resolver);
  return parse(preprocessed);
}
```

Add guards in the existing `parseDotCommand` for `.include` and `.lib` with file:

```typescript
    case '.INCLUDE':
      throw new ParseError(
        '.include directive requires async parsing. Use parseAsync() with a resolveInclude option.',
        lineNumber, tokens.join(' '),
      );
    case '.LIB':
      if (tokens.length >= 3) {
        throw new ParseError(
          '.lib directive with file requires async parsing. Use parseAsync() with a resolveInclude option.',
          lineNumber, tokens.join(' '),
        );
      }
      break;
```

Add these cases before the `default` in `parseDotCommand`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run src/parser/parser.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/parser/index.ts packages/core/src/parser/parser.test.ts
git commit -m "feat: add parseAsync() with preprocessor integration"
```

---

### Task 11: Wire `resolveInclude` into `simulate()`

**Files:**
- Modify: `packages/core/src/simulate.ts`
- Modify: `packages/core/src/simulate.test.ts`
- Modify: `packages/core/src/types.ts`

- [ ] **Step 1: Write failing test for simulate with resolver**

Append to `packages/core/src/simulate.test.ts`, inside the outer `describe`:

```typescript
  it('simulates with .include resolved via resolveInclude', async () => {
    const result = await simulate(
      `.include 'divider.lib'\n.op`,
      {
        resolveInclude: async (path) => {
          if (path === 'divider.lib') {
            return 'V1 1 0 DC 5\nR1 1 2 1k\nR2 2 0 2k';
          }
          throw new Error(`Unknown: ${path}`);
        },
      },
    );
    expect(result.dc).toBeDefined();
    expect(result.dc!.voltage('2')).toBeCloseTo(10 / 3, 6);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run src/simulate.test.ts`
Expected: FAIL — `resolveInclude` not recognized or `.include` throws

- [ ] **Step 3: Add resolveInclude to SimulationOptions**

In `packages/core/src/types.ts`, add to `SimulationOptions`:

```typescript
  /** Resolver for .include and .lib file directives */
  resolveInclude?: IncludeResolver;
```

- [ ] **Step 4: Wire into simulate()**

In `packages/core/src/simulate.ts`, add the import and modify the string parsing branch:

```typescript
import { parseAsync } from './parser/index.js';
```

Change the `simulate` function:

```typescript
export async function simulate(
  input: string | Circuit,
  options?: SimulationOptions,
): Promise<SimulationResult> {
  let circuit: Circuit;
  if (typeof input === 'string') {
    if (options?.resolveInclude) {
      circuit = await parseAsync(input, options.resolveInclude);
    } else {
      circuit = parse(input);
    }
  } else {
    circuit = input;
  }
  const compiled = circuit.compile();
  // ... rest unchanged
```

Do the same for `simulateStream`:

```typescript
export async function* simulateStream(
  input: string | Circuit,
  options?: SimulationOptions,
): AsyncIterableIterator<TransientStep | ACPoint> {
  let circuit: Circuit;
  if (typeof input === 'string') {
    if (options?.resolveInclude) {
      circuit = await parseAsync(input, options.resolveInclude);
    } else {
      circuit = parse(input);
    }
  } else {
    circuit = input;
  }
  // ... rest unchanged
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run src/simulate.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Run full test suite**

Run: `cd packages/core && npx vitest run`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/simulate.ts packages/core/src/simulate.test.ts packages/core/src/types.ts
git commit -m "feat: wire resolveInclude into simulate() and simulateStream()"
```

---

### Task 12: Public Exports

**Files:**
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Add new exports**

In `packages/core/src/index.ts`, add:

```typescript
export { parseAsync } from './parser/index.js';
export { preprocess } from './parser/preprocessor.js';
export type { SubcktDefinition, IncludeResolver } from './types.js';
export { CycleError } from './errors.js';
```

- [ ] **Step 2: Verify build succeeds**

Run: `cd packages/core && npx tsup`
Expected: Build succeeds, ESM + CJS outputs

- [ ] **Step 3: Verify full test suite passes**

Run: `cd packages/core && npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat: export parseAsync, preprocess, CycleError, SubcktDefinition, IncludeResolver"
```

---

### Task 13: End-to-End Integration Tests

**Files:**
- Create: `packages/core/src/subcircuit-integration.test.ts`

- [ ] **Step 1: Write end-to-end integration tests**

In `packages/core/src/subcircuit-integration.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { simulate, parseAsync } from './index.js';
import type { IncludeResolver } from './index.js';

describe('subcircuit integration (end-to-end)', () => {
  it('simulates a resistor divider defined as a subcircuit', async () => {
    const result = await simulate(`
      .subckt divider in out gnd
      R1 in out 1k
      R2 out gnd 2k
      .ends divider
      V1 1 0 DC 5
      X1 1 2 0 divider
      .op
    `);
    expect(result.dc).toBeDefined();
    expect(result.dc!.voltage('2')).toBeCloseTo(10 / 3, 4);
  });

  it('simulates nested subcircuits (buffer = 2 inverters)', async () => {
    const result = await simulate(`
      .subckt res_half in out
      R1 in out 1k
      .ends res_half
      .subckt res_chain in out
      X1 in mid res_half
      X2 mid out res_half
      .ends res_chain
      V1 1 0 DC 10
      X0 1 2 res_chain
      R_load 2 0 2k
      .op
    `);
    expect(result.dc).toBeDefined();
    // 2k series (1k+1k from chain) with 2k to ground -> V(2) = 10 * 2k / (2k+2k) = 5
    expect(result.dc!.voltage('2')).toBeCloseTo(5, 4);
  });

  it('simulates with .lib corner selection', async () => {
    const libContent = [
      '.lib TT',
      '.subckt myres a b',
      'R1 a b 1k',
      '.ends myres',
      '.endl TT',
      '.lib FF',
      '.subckt myres a b',
      'R1 a b 500',
      '.ends myres',
      '.endl FF',
    ].join('\n');

    const resolver: IncludeResolver = async () => libContent;

    const resultTT = await simulate(
      `.lib 'corners.lib' TT\nV1 1 0 DC 5\nX1 1 2 myres\nR2 2 0 1k\n.op`,
      { resolveInclude: resolver },
    );
    // TT: 1k + 1k divider -> V(2) = 2.5
    expect(resultTT.dc!.voltage('2')).toBeCloseTo(2.5, 4);

    const resultFF = await simulate(
      `.lib 'corners.lib' FF\nV1 1 0 DC 5\nX1 1 2 myres\nR2 2 0 1k\n.op`,
      { resolveInclude: resolver },
    );
    // FF: 500 + 1k divider -> V(2) = 5 * 1k / 1.5k ≈ 3.333
    expect(resultFF.dc!.voltage('2')).toBeCloseTo(10 / 3, 4);
  });

  it('simulates with .include and .param', async () => {
    const resolver: IncludeResolver = async (path) => {
      if (path === 'params.lib') return '.param rval = 2k';
      throw new Error(`Unknown: ${path}`);
    };

    const result = await simulate(
      `.include 'params.lib'\nV1 1 0 DC 5\nR1 1 2 {rval}\nR2 2 0 {rval}\n.op`,
      { resolveInclude: resolver },
    );
    expect(result.dc!.voltage('2')).toBeCloseTo(2.5, 4);
  });

  it('simulates subcircuit with parameterized devices', async () => {
    const result = await simulate(`
      .subckt paramres a b R=1k
      R1 a b {R}
      .ends paramres
      V1 1 0 DC 10
      X1 1 2 paramres R=2k
      X2 2 0 paramres R=3k
      .op
    `);
    expect(result.dc).toBeDefined();
    // 2k + 3k divider: V(2) = 10 * 3k / 5k = 6
    expect(result.dc!.voltage('2')).toBeCloseTo(6, 4);
  });

  it('full flow: include -> lib section -> subckt -> simulation', async () => {
    const files: Record<string, string> = {
      'top.lib': `.lib TT\n.include 'models-tt.lib'\n.endl TT`,
      'models-tt.lib': [
        '.subckt divider in out gnd R1VAL=1k R2VAL=2k',
        'R1 in out {R1VAL}',
        'R2 out gnd {R2VAL}',
        '.ends divider',
      ].join('\n'),
    };
    const resolver: IncludeResolver = async (path) => {
      if (path in files) return files[path];
      throw new Error(`Unknown file: ${path}`);
    };

    const result = await simulate(
      `.lib 'top.lib' TT\nV1 1 0 DC 9\nX1 1 2 0 divider R1VAL=1k R2VAL=2k\n.op`,
      { resolveInclude: resolver },
    );
    expect(result.dc!.voltage('2')).toBeCloseTo(6, 4);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run src/subcircuit-integration.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 3: Run the full test suite**

Run: `cd packages/core && npx vitest run`
Expected: All tests PASS, no regressions

- [ ] **Step 4: Verify build**

Run: `cd packages/core && npx tsup && npx tsc --noEmit`
Expected: Build and type-check succeed

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/subcircuit-integration.test.ts
git commit -m "test: add end-to-end integration tests for subcircuit and lib support"
```

---

### Task 14: Final Verification & Cleanup

**Files:**
- All modified files

- [ ] **Step 1: Run the complete test suite**

Run: `cd packages/core && npx vitest run`
Expected: All tests PASS

- [ ] **Step 2: Run type checking**

Run: `cd packages/core && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Run build**

Run: `cd packages/core && npx tsup`
Expected: Build succeeds, ESM + CJS outputs generated

- [ ] **Step 4: Run existing accuracy benchmarks to check for regressions**

Run: `cd packages/core && npx vitest run src/accuracy.test.ts`
Expected: All accuracy tests PASS

- [ ] **Step 5: Commit any cleanup**

If any cleanup was needed during verification:

```bash
git add -A
git commit -m "chore: cleanup after lib/subckt implementation"
```
