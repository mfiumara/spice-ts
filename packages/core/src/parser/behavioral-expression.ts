import { ParseError } from '../errors.js';
import { parseNumber } from './tokenizer.js';

/**
 * Bounded ngspice B-source (`ASRC`) expression support.
 *
 * Supported: numbers with SPICE scale factors, `v(node)`, `v(node1,node2)`,
 * unary `+`/`-`, binary `+ - * /`, parentheses, and the functions listed in
 * {@link BEHAVIORAL_FUNCTIONS}, evaluated like ngspice `ptfuncs.c`.
 * Everything else (branch currents, `time`, parameters, powers, comparisons,
 * ternaries, `V=` sources, instance parameters) is rejected explicitly.
 */
export type BehavioralFunction =
  | 'tanh' | 'exp' | 'sinh' | 'cosh' | 'atan' | 'sin' | 'cos' | 'abs';

export type BehavioralExpression =
  | { kind: 'number'; value: number }
  | { kind: 'voltage'; positive: string; negative?: string }
  | { kind: 'negate'; operand: BehavioralExpression }
  | { kind: 'binary'; op: '+' | '-' | '*' | '/'; left: BehavioralExpression; right: BehavioralExpression }
  | { kind: 'call'; name: BehavioralFunction; argument: BehavioralExpression };

export const BEHAVIORAL_FUNCTIONS: readonly BehavioralFunction[] = [
  'tanh', 'exp', 'sinh', 'cosh', 'atan', 'sin', 'cos', 'abs',
];

export interface BehavioralSourceCard {
  name: string;
  nodes: [string, string];
  expression: BehavioralExpression;
}

const GROUND = '0';
const NUMBER = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?[a-zA-Z]*/;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*/;
const NODE_NAME = /^[^\s(),]+/;
const B_CARD = /^(\S+)\s+([^\s(),=]+)\s+([^\s(),=]+)\s*(.*)$/;
const CURRENT_ASSIGNMENT = /^i\s*=\s*([\s\S]+)$/i;

class ExpressionError extends Error {}

export function parseBehavioralSourceCard(raw: string, lineNumber: number): BehavioralSourceCard {
  const card = B_CARD.exec(raw.trim());
  if (!card || card[4] === '') {
    throw new ParseError('B-card requires two nodes and an I= expression', lineNumber, raw);
  }
  const assignment = CURRENT_ASSIGNMENT.exec(card[4]);
  if (!assignment) {
    throw new ParseError(
      "Unsupported behavioral source form: only 'I=<expression>' is supported",
      lineNumber,
      raw,
    );
  }
  try {
    return {
      name: card[1],
      nodes: [card[2], card[3]],
      expression: parseBehavioralExpression(assignment[1]),
    };
  } catch (error) {
    if (error instanceof ExpressionError) throw new ParseError(error.message, lineNumber, raw);
    throw error;
  }
}

export function parseBehavioralExpression(text: string): BehavioralExpression {
  const parser = new Parser(text);
  const expression = parser.parseSum();
  parser.expectEnd();
  return expression;
}

class Parser {
  private position = 0;

  constructor(private readonly source: string) {}

  parseSum(): BehavioralExpression {
    let left = this.parseProduct();
    for (;;) {
      const op = this.peek();
      if (op !== '+' && op !== '-') return left;
      this.position++;
      left = { kind: 'binary', op, left, right: this.parseProduct() };
    }
  }

  private parseProduct(): BehavioralExpression {
    let left = this.parseUnary();
    for (;;) {
      const op = this.peek();
      if (op !== '*' && op !== '/') return left;
      this.position++;
      left = { kind: 'binary', op, left, right: this.parseUnary() };
    }
  }

  private parseUnary(): BehavioralExpression {
    const op = this.peek();
    if (op === '-') {
      this.position++;
      return { kind: 'negate', operand: this.parseUnary() };
    }
    if (op === '+') {
      this.position++;
      return this.parseUnary();
    }
    return this.parsePrimary();
  }

