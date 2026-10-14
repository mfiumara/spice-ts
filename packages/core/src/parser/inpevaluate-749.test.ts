import { describe, it, expect } from 'vitest';
import { parseNumber } from './tokenizer.js';
import { simulate } from '../simulate.js';
import { parse } from './index.js';
import { formatNumber } from '../netlist-number.js';

// #749: ngspice-47 INPevaluate (src/spicelib/parser/inpeval.c) builds a literal
// as sign * mantissa * pow(10, exponent), not as the correctly rounded value.
// Expected doubles were read back from ngspice-47 (macOS arm64, Homebrew
// bottle) with `V<i> n<i> 0 <literal>`, `op` and `write` to a binary rawfile,
// so each one is the exact value ngspice parsed for the literal.
const NGSPICE_47_LITERALS: [string, number][] = [
  ['0.05N', 4.9999999999999995e-11],
  ['0.05n', 4.9999999999999995e-11],
  ['1.3u', 1.2999999999999998e-06],
  ['1.3e-6', 1.2999999999999998e-06],
  ['1.1u', 1.1e-06],
  ['1u', 1e-06],
  ['10u', 9.999999999999999e-06],
  ['2.2meg', 2200000],
  ['2.2MEG', 2200000],
  ['1mil', 2.5399999999999997e-05],
  ['25.4mil', 0.0006451599999999999],
  ['3.3k', 3300],
  ['0.1', 0.1],
  ['123456789012345678', 1.2345678901234568e+17],
  ['1.2999999999999998e-06', 1.2999999999999998e-06],
  ['1.1000000000000001e-06', 1.1e-06],
  ['4.6e-6', 4.6e-06],
  ['1e-300', 1e-300],
  ['1e308', 1e+308],
  ['1e-320', 1e-320],
  ['2.5e-310', 2.49999999999987e-310],
  ['.5', 0.5],
  ['5.', 5],
  ['-1.5k', -1500],
  ['1e3', 1000],
  ['15e-3', 0.015],
  ['0.3u', 3e-07],
  ['2.5n', 2.5e-09],
  ['47p', 4.7e-11],
  ['0.001', 0.001],
  ['33.3333333333333333m', 0.03333333333333333],
  ['1E+3', 1000],
  ['0.7', 0.7000000000000001],
  ['4.7k', 4700],
  ['12345678901234567890.123456789e-10', 1234567890.1234567],
  ['0.1234567890123456789', 0.12345678901234568],
  ['9007199254740993', 9007199254740992],
  ['1.7976931348623157e308', 1.7976931348623157e+308],
  ['6.02214076e23', 6.02214076e+23],
  ['1.380649e-23', 1.3806489999999998e-23],
  ['1.602176634e-19', 1.602176634e-19],
  ['300.15', 300.15000000000003],
  ['0.05', 0.05],
  ['1e-14', 1e-14],
  ['2.2e-12', 2.2e-12],
];

describe('parseNumber matches ngspice-47 INPevaluate bit for bit (#749)', () => {
  it.each(NGSPICE_47_LITERALS)('%s', (literal, ngspice) => {
    expect(Object.is(parseNumber(literal), ngspice)).toBe(true);
  });

  it('reads 0.05N as 5 * pow(10, -11), not the nearest double to 5e-11', () => {
    expect(parseNumber('0.05N')).toBe(4.9999999999999995e-11);
    expect(parseNumber('0.05N')).not.toBe(5e-11);
  });

  it('uses the correctly rounded pow(10, e) of the C library, not Math.pow', () => {
    // Math.pow(10, -88) is one ulp away from 1e-88 in V8.
    expect(parseNumber('1e-88')).toBe(1e-88);
    expect(parseNumber('1e-307')).toBe(1e-307);
  });

  it('keeps the embedded RKM extension on the INPevaluateRKM_* formula', () => {
    // spice-ts accepts 3k3-style values everywhere as an extension. ngspice-47
    // only reads them in LTspice compatibility mode (INPevaluateRKM_R/C/L),
    // with (mantis + deci * pow(10, -digits)) * pow(10, scale).
    expect(parseNumber('1n5')).toBe((1 + 5 * 1e-1) * 1e-9);
    expect(parseNumber('1n5')).toBe(1.5000000000000002e-9);
    expect(parseNumber('2p2')).toBe(2.2000000000000003e-12);
    expect(parseNumber('-4k7')).toBe(-4700);
  });
});

