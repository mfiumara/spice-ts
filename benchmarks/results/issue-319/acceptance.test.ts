import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compareWaveform } from './acceptance.js';

describe('issue #319 waveform acceptance', () => {
  it('rejects an interior sample above the fixture reltol when endpoints match', () => {
    assert.throws(
      () => compareWaveform([1, 1.006, 1], [1, 1, 1], 25),
      /TEMP 25: max relative waveform error 0\.006 exceeds 0\.005/,
    );
  });
});
