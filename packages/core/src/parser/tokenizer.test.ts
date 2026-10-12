import { describe, it, expect } from 'vitest';
import { parseNumber, tokenizeNetlist } from './tokenizer.js';

describe('parseNumber', () => {
  it('parses plain integers', () => {
    expect(parseNumber('42')).toBe(42);
  });

  it('parses plain floats', () => {
    expect(parseNumber('3.14')).toBeCloseTo(3.14);
  });

  it('parses scientific notation', () => {
    expect(parseNumber('1e-14')).toBe(1e-14);
    expect(parseNumber('2.5E3')).toBe(2500);
  });

  describe('ngspice scale factors', () => {
    it('parses k/K as kilo (1e3)', () => {
      expect(parseNumber('10k')).toBe(10000);
      expect(parseNumber('4.7K')).toBe(4700);
    });

    it('parses m as milli (1e-3)', () => {
      expect(parseNumber('2.2m')).toBeCloseTo(0.0022);
    });

    it('parses m/M as milli (1e-3)', () => {
      expect(parseNumber('1M')).toBe(1e-3);
      expect(parseNumber('10m')).toBe(10e-3);
    });

    it('parses meg/MEG as mega (1e6)', () => {
      expect(parseNumber('2.2meg')).toBe(2.2e6);
      expect(parseNumber('1MEG')).toBe(1e6);
    });

    it('parses mil as one thousandth of an inch', () => {
      // ngspice-47 INPevaluate: mantissa * 25.4 * pow(10, -6) (#749).
      expect(parseNumber('1mil')).toBe(25.4 * 1e-6);
      expect(parseNumber('10MIL')).toBe(254 * 1e-6);
    });

    it('parses u as micro (1e-6)', () => {
      expect(parseNumber('100u')).toBe(100 * 1e-6);
    });

    it('parses n as nano (1e-9)', () => {
      expect(parseNumber('100n')).toBe(100 * 1e-9);
    });

    it('parses p as pico (1e-12)', () => {
      expect(parseNumber('10p')).toBe(10e-12);
    });

    it('parses f as femto (1e-15)', () => {
      expect(parseNumber('1f')).toBe(1e-15);
    });

    it('parses T as tera (1e12)', () => {
      expect(parseNumber('1T')).toBe(1e12);
    });

    it('parses G as giga (1e9)', () => {
      expect(parseNumber('2G')).toBe(2e9);
    });

    it('ignores letters following a number or scale factor', () => {
      expect(parseNumber('10Volts')).toBe(10);
      expect(parseNumber('1kHz')).toBe(1e3);
      expect(parseNumber('2.2MegOhm')).toBe(2.2e6);
    });
  });

  describe('embedded suffix notation', () => {
    it('parses 3k3 as 3300', () => {
      expect(parseNumber('3k3')).toBe(3300);
    });

    it('parses 4M7 as 0.0047', () => {
      expect(parseNumber('4M7')).toBeCloseTo(0.0047);
    });

    it('parses 1k5 as 1500', () => {
      expect(parseNumber('1k5')).toBe(1500);
    });

    it('parses 2n2 as 2.2e-9', () => {
      expect(parseNumber('2n2')).toBeCloseTo(2.2e-9);
    });

    it('parses 4meg7 as 4.7e6', () => {
      expect(parseNumber('4meg7')).toBe(4.7e6);
    });
  });

  it('throws on unparseable tokens', () => {
    expect(() => parseNumber('abc')).toThrow('Cannot parse number');
  });
});

