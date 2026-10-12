import { describe, it, expect } from 'vitest';
import { parseNumber } from './tokenizer.js';
import { simulate } from '../simulate.js';
import { parse } from './index.js';

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
    // 10u is 10 * pow(10, -6) = 9.999999999999999e-6, which no shorter decimal reads back to.
    expect(circuit.toNetlist()).toContain('PULSE(0 0.7 0.0000013 3e-9 3e-7 0.0000011 0.000009999999999999999)');
  });
});