  private parsePrimary(): BehavioralExpression {
    const next = this.peek();
    if (next === undefined) throw new ExpressionError('Unexpected end of behavioral expression');
    if (next === '(') {
      this.position++;
      const inner = this.parseSum();
      this.expect(')');
      return inner;
    }
    const rest = this.source.slice(this.position);
    const number = NUMBER.exec(rest);
    if (number) {
      this.position += number[0].length;
      return { kind: 'number', value: parseNumber(number[0]) };
    }
    const identifier = IDENTIFIER.exec(rest);
    if (identifier) {
      this.position += identifier[0].length;
      const name = identifier[0].toLowerCase();
      if (this.peek() !== '(') {
        throw new ExpressionError(`Unsupported behavioral expression token '${identifier[0]}'`);
      }
      this.position++;
      if (name === 'v') return this.parseVoltage();
      if (!(BEHAVIORAL_FUNCTIONS as readonly string[]).includes(name)) {
        throw new ExpressionError(`Unsupported behavioral expression function '${identifier[0]}'`);
      }
      const argument = this.parseSum();
      this.expect(')');
      return { kind: 'call', name: name as BehavioralFunction, argument };
    }
    throw new ExpressionError(`Unsupported behavioral expression operator '${next}'`);
  }

  private parseVoltage(): BehavioralExpression {
    const nodes: string[] = [];
    for (;;) {
      this.skipWhitespace();
      const node = NODE_NAME.exec(this.source.slice(this.position));
      if (!node) throw new ExpressionError('v() takes one or two node names');
      nodes.push(node[0]);
      this.position += node[0].length;
      const separator = this.peek();
      if (separator === ',') {
        this.position++;
        continue;
      }
      if (separator === ')') {
        this.position++;
        break;
      }
      throw new ExpressionError('v() takes one or two node names');
    }
    if (nodes.length > 2) throw new ExpressionError('v() takes one or two node names');
    return nodes.length === 1
      ? { kind: 'voltage', positive: nodes[0] }
      : { kind: 'voltage', positive: nodes[0], negative: nodes[1] };
  }

  expectEnd(): void {
    const next = this.peek();
    if (next === undefined) return;
    const token = /^[A-Za-z_][A-Za-z0-9_]*/.exec(this.source.slice(this.position));
    if (token) throw new ExpressionError(`Unsupported behavioral expression token '${token[0]}'`);
    if (next === ')') throw new ExpressionError("Unbalanced ')' in behavioral expression");
    throw new ExpressionError(`Unsupported behavioral expression operator '${next}'`);
  }

  private expect(char: string): void {
    if (this.peek() !== char) throw new ExpressionError(`Expected '${char}' in behavioral expression`);
    this.position++;
  }

  private peek(): string | undefined {
    this.skipWhitespace();
    return this.position < this.source.length ? this.source[this.position] : undefined;
  }

  private skipWhitespace(): void {
    while (this.position < this.source.length && /\s/.test(this.source[this.position])) {
      this.position++;
    }
  }
}

/** Rename every node referenced by `v()` (ground stays ground). */
export function mapBehavioralNodes(
  expression: BehavioralExpression,
  mapNode: (node: string) => string,
): BehavioralExpression {
  const map = (node: string) => (node === GROUND ? GROUND : mapNode(node));
  switch (expression.kind) {
    case 'number':
      return expression;
    case 'voltage':
      return expression.negative === undefined
        ? { kind: 'voltage', positive: map(expression.positive) }
        : { kind: 'voltage', positive: map(expression.positive), negative: map(expression.negative) };
    case 'negate':
      return { kind: 'negate', operand: mapBehavioralNodes(expression.operand, mapNode) };
    case 'binary':
      return {
        ...expression,
        left: mapBehavioralNodes(expression.left, mapNode),
        right: mapBehavioralNodes(expression.right, mapNode),
      };
    case 'call':
      return { ...expression, argument: mapBehavioralNodes(expression.argument, mapNode) };
  }
}

/** Render an expression back to ngspice syntax (used by netlist serialisation). */
export function formatBehavioralExpression(expression: BehavioralExpression): string {
  switch (expression.kind) {
    case 'number':
      return String(expression.value);
    case 'voltage':
      return expression.negative === undefined
        ? `v(${expression.positive})`
        : `v(${expression.positive},${expression.negative})`;
    case 'negate':
      return `(-${formatBehavioralExpression(expression.operand)})`;
    case 'binary':
      return `(${formatBehavioralExpression(expression.left)}${expression.op}${formatBehavioralExpression(expression.right)})`;
    case 'call':
      return `${expression.name}(${formatBehavioralExpression(expression.argument)})`;
  }
}

export interface CompiledBehavioralExpression {
  /** Distinct non-ground controlling nodes, in first-reference order. */
  readonly nodes: readonly string[];
  /**
   * Evaluate at the given node voltages (indexed like {@link nodes}); writes
   * d(value)/d(node voltage) into `gradient` and returns the value.
   */
  evaluate(voltages: ArrayLike<number>, gradient: Float64Array): number;
}

