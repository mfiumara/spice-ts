import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';

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
