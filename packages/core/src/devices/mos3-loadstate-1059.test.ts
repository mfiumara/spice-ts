import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';
import { MOS3 } from './mos3.js';
import type { TransientChargeState } from './charge-state.js';

interface Capture {
  input: string;
  sha256: string;
  reference: { grid: number[]; signals: Record<string, { re: number; im: number }[]> };
}

interface DebugMOS {
  charges: Pick<TransientChargeState, 'incrementalCharge' | 'predictedCharge'> & { truncation?: unknown };
  capacitanceScratch: Float64Array;
}

describe('MOS3 material load-state divergence #1059', () => {
  it.skipIf(process.env.ISSUE1059_LOADSTATE_RED !== '1')('RED: reduced pair input current stays within 1% of ngspice-47', async () => {
    const capture = JSON.parse(gunzipSync(readFileSync(new URL('../../../../benchmarks/results/issue-1059-loadstate/pair-waveforms.json.gz', import.meta.url))).toString()) as Capture;
    expect(createHash('sha256').update(capture.input).digest('hex')).toBe(capture.sha256);
    const actual = (await simulate(capture.input)).transient!;
    const { grid, signals } = capture.reference;
    const reference = signals['i(vp)'].map(v => v.re);
    const peak = Math.max(1e-10, ...reference.map(Math.abs));
    const current = actual.current('vp');
    let cursor = 1;
    for (let i = 0; i < actual.time.length; i++) {
      const time = actual.time[i];
      if (time < grid[0] || time > grid.at(-1)!) continue;
      while (cursor < grid.length - 1 && grid[cursor] <= time) cursor++;
      const fraction = (time - grid[cursor - 1]) / (grid[cursor] - grid[cursor - 1]);
      const expected = reference[cursor - 1] + fraction * (reference[cursor] - reference[cursor - 1]);
      expect(Math.abs(current[i] - expected) / peak,
        `first material input-current divergence at ${time} s: TS=${current[i]} A, ngspice interpolated=${expected} A`).toBeLessThanOrEqual(0.01);
    }
  });
  it.skipIf(process.env.ISSUE1059_LOADSTATE_RED !== '1')('RED: MOS3 first charge load uses native MODEINITPRED charge extrapolation', async () => {
    const input = readFileSync(new URL('../../../../benchmarks/results/issue-1059/pair.cir', import.meta.url), 'utf8');
    const acceptedDt = new WeakMap<MOS3, number>();
    const trialTime = new WeakMap<MOS3, number>();
    const records: { time: number; actual: number; expected: number; xfact: number }[] = [];
    const stamp = MOS3.prototype.stampTransientCharge;
    const accept = MOS3.prototype.acceptTransientStep;
    MOS3.prototype.acceptTransientStep = function(ctx) {
      const d = this as unknown as DebugMOS;
      const truncating = d.charges.truncation !== undefined;
      accept.call(this, ctx);
      if (!truncating) acceptedDt.set(this, ctx.dt);
    };
    MOS3.prototype.stampTransientCharge = function(ctx, integration) {
      const first = trialTime.get(this) !== ctx.time;
      trialTime.set(this, ctx.time);
      stamp.call(this, ctx, integration);
      const previousDt = acceptedDt.get(this);
      if (!first || this.name.toLowerCase() !== 'mp2' || ctx.time < 4.2001e-8 || ctx.time >= 4.3e-8 || !previousDt) return;
      const d = this as unknown as DebugMOS;
      const [, gate, source] = this.nodes;
      const voltage = ctx.getVoltage(gate) - ctx.getVoltage(source);
      records.push({ time: ctx.time, xfact: ctx.dt / previousDt,
        actual: d.charges.incrementalCharge(0, voltage, d.capacitanceScratch[0], true),
        expected: d.charges.predictedCharge(0, ctx.dt / previousDt) });
    };
    try {
      await simulate(input);
    } finally {
      MOS3.prototype.stampTransientCharge = stamp;
      MOS3.prototype.acceptTransientStep = accept;
    }
    expect(records.length).toBeGreaterThan(0);
    // A policy RED, not a claim that predictor-only changes fix waveform parity.
    for (const r of records) expect(Math.abs(r.actual - r.expected), JSON.stringify(r)).toBeLessThanOrEqual(1e-25);
  });
  it('native pair first-load qgs is charge-history extrapolation, not incremental Meyer integration', () => {
    interface NativeLoad { xfact: number; states: Record<string, number>[] }
    interface Steps { nativeAccepted: { time: number; devices: Record<string, { firstLoad: NativeLoad }> }[] }
    const steps = JSON.parse(gunzipSync(readFileSync(new URL('../../../../benchmarks/results/issue-1059-loadstate/pair-steps.json.gz', import.meta.url))).toString()) as Steps;
    const load = steps.nativeAccepted.find(s => s.time >= 4.201e-8)!.devices.mp2.firstLoad;
    const [trial, accepted, previous] = load.states;
    const predicted = (1 + load.xfact) * accepted.qgs - load.xfact * previous.qgs;
    expect(Math.abs(trial.qgs - predicted)).toBeLessThanOrEqual(1e-25);
    const incremental = accepted.qgs + (trial.vgs - accepted.vgs) * (trial.capgs + accepted.capgs);
    expect(Math.abs(trial.qgs - incremental)).toBeGreaterThan(1e-20);
  });
});
