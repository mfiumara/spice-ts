import { describe, expect, it } from 'vitest';
import { parse } from '../parser/index.js';
import { resolveOptions } from '../types.js';
import { createDriverFromCompiled } from './transient-driver.js';

const deck = `OP integration clock is not source time
V1 input 0 PWL(0 0 1u 5 10u 5)
R1 input output 1k
C1 output 0 1n
.end`;

describe('OPtran local clock (#1101)', () => {
  it.each([false, true])('preserves DC versus TRANOP source selection, DC=%s', useDcSourceValue => {
    const compiled = parse(deck.replace('PWL(0 0 1u 5 10u 5)', 'DC 2 PWL(0 0 1u 5 10u 5)')).compile();
    const driver = createDriverFromCompiled(compiled, resolveOptions(), {
      stopTime: 2e-6, timestep: 1e-7, maxTimestep: 1e-7,
      initialSolution: new Float64Array(compiled.nodeCount + compiled.branchCount),
      operatingPoint: { useDcSourceValue },
    });
    try {
      for (let i = 0; i < 10000 && !driver.isDone; i++) driver.advanceSolution();
      expect(driver.isDone).toBe(true);
      expect(driver.currentSolution()[compiled.nodeNames.indexOf('input')]).toBe(useDcSourceValue ? 2 : 0);
    } finally {
      driver.dispose();
    }
  });

  it.each([false, true])('separates source time only when operatingPoint=%s', operatingPoint => {
    const compiled = parse(deck).compile();
    const driver = createDriverFromCompiled(compiled, resolveOptions(), {
      stopTime: 2e-6, timestep: 1e-7, maxTimestep: 1e-7,
      initialSolution: new Float64Array(compiled.nodeCount + compiled.branchCount),
      operatingPoint: operatingPoint ? { useDcSourceValue: true } : undefined,
    });
    try {
      for (let i = 0; i < 10000 && !driver.isDone; i++) driver.advanceSolution();
      expect(driver.isDone).toBe(true);
      expect(driver.simTime).toBe(2e-6);
      const input = driver.currentSolution()[compiled.nodeNames.indexOf('input')];
      expect(input).toBe(operatingPoint ? 0 : 5);
      if (operatingPoint) expect(driver.currentSolution()[compiled.nodeNames.indexOf('output')]).toBe(0);
    } finally {
      driver.dispose();
    }
  });
});
