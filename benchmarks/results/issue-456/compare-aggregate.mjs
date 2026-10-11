#!/usr/bin/env node
// Diff two aggregate-report.json files (before/after) per fixture, analysis and
// signal. Usage: node compare-aggregate.mjs before.json after.json [out.json]
// Prints every analysis whose grid or any signal metric changed, with the
// number of signals whose absolute RMS went down/up and the worst absolute max
// before/after, and writes the full per-signal deltas to out.json.
import { readFileSync, writeFileSync } from 'node:fs';

const [beforePath, afterPath, outPath] = process.argv.slice(2);
const before = JSON.parse(readFileSync(beforePath, 'utf8'));
const after = JSON.parse(readFileSync(afterPath, 'utf8'));
const byKey = report => new Map(report.fixtures.map(fixture => [fixture.key, fixture]));
const beforeFixtures = byKey(before);
const rows = [];
const unchanged = [];

for (const fixture of after.fixtures) {
  const previous = beforeFixtures.get(fixture.key);
  if (!previous) continue;
  const statusChanged = previous.spiceTs.status !== fixture.spiceTs.status;
  // A fixture can carry several comparisons of one analysis type (e.g. a
  // noise spectrum and its integrated totals); pair them by position.
  const previousComparisons = previous.comparisons ?? [];
  for (const [index, comparison] of (fixture.comparisons ?? []).entries()) {
    const old = previousComparisons[index];
    if (old?.analysis !== comparison.analysis) continue;
    if (!old) continue;
    const signals = {};
    let down = 0;
    let up = 0;
    let worstBefore = ['', 0];
    let worstAfter = ['', 0];
    for (const [signal, metric] of Object.entries(comparison.metrics.signals)) {
      const oldMetric = old.metrics.signals[signal];
      if (metric.status !== 'compared' || oldMetric?.status !== 'compared') continue;
      const a = metric.absoluteError;
      const b = oldMetric.absoluteError;
      if (a.rms < b.rms) down++;
      else if (a.rms > b.rms) up++;
      if (b.max > worstBefore[1]) worstBefore = [signal, b.max];
      if (a.max > worstAfter[1]) worstAfter = [signal, a.max];
      if (a.max !== b.max || a.rms !== b.rms) {
        signals[signal] = { absMax: [b.max, a.max], absRms: [b.rms, a.rms] };
      }
    }
    const gridBefore = old.metrics.grid.spiceTsPoints;
    const gridAfter = comparison.metrics.grid.spiceTsPoints;
    if (Object.keys(signals).length === 0 && gridBefore === gridAfter && !statusChanged) {
      unchanged.push(`${fixture.key} ${comparison.analysis}`);
      continue;
    }
    rows.push({
      fixture: fixture.key,
      analysis: comparison.analysis,
      spiceTsPoints: [gridBefore, gridAfter],
      ngspicePoints: comparison.metrics.grid.ngspicePoints,
      signalCount: Object.keys(comparison.metrics.signals).length,
      absRmsDown: down,
      absRmsUp: up,
      worstAbsMax: { before: worstBefore, after: worstAfter },
      changedSignals: signals,
    });
  }
  if (statusChanged) {
    rows.push({ fixture: fixture.key, status: [previous.spiceTs.status, fixture.spiceTs.status] });
  }
}

const fmt = value => Number(value).toPrecision(4);
for (const row of rows) {
  if (row.status) {
    console.log(`${row.fixture}: spice-ts status ${row.status[0]} -> ${row.status[1]}`);
    continue;
  }
  const { before: wb, after: wa } = row.worstAbsMax;
  console.log(
    `${row.fixture} ${row.analysis}: points ${row.spiceTsPoints[0]} -> ${row.spiceTsPoints[1]} (ngspice ${row.ngspicePoints}); `
    + `abs RMS down ${row.absRmsDown}, up ${row.absRmsUp} of ${row.signalCount}; `
    + `worst abs max ${wb[0]} ${fmt(wb[1])} -> ${wa[0]} ${fmt(wa[1])}`,
  );
}
console.log(`unchanged compared analyses (${unchanged.length}): ${unchanged.join(', ')}`);
console.log(`outcome ${before.outcomeSha256} -> ${after.outcomeSha256}; changed analyses ${rows.length}`);
if (outPath) {
  writeFileSync(outPath, `${JSON.stringify({
    before: { outcomeSha256: before.outcomeSha256, totals: before.totals },
    after: { outcomeSha256: after.outcomeSha256, totals: after.totals },
    changed: rows,
    unchanged,
  }, null, 2)}\n`);
}
