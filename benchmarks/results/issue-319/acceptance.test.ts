import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { resolve } from 'node:path';
import { compareFixture } from '../../comparison-harness.js';
import { compareWaveform } from './acceptance.js';

const PARITY_FIXTURE_PATH = 'benchmarks/diode-breakdown-temperature/dc-equivalent.cir';
const PARITY_FIXTURE_SHA256 = '02551eb619592aa1065cd549dbabd65e0916c3d223c2cbef7ecd6de72d4c8b65';

describe('issue #319 waveform acceptance', () => {
  it('rejects an interior sample above the fixture reltol when endpoints match', () => {
    assert.throws(
      () => compareWaveform([1, 1.006, 1], [1, 1, 1], 25),
      /TEMP 25: max relative waveform error 0\.006 exceeds 0\.005/,
    );
  });

  it('compares the byte-identical DC-equivalent temperature-law fixture with ngspice-47', async () => {
    const input = await readFile(resolve(PARITY_FIXTURE_PATH), 'utf8');
    assert.equal(createHash('sha256').update(input).digest('hex'), PARITY_FIXTURE_SHA256);

    const comparison = await compareFixture({
      name: 'issue-319-diode-breakdown-temperature-dc-equivalent',
      analysis: 'dc',
      netlist: input,
      signals: ['v(cold)', 'v(nominal)', 'v(hot)', 'i(VSWEEP)'],
    });

    assert.equal(comparison.netlistSha256, PARITY_FIXTURE_SHA256);
    assert.equal(comparison.status, 'compared');
    assert.equal(comparison.metrics?.grid.alignedPoints, 17);
    for (const signal of Object.values(comparison.metrics?.signals ?? {})) {
      assert.equal(signal.status, 'compared');
      if (signal.status === 'compared') assert.equal(signal.sampleCount, 17);
    }
  });
});