describe('PWL R= repeat lands on the ngspice-47 side of each wrap (#749)', () => {
  // Issue #749 deck. TD = 1.3u and the 1.1u period are 1.2999999999999998e-6
  // and 1.1e-6 in ngspice-47, so (4.6u - TD) / period is exactly 3 at the wrap
  // and the sample is the first PWL value (1). With correctly rounded
  // literals it was 2.9999999999999996 and the sample was the last value (2).
  // ngspice-47 -b, same deck: v(11) = 1, 1, 1.9999999999999953 at the three
  // times below, which sit on the same doubles in both engines.
  const deck = `t
I11 0 11 PWL(0 1 0.3u -1 1.1u 2) TD=1.3u R=0
R11 11 0 1
.tran 0.1u 10u
.end
`;

  it('matches ngspice-47 at t = 4.6u, 5.7u and 9.0u', async () => {
    const result = await simulate(deck);
    const time = result.transient!.time;
    const v = result.transient!.voltage('11');
    const at = (t: number) => v[time.findIndex(x => Math.abs(x - t) < 1e-12)];
    expect(at(4.6e-6)).toBe(1);
    expect(at(5.7e-6)).toBe(1);
    expect(at(9.0e-6)).toBeCloseTo(2, 12);
  });
});

describe('netlist export round-trips INPevaluate values (#749)', () => {
  it('writes numbers that read back to the same doubles', () => {
    const circuit = parse(`export
V1 1 0 PULSE(0 0.7 1.3u 3n 0.3u 1.1u 10u)
R1 1 2 1.380649e-23
C1 2 0 0.05N
.tran 0.1u 10u
.end
`);
    const again = parse(circuit.toNetlist());
    expect(again.compile().devices.map(d => (d as { waveform?: unknown }).waveform))
      .toEqual(circuit.compile().devices.map(d => (d as { waveform?: unknown }).waveform));
    expect(again.toNetlist()).toBe(circuit.toNetlist());
    // 10u is 10 * pow(10, -6) = 9.999999999999999e-6, which no plain decimal reads back to.
    expect(circuit.toNetlist()).toContain('PULSE(0 0.7 0.0000013 3e-9 3e-7 0.0000011 10e-6)');
  });

  it('is stable across repeated exports (30u, 90u, 370f drifted one ulp per export)', () => {
    const first = parse('rt\nV1 1 0 PULSE(0 1 30u 90u 140u 780u 370f)\nR1 1 0 1k\n.tran 1u 1m\n.end\n');
    const netlist = first.toNetlist();
    expect(netlist).toContain('PULSE(0 1 30e-6 90e-6 140e-6 780e-6 370e-15)');
    const second = parse(netlist);
    expect(second.toNetlist()).toBe(netlist);
    expect(second.compile().devices.map(d => (d as { waveform?: unknown }).waveform))
      .toEqual(first.compile().devices.map(d => (d as { waveform?: unknown }).waveform));
  });
});

