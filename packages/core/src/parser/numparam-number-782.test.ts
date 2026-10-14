import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';
import { formatNumber } from './preprocessor.js';

/**
 * #782: measured with Homebrew ngspice-47 (Apple arm64):
 *   ngspice -n -b -r 782.raw 782.cir
 * 782.cir is DECK below. Decode the first Binary: row as native doubles;
 * unlike an ASCII rawfile this preserves every bit of the operating point.
 */
const DECK = `numparam double rounding #782
.param p=0.1
Vbrace brace 0 {0.1}
Vparam param 0 {p}
Vnano nano 0 {0.05n}
Vmicro micro 0 {1.3u}
Vplain plain 0 0.1
.subckt probe out params: q=0.1
Vq out 0 {q}
.ends
Xdefault default probe
Xbare bare probe q=0.1
Xbrace instance probe q={0.1}
Xnano nanobare probe q=0.05n
Xnanobrace nanobrace probe q={0.05n}
.subckt scaled out params: q=0.05n
Vq out 0 {q}
.ends
Xscaled nanodefault scaled
.subckt parent out
Xinner out probe q={0.05n}
.ends
Xparent nested parent
.subckt units out params: q=0.05nF
Vq out 0 {q}
.ends
Xunits unitdefault units
Xunitactual unitactual units q=0.05nF
Vpos pos 0 {1000000000000000.5}
Vneg neg 0 {-1000000000000000.5}
Vsmall small 0 {0.10001373291015625}
.op
.end
`;

const NGSPICE_BITS: Record<string, string> = {
  brace: '3fb9999999999999',
  param: '3fb9999999999999',
  nano: '3dcb7cdfd9d7bdbd',
  micro: '3eb5cf751db94e6a',
  plain: '3fb999999999999a',
  default: '3fb9999999999999',
  bare: '3fb9999999999999',
  instance: '3fb9999999999999',
  nanobare: '3dcb7cdfd9d7bdbd',
  nanobrace: '3dcb7cdfd9d7bdbd',
  nanodefault: '3dcb7cdfd9d7bdbd',
  nested: '3dcb7cdfd9d7bdbd',
  unitdefault: '3dcb7cdfd9d7bdbd',
  unitactual: '3dcb7cdfd9d7bdbd',
  pos: '430c6bf526340000',
  neg: 'c30c6bf526340000',
  small: '3fb99a7ffffffffc',
};

function bits(value: number): string {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  return view.getBigUint64(0).toString(16).padStart(16, '0');
}

describe('numparam number round-trip matches ngspice-47 bit-for-bit (#782)', () => {
  for (const [node, expected] of Object.entries(NGSPICE_BITS)) {
    it(`matches v(${node}) from the binary rawfile`, async () => {
      const result = await simulate(DECK);
      expect(bits(result.dc!.voltage(node))).toBe(expected);
    });
  }
});

describe('numparam printf rounding across the double range', () => {
  it.each([
    [0, '0.000000000000000e+0'],
    [-0, '-0.000000000000000e+0'],
    [1, '1.000000000000000e+0'],
    [1000000000000000.5, '1.000000000000000e+15'],
    [-1000000000000000.5, '-1.000000000000000e+15'],
    [1000000000000001.5, '1.000000000000002e+15'],
    [0.10001373291015625, '1.000137329101562e-1'],
    [1e20, '1.000000000000000e+20'],
    [1e-20, '9.999999999999999e-21'],
    [Number.MIN_VALUE, '4.940656458412465e-324'],
    [2.2250738585072014e-308, '2.225073858507201e-308'],
    [Number.MAX_VALUE, '1.797693134862316e+308'],
  ])('formats %s with round-half-even', (value, expected) => {
    expect(formatNumber(value)).toBe(expected);
  });
});
