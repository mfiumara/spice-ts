import { accumulateDigits, parseNumber } from './parser/tokenizer.js';

/**
 * The shortest literal that the netlist parser reads back as exactly `value`.
 * Literals are read as ngspice-47 INPevaluate does (#749): an integer
 * mantissa M times pow(10, E) (times 25.4 first for `mil`), which is not
 * always the correctly rounded value, so Number#toString does not always
 * round-trip (0.30000000000000004, the parsed `0.3`, prints back as `0.3`,
 * and `30u` is 2.9999999999999997e-5, which no plain decimal reads back to).
 * For each precision this tries the plain decimal, then the integer-mantissa
 * form `<M>e<E>` (`30e-6`), which is built exactly as the parser builds the
 * value; then the `mil` form (`74mil` is 74 * 25.4 * 1e-6, which no decimal
 * reaches); then mantissas next to the rounded one; and last, for the few
 * doubles none of those reach (#806), every decimal exponent E with the
 * mantissa doubles next to `value / pow(10, E)`.
 *
 * Some doubles below about 1e-302 have no INPevaluate literal at all: there
 * pow(10, E) is either too coarse (E >= -307) or a subnormal integer
 * multiple K * 2^-1074 (E <= -308, K = 2, 20, 202, ...), so `M * pow(10, E)`
 * steps over them. An odd multiple of 2^-1074 below 2^-1021 is mostly in
 * this set. Those values are written as the nearest double that has a
 * literal (one ulp away, the least drift INPevaluate allows).
 *
 * Every literal is a plain INPevaluate form (no embedded `3k3` RKM), so
 * ngspice-47 reads it in any compatibility mode.
 *
 * @internal Exported for the netlist writer and the round-trip tests.
 */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  const exact = exactLiteral(value);
  if (exact !== undefined) return exact;
  let below = value;
  let above = value;
  for (let ulps = 1; ulps <= MAX_UNREACHABLE_ULPS; ulps++) {
    // Toward zero first, so the written value never grows in magnitude on a tie.
    below = adjacentDouble(below, -1);
    above = adjacentDouble(above, 1);
    const nearest = exactLiteral(below) ?? exactLiteral(above);
    if (nearest !== undefined) return nearest;
  }
  return value.toString();
}

const MAX_UNREACHABLE_ULPS = 4;

/** A literal that reads back as exactly `value`, or undefined when INPevaluate has none. */
function exactLiteral(value: number): string | undefined {
  if (value === 0) return Object.is(value, -0) ? '-0' : '0';
  for (let digits = 1; digits <= 17; digits++) {
    const text = Number(value.toPrecision(digits)).toString();
    if (readsBackAs(text, value)) return text;
    const integerForm = roundedMantissaForm(value, digits, DECIMAL);
    if (readsBackAs(integerForm, value)) return integerForm;
  }
  for (let digits = 1; digits <= 17; digits++) {
    const milForm = roundedMantissaForm(value, digits, MIL);
    if (readsBackAs(milForm, value)) return milForm;
  }
  return nearestMantissaForm(value, DECIMAL)
    ?? nearestMantissaForm(value, MIL)
    ?? anyExponentMantissaForm(value, DECIMAL)
    ?? anyExponentMantissaForm(value, MIL);
}

/** How INPevaluate scales the mantissa for a literal ending in `suffix`. */
interface MantissaUnit { suffix: string; factor: number; exponentOffset: number }
const DECIMAL: MantissaUnit = { suffix: '', factor: 1, exponentOffset: 0 };
const MIL: MantissaUnit = { suffix: 'mil', factor: 25.4, exponentOffset: 6 };

function mantissaLiteral(sign: string, mantissa: string, scale: number, unit: MantissaUnit): string {
  const exponent = scale + unit.exponentOffset;
  return `${sign}${mantissa}${exponent === 0 ? '' : `e${exponent}`}${unit.suffix}`;
}

/** `value` rounded to `digits` significant digits, written as `<M>e<E><unit>` with integer M. */
function roundedMantissaForm(value: number, digits: number, unit: MantissaUnit): string {
  const [mantissa, exponent] = (Math.abs(value) / unit.factor).toExponential(digits - 1).split('e');
  return mantissaLiteral(value < 0 ? '-' : '', mantissa.replace('.', ''), Number(exponent) - (digits - 1), unit);
}

/**
 * A `<M>e<E><unit>` literal for `value` when no rounded mantissa reads back
 * to it: integer mantissas next to `value / pow(10, E)`, from 17 digits (one
 * mantissa step is about one ulp of the product) up to 23 digits, where
 * accumulating the digits rounds and the extra digits pick the rounding.
 */
