import { parseNumber } from './tokenizer.js';
import { parseInstanceParams } from './waveform-parser.js';

export interface ParsedPassiveElement {
  value?: number;
  modelName?: string;
  params: Record<string, number>;
}

const PREFIX_FACTORS: Record<string, number> = {
  T: 1e12, t: 1e12,
  G: 1e9, g: 1e9,
  K: 1e3, k: 1e3,
  M: 1e6,
  m: 1e-3,
  U: 1e-6, u: 1e-6,
  N: 1e-9, n: 1e-9,
  P: 1e-12, p: 1e-12,
  F: 1e-15, f: 1e-15,
};

function unitFactor(token: string, kind: 'C' | 'L'): number | undefined {
  const expectedUnit = kind === 'C' ? 'F' : 'H';
  const match = token.match(/^([TtGgKkMmUuNnPpFf]?)([FfHh])$/);
  if (!match || match[2].toUpperCase() !== expectedUnit) return undefined;
  const prefix = match[1];
  return prefix ? PREFIX_FACTORS[prefix] : 1;
}

function parsePassiveNumber(token: string, kind: 'C' | 'L'): number | undefined {
  try {
    return parseNumber(token);
  } catch {
    // Accept engineering unit suffixes that include the physical unit, e.g. 1uF or 10nH.
    const expectedUnit = kind === 'C' ? 'F' : 'H';
    const match = token.match(/^([+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?)([TtGgKkMmUuNnPpFf]?)([FfHh])$/);
    if (!match || match[5].toUpperCase() !== expectedUnit) return undefined;
    const prefix = match[4];
    const factor = prefix ? PREFIX_FACTORS[prefix] : 1;
    return Number(match[1]) * factor;
  }
}

function parsePassiveNumberWithUnit(
  tokens: string[],
  index: number,
  kind: 'C' | 'L',
): { value: number; consumed: number } | undefined {
  const value = parsePassiveNumber(tokens[index], kind);
  if (value === undefined) return undefined;

  const separatedUnitFactor = tokens[index + 1] ? unitFactor(tokens[index + 1], kind) : undefined;
  if (separatedUnitFactor !== undefined) {
    return { value: value * separatedUnitFactor, consumed: 2 };
  }

  return { value, consumed: 1 };
}

function parsePassiveValueAssignment(token: string, kind: 'C' | 'L'): number | undefined {
  const eqIdx = token.indexOf('=');
  if (eqIdx <= 0) return undefined;

  const key = token.slice(0, eqIdx).toUpperCase();
  const valueToken = token.slice(eqIdx + 1);
  const isValueKey = kind === 'C'
    ? key === 'C' || key === 'CAP'
    : key === 'L' || key === 'IND';
  if (!isValueKey) return undefined;

  return parsePassiveNumber(valueToken, kind);
}

export function parsePassiveElement(
  tokens: string[],
  startIdx: number,
  kind: 'C' | 'L',
): ParsedPassiveElement {
  let idx = startIdx;
  let value: number | undefined;
  let modelName: string | undefined;

  const first = tokens[idx];
  if (first === undefined) {
    return { params: {} };
  }

  const assignmentValue = parsePassiveValueAssignment(first, kind);
  if (assignmentValue !== undefined) {
    value = assignmentValue;
    idx++;
  } else {
    const numeric = parsePassiveNumberWithUnit(tokens, idx, kind);
    if (numeric) {
      value = numeric.value;
      idx += numeric.consumed;
      if (tokens[idx] && !tokens[idx].includes('=')) {
        modelName = tokens[idx++];
      }
    } else if (!first.includes('=')) {
      modelName = first;
      idx++;
    }
  }

  return {
    value,
    modelName,
    params: parseInstanceParams(tokens, idx),
  };
}
