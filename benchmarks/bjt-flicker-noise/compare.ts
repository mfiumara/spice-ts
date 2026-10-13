#!/usr/bin/env tsx
import { runNoiseCompare } from '../noise-raw.js';

void runNoiseCompare({
  name: 'bjt-flicker-noise',
  fixtureSha256: 'd9001973f05126c8590e28818d83655eb0ff315b3a3eecc69ee76c28296daa4a',
  source: {
    url: 'https://github.com/mfiumara/spice-ts/issues/248',
    revision: 'issue-248 fixture committed at the reported spice-ts head SHA',
    referenceEquation: {
      url: 'https://github.com/ngspice/ngspice/blob/032b1c32/src/spicelib/devices/bjt/bjtnoise.c#L126-L149',
      revision: '032b1c32',
      licence: 'BSD-3-Clause',
    },
  },
  unsupported: [
    'temperature variation',
    'stepped noise',
    'junction-capacitance noise',
    'differential voltage output',
    'current output',
    'non-level-1 BJT models',
    'instance multiplicity',
    'broader Gummel-Poon forms including CJE, CJC, RBM, IRB, and TF',
  ],
  losses: [
    'The bounded implementation covers only level-1 KF/AF base-current flicker noise at fixed 27 C.',
    'Non-zero numerical residuals are retained in the error metrics.',
  ],
  receipts: {
    redReceipt: 'commit b06c79c: pnpm -C packages/core exec vitest run src/analysis/noise.test.ts => 3 failed, 40 passed; KF/AF remained explicitly unsupported',
    greenReceipt: 'pnpm -C packages/core exec vitest run src/analysis/noise.test.ts src/devices/bjt.test.ts => 49 passed',
    potetoReceipt: 'benchmarks/bjt-flicker-noise/POTETO.md',
  },
});
