import { ParseError } from '../errors.js';

// Ngspice scale factors are case-insensitive. In particular, both M and m
// mean milli; mega must be written as MEG. Values are decimal exponents.
const SI_SCALE_EXPONENT: Record<string, number> = {
  t: 12, g: 9, k: 3, m: -3, meg: 6,
  u: -6, n: -9, p: -12, f: -15, a: -18,
};

// Plain or suffixed number: 1e-14, 10k, 100n, 2.2meg. Ngspice ignores
// alphabetic unit text after a number or scale factor; INPevaluate also skips
// non-ASCII unit text such as `27°C` or `1kΩ` (#790).
// Groups: sign, integer digits, fraction digits, exponent, scale factor.
const SUFFIXED_NUMBER = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?(meg|mil|[tgkmunpfa])?[a-z\u0080-\uffff]*$/i;
// Embedded RKM notation (accepted as an extension): 3k3 = 3300.
const EMBEDDED_NUMBER = /^([+-]?)(\d+)(meg|[tgkmunpfa])(\d+)[a-z]*$/i;

// Index of 10^0 in POW10. Beyond this range 10^e is 0 or Infinity in double.
const POW10_BIAS = 400;
const POW10: number[] = [];
for (let e = -POW10_BIAS; e <= POW10_BIAS; e++) POW10.push(Number(`1e${e}`));

/**
 * `pow(10.0, e)` as the C library returns it for integer `e`. Math.pow(10, e)
 * is off by one ulp for many negative `e` in V8 (e.g. -307, -88), whereas
 * the C library result is the correctly rounded power, which is exactly what
 * the decimal literal `1e<e>` parses to.
 */
function pow10(e: number): number {
  if (e < -POW10_BIAS) return 0;
  if (e > POW10_BIAS) return Infinity;
  return POW10[e + POW10_BIAS];
}

// Below this, 10 * m + code is exact, so fused and unfused rounding agree.
const EXACT_ACCUMULATION_LIMIT = 2 ** 49;

/**
 * Accumulate decimal digits into a double the way ngspice-47 INPevaluate
 * does (`mantis = 10 * mantis + *here - '0'`), so long digit strings round
 * at the same steps as in C. The reference ngspice-47 build (Homebrew,
 * Apple arm64; see benchmarks/AGGREGATE_PARITY.md) contracts `10 * mantis +
 * *here` into one fused multiply-add, so that sum is rounded once. This only
 * matters for mantissas of 16 or more significant digits;
 * below that every step is exact on any build.
 */
function accumulateDigits(mantissa: number, digits: string): number {
  let m = mantissa;
  for (let i = 0; i < digits.length; i++) {
    const code = digits.charCodeAt(i);
    m = m < EXACT_ACCUMULATION_LIMIT || m === Infinity
      ? 10 * m + code - 48
      : Number(BigInt(m) * 10n + BigInt(code)) - 48;
  }
  return m;
}

/**
 * A number literal as ngspice-47 `INPevaluate` (src/spicelib/parser/inpeval.c)
 * builds it: the digits form an integer mantissa, the fraction digits, the
 * `e` exponent and the scale factor form one decimal exponent, and the value
 * is `sign * mantissa * pow(10, exponent)` (`mil` also scales the mantissa by
 * 25.4). This is not always the correctly rounded value of the literal
 * (`1.3u` is 1.2999999999999998e-6), and matching it keeps samples that land
 * exactly on a source discontinuity on the same side as ngspice (#749).
 */
function inpEvaluate(
  sign: string,
  intDigits: string,
  fracDigits: string,
  exponent: string | undefined,
  scale: string | undefined,
): number {
  let mantissa = accumulateDigits(accumulateDigits(0, intDigits), fracDigits);
  let expo = -fracDigits.length + (exponent === undefined ? 0 : parseInt(exponent, 10));
  if (scale !== undefined) {
    const lower = scale.toLowerCase();
    if (lower === 'mil') {
      expo -= 6;
      mantissa *= 25.4;
    } else {
      expo += SI_SCALE_EXPONENT[lower];
    }
  }
  return (sign === '-' ? -1 : 1) * mantissa * pow10(expo);
}

