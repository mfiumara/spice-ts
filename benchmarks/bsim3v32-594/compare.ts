#!/usr/bin/env tsx
/**
 * Score a spice-ts build against the #594 ngspice-47 bsim3v32 reference.
 *
 *   pnpm exec tsx benchmarks/bsim3v32-594/compare.ts [--core <dist/index.js>] [--output <json>]
 *
 * Uses only the public simulate() API, so it runs against any build (main
 * rejects every VERSION=3.2.x deck, which is scored as a failure). Per case
 * it counts the reference values within 1% (|spice-ts - ngspice| /
 * max(|ngspice|, floor)) for: terminal i(VD) at every DC operating point and
 * along the Id-Vds sweep (floor 1e-12 A), and the AC terminal capacitance
 * matrices (floor 1e-21 F). For the inverter-chain transient it reports the
 * worst node-voltage and windowed supply-charge error as a fraction of the
 * ngspice peak. The 1% gate is
 * packages/core/src/devices/bsim3v32-ngspice-parity.test.ts, which also
 * checks the device-level b3v32ld.c outputs.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const THRESHOLD = 0.01;
type Source = 'vg' | 'vd' | 'vb';
interface Bias { vgs: number; vds: number; vbs: number }
interface DcCase {
  name: string; type: 1 | -1;
  operatingPoints: { deck: string; points: (Bias & { ivd: number })[] };
  sweep: { deck: string; points: { vd: number; ivd: number }[] };
}
interface ChargeCase {
  name: string; type: 1 | -1;
  ac: { deck: string; frequency: number; points: (Bias & { c: Record<Source, Record<Source, number>> })[] };
}
type TranSignal = 'v(n1)' | 'v(n2)' | 'v(out)' | 'q(vdd)';
const reference = JSON.parse(readFileSync(new URL('./ngspice-47-bsim3v32.json', import.meta.url), 'utf8')) as {
  engine: string; dc: DcCase[]; charge: ChargeCase[];
  transient: { deck: string; window: number; peak: Record<TranSignal, number>; samples: ({ time: number } & Record<TranSignal, number>)[] };
};

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
type Core = typeof import('../../packages/core/src/index.js');

interface Score { within: number; total: number; worst: number; label: string }
const score = (): Score => ({ within: 0, total: 0, worst: 0, label: '' });
function record(s: Score, error: number, label: () => string): void {
  s.total++;
  if (error < THRESHOLD) s.within++;
  if (!(error <= s.worst)) { s.worst = error; s.label = label(); }
}
const relative = (actual: number, expected: number, floor: number) => Math.abs(actual - expected) / Math.max(Math.abs(expected), floor);

async function run(core: Core, deck: string) {
  try {
    return { result: await core.simulate(deck) };
  } catch (error) {
    return { error: (error as Error).message.split('\n')[0] };
  }
}

async function main(): Promise<void> {
  const core = await import(pathToFileURL(resolve(arg('--core') ?? 'packages/core/dist/index.js')).href) as Core;
  const cases: Record<string, Record<string, Score>> = {};
  for (const c of reference.dc) {
    const op = score();
    for (const p of c.operatingPoints.points) {
      const deck = c.operatingPoints.deck
        .replace(/^VD d 0 DC .*$/m, `VD d 0 DC ${c.type * p.vds}`)
        .replace(/^VG g 0 DC .*$/m, `VG g 0 DC ${c.type * p.vgs}`)
        .replace(/^VB b 0 DC .*$/m, `VB b 0 DC ${c.type * p.vbs}`)
        .replace(/^\.end$/m, '.op\n.end');
      const { result, error } = await run(core, deck);
      if (!result) { record(op, Infinity, () => error!); continue; }
      const current = result.dc!.current('VD');
      record(op, relative(current, p.ivd, 1e-12), () => `i(VD) at ${JSON.stringify({ vgs: p.vgs, vds: p.vds, vbs: p.vbs })}: ${current} vs ${p.ivd}`);
    }
    const sweep = score();
    const { result, error } = await run(core, c.sweep.deck);
    const current = result?.dcSweep?.current('VD');
    c.sweep.points.forEach((p, i) => {
      if (!current) record(sweep, Infinity, () => error ?? 'no sweep');
      else record(sweep, relative(current[i], p.ivd, 1e-12), () => `i(VD) at VD=${p.vd}: ${current[i]} vs ${p.ivd}`);
    });
    cases[c.name] = { ...cases[c.name], operatingPoints: op, sweep };
  }
  for (const c of reference.charge) {
    const ac = score();
    const omega = 2 * Math.PI * c.ac.frequency;
    for (const p of c.ac.points) {
      for (const excited of ['vg', 'vd', 'vb'] as const) {
        const deck = c.ac.deck
          .replace(/^VD d 0 DC 0 AC 0$/m, `VD d 0 DC ${c.type * p.vds} AC ${excited === 'vd' ? 1 : 0}`)
          .replace(/^VG g 0 DC 0 AC 0$/m, `VG g 0 DC ${c.type * p.vgs} AC ${excited === 'vg' ? 1 : 0}`)
          .replace(/^VB b 0 DC 0 AC 0$/m, `VB b 0 DC ${c.type * p.vbs} AC ${excited === 'vb' ? 1 : 0}`)
          .replace(/^\.end$/m, `.ac lin 1 ${c.ac.frequency} ${c.ac.frequency}\n.end`);
        const { result, error } = await run(core, deck);
        for (const measured of ['vg', 'vd', 'vb'] as const) {
          if (!result) { record(ac, Infinity, () => error!); continue; }
          const { magnitude, phase } = result.ac!.current(measured.toUpperCase())[0];
          const capacitance = magnitude * Math.sin(phase * Math.PI / 180) / omega;
          record(ac, relative(capacitance, p.c[excited][measured], 1e-21),
            () => `d i(${measured})/d ${excited} at ${JSON.stringify({ vgs: p.vgs, vds: p.vds, vbs: p.vbs })}: ${capacitance} vs ${p.c[excited][measured]}`);
        }
      }
    }
    cases[`charge:${c.name}`] = { ac };
  }

  const interpolate = (time: readonly number[], values: readonly number[], t: number): number => {
    const j = time.findIndex(x => x >= t);
    if (j <= 0) return values[Math.max(j, 0)];
    return values[j - 1] + (values[j] - values[j - 1]) * (t - time[j - 1]) / (time[j] - time[j - 1]);
  };
  const integrate = (time: readonly number[], values: readonly number[], lo: number, hi: number): number => {
    const points: [number, number][] = [[lo, interpolate(time, values, lo)]];
    for (let k = 0; k < time.length; k++) if (time[k] > lo && time[k] < hi) points.push([time[k], values[k]]);
    points.push([hi, interpolate(time, values, hi)]);
    let q = 0;
    for (let k = 1; k < points.length; k++) q += 0.5 * (points[k][1] + points[k - 1][1]) * (points[k][0] - points[k - 1][0]);
    return q;
  };
  const tran = reference.transient;
  const started = performance.now();
  const { result: tranResult, error: tranError } = await run(core, tran.deck);
  const tranSeconds = (performance.now() - started) / 1000;
  const transient: Record<string, number | string> = {};
  if (tranResult?.transient) {
    const t = tranResult.transient;
    const half = tran.window / 2;
    for (const signal of ['v(n1)', 'v(n2)', 'v(out)', 'q(vdd)'] as const) {
      let worst = 0;
      for (const sample of tran.samples) {
        const actual = signal === 'q(vdd)'
          ? integrate(t.time, t.current('VDD'), sample.time - half, sample.time + half)
          : interpolate(t.time, t.voltage(signal.slice(2, -1)), sample.time);
        worst = Math.max(worst, Math.abs(actual - sample[signal]) / tran.peak[signal]);
      }
      transient[signal] = Number(worst.toPrecision(3));
    }
    transient.points = t.time.length;
    transient.seconds = Number(tranSeconds.toFixed(2));
  } else {
    transient.error = tranError ?? 'no transient result';
  }

  const totals = { within: 0, total: 0, casesMatched: 0, cases: 0 };
  for (const scores of Object.values(cases)) {
    totals.cases++;
    let matched = true;
    for (const s of Object.values(scores)) {
      totals.within += s.within;
      totals.total += s.total;
      if (s.within !== s.total) matched = false;
    }
    if (matched) totals.casesMatched++;
  }
  const report = {
    schemaVersion: 'spice-ts-bsim3v32-compare/v1',
    engine: reference.engine,
    core: arg('--core') ?? 'packages/core/dist/index.js',
    threshold: THRESHOLD,
    totals,
    transient,
    cases: Object.fromEntries(Object.entries(cases).map(([name, scores]) => [name, Object.fromEntries(
      Object.entries(scores).map(([k, s]) => [k, { within: s.within, total: s.total, worst: Number.isFinite(s.worst) ? Number(s.worst.toPrecision(3)) : 'failed', label: s.label }]),
    )])),
  };
  const json = `${JSON.stringify(report, null, 1)}\n`;
  const output = arg('--output');
  if (output) writeFileSync(output, json);
  console.log(JSON.stringify({ totals, transient }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
