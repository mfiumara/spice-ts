import type { ModelParams } from '../types.js';
import { parseNumber } from './tokenizer.js';
import { parseVdmosModelCard, VDMOS_MODEL_TYPES } from '../devices/vdmos-model.js';

export function parseModelCard(tokens: string[], lineNumber: number): ModelParams {
  const name = tokens[1];
  const type = tokens[2].toUpperCase();
  if (VDMOS_MODEL_TYPES.has(type)) return parseVdmosModelCard(tokens);
  const params: Record<string, number> = {};
  let version: string | undefined;

  for (let i = 3; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === '(' || token === ')') continue;
    const eqIdx = token.indexOf('=');
    if (eqIdx > 0) {
      const key = token.substring(0, eqIdx).toUpperCase();
      const val = token.substring(eqIdx + 1);
      // #503: VERSION is a string (ngspice b3.c/b4.c IF_STRING), e.g. `3.3.0`, never a number.
      if (key === 'VERSION') version = val;
      else params[key] = parseNumber(val);
    }
  }

  return version === undefined ? { name, type, params } : { name, type, params, version };
}
