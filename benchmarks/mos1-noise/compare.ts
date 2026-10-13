#!/usr/bin/env tsx
import { runNoiseCompare } from '../noise-raw.js';

void runNoiseCompare({
  name: 'mos1-noise',
  source: {
    url: 'https://github.com/mfiumara/spice-ts/issues/189',
    revision: 'issue-189 project-authored reference fixture',
  },
  losses: [
    'Only MOSFET LEVEL=1 with NLEV=2 is supported.',
    'Drain/source series resistance noise (RD/RS), body-junction noise, and BSIM noise remain unsupported.',
  ],
  receipts: {
    redReceipt: 'pnpm -C packages/core exec vitest run src/analysis/noise.test.ts => 5 failed, 17 passed; MOSFET noise explicitly rejected before implementation',
  },
});
