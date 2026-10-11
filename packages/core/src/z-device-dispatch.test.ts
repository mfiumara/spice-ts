import { describe, expect, it } from 'vitest';
import { simulate } from './simulate.js';

const hfetModel = '.model a nhfet level=5 vt0=0.3 rd=60 rs=60 js1s=1e-12 js1d=1e-12';

describe('Z-card model dispatch', () => {
  it('gives a top-level NHFET Z-card the same operating point as inside a subcircuit', async () => {
    const topLevel = await simulate([
      'top-level hfet', 'vd d 0 1', 'vg g 0 0.5', 'rl d o 1k',
      'z1 o g 0 a l=1u w=10u', hfetModel, '.op', '.end',
    ].join('\n'));
    const nested = await simulate([
      'subcircuit hfet', 'vd d 0 1', 'vg g 0 0.5', 'rl d o 1k',
      '.subckt hcell d g s', 'z1 d g s a l=1u w=10u', '.ends',
      'x1 o g 0 hcell', hfetModel, '.op', '.end',
    ].join('\n'));
    expect(topLevel.dc!.voltage('o')).toBe(nested.dc!.voltage('o'));
  });

  it('rejects Z-card models other than NHFET and NMF', async () => {
    await expect(simulate([
      'pmf', 'vd d 0 1', 'z1 d 0 0 p', '.model p pmf level=2', '.op', '.end',
    ].join('\n'))).rejects.toThrow("Unsupported Z-card model type: 'PMF'");
  });

  it('rejects Z-card instance parameters other than L and W at parse time', async () => {
    await expect(simulate([
      'z m', 'vd d 0 1', 'z1 d 0 0 n m=2', '.model n nmf level=2', '.op', '.end',
    ].join('\n'))).rejects.toThrow("Unsupported Z-card instance parameter: 'M'");
  });
});