describe('tokenizeNetlist', () => {
  it('removes end-of-line comments before merging required continuation syntax', () => {
    const lines = tokenizeNetlist('.tran 1n $ step\n+ 10n ; stop time\n.op // trailing comment');

    expect(lines).toEqual([
      { raw: '.tran 1n 10n', lineNumber: 1, tokens: ['.tran', '1n', '10n'] },
      { raw: '.op', lineNumber: 3, tokens: ['.op'] },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Behavior pins for issue #369 (tokenizer/number-parse performance). These
// were written against the pre-optimization implementation and must keep
// passing unchanged; the reference copies below are that implementation
// verbatim, used as a differential oracle. Deliberate semantic changes since:
// #496 keeps whitespace-free `{...}` groups whole (see referenceTokenizeNetlist).
// #749 builds accepted values as ngspice-47 INPevaluate does (see
// referenceParseNumber); which tokens are accepted is unchanged.
// ---------------------------------------------------------------------------

const REFERENCE_SI_SUFFIX_MAP: Record<string, string> = {
  t: 'e12', g: 'e9', k: 'e3', m: 'e-3',
  u: 'e-6', n: 'e-9', p: 'e-12', f: 'e-15', a: 'e-18',
};

/**
 * Character-by-character port of ngspice-47 INPevaluate
 * (src/spicelib/parser/inpeval.c), with INPevaluateRKM_*'s digits after the
 * scale factor when `rkm` is set. `10 * mantis + *here` is rounded once, as
 * in the fused multiply-add the reference arm64 build compiles it to.
 */
function cInpEvaluate(token: string, rkm: boolean): number {
  let i = 0;
  let mantis = 0;
  let expo1 = 0;
  let expo2 = 0;
  let sign = 1;
  let expsgn = 1;
  const isDigit = (c: string | undefined) => c !== undefined && c >= '0' && c <= '9';
  const accumulate = (m: number, c: string) =>
    Number.isFinite(m) ? Number(BigInt(m) * 10n + BigInt(c.charCodeAt(0))) - 48 : m;
  if (token[i] === '+') i++;
  else if (token[i] === '-') { i++; sign = -1; }
  while (isDigit(token[i])) mantis = accumulate(mantis, token[i++]);
  if (token[i] === '.') {
    i++;
    while (isDigit(token[i])) { mantis = accumulate(mantis, token[i++]); expo1--; }
  }
  // Legacy spice-ts grammar (kept by #749): `e` starts an exponent only when
  // digits follow; otherwise it is unit text (ngspice would still read a
  // scale factor after it, e.g. '12eu').
  if ((token[i] === 'e' || token[i] === 'E') && /^[eE][+-]?\d/.test(token.slice(i))) {
    i++;
    if (token[i] === '+') i++;
    else if (token[i] === '-') { i++; expsgn = -1; }
    while (isDigit(token[i])) expo2 = 10 * expo2 + token.charCodeAt(i++) - 48;
  }
  const scale = token.slice(i).toLowerCase();
  const exponents: Record<string, number> = { t: 12, g: 9, k: 3, m: -3, u: -6, n: -9, p: -12, f: -15, a: -18 };
  if (scale.startsWith('meg')) {
    expo1 += 6;
    i += 2;
  } else if (scale.startsWith('mil')) {
    expo1 -= 6;
    mantis *= 25.4;
  } else if (scale[0] in exponents) {
    expo1 += exponents[scale[0]];
  }
  if (rkm) {
    i++;
    let deci = 0;
    let expo3 = 0;
    while (isDigit(token[i])) { deci = 10 * deci + token.charCodeAt(i++) - 48; expo3--; }
    mantis = mantis + deci * Number(`1e${expo3}`);
  }
  // pow(10, e) of the C library is the correctly rounded power: `1e<e>`.
  return sign * mantis * Number(`1e${expo1 + expsgn * expo2}`);
}

function referenceParseNumber(token: string): number {
  const trimmed = token.trim();
  const plain = Number(trimmed);
  if (!isNaN(plain) && /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(trimmed)) {
    return cInpEvaluate(trimmed, false);
  }
  const embeddedMatch = trimmed.match(/^([+-]?\d+)(meg|[tgkmunpfa])(\d+)[a-z]*$/i);
  if (embeddedMatch) {
    const numStr = embeddedMatch[1] + '.' + embeddedMatch[3];
    const suffix = embeddedMatch[2].toLowerCase();
    const exp = suffix === 'meg' ? 'e6' : REFERENCE_SI_SUFFIX_MAP[suffix];
    const val = Number(numStr + exp);
    if (!isNaN(val)) return cInpEvaluate(trimmed, true);
  }
  const suffixMatch = trimmed.match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)(meg|mil|[tgkmunpfa])?([a-z]*)$/i);
  if (suffixMatch) {
    const suffix = suffixMatch[2]?.toLowerCase();
    const exp = suffix === 'meg' ? 'e6' : suffix && suffix !== 'mil' ? REFERENCE_SI_SUFFIX_MAP[suffix] : '';
    const val = suffix === 'mil'
      ? Number(suffixMatch[1]) * 25.4e-6
      : Number(suffixMatch[1] + exp);
    if (!isNaN(val)) return cInpEvaluate(trimmed, false);
  }
  throw new Error(`Cannot parse number: '${token}'`);
}

function referenceTokenizeNetlist(
  netlist: string,
  options: { firstLineIsTitle?: boolean } = {},
): { raw: string; lineNumber: number; tokens: string[] }[] {
  const rawLines = netlist.split('\n');
  const result: { raw: string; lineNumber: number; tokens: string[] }[] = [];
  const mergedLines: { text: string; lineNumber: number }[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    if (i === 0 && options.firstLineIsTitle) continue;
    const trimmed = referenceStripEndOfLineComment(rawLines[i]).trim();
    if (trimmed === '' || trimmed.startsWith('*') || trimmed.startsWith(';')) continue;
    if (trimmed.toUpperCase() === '.END') continue;
    if (trimmed.startsWith('+') && mergedLines.length > 0) {
      mergedLines[mergedLines.length - 1].text += ' ' + trimmed.substring(1).trim();
      continue;
    }
    mergedLines.push({ text: trimmed, lineNumber: i + 1 });
  }
  for (const { text, lineNumber } of mergedLines) {
    // #496: a whitespace-free `{...}` group keeps its parentheses and commas
    // (stashed here, restored after splitting). Placeholders use U+E000, which
    // the fuzz fragments never contain.
    const groups: string[] = [];
    const normalized = text
      .replace(/\s*=\s*/g, '=')
      .replace(/\{[^{}\s]*\}/g, group => `\ue000${groups.push(group) - 1}\ue000`)
      .replace(/\(/g, ' ( ')
      .replace(/\)/g, ' ) ')
      .replace(/,/g, ' ');
    const tokens = normalized.split(/\s+/).filter(t => t.length > 0)
      .map(token => token.replace(/\ue000(\d+)\ue000/g, (_match, index: string) => groups[Number(index)]));
    result.push({ raw: text, lineNumber, tokens });
  }
  return result;
}

function referenceStripEndOfLineComment(line: string): string {
  let commentStart = line.length;
  for (const delimiter of ['$', ';', '//']) {
    const index = line.indexOf(delimiter);
    if (index >= 0 && index < commentStart) commentStart = index;
  }
  return line.slice(0, commentStart);
}

/** Deterministic PRNG (mulberry32) so fuzz failures are reproducible. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function outcome(fn: () => number): { value: number } | { error: string } {
  try {
    return { value: fn() };
  } catch (error) {
    return { error: (error as Error).message };
  }
}

describe('parseNumber behavior pins (#369)', () => {
  it('returns the same double for the scale-factor and decimal-exponent spellings (#749)', () => {
    // Both are mantissa * pow(10, e) with the same mantissa and exponent.
    expect(parseNumber('1.1m')).toBe(parseNumber('1.1e-3'));
    expect(parseNumber('1.1m')).toBe(11 * 1e-4);
    expect(parseNumber('0.1k')).toBe(parseNumber('0.1e3'));
    expect(parseNumber('3.3u')).toBe(parseNumber('3.3e-6'));
    expect(parseNumber('3.3u')).toBe(33 * 1e-7);
    expect(parseNumber('4.7meg')).toBe(parseNumber('4.7e6'));
    expect(parseNumber('2n2')).toBe((2 + 2 * 1e-1) * 1e-9);
    expect(parseNumber('1a')).toBe(1e-18);
  });

  it('accepts signs, leading and trailing decimal points', () => {
    expect(parseNumber('+5')).toBe(5);
    expect(parseNumber('-1k')).toBe(-1000);
    expect(parseNumber('-.5')).toBe(-0.5);
    expect(parseNumber('.5u')).toBe(0.5e-6);
    expect(parseNumber('1.')).toBe(1);
    expect(parseNumber('-3k3')).toBe(-3300);
    expect(Object.is(parseNumber('-0'), -0)).toBe(true);
  });

  it('combines exponents with unit text and mil, but rejects exponent plus scale factor', () => {
    // Pinned as-is: the legacy parser builds e.g. '1e3e3', which is NaN and
    // therefore rejected. Changing that is a behavior change outside #369.
    expect(() => parseNumber('1e3k')).toThrow("Cannot parse number: '1e3k'");
    expect(() => parseNumber('1E+2meg')).toThrow("Cannot parse number: '1E+2meg'");
    expect(parseNumber('1e3mil')).toBe(25.4 * 1e-3);
    expect(parseNumber('1e3V')).toBe(1000);
    expect(parseNumber('1e400')).toBe(Infinity);
    expect(parseNumber('1e')).toBe(1);
    expect(parseNumber('1Ek')).toBe(1);
    expect(parseNumber('2Volts')).toBe(2);
  });

  it('gives meg and mil priority over single-letter m, case-insensitively', () => {
    expect(parseNumber('1MILLI')).toBe(25.4 * 1e-6);
    expect(parseNumber('1mils')).toBe(25.4 * 1e-6);
    expect(parseNumber('1megk')).toBe(1e6);
    expect(parseNumber('1Meter')).toBe(1e-3);
    expect(parseNumber('1me')).toBe(1e-3);
  });

  it('trims surrounding whitespace, including Unicode spaces', () => {
    expect(parseNumber(' 10k ')).toBe(10000);
    expect(parseNumber('\t1n\r')).toBe(1e-9);
    expect(parseNumber('\u00a02.2\u3000')).toBe(2.2);
  });

  it('rejects malformed tokens with the original (untrimmed) token in the message', () => {
    for (const bad of ['', ' ', '.', '+', '-k', '--1', '1 k', '1e+', '3.3k3', '1e3k3', '1mil5', '1k5.3',
      'NaN', 'Infinity', '0x10', '1_000', '\uff11', '1k\u00e9', 'k1', '1,5']) {
      expect(() => parseNumber(bad), JSON.stringify(bad)).toThrow(`Cannot parse number: '${bad}'`);
    }
  });

  it('matches the reference implementation on a deterministic fuzz corpus', () => {
    const fragments = ['0', '1', '2', '9', '00', '12', '.', '+', '-', 'e', 'E', 'e-', 'e+', 'k', 'K', 'm', 'M',
      'meg', 'MEG', 'mil', 'Mil', 'u', 'n', 'p', 'f', 'a', 't', 'g', 'G', 'x', 'z', 'V', 'Hz', 'ohm', ' ',
      '\t', '\u00a0', '\u180e', '\u0085', '\u00e9', '_', '$', '{', '}'];
    const random = prng(369);
    const mismatches: string[] = [];
    for (let i = 0; i < 20000; i++) {
      const parts = 1 + Math.floor(random() * 6);
      let token = '';
      for (let j = 0; j < parts; j++) token += fragments[Math.floor(random() * fragments.length)];
      const actual = outcome(() => parseNumber(token));
      const expected = outcome(() => referenceParseNumber(token));
      const same = 'value' in expected
        ? 'value' in actual && Object.is(actual.value, expected.value)
        : 'error' in actual && actual.error === expected.error;
      if (!same) mismatches.push(`${JSON.stringify(token)}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
    }
    expect(mismatches).toEqual([]);
  });
});

describe('tokenizeNetlist behavior pins (#369)', () => {
  it('collapses whitespace around = into one token', () => {
    expect(tokenizeNetlist('.model d1 D(is=1e-14 n = 1.5)')[0].tokens)
      .toEqual(['.model', 'd1', 'D', '(', 'is=1e-14', 'n=1.5', ')']);
    expect(tokenizeNetlist('x = = y')[0].tokens).toEqual(['x==y']);
    expect(tokenizeNetlist('a , = b')[0].tokens).toEqual(['a', '=b']);
    expect(tokenizeNetlist('a = , b')[0].tokens).toEqual(['a=', 'b']);
    expect(tokenizeNetlist('a = (b)')[0].tokens).toEqual(['a=', '(', 'b', ')']);
    expect(tokenizeNetlist('ic=1 , 2')[0].tokens).toEqual(['ic=1', '2']);
  });

  it('splits parentheses into tokens and treats commas as separators', () => {
    expect(tokenizeNetlist('V1 1 0 SIN(0 1 1k)')[0].tokens)
      .toEqual(['V1', '1', '0', 'SIN', '(', '0', '1', '1k', ')']);
    expect(tokenizeNetlist('.print v(a,b) i(V1)')[0].tokens)
      .toEqual(['.print', 'v', '(', 'a', 'b', ')', 'i', '(', 'V1', ')']);
    expect(tokenizeNetlist('X1 ((a)),,b')[0].tokens).toEqual(['X1', '(', '(', 'a', ')', ')', 'b']);
  });

  it('splits brace expressions that contain whitespace', () => {
    expect(tokenizeNetlist('R1 a b {rval * 2}')[0].tokens).toEqual(['R1', 'a', 'b', '{rval', '*', '2}']);
    expect(tokenizeNetlist('.param x = {a + b}')[0].tokens).toEqual(['.param', 'x={a', '+', 'b}']);
  });

  it('keeps a whitespace-free brace expression with parentheses and commas whole (#496)', () => {
    expect(tokenizeNetlist('R1 a b {f(1,2)}')[0].tokens).toEqual(['R1', 'a', 'b', '{f(1,2)}']);
    expect(tokenizeNetlist('R1 a b r={((3)*scale)} m=2')[0].tokens).toEqual(['R1', 'a', 'b', 'r={((3)*scale)}', 'm=2']);
    expect(tokenizeNetlist('C1 a b {max(x,y)}x(1)')[0].tokens).toEqual(['C1', 'a', 'b', '{max(x,y)}x', '(', '1', ')']);
    expect(tokenizeNetlist('R1 a b {f(1, 2)}')[0].tokens).toEqual(['R1', 'a', 'b', '{f', '(', '1', '2', ')', '}']);
    expect(tokenizeNetlist('R1 a b {open(1)')[0].tokens).toEqual(['R1', 'a', 'b', '{open', '(', '1', ')']);
  });

  it('strips full-line and end-of-line comments with the earliest delimiter winning', () => {
    expect(tokenizeNetlist('* full\n  * indented\n; semi\nR1 a b 1k ; c $ d\nR2 a b 2k $ e ; f\nR3 a b 3 // g\nR4 a/b c 1')).toEqual([
      { raw: 'R1 a b 1k', lineNumber: 4, tokens: ['R1', 'a', 'b', '1k'] },
      { raw: 'R2 a b 2k', lineNumber: 5, tokens: ['R2', 'a', 'b', '2k'] },
      { raw: 'R3 a b 3', lineNumber: 6, tokens: ['R3', 'a', 'b', '3'] },
      { raw: 'R4 a/b c 1', lineNumber: 7, tokens: ['R4', 'a/b', 'c', '1'] },
    ]);
    expect(tokenizeNetlist('$ only\n   // only\nR1 a b 1k$x')).toEqual([
      { raw: 'R1 a b 1k', lineNumber: 3, tokens: ['R1', 'a', 'b', '1k'] },
    ]);
  });

  it('merges continuation lines across skipped lines into the last kept line', () => {
    expect(tokenizeNetlist('R1 a b\n\n* note\n+ 1k\n+\n.end\n+ x')).toEqual([
      { raw: 'R1 a b 1k  x', lineNumber: 1, tokens: ['R1', 'a', 'b', '1k', 'x'] },
    ]);
    expect(tokenizeNetlist('+ 10n\nR1 a b\n+   2k  ')).toEqual([
      { raw: '+ 10n', lineNumber: 1, tokens: ['+', '10n'] },
      { raw: 'R1 a b 2k', lineNumber: 2, tokens: ['R1', 'a', 'b', '2k'] },
    ]);
  });

  it('skips .END case-insensitively but keeps .ends and other directives', () => {
    expect(tokenizeNetlist('.end\n .End \n.ends\n.endc\n.END x').map(l => l.raw)).toEqual(['.ends', '.endc', '.END x']);
  });

  it('honours firstLineIsTitle, CRLF endings and Unicode whitespace', () => {
    expect(tokenizeNetlist('R0 x y 1\r\nR1\ta\u00a0b 1k\r\n', { firstLineIsTitle: true })).toEqual([
      { raw: 'R1\ta\u00a0b 1k', lineNumber: 2, tokens: ['R1', 'a', 'b', '1k'] },
    ]);
    expect(tokenizeNetlist('R0 x y 1', { firstLineIsTitle: false })[0].tokens).toEqual(['R0', 'x', 'y', '1']);
    expect(tokenizeNetlist('')).toEqual([]);
    expect(tokenizeNetlist('\n\n')).toEqual([]);
  });

  it('matches the reference implementation on a deterministic fuzz corpus', () => {
    const fragments = ['R1', 'a', 'b', '1k', '.model', '.end', '.END', 'x', ' ', '  ', '\t', '\r', '\n', '\n+',
      '\n+ ', '\n*', '=', ' = ', '(', ')', ',', '{', '}', '$', ';', '/', '//', '*', '+', '\u00a0', '\u2028',
      '\u3000', '\ufeff', '\u180e', '\u0085', 'é'];
    const random = prng(3690);
    const mismatches: string[] = [];
    for (let i = 0; i < 5000; i++) {
      const parts = 1 + Math.floor(random() * 24);
      let netlist = '';
      for (let j = 0; j < parts; j++) netlist += fragments[Math.floor(random() * fragments.length)];
      const firstLineIsTitle = random() < 0.3;
      const actual = JSON.stringify(tokenizeNetlist(netlist, { firstLineIsTitle }));
      const expected = JSON.stringify(referenceTokenizeNetlist(netlist, { firstLineIsTitle }));
      if (actual !== expected) mismatches.push(`${JSON.stringify(netlist)} (title=${firstLineIsTitle}): ${actual} != ${expected}`);
    }
    expect(mismatches).toEqual([]);
  });
});
