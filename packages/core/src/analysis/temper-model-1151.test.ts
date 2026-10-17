import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';
import { parse } from '../parser/index.js';
import { solveDCSweep } from './dc-sweep.js';
import { resolveOptions } from '../types.js';

const deck = `TEMPER-dependent model and instance
V1 a 0 0.1
D1 a 0 dt
D2 a 0 df area={temper}
.model dt d is='1e-12*temper'
.model df d is=1e-12
.dc temp 10 100 10
.end
`;

// ngspice-47, identical deck above: SPICE_ASCIIRAWFILE=1 ngspice -n -b -r probe.raw probe.cir.
const referenceCurrents = [
  -7.583040679788282e-11, -6.873940669279752e-10, -4.250992829552118e-9,
  -2.141090142833579e-8, -9.336300708209111e-8, -3.634722505500835e-7,
  -1.287458805371283e-6, -4.203893471303472e-6, -1.277878654976555e-5,
  -3.644274435024016e-5,
];

describe('TEMPER expressions in temperature sweeps (#1151)', () => {
  it('re-evaluates model and instance expressions at every DC TEMP point', async () => {
    const result = await simulate(deck);
    const sweep = result.dcSweep!;
    expect([...sweep.sweepValues]).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    for (let i = 0; i < sweep.sweepValues.length; i++) {
      expect(sweep.current('V1')[i]).toBeCloseTo(referenceCurrents[i], 16);
      const temperature = sweep.sweepValues[i];
      const fixed = await simulate(deck.replace("is='1e-12*temper'", `is=${1e-12 * temperature}`)
        .replace('area={temper}', `area=${temperature}`).replace('.dc temp 10 100 10', `.temp ${temperature}\n.op`));
      expect(sweep.current('V1')[i]).toBeCloseTo(fixed.dc!.current('V1'), 16);
    }
  });

  it('preserves a nested source sweep and restores devices after DC TEMP', () => {
    const compiled = parse(deck).compile();
    const original = [...compiled.devices];
    const result = solveDCSweep(compiled, {
      type: 'dc', source: 'V1', start: 0.1, stop: 0.2, step: 0.1,
      secondary: { source: 'temp', start: 10, stop: 20, step: 10 },
    }, resolveOptions());
    expect(result.current('V1')[1]).not.toBe(result.current('V1')[0]);
    expect(result.current('V1')[2]).not.toBe(result.current('V1')[0]);
    compiled.devices.forEach((device, i) => expect(device).toBe(original[i]));
  });

  it('re-evaluates expressions for .step TEMP', async () => {
    const result = await simulate(deck.replace('.dc temp 10 100 10', '.step temp list 10 100\n.op'));
    expect(result.steps).toHaveLength(2);
    expect(result.steps![0].dc!.current('V1')).toBeCloseTo(referenceCurrents[0], 16);
    expect(result.steps![1].dc!.current('V1')).toBeCloseTo(referenceCurrents[9], 16);
  });

  it('re-evaluates .param dependencies without retaining a previous temperature cache', async () => {
    const result = await simulate(deck.replace("is='1e-12*temper'", "is={scale}")
      .replace('V1 a', ".param scale='1e-12*temper'\nV1 a"));
    referenceCurrents.forEach((current, i) => expect(result.dcSweep!.current('V1')[i]).toBeCloseTo(current, 16));
  });

  it('preserves a secondary voltage sweep when TEMP is the primary dimension', () => {
    const compiled = parse(deck).compile();
    const result = solveDCSweep(compiled, {
      type: 'dc', source: 'temp', start: 10, stop: 20, step: 10,
      secondary: { source: 'V1', start: 0.1, stop: 0.2, step: 0.1 },
    }, resolveOptions());
    expect(result.current('V1')[0]).toBeCloseTo(referenceCurrents[0], 16);
    expect(result.current('V1')[1]).toBeCloseTo(referenceCurrents[1], 16);
    expect(result.current('V1')[2]).not.toBe(result.current('V1')[0]);
    expect(result.current('V1')[3]).not.toBe(result.current('V1')[1]);
  });

  it('restores original devices if re-evaluation fails partway through the sweep', () => {
    const compiled = parse(deck).compile();
    const original = compiled.devices;
    const recompile = compiled.recompileAtTemperature!;
    compiled.recompileAtTemperature = temperature => {
      if (temperature === 20) throw new Error('evaluation failed');
      return recompile(temperature);
    };
    expect(() => solveDCSweep(compiled, {
      type: 'dc', source: 'temp', start: 10, stop: 20, step: 10,
    }, resolveOptions())).toThrow('evaluation failed');
    expect(compiled.devices).toBe(original);
  });

  for (const path of ['temper/temper-2', 'temper/temper-res-1', 'misc/asrc-tc-1', 'misc/asrc-tc-2']) {
    it(`passes the upstream ${path} control self-check`, async () => {
      const text = readFileSync(new URL(`../../../../benchmarks/corpus/corpus-f/fixtures/tests/regression/${path}.cir`, import.meta.url), 'utf8');
      await expect(simulate(text)).resolves.toBeDefined();
    });
  }
});
