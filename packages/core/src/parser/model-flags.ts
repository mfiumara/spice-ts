import { ParseError } from '../errors.js';

/**
 * ngspice-47 `IF_FLAG` model parameters that a `.model` card may write bare
 * (no `=value`), keyed by the upper-cased spice-ts model type. ngspice's
 * INPgetValue gives an `IF_FLAG` the value 1 without consuming a token
 * (inpgval.c), so `xpart` and `xpart=0` both set the flag.
 *
 * Sources (model parameter tables, `*_MOD_*` ids only):
 * - D: dio.c `d`
 * - NPN/PNP: bjt.c, vbic.c, hicum2.c `npn`/`pnp`
 * - NJF: jfet.c, jfet2.c `njf`/`pjf`
 * - NMOS/PMOS: mos1/2/3/6/9.c, b3*.c, b4*.c, hsm*.c `nmos`/`pmos`; b1.c (BSIM1,
 *   LEVEL=4 only) `xpart`. BSIM3/BSIM4 `xpart` is IF_REAL and keeps its value.
 * - NHFET: hfet.c, hfet2.c `nhfet`/`phfet`
 * - NMF: mes.c, mesa.c `nmf`/`pmf`
 * - C: cap.c `c`; L: ind.c `l`; SW: sw.c `sw`; CSW: csw.c `csw`
 * - R: res.c has no model flag.
 *
 * LTRA/TXL/CPL and VDMOS cards are parsed by their own parsers.
 */
export const MODEL_FLAG_PARAMETERS: Readonly<Record<string, ReadonlySet<string>>> = {
  D: new Set(['D']),
  NPN: new Set(['NPN', 'PNP']),
  PNP: new Set(['NPN', 'PNP']),
  NJF: new Set(['NJF', 'PJF']),
  NMOS: new Set(['NMOS', 'PMOS']),
  PMOS: new Set(['NMOS', 'PMOS']),
  NHFET: new Set(['NHFET', 'PHFET']),
  NMF: new Set(['NMF', 'PMF']),
  R: new Set(),
  C: new Set(['C']),
  L: new Set(['L']),
  SW: new Set(['SW']),
  CSW: new Set(['CSW']),
};

/** BSIM1 (`LEVEL=4`, b1.c) adds the `xpart` charge-partition flag. */
const BSIM1_FLAG_PARAMETERS: ReadonlySet<string> = new Set(['NMOS', 'PMOS', 'XPART']);

/** Bare-flag parameter names ngspice-47 accepts for a model `type` at `level`. */
export function modelFlagParameters(type: string, level: number | undefined): ReadonlySet<string> {
  if ((type === 'NMOS' || type === 'PMOS') && level === 4) return BSIM1_FLAG_PARAMETERS;
  return MODEL_FLAG_PARAMETERS[type] ?? new Set();
}

/**
 * Polarity flags. In ngspice a bare `pnp` on an `npn` card flips the device
 * type; spice-ts takes polarity from the card type only, so a polarity flag
 * other than the card type itself is rejected rather than simulated with the
 * wrong sign.
 */
const POLARITY_FLAGS: ReadonlySet<string> = new Set([
  'NPN', 'PNP', 'NMOS', 'PMOS', 'NJF', 'PJF', 'NHFET', 'PHFET', 'NMF', 'PMF',
]);

/**
 * Thrown for a bare (valueless) `.model` token that is neither an ngspice-47
 * `IF_FLAG` model parameter of the card's type nor a parameter name followed
 * by its value, or for a polarity flag that contradicts the card type. Such
 * tokens used to be dropped silently, so a card could simulate with a
 * different model than the one written.
 */
export class UnsupportedModelFlagError extends ParseError {
  /** Stable machine-readable error code. */
  readonly code = 'UNSUPPORTED_MODEL_FLAG';

  constructor(
    /** Model name as written on the `.model` card */
    public readonly modelName: string,
    /** Upper-cased model type */
    public readonly modelType: string,
    /** Upper-cased offending token */
    public readonly flag: string,
    /** Bare flags ngspice-47 accepts for this model type */
    public readonly acceptedFlags: readonly string[],
    line: number,
    context: string,
    detail?: string,
  ) {
    super(
      `.model '${modelName}' (${modelType}) has unsupported bare parameter '${flag}'`
        + (detail ? ` (${detail})` : ` (accepted flags: ${acceptedFlags.join(', ') || 'none'};`
          + ' other parameters need a value)'),
      line,
      context,
    );
    this.name = 'UnsupportedModelFlagError';
  }
}

/**
 * Flags that change the simulation and are stored on the model as 1 (the
 * value ngspice INPgetValue gives an IF_FLAG). The device-type flags (`d`,
 * `npn`, `nmos`, `c`, ...) only restate the card type and are not stored:
 * storing a bare `l` as `L=1` would read as a 1 H inductance.
 */
const STORED_FLAGS: ReadonlySet<string> = new Set(['XPART']);

/**
 * Classify the bare `.model` token `key` (upper-cased) for a card of `type`
 * at `level`: `'store'` (set `params[key] = 1`), `'ignore'` (a device-type
 * flag), or undefined when it is not a flag. Throws
 * {@link UnsupportedModelFlagError} for a polarity flag that contradicts `type`.
 */
export function classifyModelFlag(
  modelName: string,
  type: string,
  level: number | undefined,
  key: string,
  line: number,
  context: string,
): 'store' | 'ignore' | undefined {
  const flags = modelFlagParameters(type, level);
  if (!flags.has(key)) return undefined;
  if (POLARITY_FLAGS.has(key) && key !== type) {
    throw new UnsupportedModelFlagError(
      modelName, type, key, [...flags], line, context,
      `contradicts the '${type}' card polarity; spice-ts takes polarity from the model type`,
    );
  }
  return STORED_FLAGS.has(key) ? 'store' : 'ignore';
}
