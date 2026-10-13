#!/usr/bin/env tsx
import { runNoiseCompare } from '../noise-raw.js';

void runNoiseCompare({
  name: 'bjt-noise',
  source: {
    url: 'https://github.com/mfiumara/spice-ts/issues/199',
    revision: 'issue-199 project-authored reference fixture',
  },
  losses: [
    'Only BJT LEVEL=1 collector and base shot noise is supported.',
    'Internal RB/RC/RE thermal noise, KF/AF flicker noise, junction-capacitance noise, and temperature variation remain unsupported.',
  ],
  receipts: {
    redReceipt: 'pnpm -C packages/core exec vitest run src/analysis/noise.test.ts => 7 failed, 31 passed (38 total); BJT noise rejected before implementation; the added .temp test already passed on base',
  },
});
