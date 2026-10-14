import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { simulate } from './index.js';
import type { SimulationResult } from './index.js';

const resistor = `Repeated analyses
V1 in 0 1 ac 1
R1 in 0 1k`;

function expectRunShape(result: SimulationResult, field: string, measured = false): void {
  expect(Object.keys(result).sort()).toEqual([field, 'warnings', ...(measured ? ['measurements'] : [])].sort());
  expect(result.warnings).toEqual([]);
}

describe('native dot-card analysis retention (#1009)', () => {
  it('retains the unchanged four-card benchmark execution probe', async () => {
    const result = await simulate(`Repeated dot-card core execution probe
V1 in 0 1 ac 1
R1 in 0 1k
.dc V1 0 2 1
.dc V1 3 5 1
.meas dc average avg v(in)
.op
.op
.end
`);
    expect(result.analyses?.map(({ index, analysis }) => [index, analysis]))
      .toEqual([[0, 'dc'], [1, 'dc'], [2, 'op'], [3, 'op']]);
    expect(Array.from(result.analyses![0].result.dcSweep!.sweepValues)).toEqual([0, 1, 2]);
    expect(Array.from(result.dcSweep!.sweepValues)).toEqual([3, 4, 5]);
    expect(result.analyses!.map(run => run.result.measurements?.map(m => m.value)))
      .toEqual([[1], [4], undefined, undefined]);
    expect(result.convergence?.dc.acceptedSolves).toBe(8);
  });

  it('retains distinct sweeps and OPs in source order with per-run measurements', async () => {
    const result = await simulate(`${resistor}
.dc V1 0 2 1
.op
.dc V1 3 5 1
.op
.meas dc average avg v(in)
.end`);
    expect(result.analyses?.map(({ index, analysis }) => [index, analysis]))
      .toEqual([[0, 'dc'], [1, 'op'], [2, 'dc'], [3, 'op']]);
    const runs = result.analyses!;
    expect(Array.from(runs[0].result.dcSweep!.sweepValues)).toEqual([0, 1, 2]);
    expect(Array.from(runs[2].result.dcSweep!.sweepValues)).toEqual([3, 4, 5]);
    expect(Array.from(result.dcSweep!.sweepValues)).toEqual([3, 4, 5]);
    expect(result.dcSweep).toBe(runs[2].result.dcSweep);
    expect(result.dc).toBe(runs[3].result.dc);
    expect(runs[0].result.measurements?.map(m => m.value)).toEqual([1]);
    expect(runs[2].result.measurements?.map(m => m.value)).toEqual([4]);
    expect(result.measurements).toEqual([...runs[0].result.measurements!, ...runs[2].result.measurements!]);
    expect(result.convergence?.dc.acceptedSolves).toBe(8);
    for (const run of runs) expectRunShape(run.result, run.analysis === 'dc' ? 'dcSweep' : 'dc', run.analysis === 'dc');
  });

  it('retains both distinct AC cards without changing the legacy last result', async () => {
    const result = await simulate(`${resistor}\n.ac lin 3 1 3\n.ac lin 3 10 30\n.end`);
    expect(result.analyses?.map(run => run.result.ac!.frequencies)).toEqual([[1, 2, 3], [10, 20, 30]]);
    expect(result.ac).toBe(result.analyses![1].result.ac);
    for (const run of result.analyses!) expectRunShape(run.result, 'ac');
  });

  it('leaves a single-card result deep-equal to the original field set', async () => {
    const result = await simulate(`${resistor}\n.op\n.end`);
    expect(result).toEqual({ dc: result.dc, warnings: [], convergence: result.convergence });
    expect(result).not.toHaveProperty('analyses');
    expect(result.dc!.voltage('in')).toBe(1);
  });

  it('does not retain dot-card runs on a step or its individual results', async () => {
    const result = await simulate(`${resistor}\n.step V1 list 1 2\n.op\n.ac lin 3 1 3\n.end`);
    expect(result).not.toHaveProperty('analyses');
    expect(result.steps).toHaveLength(2);
    for (const step of result.steps!) expect(step).not.toHaveProperty('analyses');
  });

  it('leaves control runs separate, including run of repeated dot cards', async () => {
    const result = await simulate(`${resistor}
.dc V1 0 2 1
.dc V1 3 5 1
.control
let count = 1
run
quit
.endc
.end`);
    expect(result).not.toHaveProperty('analyses');
    expect(result.control!.runs.map(run => [run.plot, run.analysis])).toEqual([['dc1', 'dc'], ['dc2', 'dc']]);
    expect(result.control!.runs.map(run => Array.from(run.result.dcSweep!.sweepValues)))
      .toEqual([[0, 1, 2], [3, 4, 5]]);
    for (const run of result.control!.runs) expect(run.result).not.toHaveProperty('analyses');
  });

  it('retains a straight-line control block lowered onto dot cards', async () => {
    const result = await simulate(`${resistor}\n.control\nop\nac lin 3 1 3\n.endc\n.end`);
    expect(result.analyses?.map(({ index, analysis }) => [index, analysis])).toEqual([[0, 'op'], [1, 'ac']]);
    expect(result.dc).toBe(result.analyses![0].result.dc);
    expect(result.ac!.frequencies).toEqual([1, 2, 3]);
  });

  it('records PZ after dot cards even when its card appears first', async () => {
    const fixture = readFileSync(new URL('../../../benchmarks/pole-zero/passive-rlc.cir', import.meta.url), 'utf8');
    const result = await simulate(`${fixture.replace(/\.end\s*$/i, '')}\n.op\n.end`);
    expect(result.analyses?.map(({ index, analysis }) => [index, analysis])).toEqual([[0, 'op'], [1, 'pz']]);
    expect(result.poleZero).toBe(result.analyses![1].result.poleZero);
    expectRunShape(result.analyses![0].result, 'dc');
    expectRunShape(result.analyses![1].result, 'poleZero');
  });
});
