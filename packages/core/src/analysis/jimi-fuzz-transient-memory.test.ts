import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createConvergenceTelemetry } from '../convergence-telemetry.js';
import { parse } from '../parser/index.js';
import { resolveOptions } from '../types.js';
import { createDriverFromCompiled, createTransientSim } from './transient-driver.js';

const fixtureBytes = readFileSync(new URL(
  '../../../../benchmarks/corpus/ngspice/fixtures/examples/wave/jimi_fuzz.cir',
  import.meta.url,
));
const fixture = fixtureBytes.toString('utf8');

describe('jimi-fuzz transient point growth', () => {
  it('bounds the persistent NR retry cycle on the unchanged nonlinear fixture', async () => {
    expect(fixtureBytes.byteLength).toBe(1_009);
    expect(createHash('sha256').update(fixtureBytes).digest('hex')).toBe(
      '0607c7f358628d0ce60eff584b329a4d685ae215894c466622a19357c7163b0e',
    );

    const sim = await createTransientSim(fixture);
    try {
      for (let point = 1; point < 20_000; point++) sim.advance();

      expect(sim.simTime).toBeGreaterThan(0.1);
      expect(sim.convergence.transient.nrRetries).toBeLessThanOrEqual(1_024);
    } finally {
      sim.dispose();
    }
  }, 10_000);

  it('bounds each run when synchronous step analyses share aggregate telemetry', () => {
    const compiled = parse(fixture).compile();
    const analysis = compiled.analyses.find(candidate => candidate.type === 'tran');
    expect(analysis?.type).toBe('tran');
    if (analysis?.type !== 'tran') throw new Error('fixture has no transient analysis');

    const convergence = createConvergenceTelemetry();
    const options = resolveOptions(compiled.simulationOptions, analysis.stopTime);
    const createRun = () => createDriverFromCompiled(compiled, options, {
      stopTime: analysis.stopTime,
      timestep: analysis.timestep,
      maxTimestep: analysis.maxTimestep ?? analysis.timestep,
      convergence,
    });

    const firstRun = createRun();
    try {
      for (let point = 1; point < 20_000; point++) firstRun.advance();
      expect(firstRun.simTime).toBeGreaterThan(0.1);
      expect(firstRun.convergence.transient.nrRetries).toBe(1_024);
    } finally {
      firstRun.dispose();
    }

    const secondRunStartRetries = convergence.transient.nrRetries;
    const secondRun = createRun();
    try {
      expect(secondRun.convergence.transient.nrRetries).toBe(1_024);
      for (let point = 1; point < 20_000; point++) secondRun.advance();
      expect(secondRun.simTime).toBeGreaterThan(0.1);
      expect(secondRun.convergence.transient.nrRetries - secondRunStartRetries).toBe(1_024);
    } finally {
      secondRun.dispose();
    }
  }, 10_000);
});
