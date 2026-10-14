import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';

// ngspice-47, identical corpus-k k-15 input. Xyce_Regression GPL-3.0-or-later
// provenance and original hashes are retained in evidence/996 and SOURCES.md.
// No phase alignment, reference refinement or altered solver tolerances.
type Receipt = {
  deck: string;
  ngspice: { execution: { analyses: { series: { grid: number[]; signals: Record<string, { re: number }[]> } }[] } };
};

describe('MOS2 ring startup trajectory (#1003)', () => {
  // Coverage-instrumented CI can exceed Vitest's default 5 s wall-clock limit.
  it.each([['k-15', 19], ['k-10', 10]] as const)('matches every %s original common signal within the unchanged 1% reference-peak rule', async (id, signalCount) => {
    const receipt = JSON.parse(gunzipSync(readFileSync(new URL(`../../../../evidence/996/runs/${id}-original.json.gz`, import.meta.url))).toString()) as Receipt;
    const result = (await simulate(receipt.deck)).transient!;
    const reference = receipt.ngspice.execution.analyses[0].series;
    expect(Object.keys(reference.signals)).toHaveLength(signalCount);
    expect(result.time.at(-1)).toBeCloseTo(reference.grid.at(-1)!, 15);
    let worst = 0;
    for (const [name, samples] of Object.entries(reference.signals)) {
      const expected = samples.map(s => s.re);
      const actual = name.startsWith('v(') ? result.voltage(name.slice(2, -1)) : result.current(name.slice(2, -1));
      expect(actual).toHaveLength(result.time.length);
      const peak = Math.max(...expected.map(Math.abs), name.startsWith('v(') ? 1e-4 : 1e-10);
      let cursor = 1;
      for (let i = 0; i < result.time.length; i++) {
        const t = result.time[i];
        if (t < reference.grid[0] || t > reference.grid.at(-1)!) continue;
        while (cursor < reference.grid.length - 1 && reference.grid[cursor] < t) cursor++;
        const f = (t - reference.grid[cursor - 1]) / (reference.grid[cursor] - reference.grid[cursor - 1]);
        const value = expected[cursor - 1] + f * (expected[cursor] - expected[cursor - 1]);
        worst = Math.max(worst, Math.abs(actual[i] - value) / peak);
      }
    }
    expect(worst).toBeLessThanOrEqual(0.01);
  }, 30_000);
});
