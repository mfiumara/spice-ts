#!/usr/bin/env tsx
/**
 * Score spice-ts against the ngspice-47 BSIM3 DC reference (issue #589).
 *
 *   pnpm -C packages/core build
 *   pnpm exec tsx benchmarks/bsim3-dc-589/compare.ts [--core <dist/index.js>] [--device] [--output <json>]
 *
 * Terminal level (any checkout): every operating point of ngspice-47-dc.json
 * is re-run through spice-ts `simulate` with the identical deck (sources set
 * to the same bias) and i(VD) is compared; the Id-Vds sweep deck is run as-is.
 * Device level (`--device`, this branch only): the b3ld.c outputs Id, gm, gds,
 * gmbs and Vth from the ported evaluator against @m1[...].
 *
 * Relative errors use max(|reference|, 1e-12) as the denominator. The script
 * exits zero whenever metrics were produced; it does not gate on parity.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { relative, resolve } from 'node:path';

interface ReferencePoint {
  vgs: number; vds: number; vbs: number;
  id: number; gm: number; gds: number; gmbs: number; vth: number; ivd: number;
}
interface ReferenceCase {
  name: string; type: 1 | -1;
  operatingPoints: { deck: string; points: ReferencePoint[] };
  sweep: { deck: string; points: { vd: number; ivd: number }[] };
}
interface Worst { maxRelative: number; at: string; within1Percent?: number }

const FLOOR = 1e-12;
const argValue = (flag: string): string | undefined => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const corePath = resolve(argValue('--core') ?? new URL('../../packages/core/dist/index.js', import.meta.url).pathname);
const reference = JSON.parse(readFileSync(new URL('./ngspice-47-dc.json', import.meta.url), 'utf8')) as {
  engine: string; cases: ReferenceCase[];
};

function track(worst: Worst, actual: number, expected: number, at: string): void {
  const error = Math.abs(actual - expected) / Math.max(Math.abs(expected), FLOOR);
  if (error < 0.01) worst.within1Percent = (worst.within1Percent ?? 0) + 1;
  if (!(error <= worst.maxRelative)) {
    worst.maxRelative = error;
    worst.at = `${at}: spice-ts ${actual.toExponential(6)} vs ngspice ${expected.toExponential(6)}`;
  }
}

/** Replace a source's DC value in the deck (the bias of one operating point). */
function biasDeck(deck: string, c: ReferenceCase, p: ReferencePoint): string {
  return deck
    .replace(/^VD d 0 DC .*$/m, `VD d 0 DC ${c.type * p.vds}`)
    .replace(/^VG g 0 DC .*$/m, `VG g 0 DC ${c.type * p.vgs}`)
    .replace(/^VB b 0 DC .*$/m, `VB b 0 DC ${c.type * p.vbs}`)
    .replace(/^\.end$/m, '.op\n.end');
}

async function main(): Promise<void> {
  const core = await import(pathToFileURL(corePath).href) as {
    simulate: (netlist: string) => Promise<{
      dc?: { current(name: string): number };
      dcSweep?: { current(name: string): ArrayLike<number> };
    }>;
  };
  const device = process.argv.includes('--device')
    ? await Promise.all([
      import('../../packages/core/src/parser/index.js'),
      import('../../packages/core/src/devices/bsim3v3.js'),
      import('../../packages/core/src/devices/bsim3v3-dc.js'),
    ])
    : undefined;

  const cases = [];
  for (const c of reference.cases) {
    const terminal: Worst = { maxRelative: 0, at: '', within1Percent: 0 };
    let failures = 0;
    let firstFailure: string | undefined;
    for (const p of c.operatingPoints.points) {
      try {
        const result = await core.simulate(biasDeck(c.operatingPoints.deck, c, p));
        track(terminal, result.dc!.current('VD'), p.ivd, `Vgs=${p.vgs} Vds=${p.vds} Vbs=${p.vbs}`);
      } catch (error) {
        failures++;
        firstFailure ??= `Vgs=${p.vgs} Vds=${p.vds} Vbs=${p.vbs}: ${(error as Error).message}`;
      }
    }
    const sweep: Worst = { maxRelative: 0, at: '', within1Percent: 0 };
    let sweepStatus = 'compared';
    try {
      const values = (await core.simulate(c.sweep.deck)).dcSweep!.current('VD');
      c.sweep.points.forEach((p, i) => track(sweep, values[i], p.ivd, `VD=${p.vd.toFixed(2)}`));
    } catch (error) {
      sweepStatus = `failed: ${(error as Error).message}`;
    }
    let deviceMetrics: Record<string, Worst> | undefined;
    if (device) {
      const [{ parse }, { BSIM3v3 }, { evaluateDC }] = device;
      const m1 = parse(c.operatingPoints.deck).compile().devices.find(d => d instanceof BSIM3v3) as InstanceType<typeof BSIM3v3>;
      deviceMetrics = Object.fromEntries(['id', 'gm', 'gds', 'gmbs', 'vth'].map(q => [q, { maxRelative: 0, at: '', within1Percent: 0 }]));
      for (const p of c.operatingPoints.points) {
        const reverse = p.vds < 0;
        const dc = evaluateDC(m1.model, m1.size, reverse ? p.vgs - p.vds : p.vgs, Math.abs(p.vds),
          reverse ? p.vbs - p.vds : p.vbs);
        const at = `Vgs=${p.vgs} Vds=${p.vds} Vbs=${p.vbs}`;
        const m = m1.size.m;
        track(deviceMetrics.id, m * dc.Ids, p.id, at);
        track(deviceMetrics.gm, m * dc.gm, p.gm, at);
        track(deviceMetrics.gds, m * dc.gds, p.gds, at);
        track(deviceMetrics.gmbs, m * dc.gmbs, p.gmbs, at);
        track(deviceMetrics.vth, dc.von, p.vth, at);
      }
    }
    cases.push({
      name: c.name,
      operatingPoints: {
        count: c.operatingPoints.points.length, failures, ...(firstFailure ? { firstFailure } : {}), terminalIvd: terminal,
      },
      sweep: { status: sweepStatus, count: c.sweep.points.length, terminalIvd: sweep },
      ...(deviceMetrics ? { device: deviceMetrics } : {}),
    });
  }
  const output = {
    schemaVersion: 'spice-ts-bsim3-dc-compare/v1',
    reference: reference.engine,
    // Relative to the checkout the script runs from (no host paths in receipts).
    core: relative(process.cwd(), corePath),
    node: process.version,
    generatedAt: new Date().toISOString(),
    cases,
  };
  const json = `${JSON.stringify(output, null, 2)}\n`;
  const path = argValue('--output');
  if (path) writeFileSync(path, json);
  else process.stdout.write(json);
  for (const c of cases) {
    const d = c.device ? ` device id/gm/gds/gmbs ${['id', 'gm', 'gds', 'gmbs'].map(q => c.device![q].maxRelative.toExponential(2)).join('/')}` : '';
    console.error(`${c.name.padEnd(20)} op i(VD) ${c.operatingPoints.terminalIvd.maxRelative.toExponential(2)} [${c.operatingPoints.terminalIvd.within1Percent}/${c.operatingPoints.count} <1%] (fail ${c.operatingPoints.failures}${c.operatingPoints.firstFailure ? `: ${c.operatingPoints.firstFailure}` : ''}) sweep ${c.sweep.terminalIvd.maxRelative.toExponential(2)} [${c.sweep.terminalIvd.within1Percent}/${c.sweep.count}]${d}`);
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
