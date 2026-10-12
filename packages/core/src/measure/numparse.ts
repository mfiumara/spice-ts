/**
 * The two number readers ngspice-47's measure code uses, ported so a `.meas`
 * card accepts exactly the numbers ngspice accepts.
 */

/** A parsed number and the text left after it. */
export interface ParsedPrefix {
  value: number;
  rest: string;
}

const isDigit = (character: string | undefined): boolean => character !== undefined && character >= '0' && character <= '9';

/** numparse.c get_decimal_number: `[+-]digits[.digits]` or `[+-].digits`. */
function decimalNumber(text: string): ParsedPrefix | undefined {
  let index = 0;
  let sign = 1;
  if (text[index] === '+') index++;
  else if (text[index] === '-') {
    index++;
    sign = -1;
  }
  if ((!isDigit(text[index]) && text[index] !== '.') || (text[index] === '.' && !isDigit(text[index + 1]))) {
    return undefined;
  }
  let value = 0;
  while (isDigit(text[index])) value = value * 10 + Number(text[index++]);
  if (text[index] === '.') {
    const start = ++index;
    let numerator = 0;
    while (isDigit(text[index])) numerator = numerator * 10 + Number(text[index++]);
    value += numerator * Math.pow(10, start - index);
  }
  return { value: sign * value, rest: text.slice(index) };
}

/** Scale-factor letters shared by both readers: exponent and characters consumed. */
function scaleFactor(text: string): { exponent: number; length: number; mil: boolean } | undefined {
  const lower = text.slice(0, 3).toLowerCase();
  switch (lower[0]) {
    case 't': return { exponent: 12, length: 1, mil: false };
    case 'g': return { exponent: 9, length: 1, mil: false };
    case 'k': return { exponent: 3, length: 1, mil: false };
    case 'u': return { exponent: -6, length: 1, mil: false };
    case 'n': return { exponent: -9, length: 1, mil: false };
    case 'p': return { exponent: -12, length: 1, mil: false };
    case 'f': return { exponent: -15, length: 1, mil: false };
    case 'a': return { exponent: -18, length: 1, mil: false };
    case 'm':
      if (lower === 'meg') return { exponent: 6, length: 3, mil: false };
      if (lower === 'mil') return { exponent: -6, length: 3, mil: true };
      return { exponent: -3, length: 1, mil: false };
    default: return undefined;
  }
}

/**
 * ngspice `ft_numparse(&s, FALSE, &v)` (frontend/parser/numparse.c): a
 * decimal number, then either an `e` exponent (itself a decimal number) or one
 * scale factor; trailing letters are skipped and any other trailing text is
 * ignored. Returns undefined where ngspice returns -1.
 */
export function ftNumparse(text: string): number | undefined {
  const mantissa = decimalNumber(text);
  if (!mantissa) return undefined;
  let { value } = mantissa;
  let rest = mantissa.rest;
  let exponent = 0;
  if (rest[0] === 'e' || rest[0] === 'E') {
    const power = decimalNumber(rest.slice(1));
    if (power) {
      exponent = power.value;
      rest = power.rest;
    }
  } else {
    const scale = scaleFactor(rest);
    if (scale) {
      exponent = scale.exponent;
      if (scale.mil) value *= 25.4;
    }
  }
  return value * (exponent === 0 ? 1 : Math.pow(10, exponent));
}

/**
 * ngspice `INPevaluate2(&s, &err, 0)` (spicelib/parser/inpeval.c): sign,
 * digits, fraction, `e`/`d` exponent and one scale factor. Returns the value
 * and the unparsed rest, or undefined where ngspice sets `err`.
 */
export function inpEvaluate(text: string): ParsedPrefix | undefined {
  let index = 0;
  let sign = 1;
  if (text[index] === '+') index++;
  else if (text[index] === '-') {
    index++;
    sign = -1;
  }
  if (index >= text.length || (!isDigit(text[index]) && text[index] !== '.')) return undefined;
  let mantissa = 0;
  let exponent = 0;
  while (isDigit(text[index])) mantissa = 10 * mantissa + Number(text[index++]);
  if (index >= text.length || text[index] === ':') return { value: mantissa * sign, rest: text.slice(index) };
  if (text[index] === '.') {
    index++;
    if (index >= text.length) return { value: mantissa * sign, rest: '' };
    while (isDigit(text[index])) {
      mantissa = 10 * mantissa + Number(text[index++]);
      exponent--;
    }
  }
  let power = 0;
  let powerSign = 1;
  if ('EeDd'.includes(text[index] ?? '#')) {
    index++;
    if (text[index] === '+') index++;
    else if (text[index] === '-') {
      index++;
      powerSign = -1;
    }
    while (isDigit(text[index])) power = 10 * power + Number(text[index++]);
  }
  const scale = scaleFactor(text.slice(index));
  if (scale) {
    exponent += scale.exponent;
    if (scale.mil) mantissa *= 25.4;
    index += scale.length;
  }
  return { value: sign * mantissa * Math.pow(10, exponent + powerSign * power), rest: text.slice(index) };
}
