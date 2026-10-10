#!/usr/bin/env tsx
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createReport,
  serializeReport,
  type ComparisonFixture,
} from '../comparison-harness.js';

const fixtures: Array<ComparisonFixture & { path: string }> = [
  {
    name: 'ngspice-ltra-line-transient',
    analysis: 'tran',
    path: 'benchmarks/corpus/ngspice/fixtures/tests/transmission/ltra1_1_line.cir',
    netlist: '',
    signals: ['v(2)', 'v(3)'],
  },
  {
    name: 'classic-lossy-line-24-inch',
    analysis: 'tran',
    path: 'benchmarks/corpus/classic/fixtures/spice3f5/ltra_1.cir',
    netlist: '',
    signals: ['v(1)', 'v(2)', 'v(3)'],
  },
  {
    name: 'classic-lossy-line-aluminium',
    analysis: 'tran',
    path: 'benchmarks/corpus/classic/fixtures/spice3f5/ltra_2.cir',
    netlist: '',
    signals: ['v(1)', 'v(2)', 'v(3)'],
  },
  {
    name: 'classic-coupled-lossy-lines',
    analysis: 'tran',
    path: 'benchmarks/corpus/classic/fixtures/spice3f5/ltra_3.cir',
    netlist: '',
    signals: ['v(1)', 'v(2)', 'v(3)', 'v(4)', 'v(5)'],
  },
];

async function main(): Promise<void> {
  const fixtureFlag = process.argv.indexOf('--fixture');
  const fixtureName = fixtureFlag >= 0 ? process.argv[fixtureFlag + 1] : undefined;
  if (fixtureFlag >= 0 && !fixtureName) throw new Error('--fixture requires a name');
  const selected = fixtureName ? fixtures.filter(fixture => fixture.name === fixtureName) : fixtures;
  if (selected.length === 0) throw new Error(`Unknown fixture '${fixtureName}'`);
  const report = await createReport(selected.map(({ path, ...fixture }) => ({
    ...fixture,
    netlist: readFileSync(resolve(path), 'utf8'),
  })));
  const receipt = {
    ...report,
    fixtures: report.fixtures.map(fixture => ({
      ...fixture,
      spiceTs: {
        ...fixture.spiceTs,
        series: fixture.spiceTs.status === 'success'
          ? { pointCount: fixture.spiceTs.series.grid.length }
          : undefined,
      },
      ngspice: {
        ...fixture.ngspice,
        series: fixture.ngspice.status === 'success'
          ? { pointCount: fixture.ngspice.series.grid.length }
          : undefined,
      },
    })),
  };
  const output = serializeReport(receipt as unknown as Parameters<typeof serializeReport>[0]);
  const outputFlag = process.argv.indexOf('--output');
  const outputPath = outputFlag >= 0 ? process.argv[outputFlag + 1] : undefined;
  if (outputFlag >= 0 && !outputPath) throw new Error('--output requires a path');
  if (outputPath) writeFileSync(resolve(outputPath), output);
  else process.stdout.write(output);
  if (report.fixtures.some(fixture => fixture.status === 'failed')) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
