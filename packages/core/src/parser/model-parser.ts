import type { ModelParams } from '../types.js';
import { parseNumber } from './tokenizer.js';
import { parseVdmosModelCard, VDMOS_MODEL_TYPES } from '../devices/vdmos-model.js';

export function parseModelCard(tokens: string[], lineNumber: number): ModelParams {
  const name = tokens[1];
  const type = tokens[2].toUpperCase();
  if (VDMOS_MODEL_TYPES.has(type)) return parseVdmosModelCard(tokens);
  const params: Record<string, number> = {};

  for (let i = 3; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === '(' || token === ')') continue;
    const eqIdx = token.indexOf('=');
    if (eqIdx > 0) {
      const key = token.substring(0, eqIdx).toUpperCase();
      const val = token.substring(eqIdx + 1);
      params[key] = parseNumber(val);
    }
  }

  return { name, type, params };
}
