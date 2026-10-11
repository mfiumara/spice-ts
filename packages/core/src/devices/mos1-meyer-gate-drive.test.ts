import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';

/**
 * #627: MOS1 Meyer gate-drive current i(vs) on the corpus-f LTRA/TXL MOS driver decks.
 *
 * VS drives only the two MOS1 gates (CGSO=CGDO=CJ=0), so i(vs) is the Meyer
 * gate-charge current alone. The fixtures are read unchanged except that both
 * engines get the same `.TRAN ... 10P` maximum step (the --tmax diagnostic of
 * triage-detail.ts). The pulse edges at 16.1 ns and 32.1 ns are breakpoints that
 * both engines land on exactly, so the samples there compare the device without
 * interpolating a current that is discontinuous at the edge corners.
 *
 * References: ngspice-47 batch run of the identical rewritten deck,
 * `meas tran find i(vs) at=16.1n / 32.1n` (numdgt=8). The remaining published
 * corpus-f gap is the output-grid/step artefact tracked in #592.
 */
const fixtureRoot = new URL('../../../../benchmarks/corpus/corpus-f/fixtures/tests/transmission/', import.meta.url);
const PEAK = 2.504e-6;

const cases = [
  ['ltra2_2_line.cir', 'da0193073a349b1d35d047eab8fb59e95bb485feafcd5529c0ad58351b5a7585',
    [[16.1e-9, -2.36416e-6], [32.1e-9, 2.01750e-6]]],
  ['txl1_1_line.cir', '950f67c60ff0fd4a85406119dfef272ede93054cc9a7ca57e0ca5e43fffff6ea',
    [[16.1e-9, -2.36368e-6], [32.1e-9, 1.93153e-6]]],
] as const;

function at(time: Float64Array | number[], values: Float64Array | number[], t: number): number {
  for (let i = 0; i < time.length; i++) {
    if (Math.abs(time[i] - t) < 1e-16) return values[i];
  }
  throw new Error(`no timepoint at ${t}`);
}

describe('MOS1 Meyer gate-drive current vs ngspice-47 (#627)', () => {
  for (const [filename, sha256, references] of cases) {
    it(`matches i(vs) at the pulse-edge breakpoints of ${filename} with TMAX 10 ps`, { timeout: 120_000 }, async () => {
      const bytes = readFileSync(new URL(filename, fixtureRoot));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(sha256);
      const original = bytes.toString('utf8');
      const deck = original.replace(/^\.TRAN 0\.2N 47N 0 0\.1N$/m, '.TRAN 0.2N 47N 0 10P');
      expect(deck).not.toBe(original);

      const result = await simulate(deck);
      const tran = result.transient!;
      const current = tran.current('VS');
      for (const [time, expected] of references) {
        // 0.5% of the gate-drive peak; spice-ts is within 0.27% at every edge.
        expect(Math.abs(at(tran.time, current, time) - expected)).toBeLessThan(0.005 * PEAK);
      }
    });
  }
});
