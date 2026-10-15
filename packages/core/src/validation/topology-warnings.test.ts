import { describe, expect, it } from 'vitest';
import { parseTitleless } from '../parser/index.js';
import { topologyWarnings } from './topology-preflight.js';

const check = (source: string) => topologyWarnings(parseTitleless(source).compile());

describe('advisory topology graph', () => {
  it('groups DC islands and sorts ids independently of declaration order', () => {
    const lines = ['C1 a 0 1u', 'R1 a b 1k', 'C2 b 0 1u'];
    const expected = [{ code: 'NO_DC_PATH_TO_GROUND', severity: 'warning', nodes: ['a', 'b'], elements: ['C1', 'C2', 'R1'], hint: expect.any(String) }];
    expect(check(`${lines.join('\n')}\n.op`)).toEqual(expected);
    expect(check(`${lines.reverse().join('\n')}\n.op`)).toEqual(expected);
  });

  it.each([
    'V1 a 0 1\nE1 a 0 b 0 2\nR1 b 0 1k\nR2 b 0 2k',
    'V1 a 0 1\nH1 a 0 V1 2',
    'V1 a 0 1\nL1 a 0 1m',
  ])('includes controlled sources and inductors in ideal loops', source => {
    expect(check(`${source}\n.op`).map(warning => warning.code)).toEqual(['VOLTAGE_SOURCE_LOOP']);
  });

  it('does not treat capacitors and current sources as DC conductors', () => {
    expect(check('C1 a 0 1u\nI1 a 0 1m\n.op')).toMatchObject([
      { code: 'NO_DC_PATH_TO_GROUND', nodes: ['a'], elements: ['C1', 'I1'] },
    ]);
    expect(check('C1 a 0 1u\nI1 a 0 1m\n.options rshunt=1G\n.op')).toEqual([]);
  });

  it('counts distinct elements rather than repeated terminals as connections', () => {
    expect(check('R1 a a 1k\n.options rshunt=1G\n.op')).toMatchObject([
      { code: 'FLOATING_NODE', nodes: ['a'], elements: ['R1'] },
    ]);
  });
});
