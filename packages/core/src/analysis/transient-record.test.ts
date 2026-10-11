import { describe, expect, it } from 'vitest';
import { parse } from '../parser/index.js';
import { simulate, simulateStream } from '../simulate.js';
import type { TransientStep } from '../types.js';
import { resolveOptions } from '../types.js';
import { createDriverFromCompiled } from './transient-driver.js';
import { solveTransient } from './transient.js';

// Issue #548: solveTransient records each accepted point straight from the
// driver's solution vector instead of building two name-keyed Maps per step.
// These tests pin that the recorded values stay bit-identical to the
// TransientStep Maps that advance() and simulateStream() still produce.

const NETLIST = `
V1 in 0 PULSE(0 1 1u 100n 100n 2u 5u)
R1 in mid 1k
L1 mid out 1m
C1 out 0 1n
D1 out 0 DMOD
.model DMOD D(CJO=1p)
X1 out tap DIV
.subckt DIV a b
R1 a b 2k
R2 b 0 2k
.ends
.tran 50n 12u 3u
`;

function compiledTran() {
  const compiled = parse(NETLIST).compile();
  const analysis = compiled.analyses.find(candidate => candidate.type === 'tran');
  if (analysis?.type !== 'tran') throw new Error('fixture has no transient analysis');
  return { compiled, analysis };
}

function createRun() {
  const { compiled, analysis } = compiledTran();
  const options = resolveOptions(compiled.simulationOptions, analysis.stopTime);
  return {
    compiled,
    driver: createDriverFromCompiled(compiled, options, {
      stopTime: analysis.stopTime,
      timestep: analysis.timestep,
      maxTimestep: analysis.maxTimestep ?? Math.min(analysis.timestep, analysis.stopTime / 50),
    }),
  };
}

function expectBitIdentical(actual: readonly number[], expected: readonly number[]): void {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    if (!Object.is(actual[i], expected[i])) {
      throw new Error(`index ${i}: ${actual[i]} is not bit-identical to ${expected[i]}`);
    }
  }
}

describe('transient result recording (#548)', () => {
  it('advanceSolution() yields the same accepted points as advance() Maps', () => {
    const reference = createRun();
    const raw = createRun();
    const { nodeNames, branchNames, nodeIndexMap, nodeCount } = raw.compiled;
    try {
      let steps = 0;
      const initial = reference.driver.peekInitialStep();
      const initialSolution = raw.driver.currentSolution();
      for (const name of nodeNames) {
        expect(Object.is(initialSolution[nodeIndexMap.get(name)!], initial.voltages.get(name))).toBe(true);
      }
      while (!reference.driver.isDone) {
        const step: TransientStep = reference.driver.advance();
        const solution = raw.driver.advanceSolution();
        expect(raw.driver.simTime).toBe(step.time);
        for (const name of nodeNames) {
          expect(Object.is(solution[nodeIndexMap.get(name)!], step.voltages.get(name))).toBe(true);
        }
        branchNames.forEach((name, i) => {
          expect(Object.is(solution[nodeCount + i], step.currents.get(name))).toBe(true);
        });
        steps++;
      }
      expect(raw.driver.isDone).toBe(true);
      expect(steps).toBeGreaterThan(20);
    } finally {
      reference.driver.dispose();
      raw.driver.dispose();
    }
  });

  it('solveTransient records bit-identical waveforms to the streamed TransientSteps', async () => {
    const { compiled, analysis } = compiledTran();
    const options = resolveOptions(compiled.simulationOptions, analysis.stopTime);
    const result = solveTransient(compiled, analysis, options);

    const time: number[] = [];
    const voltages = new Map<string, number[]>();
    const currents = new Map<string, number[]>();
    for await (const point of simulateStream(NETLIST)) {
      const step = point as TransientStep;
      time.push(step.time);
      for (const [name, value] of step.voltages) voltages.set(name, [...(voltages.get(name) ?? []), value]);
      for (const [name, value] of step.currents) currents.set(name, [...(currents.get(name) ?? []), value]);
    }

    // TSTART = 3u: only points at or after it are saved.
    expect(time[0]).toBeGreaterThanOrEqual(3e-6);
    expectBitIdentical(result.time, time);
    expect([...voltages.keys()]).toEqual(compiled.nodeNames);
    expect([...currents.keys()]).toEqual(compiled.branchNames);
    for (const [name, values] of voltages) expectBitIdentical(result.voltage(name), values);
    for (const [name, values] of currents) expectBitIdentical(result.current(name), values);

    const viaSimulate = await simulate(NETLIST);
    expectBitIdentical(viaSimulate.transient!.time, time);
    for (const [name, values] of voltages) expectBitIdentical(viaSimulate.transient!.voltage(name), values);
  });
});
