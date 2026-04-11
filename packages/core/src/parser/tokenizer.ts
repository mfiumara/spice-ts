import { ParseError } from '../errors.js';

// SI suffix exponents — case-sensitive for m (milli) vs M (mega)
const SI_SUFFIX_MAP: Record<string, string> = {
  T: 'e12', t: 'e12', G: 'e9', g: 'e9',
  K: 'e3', k: 'e3', M: 'e6', m: 'e-3',
  U: 'e-6', u: 'e-6', N: 'e-9', n: 'e-9',
  P: 'e-12', p: 'e-12', F: 'e-15', f: 'e-15',
};

export function parseNumber(token: string): number {
  const trimmed = token.trim();

  // Plain number (integer, float, scientific notation)
  const plain = Number(trimmed);
  if (!isNaN(plain) && /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(trimmed)) {
    return plain;
  }

  // Embedded suffix notation: 3k3 = 3.3k = 3300, 4M7 = 4.7M = 4700000
  const embeddedMatch = trimmed.match(/^([+-]?\d+)([Mm][Ee][Gg]|[TtGgKkMmUuNnPpFf])(\d+)$/);
  if (embeddedMatch) {
    const numStr = embeddedMatch[1] + '.' + embeddedMatch[3];
    const suffix = embeddedMatch[2];
    const exp = suffix.length === 3 ? 'e6' : SI_SUFFIX_MAP[suffix];
    const val = Number(numStr + exp);
    if (!isNaN(val)) return val;
  }

  // Standard suffix: 10k, 100n, 2.2meg, etc.
  // MEG must be tested before single-char M (case-insensitive for MEG)
  const megMatch = trimmed.match(/^([+-]?[\d.]+(?:[eE][+-]?\d+)?)[Mm][Ee][Gg]$/);
  if (megMatch) {
    const val = Number(megMatch[1] + 'e6');
    if (!isNaN(val)) return val;
  }

  // Single-char suffixes — case-sensitive (m = milli, M = mega)
  const suffixMatch = trimmed.match(/^([+-]?[\d.]+(?:[eE][+-]?\d+)?)([TtGgKkMmUuNnPpFf])$/);
  if (suffixMatch) {
    const exp = SI_SUFFIX_MAP[suffixMatch[2]];
    const val = Number(suffixMatch[1] + exp);
    if (!isNaN(val)) return val;
  }

  throw new Error(`Cannot parse number: '${token}'`);
}

export interface ParsedLine {
  raw: string;
  lineNumber: number;
  tokens: string[];
}

export function tokenizeNetlist(netlist: string): ParsedLine[] {
  const rawLines = netlist.split('\n');
  const result: ParsedLine[] = [];
  const mergedLines: { text: string; lineNumber: number }[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const trimmed = rawLines[i].trim();
    if (trimmed === '' || trimmed.startsWith('*') || trimmed.startsWith(';')) continue;
    if (trimmed.toUpperCase() === '.END') continue;

    if (trimmed.startsWith('+') && mergedLines.length > 0) {
      mergedLines[mergedLines.length - 1].text += ' ' + trimmed.substring(1).trim();
      continue;
    }

    mergedLines.push({ text: trimmed, lineNumber: i + 1 });
  }

  for (const { text, lineNumber } of mergedLines) {
    const normalized = text.replace(/\(/g, ' ( ').replace(/\)/g, ' ) ').replace(/,/g, ' ');
    const tokens = normalized.split(/\s+/).filter(t => t.length > 0);
    result.push({ raw: text, lineNumber, tokens });
  }

  return result;
}
