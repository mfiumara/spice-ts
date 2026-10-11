#!/usr/bin/env tsx
/**
 * Issue #448 receipt: NHFET level-5 hfet-inverter transient parity.
 *
 * Usage (after `pnpm -C packages/core build`):
 *   npx tsx benchmarks/results/issue-448/verify.ts              # print report
 *   npx tsx benchmarks/results/issue-448/verify.ts --output benchmarks/results/issue-448/report.json
 *   npx tsx benchmarks/results/issue-448/verify.ts --check      # compare deterministic fields
 *
 * Evidence recorded:
 *  1. The unchanged ngspice fixture on both engines (identical bytes). This is
 *     the published aggregate comparison and stays a loss.
 *  2. ngspice-47 on the same fixture with only the two Z-card lines inside
 *     `.subckt inv` swapped (electrically identical). ngspice-47's result
 *     changes with that order; spice-ts's does not. This is diagnostic only and
 *     is never substituted for the identical-netlist comparison.
 *  3. A single-device forward/inverse DC I-V sweep (identical netlist on both
 *     engines) that isolates the per-device HFET1 inverse-mode equations.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { alignAndMeasure } from '../../comparison-harness.js';
import {
  runNativeNgspice,
  runNativeSpiceTs,
  type ClassicCircuit,
  type EngineExecution,
} from '../../corpus/classic/report.js';

const FIXTURE_SHA256 = '3fa93266e9036443173bf9416eb67e8ff4c2c24aeefc6ef687f355d8548239e1';
const IV_PATH = 'benchmarks/results/issue-448/hfet-reverse-iv.cir';
const LOAD_LINE = 'z1 1 3 3   aload l=1u w=10u';
const DRIVER_LINE = 'z2 3 2 0   adrv l=1u w=10u';

function sha256(input: Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

function deterministic(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(deterministic);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => key !== 'runtimeMs')
      .map(([key, child]) => [key, deterministic(child)]));
  }
  return value;
}

function success(execution: EngineExecution, label: string): EngineExecution['analyses'][number] {
  if (execution.status !== 'success' || !execution.analyses[0]) {
    throw new Error(`${label} did not succeed: ${execution.status} ${execution.error ?? ''}`);
  }
  return execution.analyses[0];
}

function compare(spice: EngineExecution, ngspice: EngineExecution, label: string) {
  const spiceAnalysis = success(spice, `spice-ts ${label}`);
  const ngAnalysis = success(ngspice, `ngspice ${label}`);
  const signals = Object.keys(spiceAnalysis.series.signals)
    .filter(signal => ngAnalysis.series.signals[signal] !== undefined)
    .sort();
  return {
    spiceTsPoints: spiceAnalysis.series.grid.length,
    ngspicePoints: ngAnalysis.series.grid.length,
    signals,
    metrics: alignAndMeasure(spiceAnalysis.series, ngAnalysis.series, signals),
  };
}

function valueAt(execution: EngineExecution, signal: string, index: number): number {
  const series = success(execution, signal).series.signals[signal];
  if (!series) throw new Error(`missing ${signal}`);
  const point = series.at(index);
  if (!point) throw new Error(`missing ${signal}[${index}]`);
  return point.re;
}

function swapSubcircuitInstances(input: Buffer): Buffer {
  const text = input.toString('utf8');
  if (!text.includes(`${LOAD_LINE}\n${DRIVER_LINE}\n`)) {
    throw new Error('fixture Z-card lines not found in the expected order');
  }
  return Buffer.from(text.replace(`${LOAD_LINE}\n${DRIVER_LINE}\n`, `${DRIVER_LINE}\n${LOAD_LINE}\n`), 'utf8');
}

async function buildReport() {
  const manifest = JSON.parse(await readFile(resolve('benchmarks/corpus/ngspice/manifest.json'), 'utf8')) as {
    circuits: ClassicCircuit[];
  };
  const source = manifest.circuits.find(circuit => circuit.id === 'hfet-inverter');
  if (!source) throw new Error('missing hfet-inverter fixture');
  const circuit: ClassicCircuit = {
    ...source,
    ngspice: { expectedStatus: 'pass' },
    spiceTs: { expectedStatus: 'pass' },
  };
  const input = await readFile(resolve(circuit.localPath));
  const digest = sha256(input);
  if (digest !== FIXTURE_SHA256 || digest !== circuit.sha256) {
    throw new Error('hfet-inverter fixture SHA-256 mismatch');
  }
  const reordered = swapSubcircuitInstances(input);

  const ivInput = await readFile(resolve(IV_PATH));
  const ivCircuit: ClassicCircuit = {
    ...circuit,
    id: 'hfet-reverse-iv',
    analyses: ['dc'],
    localPath: IV_PATH,
    sha256: sha256(ivInput),
  };

  const [ngIdentical, ngReordered, tsIdentical, tsReordered, ngIv, tsIv] = await Promise.all([
    runNativeNgspice(input, circuit),
    runNativeNgspice(reordered, circuit),
    runNativeSpiceTs(input, circuit),
    runNativeSpiceTs(reordered, circuit),
    runNativeNgspice(ivInput, ivCircuit),
    runNativeSpiceTs(ivInput, ivCircuit),
  ]);
  const version = spawnSync('ngspice', ['--version'], { encoding: 'utf8' });

  const spiceOrder = compare(tsReordered, tsIdentical, 'order invariance');

  return {
    schemaVersion: 'spice-ts-issue-448/v1',
    issueUrl: 'https://github.com/mfiumara/spice-ts/issues/448',
    tools: {
      ngspice: `${version.stdout}\n${version.stderr}`.match(/ngspice-\d+(?:\.\d+)*/i)?.[0] ?? 'unknown',
      node: process.version,
    },
    input: {
      localPath: circuit.localPath,
      bytes: input.byteLength,
      sha256: digest,
      identicalForBothEngines: true,
      diagnosticReorderedSha256: sha256(reordered),
      diagnosticReordering: `inside .subckt inv, '${DRIVER_LINE}' is moved above '${LOAD_LINE}'; no other byte changes`,
      ivLocalPath: IV_PATH,
      ivSha256: ivCircuit.sha256,
    },
    policy: {
      fixtureAdaptation: 'none for the published comparison; the reordered netlist is diagnostic only',
      perCircuitToleranceTuning: false,
      comparisonGrid: 'spice-ts',
      interpolation: 'linear',
    },
    identicalFixture: {
      note: 'Published aggregate comparison: unchanged fixture bytes on both engines.',
      ...compare(tsIdentical, ngIdentical, 'identical fixture'),
    },
    ngspiceInstanceOrderSensitivity: {
      note: 'ngspice-47 operating point (t=0) for two electrically identical netlists that differ only in Z-card order.',
      identicalFixture: { 'v(3)': valueAt(ngIdentical, 'v(3)', 0), 'v(4)': valueAt(ngIdentical, 'v(4)', 0), 'i(vdd)': valueAt(ngIdentical, 'i(vdd)', 0) },
      reorderedFixture: { 'v(3)': valueAt(ngReordered, 'v(3)', 0), 'v(4)': valueAt(ngReordered, 'v(4)', 0), 'i(vdd)': valueAt(ngReordered, 'i(vdd)', 0) },
      spiceTs: { 'v(3)': valueAt(tsIdentical, 'v(3)', 0), 'v(4)': valueAt(tsIdentical, 'v(4)', 0), 'i(vdd)': valueAt(tsIdentical, 'i(vdd)', 0) },
    },
    spiceTsInstanceOrderInvariance: {
      note: 'spice-ts on the reordered netlist measured against spice-ts on the identical fixture.',
      maxAbsoluteError: Math.max(...Object.values(spiceOrder.metrics.signals)
        .map(signal => signal.status === 'compared' ? signal.absoluteError.max : Number.POSITIVE_INFINITY)),
    },
    diagnosticReorderedComparison: {
      note: 'spice-ts on the identical fixture versus ngspice-47 on the reordered fixture. Diagnostic only; not an aggregate result.',
      ...compare(tsIdentical, ngReordered, 'reordered fixture'),
    },
    singleDeviceInverseIv: {
      note: 'Identical single-device DC sweep on both engines; VDS < 0 exercises HFET1 inverse operation.',
      ...compare(tsIv, ngIv, 'single-device I-V'),
    },
    rootCause: [
      'ngspice-47 hfetload.c declares `int inverse=FALSE;` once per HFETAload call and only ever sets it to TRUE. After the first instance in load order with vds<0, every later HFET1 instance in that Newton iteration negates its drain current, swaps Cgs/Cgd and uses a negated vds in the companion current, even when its own vds>0.',
      'In the identical fixture ngspice-47 loads the adrv drivers before the aload loads (models and instances are evaluated in reverse creation order). A driver with its drain below ground sets the flag, the loads inherit it, and the resulting operating point has v(3)=v(4)~-0.275 V with i(vdd)~1.3 nA although each depletion load has VGS=0 and VDS~2.27 V. Moving the driver line above the load line (electrically identical) gives v(3)=1.9557 V, which spice-ts reproduces on either order.',
      'hfetload.c also calls hfeta(..., vds>0?vgs:vgd, vds, ...) after already negating vds, so inverse operation is always evaluated at the external VGS. This per-device behaviour is order independent; spice-ts previously evaluated inverse operation at VGD and now reproduces ngspice-47 (single-device sweep above).',
    ],
    losses: [
      'The identical-fixture comparison remains a parity loss because the ngspice-47 reference depends on Z-card order through the sticky inverse flag; spice-ts does not emulate that order-dependent state.',
      'Against the reordered fixture the operating point and DC transfer agree, but the v(4) rising edge near 1.07-1.09 ns lags ngspice-47 by roughly 15 ps (see diagnosticReorderedComparison). The DC transfer curve matches to below 1 uV, so the residual is in transient charge integration, not in the HFET DC equations.',
      'spice-ts exposes internal RD/RS node signals that ngspice .print all does not; they are excluded from comparisons.',
    ],
  };
}

async function main(): Promise<void> {
  const report = await buildReport();
  const outputIndex = process.argv.indexOf('--output');
  if (outputIndex >= 0) {
    const output = process.argv[outputIndex + 1];
    if (!output) throw new Error('--output requires a path');
    await writeFile(resolve(output), `${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  if (process.argv.includes('--check')) {
    const expected = JSON.parse(await readFile(resolve('benchmarks/results/issue-448/report.json'), 'utf8'));
    if (JSON.stringify(deterministic(expected)) !== JSON.stringify(deterministic(report))) {
      throw new Error('issue-448 deterministic receipt fields changed');
    }
    process.stderr.write('issue-448 receipt: deterministic fields match\n');
    return;
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
