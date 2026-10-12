import { ParseError } from '../errors.js';
import { parseXspiceModelCard, type XspiceModelCard } from './xspice-parser.js';

/**
 * A PSpice `.model <name> VSWITCH(...)` card as ngspice-47's PSpice
 * compatibility mode rewrites it (frontend/inpcompat.c pspice_compat):
 *
 * - with `VT=`/`VH=`: the native voltage-controlled switch, `.model <name> sw`,
 *   with the missing RON/ROFF/VT/VH given as `ron=1.0 roff=1.0e12 vt=0 vh=0`;
 * - with `VON=`/`VOFF=`: the XSPICE `pswitch` code model, RON/ROFF/VON/VOFF
 *   renamed to r_on/r_off/cntl_on/cntl_off (defaults r_on=1.0 r_off=1.0e6
 *   cntl_on=1 cntl_off=0) and `log=TRUE`. ngspice rewrites every S instance of
 *   such a model into `a<name> %gd(nc+ nc-) %gd(n+ n-) a<model>`; spice-ts
 *   keeps the S instance and compiles it to that pswitch device.
 *
 * Other parameters (the PSpice delay TD) stay on the card, where the pswitch
 * parameter table ignores them with ngspice's MIF warning.
 */
export type PspiceSwitchModel =
  | { readonly kind: 'sw'; readonly raw: string }
  | { readonly kind: 'pswitch'; readonly card: XspiceModelCard };

/** True for a tokenized `.model <name> VSWITCH ...` card. */
export function isPspiceVswitchModel(tokens: readonly string[]): boolean {
  return tokens[0]?.toUpperCase() === '.MODEL' && tokens[2]?.toUpperCase() === 'VSWITCH';
}

const VSWITCH_CARD = /^\s*\.model\s+([^\s(]+)\s+vswitch(.*)$/is;

/**
 * Translate a PSpice VSWITCH `.model` card (see {@link PspiceSwitchModel}).
 *
 * @throws {@link ParseError} when the card has neither VON/VOFF nor VT/VH
 *   (ngspice-47: "Bad switch model", then an unknown model type)
 */
export function translatePspiceVswitchModel(raw: string, line: number): PspiceSwitchModel {
  // ngspice reads the lower-cased card with the blanks around '=' removed (inp_remove_ws).
  const text = raw.toLowerCase().replace(/\s*=\s*/g, '=');
  const match = VSWITCH_CARD.exec(text);
  if (!match) throw new ParseError('.model card is missing its name or VSWITCH type', line, raw);
  const name = match[1];
  // nexttok_noparens: drop the type and the opening parenthesis.
  let params = match[2].replace(/^[\s(]+/, '').trim();
  const closed = params.endsWith(')');

  if (params.includes('vt=') || params.includes('vh=')) {
    for (const [key, fallback] of [['ron', '1.0'], ['roff', '1.0e12'], ['vt', '0'], ['vh', '0']]) {
      if (!params.includes(`${key}=`)) params = `${key}=${fallback} ${params}`;
    }
    return { kind: 'sw', raw: closed ? `.model ${name} sw ( ${params}` : `.model ${name} sw ${params}` };
  }

  if (params.includes('von=') || params.includes('voff=')) {
    for (const [key, renamed, fallback] of [
      ['ron', 'r_on', '1.0'], ['roff', 'r_off', '1.0e6'], ['von', 'cntl_on', '1'], ['voff', 'cntl_off', '0'],
    ]) {
      const at = params.indexOf(`${key}=`);
      params = at < 0
        ? `${renamed}=${fallback} ${params}`
        : params.slice(0, at) + renamed + params.slice(at + key.length);
    }
    const translated = closed
      ? `.model ${name} pswitch( log=TRUE ${params}`
      : `.model ${name} pswitch(${params} log=TRUE)`;
    const card = parseXspiceModelCard(translated, line);
    const originalName = raw.trim().split(/[\s(]+/)[1] ?? card.name;
    return { kind: 'pswitch', card: { ...card, name: originalName, raw, pspiceVswitch: true } };
  }

  throw new ParseError(
    `.model '${name}': bad PSpice VSWITCH switch model, expected VON/VOFF or VT/VH parameters`,
    line,
    raw,
  );
}
