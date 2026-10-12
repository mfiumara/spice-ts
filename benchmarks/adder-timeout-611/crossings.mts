/**
 * Issue #611 residual: per output, the time shift between each spice-ts (or perturbed
 * ngspice) crossing of a logic threshold and the matching ngspice-47 reference crossing.
 * A shift that changes sign from edge to edge with a mean near zero is step-grid jitter;
 * a shift with one sign is a model (gate-delay) difference.
 *
 * Usage: pnpm exec tsx benchmarks/adder-timeout-611/crossings.mts <spice-ts.json | other.raw> <ngspice.raw> [level=1.5]
 */
import { readFile } from 'node:fs/promises';
import * as harnessModule from '../comparison-harness.js';

type Plot = ReturnType<typeof harnessModule.parseNgspiceRaw>[number];
type Recorded = { grid: number[]; signals: Record<string, number[]> };
// comparison-harness.ts compiles as CommonJS under tsx; from this ES module its exports
// arrive either as named bindings or on `default`.
const harness = ((harnessModule as { default?: typeof harnessModule }).default ?? harnessModule);

async function transientPlot(rawPath: string): Promise<Plot> {
  const plot = harness.parseNgspiceRaw(await readFile(rawPath, 'utf8')).find(candidate => /transient/i.test(candidate.plotName));
  if (!plot) throw new Error(`${rawPath}: no transient plot`);
  return plot;
}

function recordedFromRaw(plot: Plot, nodes: readonly string[]): Recorded {
  return {
    grid: [...plot.grid],
    signals: Object.fromEntries(nodes.map(node => [`v(${node})`, plot.signals[`v(${node})`]!.map(value => value.re)])),
  };
}

const NODES = ['9', '10', '11', '12', '13'];

function crossings(grid: readonly number[], values: readonly number[], level: number): number[] {
  const found: number[] = [];
  for (let index = 1; index < grid.length; index++) {
    const before = values[index - 1]! - level;
    const after = values[index]! - level;
    if (before * after < 0) found.push(grid[index - 1]! + (grid[index]! - grid[index - 1]!) * before / (before - after));
  }
  return found;
}

const [candidatePath, rawPath, levelArg] = process.argv.slice(2);
if (!candidatePath || !rawPath) {
  console.error('usage: crossings.mts <spice-ts.json | other.raw> <ngspice.raw> [level]');
  process.exit(2);
}
const level = Number(levelArg ?? '1.5');
const reference = recordedFromRaw(await transientPlot(rawPath), NODES);
const candidate = candidatePath.endsWith('.raw')
  ? recordedFromRaw(await transientPlot(candidatePath), NODES)
  : JSON.parse(await readFile(candidatePath, 'utf8')) as Recorded;
const signals = NODES.map(node => {
  const name = `v(${node})`;
  const mine = crossings(candidate.grid, candidate.signals[name]!, level);
  const theirs = crossings(reference.grid, reference.signals[name]!, level);
  if (mine.length !== theirs.length) return { signal: name, crossings: [mine.length, theirs.length], status: 'count differs' };
  const shiftsPs = mine.map((time, index) => (time - theirs[index]!) * 1e12);
  let maxAbs = 0;
  let sum = 0;
  let positive = 0;
  for (const shift of shiftsPs) {
    maxAbs = Math.max(maxAbs, Math.abs(shift));
    sum += shift;
    if (shift > 0) positive++;
  }
  return {
    signal: name, crossings: mine.length, maxAbsShiftPs: maxAbs, meanShiftPs: sum / shiftsPs.length,
    positiveFraction: positive / shiftsPs.length,
  };
});
console.log(JSON.stringify({ level, signals }, null, 2));
