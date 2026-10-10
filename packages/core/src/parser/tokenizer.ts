import { ParseError } from '../errors.js';

// Ngspice scale factors are case-insensitive. In particular, both M and m
// mean milli; mega must be written as MEG.
const SI_SUFFIX_MAP: Record<string, string> = {
  t: 'e12', g: 'e9', k: 'e3', m: 'e-3',
  u: 'e-6', n: 'e-9', p: 'e-12', f: 'e-15', a: 'e-18',
};

// Plain or suffixed number: 1e-14, 10k, 100n, 2.2meg. Ngspice ignores
// alphabetic unit text after a number or scale factor.
const SUFFIXED_NUMBER = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)(meg|mil|[tgkmunpfa])?[a-z]*$/i;
// Embedded RKM notation (accepted as an extension): 3k3 = 3300.
const EMBEDDED_NUMBER = /^([+-]?\d+)(meg|[tgkmunpfa])(\d+)[a-z]*$/i;

export function parseNumber(token: string): number {
  const trimmed = token.trim();

  // The suffixed and embedded forms are disjoint (embedded needs a digit
  // after the scale letter, suffixed allows only letters there), so the
  // common plain/suffixed form is decided by a single regex execution.
  const suffixMatch = SUFFIXED_NUMBER.exec(trimmed);
  if (suffixMatch) {
    const mantissa = suffixMatch[1];
    const suffix = suffixMatch[2];
    if (suffix === undefined) return Number(mantissa);
    const lower = suffix.toLowerCase();
    const val = lower === 'mil'
      ? Number(mantissa) * 25.4e-6
      : Number(mantissa + (lower === 'meg' ? 'e6' : SI_SUFFIX_MAP[lower]));
    // An exponent plus a scale factor (e.g. '1e3k' -> '1e3e3') is NaN and
    // has always been rejected.
    if (!isNaN(val)) return val;
  } else {
    const embeddedMatch = EMBEDDED_NUMBER.exec(trimmed);
    if (embeddedMatch) {
      const suffix = embeddedMatch[2].toLowerCase();
      const exp = suffix === 'meg' ? 'e6' : SI_SUFFIX_MAP[suffix];
      return Number(embeddedMatch[1] + '.' + embeddedMatch[3] + exp);
    }
  }

  throw new Error(`Cannot parse number: '${token}'`);
}

export interface ParsedLine {
  raw: string;
  lineNumber: number;
  tokens: string[];
}

export interface TokenizeNetlistOptions {
  firstLineIsTitle?: boolean;
}

// After '=' normalization a token is a single parenthesis or a maximal run of
// characters other than whitespace, parentheses and commas.
const LINE_TOKEN = /[()]|[^\s(),]+/g;
const SPACES_AROUND_EQUALS = /\s*=\s*/g;

export function tokenizeNetlist(
  netlist: string,
  options: TokenizeNetlistOptions = {},
): ParsedLine[] {
  const result: ParsedLine[] = [];
  const length = netlist.length;

  // The logical line being accumulated; continuation lines append to it and
  // it is tokenized once the next logical line starts or the input ends.
  let pendingText: string | undefined;
  let pendingLineNumber = 0;

  let lineStart = 0;
  for (let lineIndex = 0; lineStart <= length; lineIndex++) {
    let lineEnd = netlist.indexOf('\n', lineStart);
    if (lineEnd < 0) lineEnd = length;
    const line = netlist.slice(lineStart, lineEnd);
    lineStart = lineEnd + 1;
    if (lineIndex === 0 && options.firstLineIsTitle) continue;

    const trimmed = stripEndOfLineComment(line).trim();
    if (trimmed === '' || trimmed.startsWith('*') || trimmed.startsWith(';')) continue;
    // toUpperCase never shortens a string, so only <= 4 chars can be '.END'.
    if (trimmed.length <= 4 && trimmed.toUpperCase() === '.END') continue;

    if (trimmed.startsWith('+') && pendingText !== undefined) {
      pendingText += ' ' + trimmed.substring(1).trim();
      continue;
    }

    if (pendingText !== undefined) {
      result.push({ raw: pendingText, lineNumber: pendingLineNumber, tokens: tokenizeLine(pendingText) });
    }
    pendingText = trimmed;
    pendingLineNumber = lineIndex + 1;
  }

  if (pendingText !== undefined) {
    result.push({ raw: pendingText, lineNumber: pendingLineNumber, tokens: tokenizeLine(pendingText) });
  }
  return result;
}

/**
 * Equivalent of the former replace(/\s*=\s*\/g, '=') -> pad '(' and ')' with
 * spaces -> ',' to ' ' -> split(/\s+/) -> drop empty tokens, without building
 * the intermediate strings.
 */
function tokenizeLine(text: string): string[] {
  const normalized = text.includes('=') ? text.replace(SPACES_AROUND_EQUALS, '=') : text;
  return normalized.match(LINE_TOKEN) ?? [];
}

function stripEndOfLineComment(line: string): string {
  let commentStart = line.indexOf('$');
  if (commentStart < 0) commentStart = line.length;
  const semicolon = line.indexOf(';');
  if (semicolon >= 0 && semicolon < commentStart) commentStart = semicolon;
  const slashes = line.indexOf('//');
  if (slashes >= 0 && slashes < commentStart) commentStart = slashes;
  return commentStart === line.length ? line : line.slice(0, commentStart);
}
