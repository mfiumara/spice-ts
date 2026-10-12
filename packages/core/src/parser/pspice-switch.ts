import { ParseError } from '../errors.js';
import { parseXspiceModelCard, type XspiceModelCard } from './xspice-parser.js';

/**
 * A PSpice `.model <name> VSWITCH(...)` or `ISWITCH(...)` card as ngspice-47's
 * PSpice compatibility mode rewrites it (frontend/inpcompat.c pspice_compat):
 *
 * - VSWITCH with `VT=`/`VH=`: the native voltage-controlled switch,
 *   `.model <name> sw`, with the missing RON/ROFF/VT/VH given as
 *   `ron=1.0 roff=1.0e12 vt=0 vh=0`;
 * - VSWITCH with `VON=`/`VOFF=`: the XSPICE `pswitch` code model,
 *   RON/ROFF/VON/VOFF renamed to r_on/r_off/cntl_on/cntl_off (defaults
 *   r_on=1.0 r_off=1.0e6 cntl_on=1 cntl_off=0) and `log=TRUE`. ngspice rewrites
 *   every S instance of such a model into `a<name> %gd(nc+ nc-) %gd(n+ n-) a<model>`;
 * - ISWITCH with `IT=`/`IH=`: the native current-controlled switch,
 *   `.model <name> csw`, defaults `ron=1.0 roff=1.0e12 it=0 ih=0`;
 * - ISWITCH with `ION=`/`IOFF=`: the XSPICE `aswitch` code model,
 *   RON/ROFF/ION/IOFF renamed to r_on/r_off/cntl_on/cntl_off (defaults
 *   r_on=1.0 r_off=1.0e6) plus `log=TRUE limit=TRUE`. ngspice rewrites every
 *   W instance into `a<name> %vnam(<vcontrol>) %gd(n+ n-) a<model>`.
 *
 * spice-ts keeps the S/W instance and compiles it to that code-model device.
 * Other parameters (the PSpice delay TD) stay on the card, where the code
 * model's parameter table ignores them with ngspice's MIF warning.
 */
export type PspiceSwitchModel =
  | { readonly kind: 'native'; readonly raw: string }
  | { readonly kind: 'xspice'; readonly card: XspiceModelCard };

type PspiceSwitchType = 'vswitch' | 'iswitch';

/** True for a tokenized `.model <name> VSWITCH ...` or `.model <name> ISWITCH ...` card. */
export function isPspiceSwitchModel(tokens: readonly string[]): boolean {
  if (tokens[0]?.toUpperCase() !== '.MODEL') return false;
  const type = tokens[2]?.toLowerCase();
  return type === 'vswitch' || type === 'iswitch';
}

/** inpcompat.c's translation of each PSpice switch type. */
const TRANSLATIONS = {
  vswitch: {
    native: { type: 'sw', threshold: 'vt', hysteresis: 'vh' },
    on: 'von', off: 'voff', codeModel: 'pswitch', flags: 'log=TRUE', instance: 'S',
  },
  iswitch: {
    native: { type: 'csw', threshold: 'it', hysteresis: 'ih' },
    on: 'ion', off: 'ioff', codeModel: 'aswitch', flags: 'log=TRUE limit=TRUE', instance: 'W',
  },
} as const;

/**
 * Translate a PSpice VSWITCH or ISWITCH `.model` card (see {@link PspiceSwitchModel}).
 *
 * @throws {@link ParseError} when the card has neither the ON/OFF nor the
 *   threshold/hysteresis parameters (ngspice-47: "Bad switch model", then an
 *   unknown model type), or an ISWITCH card has only one of ION/IOFF
 *   (ngspice-47 aborts there: inpcompat.c frees the translated card twice)
 */
export function translatePspiceSwitchModel(raw: string, line: number): PspiceSwitchModel {
  // ngspice reads the lower-cased card with the blanks around '=' removed (inp_remove_ws).
  const text = raw.toLowerCase().replace(/\s*=\s*/g, '=');
  const match = /^\s*\.model\s+([^\s(]+)\s+(vswitch|iswitch)(.*)$/is.exec(text);
  if (!match) throw new ParseError('.model card is missing its name or VSWITCH/ISWITCH type', line, raw);
  const name = match[1];
  const type = match[2] as PspiceSwitchType;
  const spec = TRANSLATIONS[type];
  const { native } = spec;
  // nexttok_noparens: drop the type and the opening parenthesis.
  let params = match[3].replace(/^[\s(]+/, '').trim();
  const closed = params.endsWith(')');

  if (params.includes(`${native.threshold}=`) || params.includes(`${native.hysteresis}=`)) {
    for (const [key, fallback] of [
      ['ron', '1.0'], ['roff', '1.0e12'], [native.threshold, '0'], [native.hysteresis, '0'],
    ]) {
      if (!params.includes(`${key}=`)) params = `${key}=${fallback} ${params}`;
    }
    return {
      kind: 'native',
      raw: closed ? `.model ${name} ${native.type} ( ${params}` : `.model ${name} ${native.type} ${params}`,
    };
  }

  const hasOn = params.includes(`${spec.on}=`);
  const hasOff = params.includes(`${spec.off}=`);
  if (hasOn || hasOff) {
    if (type === 'iswitch' && !(hasOn && hasOff)) {
      throw new ParseError(
        `.model '${name}': PSpice ISWITCH model needs both ION and IOFF `
          + `(ngspice-47 aborts on a card with only ${hasOn ? 'ION' : 'IOFF'})`,
        line,
        raw,
      );
    }
    for (const [key, renamed, fallback] of [
      ['ron', 'r_on', '1.0'], ['roff', 'r_off', '1.0e6'], [spec.on, 'cntl_on', '1'], [spec.off, 'cntl_off', '0'],
    ]) {
      const at = params.indexOf(`${key}=`);
      params = at < 0
        ? `${renamed}=${fallback} ${params}`
        : params.slice(0, at) + renamed + params.slice(at + key.length);
    }
    const translated = closed
      ? `.model ${name} ${spec.codeModel}( ${spec.flags} ${params}`
      : `.model ${name} ${spec.codeModel}(${params} ${spec.flags})`;
    const card = parseXspiceModelCard(translated, line);
    const originalName = raw.trim().split(/[\s(]+/)[1] ?? card.name;
    return { kind: 'xspice', card: { ...card, name: originalName, raw, pspiceSwitch: spec.instance } };
  }

  const expected = `${spec.on.toUpperCase()}/${spec.off.toUpperCase()} or ${native.threshold.toUpperCase()}/${native.hysteresis.toUpperCase()}`;
  throw new ParseError(
    `.model '${name}': bad PSpice ${type.toUpperCase()} switch model, expected ${expected} parameters`,
    line,
    raw,
  );
}
