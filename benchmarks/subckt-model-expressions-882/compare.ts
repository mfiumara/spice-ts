#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReport, serializeReport, type ComparisonFixture } from '../comparison-harness.js';

const directory = dirname(fileURLToPath(import.meta.url));
const fixtures: ComparisonFixture[] = ['784', '738'].map(ticket => ({
  name: `subckt-model-expressions-${ticket}`,
  analysis: 'op',
  netlist: readFileSync(join(directory, `${ticket}.cir`), 'utf8'),
  signals: ['v(a)'],
}));

// Publish measured errors, including the pre-existing diode voltage difference.
// This receipt is not an accuracy gate with circuit-specific tuned tolerances.
async function main(): Promise<void> {
  const report = await createReport(fixtures);
  report.tools.spiceTs.command = ['pnpm', 'exec', 'tsx', 'benchmarks/subckt-model-expressions-882/compare.ts'];
  process.stdout.write(serializeReport(report));
  if (report.fixtures.some(fixture => fixture.status !== 'compared')) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
