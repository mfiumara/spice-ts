import { ParseError } from '../errors.js';
import type { Ngbehavior } from '../types.js';

/**
 * ngspice-47 src/frontend/inpcompat.c set_compat_mode() (lines 61-111).
 * Upstream tests substrings, including `ll` in `all`. We deliberately accept
 * only concatenations of canonical tokens, rejecting typos with ParseError.
 * Flag precedence follows upstream, including mc leaving s3 set. `all` does
 * not enable every vendor mode. Negative sqrt is NOT a compatibility extension:
 * src/spicelib/parser/ptfuncs.c PTsqrt() rejects negatives in every mode;
 * src/frontend/numparam/xpressn.c mathfunction() uses ordinary sqrt().
 * Existing spice-ts expression helpers remain unconditional; retaining these
 * flags does not implement unported vendor syntax/translation passes.
 */
export function parseNgbehavior(value: string, line: number, context: string): Ngbehavior {
  const mode = value.toLowerCase();
  if (!/^(?:hs|ps|xs|lt|ki|all|a|ll|s3|eg|spe|mc)+$/.test(mode)) {
    throw new ParseError(`Invalid .options ngbehavior value: '${value}' (expected canonical compatibility tokens)`, line, context);
  }
  const flags = {
    hs: mode.includes('hs'), ps: mode.includes('ps'), xs: mode.includes('xs'),
    lt: mode.includes('lt'), ki: mode.includes('ki'), a: mode.includes('a'),
    ll: mode.includes('ll'), s3: mode.includes('s3'), eg: mode.includes('eg'),
    spe: mode.includes('spe'), mc: mode.includes('mc'),
  };
  if (flags.spe) flags.ps = flags.lt = flags.ki = flags.eg = false;
  if (flags.hs && flags.ps) flags.hs = false;
  if (flags.mc) {
    flags.eg = flags.hs = flags.spe = flags.ps = flags.xs = flags.ll = flags.lt = flags.ki = flags.a = false;
  }
  return Object.freeze({ mode, flags: Object.freeze(flags) });
}
