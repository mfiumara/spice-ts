import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';

// Recorded ngspice-47, identical original corpus-k k-10 deck. Source/hash and
// reference command are embedded in the #996 receipt; GPL provenance in SOURCES.md.
const receipt = JSON.parse(gunzipSync(readFileSync(new URL(
  '../../../../evidence/996/runs/k-10-original.json.gz', import.meta.url,
))).toString());
const reference = receipt.ngspice.execution.analyses.find((a: { type: string }) => a.type === 'tran').series as {
  grid: number[]; signals: Record<string, { re: number }[]>;
};

describe('MOS2 bridge accepted transient history (#1002)', () => {
  it('matches every common original-deck signal under the unchanged corpus 1% rule', async () => {
    const result = (await simulate(receipt.deck)).transient!;
    const errors: Record<string, number> = {};
    for (const [name, samples] of Object.entries(reference.signals)) {
      const expected = samples.map(s => s.re);
      const actual = name.startsWith('v(')
        ? result.voltage(name.slice(2, -1)) : result.current(name.slice(2, -1));
      const peak = Math.max(...expected.map(Math.abs), name.startsWith('v(') ? 1e-4 : 1e-10);
      let cursor = 1;
      let error = 0;
      for (let i = 0; i < result.time.length; i++) {
        const t = result.time[i];
        if (t < reference.grid[0] || t > reference.grid.at(-1)!) continue;
        while (cursor < reference.grid.length - 1 && reference.grid[cursor] < t) cursor++;
        const f = (t - reference.grid[cursor - 1]) / (reference.grid[cursor] - reference.grid[cursor - 1]);
        const value = expected[cursor - 1] + f * (expected[cursor] - expected[cursor - 1]);
        error = Math.max(error, Math.abs(actual[i] - value) / peak);
      }
      errors[name] = error;
    }
    expect(errors).toEqual(Object.fromEntries(Object.keys(errors).map(name => [name, expect.any(Number)])));
    expect(Math.max(...Object.values(errors)), JSON.stringify(errors)).toBeLessThanOrEqual(0.01);
  });
});
