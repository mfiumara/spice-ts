#!/usr/bin/env tsx
/**
 * Score a spice-ts build against the #626 ngspice-47 BSIM3 charge reference.
 *
 *   pnpm exec tsx benchmarks/bsim3-charge-626/compare.ts [--core <dist/index.js>] [--device] [--output <json>]
 *
 * For every case it reports the worst relative error |spice-ts - ngspice| /
 * max(|ngspice|, 1e-21) of the AC terminal capacitance matrix (simulate()
 * `.ac`, any build) and, with --device (this branch's
 * bsim3v3-charge.ts API), of the b3ld.c intrinsic capacitances, state charges
 * and junction capacitances. It also scores the NAND transient against
 * ngspice-47-nand-tran.json: node voltages at the sample times and the
 * windowed supply charge, as a fraction of the ngspice peak. Exits zero whenever metrics were produced; the
 * vitest file packages/core/src/devices/bsim3v3-charge-parity.test.ts is the
 * 1% gate.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { windowCharge } from './cards.js';

const FLOOR = 1e-21;
const THRESHOLD = 0.01;
type Source = 'vg' | 'vd' | 'vb';
const QUANTITIES = ['cgg', 'cgd', 'cgs', 'cbg', 'cbd', 'cbs', 'cdg', 'cdd', 'cds', 'qg', 'qb', 'qd', 'capbd', 'capbs'] as const;
type Quantity = typeof QUANTITIES[number];
interface Bias { vgs: number; vds: number; vbs: number }
interface ReferenceCase {
  name: string;
  type: 1 | -1;
  charges: { deck: string; points: (Bias & Record<Quantity, number>)[] };
  ac: { deck: string; frequency: number; points: (Bias & { c: Record<Source, Record<Source, number>> })[] };
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const corePath = resolve(arg('--core') ?? 'packages/core/dist/index.js');
const outputPath = arg('--output');
const withDevice = process.argv.includes('--device');
type Core = typeof import('../../packages/core/src/index.js');
const reference = JSON.parse(readFileSync(new URL('./ngspice-47-charge.json', import.meta.url), 'utf8')) as {
  engine: string; cases: ReferenceCase[];
};
const relative = (actual: number, expected: number) => Math.abs(actual - expected) / Math.max(Math.abs(expected), FLOOR);

interface Worst { error: number; within: number; total: number; label: string }
const track = (): Worst => ({ error: 0, within: 0, total: 0, label: '' });
function record(worst: Worst, error: number, label: string): void {
  worst.total++;
  if (error < THRESHOLD) worst.within++;
  if (!(error <= worst.error)) { worst.error = error; worst.label = label; }
}

async function acWorst(core: Core, c: ReferenceCase): Promise<Worst> {
  const omega = 2 * Math.PI * c.ac.frequency;
  const worst = track();
  for (const p of c.ac.points) {
    for (const excited of ['vg', 'vd', 'vb'] as const) {
      const deck = c.ac.deck
        .replace(/^VD d 0 DC 0 AC 0$/m, `VD d 0 DC ${c.type * p.vds} AC ${excited === 'vd' ? 1 : 0}`)
        .replace(/^VG g 0 DC 0 AC 0$/m, `VG g 0 DC ${c.type * p.vgs} AC ${excited === 'vg' ? 1 : 0}`)
        .replace(/^VB b 0 DC 0 AC 0$/m, `VB b 0 DC ${c.type * p.vbs} AC ${excited === 'vb' ? 1 : 0}`)
        .replace(/^\.end$/m, `.ac lin 1 ${c.ac.frequency} ${c.ac.frequency}\n.end`);
      let result;
      try {
        result = await core.simulate(deck);
      } catch (error) {
        record(worst, Infinity, `${excited} at ${JSON.stringify({ vgs: p.vgs, vds: p.vds, vbs: p.vbs })}: ${(error as Error).message}`);
        continue;
      }
      for (const measured of ['vg', 'vd', 'vb'] as const) {
        const { magnitude, phase } = result.ac!.current(measured.toUpperCase())[0];
        const capacitance = magnitude * Math.sin(phase * Math.PI / 180) / omega;
        record(worst, relative(capacitance, p.c[excited][measured]),
          `d i(${measured})/d ${excited} at Vgs=${p.vgs} Vds=${p.vds} Vbs=${p.vbs}: ${capacitance} vs ${p.c[excited][measured]}`);
      }
    }
  }
  return worst;
}

type TranSignal = 'v(9)' | 'v(10)' | 'q(vcc)';
async function nandWorst(core: Core): Promise<Record<TranSignal, { error: number; label: string }>> {
  const nand = JSON.parse(readFileSync(new URL('./ngspice-47-nand-tran.json', import.meta.url), 'utf8')) as {
    deck: string; peak: Record<TranSignal, number>; samples: ({ time: number } & Record<TranSignal, number>)[];
  };
  const result = (await core.simulate(nand.deck)).transient!;
  const time = result.time;
  const at = (values: number[], t: number): number => {
    const j = time.findIndex(x => x >= t);
    return values[j - 1] + (values[j] - values[j - 1]) * (t - time[j - 1]) / (time[j] - time[j - 1]);
  };
  const worst = { 'v(9)': { error: 0, label: '' }, 'v(10)': { error: 0, label: '' }, 'q(vcc)': { error: 0, label: '' } };
  for (const sample of nand.samples) {
    const actual: Record<TranSignal, number> = {
      'v(9)': at(result.voltage('9'), sample.time),
      'v(10)': at(result.voltage('10'), sample.time),
      'q(vcc)': windowCharge(time, result.current('VCC'), sample.time),
    };
    for (const signal of Object.keys(actual) as TranSignal[]) {
      const error = Math.abs(actual[signal] - sample[signal]) / nand.peak[signal];
      if (!(error <= worst[signal].error)) worst[signal] = { error, label: `at ${sample.time}: ${actual[signal]} vs ${sample[signal]}` };
    }
  }
  return worst;
}

async function deviceWorst(c: ReferenceCase): Promise<Worst> {
  const [{ parse }, { BSIM3v3 }, charge] = await Promise.all([
    import('../../packages/core/src/parser/index.js'),
    import('../../packages/core/src/devices/bsim3v3.js'),
    import('../../packages/core/src/devices/bsim3v3-charge.js'),
  ]);
  const device = parse(c.charges.deck).compile().devices.find(d => d instanceof BSIM3v3) as InstanceType<typeof BSIM3v3>;
  const params = charge.chargeParams(device.model, device.size);
  const out = charge.createTerminalCharges();
  const m = device.size.m;
  const worst = track();
  for (const p of c.charges.points) {
    const tc = charge.evaluateTerminalCharges(device.model, device.size, params, p.vgs, p.vds, p.vbs, out);
    const ic = tc.intrinsic;
    const actual: Record<Quantity, number> = {
      cgg: ic.cggb, cgd: ic.cgdb, cgs: ic.cgsb, cbg: ic.cbgb, cbd: ic.cbdb, cbs: ic.cbsb,
      cdg: ic.cdgb, cdd: ic.cddb, cds: ic.cdsb, qg: tc.qg, qb: tc.qb, qd: tc.qd, capbd: tc.capbd, capbs: tc.capbs,
    };
    for (const q of QUANTITIES) {
      record(worst, relative(m * actual[q], p[q]), `${q} at Vgs=${p.vgs} Vds=${p.vds} Vbs=${p.vbs}: ${m * actual[q]} vs ${p[q]}`);
    }
  }
  return worst;
}

async function main(): Promise<void> {
  const core = await import(pathToFileURL(corePath).href) as Core;
  const cases = [];
  for (const c of reference.cases) {
    cases.push({ name: c.name, ac: await acWorst(core, c), ...(withDevice ? { device: await deviceWorst(c) } : {}) });
  }
  const nand = await nandWorst(core);
  const summary = {
    reference: reference.engine,
    nandTransient: Object.fromEntries(Object.entries(nand).map(([k, v]) => [k, v.error])),
    core: corePath,
    threshold: THRESHOLD,
    acWithin: cases.reduce((n, c) => n + c.ac.within, 0),
    acTotal: cases.reduce((n, c) => n + c.ac.total, 0),
    acCasesPassing: cases.filter(c => c.ac.error < THRESHOLD).length,
    ...(withDevice ? {
      deviceWithin: cases.reduce((n, c) => n + (c.device?.within ?? 0), 0),
      deviceTotal: cases.reduce((n, c) => n + (c.device?.total ?? 0), 0),
      deviceCasesPassing: cases.filter(c => (c.device?.error ?? Infinity) < THRESHOLD).length,
    } : {}),
    cases: cases.length,
  };
  const json = JSON.stringify({ summary, nandTransient: nand, cases }, null, 1);
  if (outputPath) writeFileSync(outputPath, `${json}\n`);
  console.log(JSON.stringify(summary, null, 1));
}

void main();
