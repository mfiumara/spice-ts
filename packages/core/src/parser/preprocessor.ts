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
 * @throws {@link ParseError} if include depth exceeds 64 or resolver is missing
 * @throws {@link CycleError} if includes form a circular dependency
 */
export async function preprocess(
  netlist: string,
  resolver?: IncludeResolver,
  guard?: ProtocolExecutionGuard,
): Promise<string> {
  return preprocessInternal(netlist, resolver, new Set(), [], 0, {}, guard);
}

async function preprocessInternal(
  netlist: string,
  resolver: IncludeResolver | undefined,
  visited: Set<string>,
  chain: string[],
  depth: number,
  params: Record<string, number>,
  guard?: ProtocolExecutionGuard,
): Promise<string> {
  guard?.maximum('maxIncludeDepth', depth, 'parse');
  if (depth > MAX_DEPTH) {
    throw new ParseError(`Include depth limit exceeded (${MAX_DEPTH})`, 0, '');
  }

  const lines = netlist.split('\n');
  const output: string[] = [];
  let inSubckt = 0;

  for (const line of lines) {
    guard?.checkpoint('parse:line');
    const trimmed = line.trim();
    const upper = trimmed.toUpperCase();

    // Comments are metadata, not expression-bearing netlist statements.
    if (trimmed.startsWith('*')) {
      output.push(line);
      continue;
    }

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
      const paramContent = trimmed.slice(7).trim();
      const assignments = paramContent.matchAll(/([A-Za-z_]\w*)\s*=\s*(\{[^}]+\}|\S+)/g);
      for (const assignment of assignments) {
        const name = assignment[1].toUpperCase();
        let valStr = assignment[2];
        if (valStr.startsWith('{') && valStr.endsWith('}')) {
          valStr = valStr.slice(1, -1);
        }
        try {
          params[name] = evaluateExpression(valStr, params);
        } catch {
          params[name] = parseNumber(valStr);
        }
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
      const processed = await preprocessInternal(
        content, resolver, visited, [...chain, path], depth + 1, params, guard,
      );
      visited.delete(path);
      output.push(processed);
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
        const processed = await preprocessInternal(
          extracted, resolver, visited, [...chain, visitKey], depth + 1, params, guard,
        );
        visited.delete(visitKey);
        output.push(processed);
        continue;
      }
      continue;
    }

    // .endl — skip (handled by extractLibSection)
    if (upper.startsWith('.ENDL')) {
      continue;
    }

    // Output vectors are evaluated after simulation, not as scalar parameters.
    const preserveOutputFunctions = /^\.PRINT(?:\s|$)/i.test(trimmed);
    const substituted = substituteExpressions(line, params, preserveOutputFunctions);
    output.push(substituted);
  }

  return output.join('\n');
}

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