export function parseNumber(token: string): number {
  const trimmed = token.trim();

  // The suffixed and embedded forms are disjoint (embedded needs a digit
  // after the scale letter, suffixed allows only letters there), so the
  // common plain/suffixed form is decided by a single regex execution.
  const suffixMatch = SUFFIXED_NUMBER.exec(trimmed);
  if (suffixMatch) {
    const [, sign, intDigits, fracDigits = '', exponent, scale] = suffixMatch;
    // An exponent plus a scale factor (e.g. '1e3k') has always been rejected;
    // only `mil` (a unit rather than a power of ten) may follow an exponent.
    if ((intDigits !== '' || fracDigits !== '')
      && (exponent === undefined || scale === undefined || scale.toLowerCase() === 'mil')) {
      return inpEvaluate(sign, intDigits, fracDigits, exponent, scale);
    }
  } else {
    const embeddedMatch = EMBEDDED_NUMBER.exec(trimmed);
    if (embeddedMatch) {
      // ngspice-47 INPevaluateRKM_*: (mantis + deci * pow(10, -digits)) * pow(10, scale).
      const [, sign, intDigits, scale, decimals] = embeddedMatch;
      const mantissa = accumulateDigits(0, intDigits)
        + accumulateDigits(0, decimals) * pow10(-decimals.length);
      return (sign === '-' ? -1 : 1) * mantissa * pow10(SI_SCALE_EXPONENT[scale.toLowerCase()]);
    }
  }

  throw new Error(`Cannot parse number: '${token}'`);
}

export interface ParsedLine {
  raw: string;
  lineNumber: number;
  tokens: string[];
}

export interface TokenizeNetlistOptions {
  firstLineIsTitle?: boolean;
}

// After '=' normalization a token is a single parenthesis or a maximal run of
// characters other than whitespace, parentheses and commas. A balanced,
// whitespace-free `{...}` expression is kept whole, parentheses and commas
// included, so a compacted subcircuit value such as `r={(3)*scale}` (from
// `.func` expansion) or `{max(a,b)}` stays one token for per-instance
// evaluation (#496).
const LINE_TOKEN = /[()]|(?:[^\s(),{]+|\{[^{}\s]*\}|\{)+/g;
const SPACES_AROUND_EQUALS = /\s*=\s*/g;

export function tokenizeNetlist(
  netlist: string,
  options: TokenizeNetlistOptions = {},
): ParsedLine[] {
  const result: ParsedLine[] = [];
  const length = netlist.length;

  // The logical line being accumulated; continuation lines append to it and
  // it is tokenized once the next logical line starts or the input ends.
  let pendingText: string | undefined;
  let pendingLineNumber = 0;

  let lineStart = 0;
  for (let lineIndex = 0; lineStart <= length; lineIndex++) {
    let lineEnd = netlist.indexOf('\n', lineStart);
    if (lineEnd < 0) lineEnd = length;
    const line = netlist.slice(lineStart, lineEnd);
    lineStart = lineEnd + 1;
    if (lineIndex === 0 && options.firstLineIsTitle) continue;

    const trimmed = stripEndOfLineComment(line).trim();
    if (trimmed === '' || trimmed.startsWith('*') || trimmed.startsWith(';')) continue;
    // toUpperCase never shortens a string, so only <= 4 chars can be '.END'.
    if (trimmed.length <= 4 && trimmed.toUpperCase() === '.END') continue;

    if (trimmed.startsWith('+') && pendingText !== undefined) {
      pendingText += ' ' + trimmed.substring(1).trim();
      continue;
    }

    if (pendingText !== undefined) {
      result.push({ raw: pendingText, lineNumber: pendingLineNumber, tokens: tokenizeLine(pendingText) });
    }
    pendingText = trimmed;
    pendingLineNumber = lineIndex + 1;
  }

  if (pendingText !== undefined) {
    result.push({ raw: pendingText, lineNumber: pendingLineNumber, tokens: tokenizeLine(pendingText) });
  }
  return result;
}

/**
 * Equivalent of the former replace(/\s*=\s*\/g, '=') -> pad '(' and ')' with
 * spaces -> ',' to ' ' -> split(/\s+/) -> drop empty tokens, without building
 * the intermediate strings.
 */
export function tokenizeLine(text: string): string[] {
  const normalized = text.includes('=') ? text.replace(SPACES_AROUND_EQUALS, '=') : text;
  return normalized.match(LINE_TOKEN) ?? [];
}

function stripEndOfLineComment(line: string): string {
  let commentStart = line.indexOf('$');
  if (commentStart < 0) commentStart = line.length;
  const semicolon = line.indexOf(';');
  if (semicolon >= 0 && semicolon < commentStart) commentStart = semicolon;
  const slashes = line.indexOf('//');
  if (slashes >= 0 && slashes < commentStart) commentStart = slashes;
  return commentStart === line.length ? line : line.slice(0, commentStart);
}
