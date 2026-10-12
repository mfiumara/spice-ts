import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';
import { createTransientSim } from './transient-driver.js';

// Issue #678: createTransientSim must cap steps by the `.tran` TMAX field the
// same way simulate() does (TMAX wins over the maxTimestep option, which wins
// over the min(TSTEP, TSTOP/50) default), so both entry points step the same
// deck on the same time grid. Deck mirrors corpus-f cpl1_4_line's
// `TRAN 0.2N 47.9N 0 0.05N` with its 15.9 ns / 32 ns pulse drive.
const DRIVE = [
  '* #678 tmax repro',
  'VS1 a 0 PULSE(0 5 15.9n 0.2n 0.2n 15.8n 32n)',
  'R1 a b 50',
  'C1 b 0 1p',
  'R2 b 0 10k',
].join('\n');
const STOP = 47.9e-9;
const TMAX = 0.05e-9;
const TOLERANCE = 1 + 1e-9;

function largestStep(time: readonly number[]): number {
  let largest = 0;
  for (let i = 1; i < time.length; i++) largest = Math.max(largest, time[i]! - time[i - 1]!);
  return largest;
}

async function driverGrid(source: string, options?: { maxTimestep?: number }): Promise<number[]> {
  const sim = await createTransientSim(source, options);
  try {
    return [sim.simTime, ...sim.advanceUntil(STOP).map(step => step.time)];
  } finally {
    sim.dispose();
  }
}

describe('createTransientSim honours .tran TMAX (#678)', () => {
  const deck = `${DRIVE}\n.tran 0.2n 47.9n 0 0.05n`;

  it('never accepts a step larger than .tran TMAX', async () => {
    const grid = await driverGrid(deck);

    expect(grid.at(-1)).toBeCloseTo(STOP, 18);
    expect(largestStep(grid)).toBeLessThanOrEqual(TMAX * TOLERANCE);
  });

  it('steps on the same time grid as simulate()', async () => {
    const grid = await driverGrid(deck);
    const result = await simulate(deck);

    expect(grid).toEqual(result.transient!.time);
  });

  it('.tran TMAX takes precedence over the maxTimestep option, as in simulate()', async () => {
    const grid = await driverGrid(deck, { maxTimestep: 1e-9 });
    const result = await simulate(deck, { maxTimestep: 1e-9 });

    expect(largestStep(grid)).toBeLessThanOrEqual(TMAX * TOLERANCE);
    expect(grid).toEqual(result.transient!.time);
  });

  it('without .tran TMAX the option and the default match simulate()', async () => {
    const noTmax = `${DRIVE}\n.tran 0.2n 47.9n`;

    expect(await driverGrid(noTmax)).toEqual((await simulate(noTmax)).transient!.time);
    expect(await driverGrid(noTmax, { maxTimestep: 0.1e-9 }))
      .toEqual((await simulate(noTmax, { maxTimestep: 0.1e-9 })).transient!.time);
  });

  it('a zero-TSTEP .tran runs at TMAX, as in simulate()', async () => {
    const zeroStep = `${DRIVE}\n.tran 0 47.9n 0 0.05n`;
    const grid = await driverGrid(zeroStep);

    expect(largestStep(grid)).toBeLessThanOrEqual(TMAX * TOLERANCE);
    expect(grid).toEqual((await simulate(zeroStep)).transient!.time);
  });
});