function nearestMantissaForm(value: number, unit: MantissaUnit): string | undefined {
  const magnitude = Math.abs(value) / unit.factor;
  // 2^-1074 / 25.4 underflows to 0, and log10(0) = -Infinity would never end the loop.
  if (magnitude === 0) return undefined;
  const sign = value < 0 ? '-' : '';
  const topScale = Math.floor(Math.log10(magnitude)) - 16;
  for (let scale = topScale + 1; scale >= topScale - 6; scale--) {
    const rounded = Math.round(magnitude / Number(`1e${scale}`));
    if (!Number.isFinite(rounded)) continue; // pow(10, E) underflows to 0 for subnormal values
    const nearest = BigInt(rounded);
    for (let step = 0n; step <= MANTISSA_SEARCH_STEPS; step++) {
      for (const mantissa of step === 0n ? [nearest] : [nearest - step, nearest + step]) {
        if (mantissa <= 0n) continue;
        const text = mantissaLiteral(sign, mantissa.toString(), scale, unit);
        if (readsBackAs(text, value)) return text;
      }
    }
  }
  return undefined;
}

const MANTISSA_SEARCH_STEPS = 64n;

/**
 * The fallback for doubles that no mantissa near the 17-digit scale reaches
 * (#806). With `p = pow(10, E)`, consecutive mantissa doubles M give products
 * `M * p` that are spaced more finely than the doubles next to `value`
 * whenever M sits further into its binade than `value` does, so trying every
 * E, shortest mantissa first, reaches the doubles the faster searches miss,
 * at the cost of a long mantissa (20 to 65 digits in the #806 sweeps).
 * Mantissas above 2^53 are not exact integers in INPevaluate: its digit
 * accumulation rounds, so `mantissaDigits` builds a digit string that
 * accumulates to exactly the mantissa double.
 */
function anyExponentMantissaForm(value: number, unit: MantissaUnit): string | undefined {
  const magnitude = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  const digitCache = new Map<number, string | undefined>();
  const highest = Math.floor(Math.log10(magnitude / unit.factor));
  for (let scale = highest; scale >= MIN_POW10_EXPONENT; scale--) {
    const target = magnitude / unit.factor / Number(`1e${scale}`);
    if (target < 1) continue;
    if (!Number.isFinite(target)) break; // pow(10, E) underflows to 0 below 1e-323
    for (const mantissa of mantissaDoublesAround(target)) {
      const digits = mantissaDigits(mantissa, digitCache);
      if (digits === undefined) continue;
      const text = mantissaLiteral(sign, digits, scale, unit);
      if (readsBackAs(text, value)) return text;
    }
  }
  return undefined;
}

/** The smallest E with pow(10, E) > 0 in double (1e-323; 1e-324 is 0). */
const MIN_POW10_EXPONENT = -323;
const NEIGHBOUR_DOUBLES = 4;
const EXACT_INTEGER_LIMIT = 2 ** 53;

/**
 * Decimal digits that INPevaluate accumulates (`mantis = 10 * mantis + digit`,
 * rounding at each step above 2^53) to exactly the integral double `mantissa`,
 * or undefined when the nearby prefixes do not reach it.
 */
function mantissaDigits(mantissa: number, cache: Map<number, string | undefined>): string | undefined {
  if (mantissa <= EXACT_INTEGER_LIMIT) return BigInt(mantissa).toString();
  if (cache.has(mantissa)) return cache.get(mantissa);
  const exact = BigInt(mantissa).toString();
  if (accumulateDigits(0, exact) === mantissa) return exact;
  cache.set(mantissa, undefined); // no cycles: every prefix is smaller
  let found: string | undefined;
  search: for (const prefix of mantissaDoublesAround(Math.floor(mantissa / 10))) {
    for (let digit = 0; digit <= 9; digit++) {
      if (accumulateDigits(prefix, String(digit)) !== mantissa) continue;
      const head = mantissaDigits(prefix, cache);
      if (head !== undefined) {
        found = head + digit;
        break search;
      }
    }
  }
  cache.set(mantissa, found);
  return found;
}

/** Integral doubles next to `target`, nearest first. */
function* mantissaDoublesAround(target: number): Generator<number> {
  const centre = Math.round(target);
  yield centre;
  let below = centre;
  let above = centre;
  for (let step = 0; step < NEIGHBOUR_DOUBLES; step++) {
    below = nextIntegralDouble(below, -1);
    above = nextIntegralDouble(above, 1);
    if (below >= 1) yield below;
    yield above;
  }
}

const bits = new DataView(new ArrayBuffer(8));

/** The adjacent integral double: m +/- 1 up to 2^53, the adjacent double above. */
function nextIntegralDouble(m: number, direction: 1 | -1): number {
  return m < EXACT_INTEGER_LIMIT ? m + direction : adjacentDouble(m, direction);
}

/** The adjacent double toward zero (-1) or away from zero (+1); `value` is finite and nonzero. */
function adjacentDouble(value: number, direction: 1 | -1): number {
  bits.setFloat64(0, value);
  bits.setBigUint64(0, bits.getBigUint64(0) + BigInt(direction));
  return bits.getFloat64(0);
}

function readsBackAs(text: string, value: number): boolean {
  try {
    return Object.is(parseNumber(text), value);
  } catch {
    return false; // e.g. `Infinity` from rounding a value near Number.MAX_VALUE
  }
}
