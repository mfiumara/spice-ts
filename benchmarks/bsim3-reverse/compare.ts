#!/usr/bin/env tsx
import { writeFileSync } from 'node:fs';
import { createReport, type ComparisonFixture, type EngineRun } from '../comparison-harness.js';
import { sramCellTransient } from '../circuits/analog-blocks.js';
import { idVgsPmos, idVdsNmos } from '../circuits/bsim3-validation.js';

// Existing project-authored model cards, unchanged between engines.
const sram = sramCellTransient();
const models = sram.split('\n').filter(line => line.startsWith('.model')).join('\n');
const fixtures: ComparisonFixture[] = [
  { name: 'sram-write-0', analysis: 'tran', netlist: sram, signals: ['v(q)', 'v(qb)'] },
  ...[false, true].flatMap(reverse => [
    {
      name: `nmos-${reverse ? 'reverse' : 'forward'}`, analysis: 'op' as const,
      netlist: ['NMOS orientation', models, 'VD d 0 0.9', 'VG g 0 1.8',
        `M1 ${reverse ? '0 g d' : 'd g 0'} 0 NMOD W=0.5u L=0.18u`, '.op', '.end'].join('\n'),
      signals: ['i(VD)'],
    },
    {
      name: `pmos-${reverse ? 'reverse' : 'forward'}`, analysis: 'op' as const,
      netlist: ['PMOS orientation', models, 'VS s 0 1.8', 'VD d 0 0.9',
        `M1 ${reverse ? 's 0 d' : 'd 0 s'} s PMOD W=1u L=0.18u`, '.op', '.end'].join('\n'),
      signals: ['i(VD)'],
    },
  ]),
  {
    name: 'pmos-off', analysis: 'op',
    netlist: ['PMOS off', models, 'VS s 0 1.8', 'VG g 0 1.8', 'VD d 0 0',
      'M1 d g s s PMOD W=1u L=0.18u', '.op', '.end'].join('\n'),
    signals: ['i(VD)'],
  },
  { name: 'pmos-id-vgs', analysis: 'dc', netlist: idVgsPmos(), signals: ['i(VSD)'] },
  { name: 'nmos-id-vds', analysis: 'dc', netlist: idVdsNmos([1.8])[0], signals: ['i(VDS)'] },
];

function compact(run: EngineRun): object {
  if (run.status !== 'success') return run;
  const { series, ...receipt } = run;
  return {
    ...receipt,
    points: series.grid.length,
    first: Object.fromEntries(Object.entries(series.signals).map(([name, values]) => [name, values[0]])),
    last: Object.fromEntries(Object.entries(series.signals).map(([name, values]) => [name, values.at(-1)])),
  };
}

async function main(): Promise<void> {
  const report = await createReport(fixtures);
  const output = {
    ...report,
    schemaVersion: 'spice-ts-bsim3-diagnostic/v1',
    command: ['pnpm', 'exec', 'tsx', 'benchmarks/bsim3-reverse/compare.ts'],
    note: 'Diagnostic comparison, not a parity pass. BSIM3 model approximation losses remain in #589; SRAM waveform acceptance in #582 is not met.',
    fixtures: report.fixtures.map(f => ({ ...f, spiceTs: compact(f.spiceTs), ngspice: compact(f.ngspice) })),
  };
  const json = `${JSON.stringify(output, null, 2)}\n`;
  const flag = process.argv.indexOf('--output');
  if (flag >= 0) {
    const path = process.argv[flag + 1];
    if (!path) throw new Error('--output requires a path');
    writeFileSync(path, json);
  } else process.stdout.write(json);
  // Successful execution means metrics are available, not that parity is achieved.
  if (report.fixtures.some(f => f.status !== 'compared'
    || Object.values(f.metrics?.signals ?? {}).some(s => s.status !== 'compared'))) process.exitCode = 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
