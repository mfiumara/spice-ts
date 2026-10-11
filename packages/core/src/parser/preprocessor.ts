import { evaluateExpression } from './expression.js';
import { parseNumber } from './tokenizer.js';
import { CycleError, ParseError } from '../errors.js';
import type { IncludeResolver } from '../types.js';
import type { ProtocolExecutionGuard } from '../protocol/execution-guard.js';

const MAX_DEPTH = 64;

/**
 * Preprocess a SPICE netlist: resolve `.include`/`.lib` directives,
 * evaluate `.param` definitions, and substitute `{expression}` tokens.
 *
 * This is called internally by {@link parseAsync} but can be used
 * standalone when you need the fully-expanded netlist text.
 *
 * @param netlist - Raw SPICE netlist text
 * @param resolver - Async function that returns file contents given a path;
 *   required if the netlist contains `.include` or `.lib` directives
 * @returns The preprocessed netlist with all includes inlined and expressions evaluated
 * @throws {@link ParseError} if include depth exceeds 64, resolver is missing,
 *   or a `{expression}` references an undefined or circular `.param`
 * @throws {@link CycleError} if includes form a circular dependency
 */
export async function preprocess(
  netlist: string,
  resolver?: IncludeResolver,
  guard?: ProtocolExecutionGuard,
): Promise<string> {
  const definitions = new Map<string, ParamDefinition>();
  const statements: PendingStatement[] = [];
  await collectStatements(netlist, resolver, new Set(), [], 0, definitions, statements, guard);
  // ngspice collects every top-level `.param` before substituting, so a
  // parameter may be used before its definition and the last definition wins.
  const params = createParamScope(definitions);
  return statements.map(statement => statement.substitute
    ? substituteStatement(statement, params)
    : statement.text).join('\n');
}

interface ParamDefinition {
  expression: string;
  line: number;
  context: string;
}

interface PendingStatement {
  text: string;
  substitute: boolean;
  line: number;
}

/**
 * Lazily evaluates `.param` definitions on first use, in dependency order.
 * Returned as a variable record so the expression evaluator can look names up.
 */
function createParamScope(definitions: Map<string, ParamDefinition>): Record<string, number> {
  const values = new Map<string, number>();
  const resolving: string[] = [];
  const isParam = (key: string | symbol): key is string => typeof key === 'string' && definitions.has(key);
  const scope: Record<string, number> = new Proxy({}, {
    has: (_target, key) => isParam(key),
    get: (_target, key) => (isParam(key) ? resolve(key) : undefined),
  });

  function resolve(name: string): number {
    const known = values.get(name);
    if (known !== undefined) return known;
    const definition = definitions.get(name)!;
    if (resolving.includes(name)) {
      const cycle = [...resolving.slice(resolving.indexOf(name)), name].join(' -> ');
      throw new ParseError(`Circular .param dependency: ${cycle}`, definition.line, definition.context);
    }
    resolving.push(name);
    try {
      const value = evaluateParamExpression(definition, scope);
      values.set(name, value);
      return value;
    } finally {
      resolving.pop();
    }
  }

  return scope;
}

function evaluateParamExpression(definition: ParamDefinition, scope: Record<string, number>): number {
  try {
    return evaluateExpression(definition.expression, scope);
  } catch (error) {
    if (error instanceof ParseError) throw error;
    const value = parseNumber(definition.expression);
    if (Number.isNaN(value)) throw toParseError(error, definition.line, definition.context);
    return value;
  }
}

function substituteStatement(statement: PendingStatement, params: Record<string, number>): string {
  const preserveOutputFunctions = /^\.PRINT(?:\s|$)/i.test(statement.text.trim());
  try {
    return substituteExpressions(statement.text, params, preserveOutputFunctions);
  } catch (error) {
    if (error instanceof ParseError) throw error;
    throw toParseError(error, statement.line, statement.text.trim());
  }
}

function toParseError(error: unknown, line: number, context: string): ParseError {
  const message = (error as Error).message
    .replace(/^Undefined variable '([^']*)'$/, "Undefined parameter '$1'");
  return new ParseError(message, line, context);
}

