import { ParseError } from '../errors.js';

export function parseNumber(token: string): number {
  const upper = token.toUpperCase().trim();

  const plain = Number(token);
  if (!isNaN(plain) && /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(token.trim())) {
    return plain;
  }

  const suffixes: [RegExp, string][] = [
    [/^([+-]?[\d.]+(?:[eE][+-]?\d+)?)T$/i, 'e12'],
    [/^([+-]?[\d.]+(?:[eE][+-]?\d+)?)G$/i, 'e9'],
    [/^([+-]?[\d.]+(?:[eE][+-]?\d+)?)MEG$/i, 'e6'],
    [/^([+-]?[\d.]+(?:[eE][+-]?\d+)?)K$/i, 'e3'],
    [/^([+-]?[\d.]+(?:[eE][+-]?\d+)?)M$/i, 'e-3'],
    [/^([+-]?[\d.]+(?:[eE][+-]?\d+)?)U$/i, 'e-6'],
    [/^([+-]?[\d.]+(?:[eE][+-]?\d+)?)N$/i, 'e-9'],
    [/^([+-]?[\d.]+(?:[eE][+-]?\d+)?)P$/i, 'e-12'],
    [/^([+-]?[\d.]+(?:[eE][+-]?\d+)?)F$/i, 'e-15'],
  ];

  for (const [regex, exp] of suffixes) {
    const match = upper.match(regex);
    if (match) {
      const val = Number(match[1] + exp);
      if (!isNaN(val)) return val;
    }
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
