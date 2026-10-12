import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { simulate } from '../simulate.js';

const NGSPICE = JSON.parse(readFileSync(
  new URL('./fixtures/ngspice47-cpl1-4-line-561.json', import.meta.url), 'utf8',
)) as { deck: string; totalPoints: number; nodes: string[]; time: number[]; voltages: number[][] };

// Issue #561: after #545 the transient grid left ngspice-47's right after the
// first step (spice-ts doubled the step where dctran.c repeats it once), and
// the corpus-f deck examples/TransmissionLines/cpl1_4_line.sp (four coupled
// CPL lines driven by MOS inverters) stopped with TimestepTooSmallError at
// 47.1 ns. Its CPL history is kept on ngspice's integer-picosecond clock, so
// the deck is very sensitive to where the steps land.
//
// The first-step and order-1 restart rules of dctran.c (#742) and the
// CKTdelta step integration (#708) put spice-ts on ngspice's grid. On this
// deck spice-ts now accepts the same 978 timepoints as ngspice-47, identical
// for the first 334 (to 16 ns, past the first PULSE edge at 15.9 ns), and the
// worst plotted node is 0.55% of its swing from ngspice. Before #742/#708
// (main dd4e58be) it was 1.19%, and right after #545 it did not finish.
//
// Reference: ngspice-47 on the identical netlist (the .control `TRAN` moved to
// a .tran card, as benchmarks/txl-cpl/compare.ts does), see
// fixtures/gen-ngspice47-cpl1-4-line-561.mjs.

function interpolate(time: ArrayLike<number>, values: ArrayLike<number>, t: number): number {
  if (t <= time[0]) return values[0];
  let lo = 0;
  let hi = time.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (time[mid] <= t) lo = mid; else hi = mid;
  }
  if (t >= time[hi]) return values[hi];
  const f = (t - time[lo]) / (time[hi] - time[lo]);
  return values[lo] + f * (values[hi] - values[lo]);
}

describe('transient step grid after t = 0 matches ngspice-47 on corpus-f cpl1_4_line.sp (#561)', () => {
  it('runs to TSTOP on the ngspice-47 grid and tracks every plotted node', async () => {
    const tr = (await simulate(NGSPICE.deck)).transient!;
    expect(tr.time[tr.time.length - 1]).toBeCloseTo(47.9e-9, 20);
    expect(tr.time.length).toBe(NGSPICE.totalPoints);

    // Same accepted timepoints as ngspice-47 through the first PULSE edge.
    let sameGrid = 0;
    while (sameGrid < NGSPICE.time.length
      && Math.abs(tr.time[sameGrid] - NGSPICE.time[sameGrid]) <= 1e-12 * NGSPICE.time[sameGrid]) sameGrid++;
    expect(sameGrid).toBeGreaterThanOrEqual(334);

    let worst = 0;
    NGSPICE.nodes.forEach((node, k) => {
      const values = tr.voltage(node);
      const reference = NGSPICE.voltages[k];
      const swing = Math.max(...reference) - Math.min(...reference);
      for (let i = 0; i < NGSPICE.time.length; i++) {
        worst = Math.max(worst, Math.abs(interpolate(tr.time, values, NGSPICE.time[i]) - reference[i]) / swing);
      }
    });
    // Measured 0.549% (max |err| / ngspice swing, worst of the 8 nodes).
    expect(worst).toBeLessThan(0.006);
  }, 20_000);
});
