import type { ModelParams } from '../types.js';
import { parseNumber } from './tokenizer.js';
import { parseVdmosModelCard, VDMOS_MODEL_TYPES } from '../devices/vdmos-model.js';
import { isNgspiceBjtName, selectsNgspiceBjt } from '../devices/bjt-ngspice-parameters.js';
import { classifyModelFlag, modelFlagParameters, UnsupportedModelFlagError } from './model-flags.js';
import { ignoredPspiceTemperatureWarning, translatePspiceModelTemperatures } from './pspice-model-temperature.js';
import { UnsupportedModelParameterError } from '../errors.js';

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
 * Model types whose ngspice-47 INPdomodel (inpdomod.c) picks the device through
 * INPfindLev: npn/pnp, njf/pjf, nmf/pmf/nhfet/phfet, nmos/pmos/nsoi/psoi and r.
 */
const INPFINDLEV_MODEL_TYPES: ReadonlySet<string> = new Set([
  'NPN', 'PNP', 'NJF', 'PJF', 'NMF', 'PMF', 'NHFET', 'PHFET', 'NMOS', 'PMOS', 'NSOI', 'PSOI', 'R',
]);

/**
 * ngspice-47 inpfindl.c INPfindLev: the level is rounded to `(int)(level + 0.5)`,
 * and a result below 0 or above 99 is replaced by 1 ("Illegal value for level.
 * Level must be < 99 (Setting Level to 1)"). Level 0 shares `case 1` in every
 * INPdomodel switch that reads it, so it selects level 1 too. #747: this is
 * what ngspice-47 runs for `LEVEL=260` (Xyce's EKV 2.6), which it does not implement.
 */
function ngspiceModelLevel(level: number): { level: number; outOfRange: boolean } {
  const rounded = Math.trunc(level + 0.5);
  if (rounded < 0 || rounded > 99) return { level: 1, outOfRange: true };
  return { level: rounded === 0 ? 1 : rounded, outOfRange: false };
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
 *
 * PSpice `T_ABS`/`T_REL_GLOBAL`/`T_MEASURED` are first renamed to
 * `TEMP`/`DTEMP`/`TNOM` as ngspice-47 inpcompat.c does (see
 * {@link translatePspiceModelTemperatures}); a resulting TEMP/DTEMP on a
 * non-resistor model throws {@link UnsupportedModelParameterError}.
 */
export function parseModelCard(
  rawTokens: string[],
  lineNumber: number,
  warn?: (message: string) => void,
): ModelParams {
  const name = rawTokens[1];
  const type = rawTokens[2].toUpperCase();
  const temperatures = translatePspiceModelTemperatures(rawTokens.slice(3));
  const tokens = [...rawTokens.slice(0, 3), ...temperatures.body];
  if (temperatures.ignored.length > 0) warn?.(ignoredPspiceTemperatureWarning(name, type, temperatures.ignored));
  const { translated } = temperatures;
  if (translated !== undefined && translated.to !== 'TNOM' && type !== 'R' && type !== 'RES') {
    // A model TEMP/DTEMP is an instance default (inpgmod.c) that spice-ts
    // applies to resistors only; reject it rather than run at the circuit temperature.
    throw new UnsupportedModelParameterError('', translated.from, `ngspice-47 inpcompat.c renames it to `
      + `'${translated.to.toLowerCase()}', a default instance temperature, which spice-ts applies to `
      + 'resistor (R/RES) models only', { modelName: name, model: type });
  }
  if (VDMOS_MODEL_TYPES.has(type)) return parseVdmosModelCard(tokens);
  const params: Record<string, number> = {};
  let version: string | undefined;
  const body = tokens.slice(3).filter((token) => token !== '(' && token !== ')');
  const writtenLevel = modelLevel(body);
  const ngspiceLevel = writtenLevel !== undefined && INPFINDLEV_MODEL_TYPES.has(type)
    ? ngspiceModelLevel(writtenLevel) : undefined;
  const level = ngspiceLevel?.level ?? writtenLevel;
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

  if (ngspiceLevel !== undefined && params.LEVEL !== undefined) {
    params.LEVEL = ngspiceLevel.level;
    if (ngspiceLevel.outOfRange) {
      warn?.(`Model '${name}' (${type}): LEVEL=${writtenLevel} is outside ngspice-47's 0-99 range;`
        + ' level=1 assumed, as ngspice-47 does (inpfindl.c)');
    }
  }

  if (selectsNgspiceBjt(type, level)) {
    const unrecognized = Object.keys(params).filter((key) => !isNgspiceBjtName(key));
    for (const key of unrecognized) delete params[key];
    if (unrecognized.length > 0) {
      warn?.(`Model '${name}' (${type}): `
        + unrecognized.map((key) => `unrecognized parameter (${key.toLowerCase()}) - ignored`).join(', ')
        + ', as ngspice-47 does (inpgmod.c)');
    }
  }

  return version === undefined ? { name, type, params } : { name, type, params, version };
}
