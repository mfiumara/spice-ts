#!/usr/bin/env tsx
import { runNoiseCompare } from '../noise-raw.js';

void runNoiseCompare({
  name: 'bjt-internal-resistance-noise',
  workspacePrefix: 'spicets-bjt-rnoise-',
  source: {
    url: 'https://github.com/mfiumara/spice-ts/issues/243',
    revision: 'issue-243 project-authored reference fixture',
  },
  unsupported: {
    flickerNoise: ['KF', 'AF'],
    junctionCapacitance: ['CJE', 'CJC'],
    temperature: ['.temp', 'temperature sweeps'],
    steppedNoise: ['.step with .noise'],
    outputForms: ['differential voltage', 'current output'],
    modelLevels: ['non-level-1 BJT'],
    broaderGummelPoon: ['RBM', 'IRB', 'junction capacitances', 'transit-time forms'],
  },
  losses: [
    'Matched-point residuals are retained in errors; no non-zero residual is omitted.',
    'KF/AF, junction-capacitance, temperature, stepped, differential/current-output, non-level-1, and broader Gummel-Poon forms remain unsupported.',
  ],
  receipts: {
    tdd: {
      redCommit: 'a4cd77f',
      redCommand: 'pnpm -C packages/core exec vitest run src/analysis/noise.test.ts',
      redResult: '3 failed, 35 passed; RB, RC, and RE were explicitly rejected',
      greenCommand: 'pnpm -C packages/core exec vitest run src/analysis/noise.test.ts src/devices/bjt.test.ts',
      greenResult: '44 passed',
    },
    potetoReceipt: 'benchmarks/bjt-internal-resistance-noise/POTETO.md',
  },
});