/** Deterministic 31-bit LCG so a failure names a reproducible input. */
function lcg(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

const expectReadsBack = (value: number, label: string) => {
  const text = formatNumber(value);
  // Object.is compares bitwise for finite doubles (and tells -0 from 0).
  expect(Object.is(parseNumber(text), value), `${label} = ${value} written as ${text}`).toBe(true);
};

describe('formatNumber writes literals the parser reads back bitwise (#749)', () => {
  it.each([
    '30u', '90u', '140u', '780u', '370f', '776.330m', '45.650n', '10u', '1.3u', '0.3', '0.7', '2.675',
    '0.05N', '1.380649e-23', '74mil', '766mil', '2.5mil', '1e3mil', '3.3meg', '4.7k', '1g', '2t', '7.1a',
    '-30u', '-0.3', '0', '-0', '1e308', '1e-300', '123456789012345678901234',
  ])('%s', literal => {
    expectReadsBack(parseNumber(literal), literal);
  });

  it('round-trips 20k generated literals (1-4 digit mantissa, optional fraction, every scale factor)', () => {
    const random = lcg(749);
    const suffixes = ['', 'm', 'u', 'n', 'p', 'f', 'a', 'k', 'meg', 'g', 't', 'mil'];
    for (let i = 0; i < 20000; i++) {
      const digits = 1 + Math.floor(random() * 4);
      let literal = String(Math.floor(random() * 10 ** digits));
      if (random() < 0.5) literal += `.${String(Math.floor(random() * 1000)).padStart(3, '0')}`;
      literal += suffixes[Math.floor(random() * suffixes.length)];
      expectReadsBack(parseNumber(literal), literal);
    }
  });

  it('round-trips 5k arbitrary doubles between 1e-30 and 1e30 (Circuit API and JSON values)', () => {
    const random = lcg(772);
    for (let i = 0; i < 5000; i++) {
      const value = (random() - 0.5) * 10 ** (Math.floor(random() * 60) - 30);
      expectReadsBack(value, `double #${i}`);
    }
  });
});

/** Deterministic 64-bit LCG (Knuth MMIX) over raw double bit patterns. */
function bitPatterns(seed: bigint): () => bigint {
  let state = seed;
  return () => {
    state = BigInt.asUintN(64, state * 6364136223846793005n + 1442695040888963407n);
    return state;
  };
}

const view = new DataView(new ArrayBuffer(8));
const fromBits = (bits: bigint) => { view.setBigUint64(0, bits); return view.getFloat64(0); };
const magnitudeBits = (value: number) => { view.setFloat64(0, value); return BigInt.asUintN(63, view.getBigUint64(0)); };
const ulpDistance = (a: number, b: number) => {
  const x = magnitudeBits(a), y = magnitudeBits(b);
  return Math.sign(a) !== Math.sign(b) ? x + y : x > y ? x - y : y - x;
};

/** Values ngspice-47 INPevaluate has no literal for (see formatNumber): all below 1e-297. */
const UNREACHABLE_BELOW = 1e-297;

// #1054: keep the complete seeded sweep in the required CI test jobs, without
// V8 coverage bookkeeping. The coverage suite still exercises the same oracle
// on its first 20k patterns, plus the separate 20k subnormal sweep below.
// Run the full corpus locally with SPICE_FULL_NUMBER_FUZZ=1 vitest run <this file>.
const fullNumberFuzz = process.env.SPICE_FULL_NUMBER_FUZZ === '1';
const bitPatternSamples = fullNumberFuzz ? 1_000_000 : 20_000;

describe('formatNumber reaches every double that INPevaluate can produce (#806)', () => {
  it.each([
    // #806 examples that drifted one ulp: the 17-digit search missed them.
    8029.858574736863, 3.911591935902834, 233797.5804693997, 0.000007564046885818243, 3.876247147563845e-19,
    // Found by the bit-pattern sweep below on the #783 formatter.
    -1.9190584215176654e+174, -3.76686182129787e-124, 2.0790523791349468e+239, -3.6667875911350772e+186,
    3.98375773972795e+59, 4.3339018281780725e+164, -1.8623377486422715e-47, 2.1226847879982163e-268,
    // Extremes.
    Number.MAX_VALUE, -Number.MAX_VALUE, 2.2250738585072014e-308, 1e-323, 2 ** -1073, 2 ** -1022 - 2 ** -1073,
  ])('%s', value => {
    expectReadsBack(value, String(value));
    expectReadsBack(-value, String(-value));
  });

  it(`round-trips ${bitPatternSamples} random bit patterns with 0 ulp drift, except the unreachable values below 1e-297`, () => {
    const next = bitPatterns(806n);
    let checked = 0;
    let unreachable = 0;
    for (let i = 0; i < bitPatternSamples; i++) {
      const value = fromBits(next());
      if (!Number.isFinite(value)) continue;
      checked++;
      const text = formatNumber(value);
      const read = parseNumber(text);
      if (Object.is(read, value)) continue;
      // No literal reads back as `value`: the nearest double with one is written instead.
      expect(Math.abs(value) < UNREACHABLE_BELOW && ulpDistance(read, value) === 1n,
        `bits #${i}: ${value} written as ${text} reads back as ${read}`).toBe(true);
      unreachable++;
    }
    expect(checked).toBeGreaterThan(fullNumberFuzz ? 999_000 : 19_980);
    // About 1 in 1024 bit patterns is below 2^-1021 (exponent field 0 or 1), and about half of
    // those are odd multiples of 2^-1074 that no literal reaches: 518 of 1M for this seed.
    expect(unreachable).toBeLessThan(fullNumberFuzz ? 600 : 20);
  }, 120_000);

  it('writes every value around the subnormal range within one ulp, exactly when a literal exists', () => {
    const next = bitPatterns(1074n);
    let exact = 0;
    for (let i = 0; i < 20_000; i++) {
      // Exponent field 0..63: subnormals up to about 2e-289.
      const bits = next();
      const value = fromBits(BigInt.asUintN(58, bits) | (bits >> 63n << 63n));
      if (value === 0) continue;
      const read = parseNumber(formatNumber(value));
      if (Object.is(read, value)) exact++;
      else expect(Math.abs(value) < UNREACHABLE_BELOW && ulpDistance(read, value) === 1n, `${value}`).toBe(true);
    }
    // Every even multiple of 2^-1074 is reachable as M * 1e-323 (1e-323 is 2 * 2^-1074).
    expect(exact).toBeGreaterThan(20_000 * 0.9);
    // ~0.8 s locally, past vitest's 5 s default under --coverage on CI (#893).
  }, 60_000);

  it('writes the even neighbour of an unreachable odd subnormal, toward zero first', () => {
    // 3 * 2^-1074: M * pow(10, E) only gives even multiples of 2^-1074 this small.
    const value = 3 * Number.MIN_VALUE;
    expect(parseNumber(formatNumber(value))).toBe(2 * Number.MIN_VALUE);
    expect(parseNumber(formatNumber(-value))).toBe(-2 * Number.MIN_VALUE);
  });

  it('writes 2^-1074 as 0 (no literal reaches it) instead of looping on 2^-1074 / 25.4 = 0', () => {
    expect(formatNumber(Number.MIN_VALUE)).toBe('0');
    expect(formatNumber(-Number.MIN_VALUE)).toBe('-0');
  });
});
