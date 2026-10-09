import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { simulate } from './simulate.js';
import { parseAsync } from './parser/index.js';
import { computeUICInitialSolution } from './analysis/uic.js';
import { MNAAssembler } from './mna/assembler.js';

const netlist = readFileSync(
  new URL('../../../benchmarks/circuits/chua-issue-48.cir', import.meta.url),
  'utf8',
);

describe('Chua & Lin issue #48 benchmark', () => {
  it('parses K coupling and reconstructs the declared UIC seed', async () => {
    const compiled = (await parseAsync(netlist)).compile();
    const seed = computeUICInitialSolution(compiled);
    const x = compiled.nodeIndexMap.get('x')!;
    const y = compiled.nodeIndexMap.get('y')!;
    const l8 = compiled.branchNames.indexOf('L8');

    expect(seed[x] - seed[y]).toBeCloseTo(2, 10);
    expect(seed[y]).toBeCloseTo(5, 10);
    expect(seed[compiled.nodeCount + l8]).toBeCloseTo(2, 10);

    const assembler = new MNAAssembler(compiled.nodeCount, compiled.branchCount);
    const context = assembler.getStampContext();
    for (const device of compiled.devices) device.stampDynamic?.(context);
    const l9 = compiled.branchNames.indexOf('L9');
    expect(assembler.C.get(compiled.nodeCount + l8, compiled.nodeCount + l9)).toBeCloseTo(1, 7);
  });

  it('documents the remaining #43-owned transient convergence gap', async () => {
    await expect(simulate(netlist, {
      reltol: 1e-12,
      maxTransientIterations: 1,
    })).rejects.toThrow(/Timestep too small at t=0/);
  });
});