type Evaluator = (voltages: ArrayLike<number>, gradient: Float64Array) => number;

// ngspice ifeval.c: PTfudge_factor = gmin * 1e-20 with the default gmin.
const DIVIDE_FUDGE = 1e-12 * 1e-20;
const EXP_LIMIT_ARGUMENT = 227.9559242;
const TWO_PI = 2 * Math.PI;

function modulus(value: number): number {
  return value - Math.trunc(value / TWO_PI) * TWO_PI;
}

function ptExp(value: number): number {
  return value > EXP_LIMIT_ARGUMENT ? 1e99 : Math.exp(value);
}

function functionValue(name: BehavioralFunction, x: number): [number, number] {
  switch (name) {
    case 'tanh': {
      const value = Math.tanh(x);
      return [value, 1 - value * value];
    }
    case 'exp': {
      const value = ptExp(x);
      return [value, value];
    }
    case 'sinh':
      return [Math.sinh(x), Math.cosh(x)];
    case 'cosh':
      return [Math.cosh(x), Math.sinh(x)];
    case 'atan':
      return [Math.atan(x), 1 / (1 + x * x)];
    case 'sin':
      return [Math.sin(modulus(x)), Math.cos(modulus(x))];
    case 'cos':
      return [Math.cos(modulus(x)), -Math.sin(modulus(x))];
    case 'abs':
      return [Math.abs(x), x > 0 ? 1 : x < 0 ? -1 : 0];
  }
}

function divisor(value: number): number {
  return value >= 0 ? value + DIVIDE_FUDGE : value - DIVIDE_FUDGE;
}

export function compileBehavioralExpression(expression: BehavioralExpression): CompiledBehavioralExpression {
  const nodes: string[] = [];
  const slot = (node: string): number => {
    if (node === GROUND) return -1;
    let index = nodes.indexOf(node);
    if (index < 0) {
      index = nodes.length;
      nodes.push(node);
    }
    return index;
  };

  const build = (node: BehavioralExpression): Evaluator => {
    switch (node.kind) {
      case 'number': {
        const { value } = node;
        return (_voltages, gradient) => {
          gradient.fill(0);
          return value;
        };
      }
      case 'voltage': {
        const positive = slot(node.positive);
        const negative = node.negative === undefined ? -1 : slot(node.negative);
        return (voltages, gradient) => {
          gradient.fill(0);
          let value = 0;
          if (positive >= 0) {
            value += voltages[positive];
            gradient[positive] += 1;
          }
          if (negative >= 0) {
            value -= voltages[negative];
            gradient[negative] -= 1;
          }
          return value;
        };
      }
      case 'negate': {
        const operand = build(node.operand);
        return (voltages, gradient) => {
          const value = operand(voltages, gradient);
          for (let i = 0; i < gradient.length; i++) gradient[i] = -gradient[i];
          return -value;
        };
      }
      case 'call': {
        const argument = build(node.argument);
        const { name } = node;
        return (voltages, gradient) => {
          const [value, slope] = functionValue(name, argument(voltages, gradient));
          for (let i = 0; i < gradient.length; i++) gradient[i] *= slope;
          return value;
        };
      }
      case 'binary': {
        const left = build(node.left);
        const right = build(node.right);
        const { op } = node;
        return (voltages, gradient) => {
          const a = left(voltages, gradient);
          const leftGradient = gradient.slice();
          const b = right(voltages, gradient);
          switch (op) {
            case '+':
              for (let i = 0; i < gradient.length; i++) gradient[i] += leftGradient[i];
              return a + b;
            case '-':
              for (let i = 0; i < gradient.length; i++) gradient[i] = leftGradient[i] - gradient[i];
              return a - b;
            case '*':
              for (let i = 0; i < gradient.length; i++) {
                gradient[i] = leftGradient[i] * b + a * gradient[i];
              }
              return a * b;
            case '/': {
              const d = divisor(b);
              for (let i = 0; i < gradient.length; i++) {
                gradient[i] = (leftGradient[i] * d - a * gradient[i]) / (d * d);
              }
              return a / d;
            }
          }
        };
      }
    }
  };

  const root = build(expression);
  return {
    nodes,
    evaluate(voltages, gradient) {
      return root(voltages, gradient);
    },
  };
}
