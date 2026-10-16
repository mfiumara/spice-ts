import { describe, expect, it } from 'vitest';
import { simulate } from '../../simulate.js';
import { InvalidCircuitError } from '../../errors.js';
import { readFileSync } from 'node:fs';

const core = '.model c core(h_array=[-2 -1 1 2] b_array=[-3 -1 1 3] area=2 length=0.5 input_domain=0.1)';
// Reference values checked with Homebrew ngspice-47 on these same decks.
const winding = ['winding', 'i1 0 1 DC 0.2', 'i2 2 0 DC 0 PWL(0 0 1 1) AC 1', 'a1 (1 0) (2 0) winding', '.model winding lcouple(num_turns=10)'];

describe('XSPICE magnetic models', () => {
  it('runs the unchanged Transformer with the 59-point ngspice grid (no artificial magnetic LTE)', async () => {
    const deck = readFileSync(new URL('../../../../../benchmarks/corpus/corpus-i/fixtures/esim/Examples/Transformer/Transformer.cir.out', import.meta.url), 'utf8');
    const result = await simulate(deck);
    expect(result.transient!.time).toHaveLength(59);
    expect(result.transient!.time.at(-1)).toBeCloseTo(0.1, 14);
  });
  it.each([[-1, 6], [-0.5, 2.05], [0, 0], [0.5, -2.05], [1, -6]])('core PWL at %s V', async (v, current) => {
    const result = await simulate(['core', `v1 1 0 ${v}`, 'a1 1 0 c', core, '.op', '.end'].join('\n'));
    expect(result.dc!.current('v1')).toBeCloseTo(current, 8);
  });

  it('couples winding current into magnetomotive force', async () => {
    const result = await simulate(['winding', 'i1 0 1 0.2', 'a1 (1 0) (2 0) winding', '.model winding lcouple(num_turns=10)', 'r2 2 0 1k', '.op', '.end'].join('\n'));
    expect(result.dc!.voltage('2')).toBeCloseTo(2, 10);
    expect(result.dc!.voltage('1')).toBeCloseTo(0, 10);
  });

  it('rejects unimplemented core hysteresis with a typed error', async () => {
    await expect(simulate(['core', 'v1 1 0 0', 'a1 1 0 c', core.replace('input_domain=0.1', 'mode=2'), '.op', '.end'].join('\n'))).rejects.toThrow(InvalidCircuitError);
  });

  it('differentiates flux with the ngspice backward difference and sign', async () => {
    const result = await simulate([...winding, '.tran .1 1', '.end'].join('\n'));
    const tran = result.transient!;
    expect(tran.voltage('1')[0]).toBe(0);
    for (let i = 1; i < tran.time.length; i++) {
      expect(tran.voltage('1')[i]).toBeCloseTo(10, 7);
      expect(tran.voltage('2')[i]).toBeCloseTo(2, 10);
    }
  });

  it('stamps only the flux-to-winding AC pair with the ngspice AC sign', async () => {
    const result = await simulate([...winding, '.ac lin 1 1 1', '.end'].join('\n'));
    const point = result.ac!.voltage('1')[0];
    expect(point.magnitude).toBeCloseTo(62.83185307179586, 10);
    expect(point.phase).toBeCloseTo(-90, 10);
    expect(result.ac!.voltage('2')[0].magnitude).toBeCloseTo(0, 10);
  });

  it.each([
    core.replace('b_array=[-3 -1 1 3]', 'b_array=[-1 1]'),
    core.replace('h_array=[-2 -1 1 2]', 'h_array=[-2 1 -1 2]'),
    core.replace('length=0.5', 'length=0'),
    core.replace('input_domain=0.1', 'input_domain=0.5 fraction=false').replace('h_array=[-2 -1 1 2]', 'h_array=[-2 -1.5 1 2]'),
  ])('rejects invalid core parameters', async model => {
    await expect(simulate(['core', 'v1 1 0 0', 'a1 1 0 c', model, '.op', '.end'].join('\n'))).rejects.toThrow(InvalidCircuitError);
  });
});
