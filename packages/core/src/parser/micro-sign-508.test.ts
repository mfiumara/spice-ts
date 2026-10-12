import { describe, expect, it } from 'vitest';
import { parse, parseAsync, parseTitleless } from './index.js';
import { simulate } from '../simulate.js';
import type { IncludeResolver } from '../types.js';

// Issue #508: ngspice-47 inpcom.c utf8_check() rewrites the micro sign
// U+00B5 ('µ', UTF-8 C2 B5) to 'u' on every card after the title line except
// '*' comments, once .include/.lib files are read. So `2µ`, `1µs` and
// `2µmeg` are 2e-6, and the rewrite also reaches .param expressions, node
// names and .control lines. The Greek small letter mu U+03BC is NOT
// translated by ngspice-47 and stays a parse error here.

const MICRO = '\u00b5';

function op(netlist: string) {
  return simulate(netlist).then(result => {
    if (!result.dc) throw new Error('expected an operating point');
    return result.dc;
  });
}

describe('micro sign scale suffix (#508)', () => {
  it('reads 2µ, 20µ and 1µs as micro values on device and analysis cards', async () => {
    const circuit = parseTitleless([
      'I1 0 a 2µ',
      'R1 a 0 20k',
      'C1 a 0 1µF',
      '.tran 1µs 10µs',
    ].join('\n'));
    // 10µs is 10 * pow(10, -6) = 9.999999999999999e-6 in ngspice-47 INPevaluate (#749).
    expect(circuit.analyses).toContainEqual(expect.objectContaining({ type: 'tran', timestep: 1e-6, stopTime: 9.999999999999999e-6 }));
    const dc = await op(['micro', 'I1 0 a 20µ', 'R1 a 0 2k', '.op'].join('\n'));
    expect(dc.voltage('a')).toBeCloseTo(0.04, 12);
  });

  it('treats µ like u before trailing unit text and other suffix letters (2µmeg = 2e-6)', async () => {
    // ngspice-47 batch: R1 a 0 2µmeg with V1 a 0 1 prints i(v1) = -5.00000e+05.
    const dc = await op(['micro', 'V1 a 0 1', 'R1 a 0 2µmeg', '.op'].join('\n'));
    expect(dc.current('V1')).toBeCloseTo(-5e5, 3);
  });

  it('evaluates µ inside .param expressions and node names like ngspice-47', async () => {
    // ngspice-47 batch on the same deck: v(du) = 1.666389e-04, i(v1) = -1.66639e-07,
    // @r3[resistance] = 6.000000e+06.
    const dc = await op([
      'micro param',
      'V1 a 0 DC 1',
      `.param pp={3${MICRO}*2}`,
      `R3 a d${MICRO} {pp*1e12}`,
      `R4 d${MICRO} 0 1k`,
      '.op',
    ].join('\n'));
    expect(dc.voltage('du')).toBeCloseTo(1.666389e-4, 9);
    expect(dc.current('V1')).toBeCloseTo(-1.66639e-7, 11);
  });

  it('simulates the corpus-f convergence.cir pulse source spec (I2 0 N01 pulse 2µ 20µ ...)', async () => {
    const circuit = parse([
      'pulse micro',
      'I2 0 N01 pulse 2µ 20µ 50n 50n 50n 1µ 2µ',
      'R1 N01 0 1k',
      '.tran 10n 3µ',
    ].join('\n'));
    expect(circuit.analyses).toContainEqual(expect.objectContaining({ type: 'tran', stopTime: 3e-6 }));
  });

  it('translates µ in included files but not in the .include path', async () => {
    const paths: string[] = [];
    const resolver: IncludeResolver = async path => {
      paths.push(path);
      return 'R1 a 0 4µ';
    };
    const circuit = await parseAsync(`include micro\n.include 'mµ.lib'\nV1 a 0 1\n.op`, resolver);
    expect(paths).toEqual(['mµ.lib']);
    const result = await simulate(circuit);
    expect(result.dc?.current('V1')).toBeCloseTo(-2.5e5, 3);
  });

  it('keeps the title line untouched and does not translate the Greek mu U+03BC', async () => {
    expect(() => parse('title 2µ\nV1 a 0 1\nR1 a 0 1k\n.op')).not.toThrow();
    // ngspice-47 leaves U+03BC alone; spice-ts keeps rejecting it loudly
    // rather than reading `2μk` as micro.
    await expect(simulate('greek\nV1 a 0 1\nR1 a 0 2\u03bck\n.op')).rejects.toThrow(/2\u03bck/);
  });
});
