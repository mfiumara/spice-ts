import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';
import { parseBJTInstance } from './bjt-parser.js';
import { parse } from './index.js';

describe('BJT Q-card parser', () => {
  it.each([
    [['Q1', 'c', 'b', 'e', 'QMOD'], 'QMOD'],
    [['Q1', 'c', 'b', 'e', 'QMOD', 'OFF'], 'QMOD'],
    [['Q1', 'c', 'b', 'e', 'substrate', 'QMOD'], 'QMOD'],
    [['Q1', 'c', 'b', 'e', 'substrate', 'QMOD', 'OFF'], 'QMOD'],
    [['Q1', 'c', 'b', 'e', '0', 'QMOD', 'OFF=1'], '0'],
  ])('resolves the bounded token shape %j', (tokens, modelName) => {
    expect(parseBJTInstance(tokens, 1)).toEqual({
      collector: 'c',
      base: 'b',
      emitter: 'e',
      modelName,
    });
  });

  it('treats OFF as an initial-state hint rather than disabling the BJT', async () => {
    const result = await simulate(`BJT OFF startup hint
      VCC 1 0 DC 12
      .model QMOD NPN(BF=100 IS=1e-14)
      RB 1 2 100k
      RC 1 3 1k
      Q1 3 2 0 QMOD OFF
      .op
      .end
    `);

    expect(result.dc!.voltage('2')).toBeGreaterThan(0.55);
    expect(result.dc!.voltage('3')).toBeLessThan(12);
  });

  it('accepts the classic four-node substrate form and resolves its model', () => {
    const compiled = parse(`classic four-node BJT
      Q1 collector base emitter substrate QMOD
      .model QMOD NPN(BF=80)
      .op
    `).compile();

    expect(compiled.devices[0]).toMatchObject({
      name: 'Q1',
      params: { BF: 80 },
    });
  });

  it('exposes the next unsupported model fields after classic Q-card parsing', () => {
    expect(() => parse(`classic OFF form
      Q1 c b e QSTD OFF
      .model QSTD NPN(BF=50 VAF=50 CJE=0.4p)
      .op
    `).compile()).toThrow("Unsupported bounded BJT model parameter: 'CJE'");

    expect(() => parse(`classic substrate form
      Q1 c b e substrate QMOD
      .model QMOD NPN(BF=100 VAF=50 CJS=2p)
      .op
    `).compile()).toThrow("Unsupported bounded BJT model parameter: 'CJS'");
  });

  it.each([
    'Q1 c b e QMOD AREA=2',
    'Q1 c b e QMOD OFF=1',
    'Q1 c b e substrate QMOD AREA=2',
    'Q1 c b e substrate QMOD OFF=1',
  ])('rejects the unsupported instance form %s', card => {
    expect(() => parse(`unsupported Q-card\n${card}\n.model QMOD NPN(BF=100)\n.op`))
      .toThrow('Unsupported BJT Q-card form');
  });
});
