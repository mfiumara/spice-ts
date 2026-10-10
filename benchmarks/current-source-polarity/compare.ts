#!/usr/bin/env tsx
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createReport,
  serializeReport,
  type ComparisonFixture,
  type SignalComparison,
} from '../comparison-harness.js';

const fixtureDirectory = dirname(fileURLToPath(import.meta.url));
const fixtures: ComparisonFixture[] = [
  { name: 'current-source-polarity-op', analysis: 'op', netlist: fixture('op.cir'), signals: ['v(out)'] },
  { name: 'current-source-polarity-dc', analysis: 'dc', netlist: fixture('dc.cir'), signals: ['v(out)'] },
  { name: 'current-source-polarity-tran', analysis: 'tran', netlist: fixture('tran.cir'), signals: ['v(out)'] },
];

function fixture(name: string): string {
  return readFileSync(join(fixtureDirectory, name), 'utf8');
}

function exceedsTolerance(comparison: SignalComparison): boolean {
  return comparison.status !== 'compared'
    || comparison.absoluteError.max > 2e-9
    || (comparison.relativeError.max ?? 0) > 2e-9;
}

async function main(): Promise<void> {
  const report = await createReport(fixtures);
  const json = serializeReport(report);
  const outputFlag = process.argv.indexOf('--output');
  const outputPath = outputFlag >= 0 ? process.argv[outputFlag + 1] : undefined;
  if (outputFlag >= 0 && !outputPath) throw new Error('--output requires a path');
  if (outputPath) writeFileSync(resolve(outputPath), json);
  else process.stdout.write(json);

  const failed = report.fixtures.some(entry =>
    entry.status !== 'compared'
    || entry.metrics === null
    || Object.values(entry.metrics.signals).some(exceedsTolerance));
  if (failed) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
