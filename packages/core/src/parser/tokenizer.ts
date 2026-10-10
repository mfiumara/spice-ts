import { ParseError } from '../errors.js';

// Ngspice scale factors are case-insensitive. In particular, both M and m
// mean milli; mega must be written as MEG.
const SI_SUFFIX_MAP: Record<string, string> = {
  t: 'e12', g: 'e9', k: 'e3', m: 'e-3',
  u: 'e-6', n: 'e-9', p: 'e-12', f: 'e-15', a: 'e-18',
};

export function parseNumber(token: string): number {
  const trimmed = token.trim();

  // Plain number (integer, float, scientific notation)
  const plain = Number(trimmed);
  if (!isNaN(plain) && /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(trimmed)) {
    return plain;
  }

  // Embedded RKM notation (accepted as an extension): 3k3 = 3300.
  const embeddedMatch = trimmed.match(/^([+-]?\d+)(meg|[tgkmunpfa])(\d+)[a-z]*$/i);
  if (embeddedMatch) {
    const numStr = embeddedMatch[1] + '.' + embeddedMatch[3];
    const suffix = embeddedMatch[2].toLowerCase();
    const exp = suffix === 'meg' ? 'e6' : SI_SUFFIX_MAP[suffix];
    const val = Number(numStr + exp);
    if (!isNaN(val)) return val;
  }

  // Standard suffix: 10k, 100n, 2.2meg, etc.
  // Ngspice ignores alphabetic unit text after a number or scale factor.
  const suffixMatch = trimmed.match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)(meg|mil|[tgkmunpfa])?([a-z]*)$/i);
  if (suffixMatch) {
    const suffix = suffixMatch[2]?.toLowerCase();
    const exp = suffix === 'meg' ? 'e6' : suffix && suffix !== 'mil' ? SI_SUFFIX_MAP[suffix] : '';
    const val = suffix === 'mil'
      ? Number(suffixMatch[1]) * 25.4e-6
      : Number(suffixMatch[1] + exp);
    if (!isNaN(val)) return val;
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

export function tokenizeNetlist(
  netlist: string,
  options: TokenizeNetlistOptions = {},
): ParsedLine[] {
  const rawLines = netlist.split('\n');
  const result: ParsedLine[] = [];
  const mergedLines: { text: string; lineNumber: number }[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    if (i === 0 && options.firstLineIsTitle) continue;

    const trimmed = stripEndOfLineComment(rawLines[i]).trim();
    if (trimmed === '' || trimmed.startsWith('*') || trimmed.startsWith(';')) continue;
    if (trimmed.toUpperCase() === '.END') continue;

    if (trimmed.startsWith('+') && mergedLines.length > 0) {
      mergedLines[mergedLines.length - 1].text += ' ' + trimmed.substring(1).trim();
      continue;
    }

    mergedLines.push({ text: trimmed, lineNumber: i + 1 });
  }

  for (const { text, lineNumber } of mergedLines) {
    const normalized = text
      .replace(/\s*=\s*/g, '=')
      .replace(/\(/g, ' ( ')
      .replace(/\)/g, ' ) ')
      .replace(/,/g, ' ');
    const tokens = normalized.split(/\s+/).filter(t => t.length > 0);
    result.push({ raw: text, lineNumber, tokens });
  }

  return result;
}

function stripEndOfLineComment(line: string): string {
  const delimiters = ['$', ';', '//'];
  let commentStart = line.length;
  for (const delimiter of delimiters) {
    const index = line.indexOf(delimiter);
    if (index >= 0 && index < commentStart) commentStart = index;
  }
  return line.slice(0, commentStart);
}
