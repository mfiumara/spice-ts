/**
 * Issue #611 / #604: compare a spice-ts waveform recorded by `measure.mts --record`
 * with the first transient plot of an ngspice-47 ASCII raw file of the identical
 * fixture, with the corpus-f metric: per signal, max |error| on the spice-ts grid
 * (ngspice linearly interpolated, one-sided across shared breakpoints, i.e.
 * comparison-harness.ts alignAndMeasure) divided by the ngspice peak; match below
 * MATCH_THRESHOLD (1 %).
 *
 * Usage: pnpm exec tsx benchmarks/adder-timeout-611/compare.ts <spice-ts.json> <ngspice.raw>
 */
import { readFile } from 'node:fs/promises';
import { alignAndMeasure, parseNgspiceRaw, sharedGridPoints } from '../comparison-harness.js';
import { MATCH_THRESHOLD, PEAK_FLOOR } from '../corpus/corpus-f/lib.js';

async function main(): Promise<void> {
  const [spicePath, rawPath] = process.argv.slice(2);
  if (!spicePath || !rawPath) {
    console.error('usage: compare.ts <spice-ts.json> <ngspice.raw>');
    process.exit(2);
  }
  const recorded = JSON.parse(await readFile(spicePath, 'utf8')) as { grid: number[]; signals: Record<string, number[]> };
  const plot = parseNgspiceRaw(await readFile(rawPath, 'utf8')).find(candidate => /transient/i.test(candidate.plotName));
  if (!plot) throw new Error(`${rawPath}: no transient plot`);

  const spiceTs = {
    grid: recorded.grid,
    signals: Object.fromEntries(Object.entries(recorded.signals).map(([name, values]) => [name, values.map(re => ({ re, im: 0 }))])),
  };
  const names = Object.keys(recorded.signals);
  const metrics = alignAndMeasure(spiceTs, plot, names, { breakpoints: sharedGridPoints(spiceTs.grid, plot.grid) });
  const signals = names.map(name => {
    const metric = metrics.signals[name];
    const reference = plot.signals[name] ?? [];
    let peak = 0;
    for (const value of reference) peak = Math.max(peak, Math.hypot(value.re, value.im));
    if (metric.status !== 'compared') return { signal: name, status: metric.status };
    const normalized = metric.absoluteError.max / Math.max(peak, PEAK_FLOOR);
    // Logic-level view for these digital decks: share of ngspice samples (inside the
    // spice-ts time range) where the spice-ts sample at or after that time differs by
    // more than half the ngspice peak, i.e. the two engines show opposite logic levels.
    let opposite = 0;
    let compared = 0;
    let cursor = 0;
    for (let index = 0; index < plot.grid.length; index++) {
      const time = plot.grid[index];
      if (time > recorded.grid[recorded.grid.length - 1]) break;
      while (cursor < recorded.grid.length - 1 && recorded.grid[cursor] < time) cursor++;
      compared++;
      if (Math.abs(recorded.signals[name][cursor] - reference[index].re) > 0.5 * peak) opposite++;
    }
    return {
      signal: name, absoluteMax: metric.absoluteError.max, ngspicePeak: peak, normalized,
      match: normalized < MATCH_THRESHOLD, oppositeLevelFraction: compared > 0 ? opposite / compared : null,
    };
  });
  const worst = signals.reduce((current, entry) => (
    'normalized' in entry && (current === null || entry.normalized! > current.normalized!) ? entry : current
  ), null as (typeof signals)[number] | null);
  console.log(JSON.stringify({
    spiceTsPoints: recorded.grid.length,
    ngspicePoints: plot.grid.length,
    spiceTsEnd: recorded.grid.at(-1),
    ngspiceEnd: plot.grid.at(-1),
    threshold: MATCH_THRESHOLD,
    worst,
    signals,
  }, null, 2));
}

void main();
