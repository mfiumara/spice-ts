import { describe, it, expect } from 'vitest';
import { simulate, parseAsync } from './index.js';
import type { IncludeResolver } from './index.js';

describe('subcircuit integration (end-to-end)', () => {
  it('simulates a resistor divider defined as a subcircuit', async () => {
    const result = await simulate(`
      .subckt divider in out gnd
      R1 in out 1k
      R2 out gnd 2k
      .ends divider
      V1 1 0 DC 5
      X1 1 2 0 divider
      .op
    `);
    expect(result.dc).toBeDefined();
    expect(result.dc!.voltage('2')).toBeCloseTo(10 / 3, 4);
  });

  it('simulates nested subcircuits (buffer = 2 inverters)', async () => {
    const result = await simulate(`
      .subckt res_half in out
      R1 in out 1k
      .ends res_half
      .subckt res_chain in out
      X1 in mid res_half
      X2 mid out res_half
      .ends res_chain
      V1 1 0 DC 10
      X0 1 2 res_chain
      R_load 2 0 2k
      .op
    `);
    expect(result.dc).toBeDefined();
    // 2k series (1k+1k from chain) with 2k to ground -> V(2) = 10 * 2k / (2k+2k) = 5
    expect(result.dc!.voltage('2')).toBeCloseTo(5, 4);
  });

  it('simulates with .lib corner selection', async () => {
    const libContent = [
      '.lib TT',
      '.subckt myres a b',
      'R1 a b 1k',
      '.ends myres',
      '.endl TT',
      '.lib FF',
      '.subckt myres a b',
      'R1 a b 500',
      '.ends myres',
      '.endl FF',
    ].join('\n');

    const resolver: IncludeResolver = async () => libContent;

    const resultTT = await simulate(
      `.lib 'corners.lib' TT\nV1 1 0 DC 5\nX1 1 2 myres\nR2 2 0 1k\n.op`,
      { resolveInclude: resolver },
    );
    // TT: 1k + 1k divider -> V(2) = 2.5
    expect(resultTT.dc!.voltage('2')).toBeCloseTo(2.5, 4);

    const resultFF = await simulate(
      `.lib 'corners.lib' FF\nV1 1 0 DC 5\nX1 1 2 myres\nR2 2 0 1k\n.op`,
      { resolveInclude: resolver },
    );
    // FF: 500 + 1k divider -> V(2) = 5 * 1k / 1.5k ≈ 3.333
    expect(resultFF.dc!.voltage('2')).toBeCloseTo(10 / 3, 4);
  });

  it('simulates with .include and .param', async () => {
    const resolver: IncludeResolver = async (path) => {
      if (path === 'params.lib') return '.param rval = 2k';
      throw new Error(`Unknown: ${path}`);
    };

    const result = await simulate(
      `.include 'params.lib'\nV1 1 0 DC 5\nR1 1 2 {rval}\nR2 2 0 {rval}\n.op`,
      { resolveInclude: resolver },
    );
    expect(result.dc!.voltage('2')).toBeCloseTo(2.5, 4);
  });

  it('simulates subcircuit with parameterized devices', async () => {
    const result = await simulate(`
      .subckt paramres a b R=1k
      R1 a b {R}
      .ends paramres
      V1 1 0 DC 10
      X1 1 2 paramres R=2k
      X2 2 0 paramres R=3k
      .op
    `);
    expect(result.dc).toBeDefined();
    // 2k + 3k divider: V(2) = 10 * 3k / 5k = 6
    expect(result.dc!.voltage('2')).toBeCloseTo(6, 4);
  });

  it('full flow: include -> lib section -> subckt -> simulation', async () => {
    const files: Record<string, string> = {
      'top.lib': `.lib TT\n.include 'models-tt.lib'\n.endl TT`,
      'models-tt.lib': [
        '.subckt divider in out gnd R1VAL=1k R2VAL=2k',
        'R1 in out {R1VAL}',
        'R2 out gnd {R2VAL}',
        '.ends divider',
      ].join('\n'),
    };
    const resolver: IncludeResolver = async (path) => {
      if (path in files) return files[path];
      throw new Error(`Unknown file: ${path}`);
    };

    const result = await simulate(
      `.lib 'top.lib' TT\nV1 1 0 DC 9\nX1 1 2 0 divider R1VAL=1k R2VAL=2k\n.op`,
      { resolveInclude: resolver },
    );
    expect(result.dc!.voltage('2')).toBeCloseTo(6, 4);
  });
});
