import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { simulate } from '../simulate.js';

const NGSPICE = JSON.parse(readFileSync(
  new URL('./fixtures/ngspice47-txl-lossless-708.json', import.meta.url), 'utf8',
)) as { deck: string; totalPoints: number; time: number[]; vb: number[]; vd: number[] };

// Issue #708: ngspice-47 dctran.c integrates each step with CKTdelta and
// advances `CKTtime += CKTdelta`. spice-ts integrated `nextTime - time`,
// which in floating point is not always the selected step, so accepted times
// drifted from ngspice's by ulps (5.213999999999999e-9 instead of 5.214e-9).
// TXL/CPL keep their history at `(int)(CKTtime * 1e12)` picoseconds
// (txlload.c / cplload.c), so that drift moved a history point by 1 ps and
// the far-end edge of the lossless line by one 1 ps slope of its 100 ps fall:
// v(b) 6.67e-3 V off ngspice at 6.27 ns.
//
// The deck has no LTE-controlled element (resistors + two TXL lines), so both
// engines take the same grid and the linear lines must agree to rounding at
// every ngspice timepoint. Reference: ngspice-47 on the identical deck, see
// fixtures/gen-ngspice47-txl-lossless-708.mjs.
describe('transient step integrates CKTdelta like ngspice-47 dctran.c (#708)', () => {
  it('matches every ngspice-47 timepoint and TXL waveform on the lossless/shunt-G deck', async () => {
    const tr = (await simulate(NGSPICE.deck)).transient!;
    expect(tr.time.length).toBe(NGSPICE.totalPoints);
    const vb = tr.voltage('b');
    const vd = tr.voltage('d');
    let timeErr = 0;
    let vbErr = 0;
    let vdErr = 0;
    for (let i = 0; i < NGSPICE.time.length; i++) {
      timeErr = Math.max(timeErr, Math.abs(tr.time[i] - NGSPICE.time[i]));
      vbErr = Math.max(vbErr, Math.abs(vb[i] - NGSPICE.vb[i]));
      vdErr = Math.max(vdErr, Math.abs(vd[i] - NGSPICE.vd[i]));
    }
    expect(timeErr).toBeLessThan(1e-21);
    expect(vbErr).toBeLessThan(1e-9);
    expect(vdErr).toBeLessThan(1e-9);
  });
});
