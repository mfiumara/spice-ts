import type { ModelParams } from '../types.js';
import { parseNumber } from './tokenizer.js';
import { parseVdmosModelCard, VDMOS_MODEL_TYPES } from '../devices/vdmos-model.js';
import { classifyModelFlag, modelFlagParameters, UnsupportedModelFlagError } from './model-flags.js';

function tryNumber(token: string): number | undefined {
  try {
    return parseNumber(token);
  } catch {
    return undefined;
  }
}

/** `LEVEL` written as `level=N` or, ngspice-style, `level N`. */
function modelLevel(body: readonly string[]): number | undefined {
  for (let i = 0; i < body.length; i++) {
    const token = body[i];
    const eqIdx = token.indexOf('=');
    if (eqIdx > 0) {
      if (token.substring(0, eqIdx).toUpperCase() === 'LEVEL') return tryNumber(token.substring(eqIdx + 1));
    } else if (token.toUpperCase() === 'LEVEL' && i + 1 < body.length) {
      return tryNumber(body[i + 1]);
    }
  }
  return undefined;
}

/**
 * Parse a tokenized `.model` card. ngspice-47 (inpgmod.c create_model) treats
 * `=` as a separator, so besides `name=value` it accepts:
 * - a bare `IF_FLAG` parameter (e.g. BSIM1 `xpart`), set to 1 without
 *   consuming a value (device-type flags such as `npn` are accepted and
 *   dropped);
 * - `name value` written without `=`;
 * - stray numbers, which it ignores.
 * Any other bare token raises {@link UnsupportedModelFlagError} instead of
 * being dropped.
 */
export function parseModelCard(tokens: string[], lineNumber: number): ModelParams {
  const name = tokens[1];
  const type = tokens[2].toUpperCase();
  if (VDMOS_MODEL_TYPES.has(type)) return parseVdmosModelCard(tokens);
  const params: Record<string, number> = {};
  let version: string | undefined;
  const body = tokens.slice(3).filter((token) => token !== '(' && token !== ')');
  const level = modelLevel(body);
  const context = tokens.join(' ');

  for (let i = 0; i < body.length; i++) {
    const token = body[i];
    const eqIdx = token.indexOf('=');
    if (eqIdx > 0) {
      const key = token.substring(0, eqIdx).toUpperCase();
      const val = token.substring(eqIdx + 1);
      // #503: VERSION is a string (ngspice b3.c/b4.c IF_STRING), e.g. `3.3.0`, never a number.
      if (key === 'VERSION') version = val;
      else params[key] = parseNumber(val);
      continue;
    }
    if (eqIdx === 0 || tryNumber(token) !== undefined) continue;

    const key = token.toUpperCase();
    const flag = classifyModelFlag(name, type, level, key, lineNumber, context);
    if (flag !== undefined) {
      if (flag === 'store') params[key] = 1;
      continue;
    }
    const next = body[i + 1];
    if (next !== undefined && next.indexOf('=') < 0) {
      if (key === 'VERSION') {
        version = next;
        i++;
        continue;
      }
      const value = tryNumber(next);
      if (value !== undefined) {
        params[key] = value;
        i++;
        continue;
      }
    }
    throw new UnsupportedModelFlagError(
      name, type, key, [...modelFlagParameters(type, level)], lineNumber, context,
    );
  }

  return version === undefined ? { name, type, params } : { name, type, params, version };
}
