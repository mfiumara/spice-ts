import { evaluateExpression } from './expression.js';
import { parseNumber } from './tokenizer.js';
import { ParseError } from '../errors.js';
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
    throw new ParseError(`Include depth limit exceeded (${MAX_DEPTH})`, 0, '');
  }

  const lines = netlist.split('\n');
  const params: Record<string, number> = {};
  const output: string[] = [];
  let inSubckt = 0;

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
      const paramContent = trimmed.slice(7).trim();
      const eqIdx = paramContent.indexOf('=');
      if (eqIdx > 0) {
        const name = paramContent.slice(0, eqIdx).trim().toUpperCase();
        let valStr = paramContent.slice(eqIdx + 1).trim();
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

    // Substitute {expr} in all other lines
    const substituted = substituteExpressions(line, params);
    output.push(substituted);
  }

  return output.join('\n');
}

function substituteExpressions(line: string, params: Record<string, number>): string {
  return line.replace(/\{([^}]+)\}/g, (_match, expr: string) => {
    const value = evaluateExpression(expr, params);
    return formatNumber(value);
  });
}

function formatNumber(value: number): string {
  // JavaScript's Number.toString() already produces exponential notation for very
  // small (< 5e-7) and very large (>= 1e21) values, and decimal strings otherwise.
  // This naturally satisfies all test expectations (e.g. 1e-7 → "1e-7",
  // 2e-6 → "0.000002", 1.8 → "1.8", 5 → "5").
  return value.toString();
}