async function collectStatements(
  netlist: string,
  resolver: IncludeResolver | undefined,
  visited: Set<string>,
  chain: string[],
  depth: number,
  definitions: Map<string, ParamDefinition>,
  statements: PendingStatement[],
  guard?: ProtocolExecutionGuard,
): Promise<void> {
  guard?.maximum('maxIncludeDepth', depth, 'parse');
  if (depth > MAX_DEPTH) {
    throw new ParseError(`Include depth limit exceeded (${MAX_DEPTH})`, 0, '');
  }

  const lines = netlist.split('\n');
  let inSubckt = 0;

  for (const [index, line] of lines.entries()) {
    guard?.checkpoint('parse:line');
    const lineNumber = index + 1;
    const trimmed = line.trim();
    const upper = trimmed.toUpperCase();
    const passThrough = () => statements.push({ text: line, substitute: false, line: lineNumber });

    // Comments are metadata, not expression-bearing netlist statements.
    if (trimmed.startsWith('*')) {
      passThrough();
      continue;
    }

    // Track .subckt nesting — don't evaluate params inside subcircuits
    if (upper.startsWith('.SUBCKT ')) {
      inSubckt++;
      passThrough();
      continue;
    }
    if (upper.startsWith('.ENDS')) {
      inSubckt--;
      passThrough();
      continue;
    }

    // Inside a subcircuit — pass through without processing
    if (inSubckt > 0) {
      passThrough();
      continue;
    }

    // .param at top level
    if (upper.startsWith('.PARAM ')) {
      const paramContent = trimmed.slice(7).trim();
      const assignments = paramContent.matchAll(/([A-Za-z_]\w*)\s*=\s*(\{[^}]+\}|\S+)/g);
      for (const assignment of assignments) {
        const name = assignment[1].toUpperCase();
        let valStr = assignment[2];
        if (valStr.startsWith('{') && valStr.endsWith('}')) {
          valStr = valStr.slice(1, -1);
        }
        definitions.set(name, { expression: valStr, line: lineNumber, context: trimmed });
      }
      continue;
    }

    // .include directive
    if (upper.startsWith('.INCLUDE ')) {
      if (!resolver) {
        throw new ParseError(
          '.include directive requires a resolver. Use parseAsync() with a resolveInclude option.',
          0, trimmed,
        );
      }
      let path = trimmed.slice(9).trim();
      if ((path.startsWith("'") && path.endsWith("'")) ||
          (path.startsWith('"') && path.endsWith('"'))) {
        path = path.slice(1, -1);
      }
      if (visited.has(path)) {
        throw new CycleError([...chain, path]);
      }
      visited.add(path);
      const content = await resolver(path);
      await collectStatements(
        content, resolver, visited, [...chain, path], depth + 1, definitions, statements, guard,
      );
      visited.delete(path);
      continue;
    }

    // .lib <filename> <section> — fetch file and extract section
    if (upper.startsWith('.LIB ')) {
      const libTokens = trimmed.slice(5).trim().split(/\s+/);
      if (libTokens.length >= 2) {
        if (!resolver) {
          throw new ParseError(
            '.lib directive with file requires a resolver. Use parseAsync() with a resolveInclude option.',
            0, trimmed,
          );
        }
        let filePath = libTokens.slice(0, -1).join(' ');
        const section = libTokens[libTokens.length - 1];
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
        await collectStatements(
          extracted, resolver, visited, [...chain, visitKey], depth + 1, definitions, statements, guard,
        );
        visited.delete(visitKey);
        continue;
      }
      continue;
    }

    // .endl — skip (handled by extractLibSection)
    if (upper.startsWith('.ENDL')) {
      continue;
    }

    statements.push({ text: line, substitute: true, line: lineNumber });
  }
}

// Output vectors are evaluated after simulation, not as scalar parameters.
function substituteExpressions(
  line: string,
  params: Record<string, number>,
  preserveOutputFunctions = false,
): string {
  return line.replace(/\{([^}]+)\}/g, (match, expr: string) => {
    if (preserveOutputFunctions && isVoltageOrCurrentOutputExpression(expr)) return match;
    const value = evaluateExpression(expr, params);
    return formatNumber(value);
  });
}

function isVoltageOrCurrentOutputExpression(expression: string): boolean {
  const functions = [...expression.matchAll(/([A-Za-z_]\w*)\s*\(/g)]
    .map(match => match[1].toUpperCase());
  if (functions.length === 0 || functions.some(name => name !== 'V' && name !== 'I')) return false;
  const arithmetic = expression.replace(/\b[vi]\s*\([^()]*\)/gi, '0');
  return /^[\d.eE+\-*/()\s]+$/.test(arithmetic);
}

function formatNumber(value: number): string {
  // JavaScript's Number.toString() already produces exponential notation for very
  // small (< 5e-7) and very large (>= 1e21) values, and decimal strings otherwise.
  // This naturally satisfies all test expectations (e.g. 1e-7 → "1e-7",
  // 2e-6 → "0.000002", 1.8 → "1.8", 5 → "5").
  return value.toString();
}

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
      if (tokens.length === 1) {
        currentSection = tokens[0].toUpperCase();
        continue;
      }
      if (currentSection === null || currentSection === sectionUpper) {
        output.push(line);
      }
      continue;
    }

    if (upper.startsWith('.ENDL')) {
      currentSection = null;
      continue;
    }

    if (currentSection === null || currentSection === sectionUpper) {
      output.push(line);
    }
  }

  return output.join('\n');
}
