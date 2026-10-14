import { describe, expect, it } from 'vitest';
import { braceBareParameters } from './numparam.js';
import { preprocess } from './preprocessor.js';
import { parse, parseAsync } from './index.js';

// Characterization tests for the combined preparation fast paths. These run
// against the unchanged parser first; performance must not alter their output.
describe('parser preparation equivalence', () => {
  it('preserves empty-scope cards and does not mutate the input', () => {
    const lines = [
      { text: 'R1 in out 1k ; rv' },
      { text: 'C1 out 0 1n' },
      { text: '+ ic=0' },
      { text: '.subckt empty a b' },
      { text: 'L1 a b 1m' },
      { text: '.ends' },
      { text: 'print rv', control: true },
    ];
    const original = structuredClone(lines);
    expect(braceBareParameters(lines, new Set())).toEqual(lines.map(line => line.text));
    expect(lines).toEqual(original);
  });

  it('does not mistake an empty root for empty nested parameter scopes', () => {
    expect(braceBareParameters([
      { text: '.subckt outer a b' },
      { text: 'R1 a b later' },
      { text: '.param later=2k' },
      { text: '.subckt inner a b cap=1n' },
      { text: '+ initial=1' },
      { text: 'C1 a b cap ic=initial' },
      { text: 'R2 a b later' },
      { text: '.ends inner' },
      { text: '.ends outer' },
      { text: 'R3 a b later' },
    ], new Set())).toEqual([
      '.subckt outer a b', 'R1 a b {later}', '.param later=2k',
      '.subckt inner a b cap=1n', '+ initial=1',
      'C1 a b {cap} ic={initial}', 'R2 a b {later}',
      '.ends inner', '.ends outer', 'R3 a b later',
    ]);
  });

  it.each([
    ['R1 a b 1k\nC1 b 0 1n\n+ ic=0', 'R1 a b 1k\nC1 b 0 1n\n+ ic=0'],
    ['.param r=2\nR1 a b r\nC1 b 0 {r*1n}', '\nR1 a b 2\nC1 b 0 2e-9'],
    ["R1 a b '2+3'", 'R1 a b 5'],
    ['R1 a b {v(a)}', 'bR1 a b i = v(a, b)/(v(a)) reciproctc=1'],
    ['E1 a b value=2', 'bE1 a b v = 2'],
    ['G1 a b cur=2', 'bG1 a b i = 2'],
    ['.param x=2\nB1 a b v=x', '\nB1 a b v=2'],
    ['.param x=2\n.meas op result param=x', '\n.meas op result param=(2)'],
    ['R1 a b 1k ; numeric comment', 'R1 a b 1k ; numeric comment'],
  ])('retains preprocessing for %s', async (input, expected) => {
    expect(await preprocess(input)).toBe(expected);
  });

  it('keeps sync and async circuit state equivalent', async () => {
    const deck = 'equivalence\nV1 in 0 1\nR1 in out 1k\nC1 out 0 1n\n.tran 1n 10n\n.end';
    expect(await parseAsync(deck)).toEqual(parse(deck));
  });

  it('still reports expression diagnostics on ordinary passive cards', async () => {
    await expect(preprocess('R1 a b {missing}')).rejects.toThrow("Undefined parameter 'missing'");
    await expect(preprocess('R1 a b 1k ; {missing}')).rejects.toThrow("Undefined parameter 'missing'");
  });
});
