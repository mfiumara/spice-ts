#!/usr/bin/env tsx
/**
 * Identical-input comparison for the xyce-spice3 translations (#524, lane 3).
 *
 * Usage (from the repository root, after `pnpm build`):
 *   pnpm exec tsx benchmarks/corpus/xyce-spice3/compare.ts
 *
 * For every translated deck both engines receive the identical committed bytes (ngspice via
 * `ngspice -b -r`, spice-ts via `simulate()`), using the aggregate report's engine runners and
 * metric (spice-ts output points, ngspice linearly interpolated, breakpoint-aware for TRAN).
 * Where Xyce_Regression ships a reference for the fixture it is a third column: the vendored gold
 * `.prn` output (diode, njfet) or the upstream analytic gold-standard formula (capacitor, rc_osc;
 * the upstream Perl scripts are vendored next to the gold files). Nothing is tuned per circuit.
 * Writes benchmarks/corpus/xyce-spice3/report.json and prints a Markdown table.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  alignAndMeasure,
  sharedGridPoints,
  type ComparisonMetrics,
  type SampleSeries,
} from '../../comparison-harness.js';
import {
  findMatchingAnalysis,
  runNativeNgspice,
  runNativeSpiceTs,
  type ClassicAnalysisType,
  type ClassicCircuit,
  type EngineExecution,
} from '../classic/report.js';

const CORPUS = 'benchmarks/corpus/xyce-spice3';
const REPORT_PATH = resolve(CORPUS, 'report.json');

interface Reference {
  kind: 'xyce-gold-prn' | 'xyce-analytic-gold';
  path: string;
  sha256: string;
  upstreamPath: string;
  /** Engine signal name -> gold column header (gold-prn only). */
  columns?: Record<string, string>;
  /** Analytic gold standard, transcribed from the upstream Perl script at `path`. */
  analytic?: { signal: string; formula: string; evaluate: (t: number) => number };
}

const REFERENCES: Record<string, Reference> = {
  'capacitor-rc-transient': {
    kind: 'xyce-analytic-gold',
    path: `${CORPUS}/reference/CAPACITOR/capacitor.cir.prn.gs.pl`,
    sha256: 'b56529ea01c865f9beac05da6c94a19add68725d175992e0ef22a99c2efda882',
    upstreamPath: 'Netlists/CAPACITOR/capacitor.cir.prn.gs.pl',
    analytic: { signal: 'v(1)', formula: 'exp(-t/0.001)', evaluate: t => Math.exp(-t / 0.001) },
  },
  'capacitor-rc-oscillator': {
    kind: 'xyce-analytic-gold',
    path: `${CORPUS}/reference/CAPACITOR/rc_osc.cir.prn.gs.pl`,
    sha256: '64f1dfe54606769ce5b730a8e2d791b0611c7595d236f756e8165032a14b8e84',
    upstreamPath: 'Netlists/CAPACITOR/rc_osc.cir.prn.gs.pl',
    analytic: {
      signal: 'v(2)',
      // The upstream gold is {v(2)+0.002}; the 0.002 offset is subtracted to compare v(2).
      formula: 'y0*exp(a*t) + a*(a*sin(s*t) + s*cos(s*t))/(a^2+s^2), a=-1/(1k*2u), s=2*3.1415927*1e5 (upstream constants), y0=-a*s/(a^2+s^2)',
      evaluate: t => {
        const a = -1 / (1000 * 2e-6);
        const s = 2 * 3.1415927 * 1e5;
        const y0 = (-a * s) / (a ** 2 + s ** 2);
        return y0 * Math.exp(a * t) + (a * (a * Math.sin(s * t) + s * Math.cos(s * t))) / (a ** 2 + s ** 2);
      },
    },
  },
  'diode-transient': {
    kind: 'xyce-gold-prn',
    path: `${CORPUS}/reference/DIODE/diode.cir.prn`,
    sha256: '5ae09676eac3312a8a413fc134d28e6a5caf7b41d08dca8a43bcfb667ea63588',
    upstreamPath: 'OutputData/DIODE/diode.cir.prn',
    columns: { 'i(vmon)': 'I(VMON)', 'v(3)': 'V(3)' },
  },
  'njfet-stepped-dc': {
    kind: 'xyce-gold-prn',
    path: `${CORPUS}/reference/NJFET_DC/njfet.cir.prn`,
    sha256: 'c80315b56288e95295e6ec4e43789b22fee72b77f88cbe232e1368cb9d1d54d6',
    upstreamPath: 'OutputData/NJFET_DC/njfet.cir.prn',
    columns: { 'i(vidmon)': 'I(VIDMON)' },
  },
};

interface ManifestCircuit {
  id: string;
  category: string;
  analyses: ClassicAnalysisType[];
  localPath?: string;
  sha256?: string;
  original: { localPath: string; sourcePath: string; upstreamUrl: string };
  translation: { status: string; reasons?: string[] };
}

const sha256 = (content: string | Buffer) => createHash('sha256').update(content).digest('hex');

function parseGoldPrn(text: string, gridColumn: string, columns: Record<string, string>): SampleSeries {
  const lines = text.split(/\r?\n/).filter(line => line.trim() && !/^End of Xyce/.test(line));
  const header = lines[0].trim().split(/\s+/);
  const rows = lines.slice(1).map(line => line.trim().split(/\s+/).map(Number));
  const at = (name: string) => {
    const index = header.indexOf(name);
    if (index < 0) throw new Error(`gold column ${name} missing`);
    return index;
  };
  const signals: SampleSeries['signals'] = {};
  for (const [signal, column] of Object.entries(columns)) {
    signals[signal] = rows.map(row => ({ re: row[at(column)], im: 0 }));
  }
  return { grid: rows.map(row => row[at(gridColumn)]), signals };
}

function worst(metrics: ComparisonMetrics): { signal: string; absMax: number; absRms: number } | null {
  let result: { signal: string; absMax: number; absRms: number } | null = null;
  for (const [signal, comparison] of Object.entries(metrics.signals)) {
    if (comparison.status !== 'compared' || comparison.sampleCount === 0) continue;
    if (!result || comparison.absoluteError.max > result.absMax) {
      result = { signal, absMax: comparison.absoluteError.max, absRms: comparison.absoluteError.rms };
    }
  }
  return result;
}

function analysisOf(execution: EngineExecution, type: ClassicAnalysisType) {
  return execution.analyses.find(analysis => analysis.type === type);
}

async function versusReference(
  execution: EngineExecution,
  type: ClassicAnalysisType,
  reference: Reference,
): Promise<ComparisonMetrics | null> {
  const analysis = analysisOf(execution, type);
  if (!analysis) return null;
  if (reference.analytic) {
    const { signal, evaluate } = reference.analytic;
    if (!analysis.series.signals[signal]) return null;
    const exact: SampleSeries = {
      grid: analysis.series.grid,
      signals: { [signal]: analysis.series.grid.map(t => ({ re: evaluate(t), im: 0 })) },
    };
    return alignAndMeasure(analysis.series, exact, [signal]);
  }
  const gold = parseGoldPrn(
    await readFile(resolve(reference.path), 'utf8'),
    type === 'tran' ? 'TIME' : 'V(1)',
    reference.columns ?? {},
  );
  return alignAndMeasure(analysis.series, gold, Object.keys(reference.columns ?? {}));
}

function ngspiceVersion(): string {
  const result = spawnSync('ngspice', ['--version'], { encoding: 'utf8' });
  return `${result.stdout ?? ''}${result.stderr ?? ''}`.split(/\r?\n/).find(line => /ngspice-\d+/.test(line))?.trim()
    ?? 'unknown';
}

async function main(): Promise<void> {
  const manifest = JSON.parse(await readFile(resolve(CORPUS, 'manifest.json'), 'utf8')) as {
    circuits: ManifestCircuit[];
  };
  const fixtures: unknown[] = [];
  const table: string[] = [
    '| Fixture | Translation | ngspice | spice-ts | spice-ts vs ngspice (worst abs max / RMS) | vs Xyce reference: ngspice | vs Xyce reference: spice-ts |',
    '|---|---|---|---|---|---|---|',
  ];
  const fmt = (value: { signal: string; absMax: number; absRms: number } | null) =>
    value ? `${value.signal} ${value.absMax.toPrecision(3)} / ${value.absRms.toPrecision(3)}` : 'n/a';

  for (const circuit of manifest.circuits) {
    if (circuit.translation.status !== 'translated' || !circuit.localPath) {
      const reason = (circuit.translation.reasons ?? []).join(' ');
      fixtures.push({ id: circuit.id, translation: circuit.translation });
      table.push(`| ${circuit.id} | unsupported-translation: ${reason} | not run | not run | n/a | n/a | n/a |`);
      continue;
    }
    const input = await readFile(resolve(circuit.localPath));
    if (sha256(input) !== circuit.sha256) throw new Error(`${circuit.id}: translated deck sha256 mismatch`);
    const classic = { ...circuit, sourcePath: circuit.original.sourcePath, sourceUrl: circuit.original.upstreamUrl } as unknown as ClassicCircuit;
    const ngStart = performance.now();
    const ngspice = await runNativeNgspice(input, classic);
    const ngMs = performance.now() - ngStart;
    const tsStart = performance.now();
    const spiceTs = await runNativeSpiceTs(input, classic);
    const tsMs = performance.now() - tsStart;
    const reference = REFERENCES[circuit.id];
    if (reference && sha256(await readFile(resolve(reference.path))) !== reference.sha256) {
      throw new Error(`${circuit.id}: reference sha256 mismatch`);
    }

    const analyses = [];
    for (const type of circuit.analyses) {
      const spiceAnalysis = analysisOf(spiceTs, type);
      const ngAnalysis = spiceAnalysis ? findMatchingAnalysis(ngspice.analyses, spiceAnalysis) : undefined;
      let engines: ComparisonMetrics | null = null;
      if (spiceAnalysis && ngAnalysis) {
        const signals = Object.keys(spiceAnalysis.series.signals).filter(name => ngAnalysis.series.signals[name]);
        engines = alignAndMeasure(spiceAnalysis.series, ngAnalysis.series, signals, type === 'tran'
          ? { breakpoints: sharedGridPoints(spiceAnalysis.series.grid, ngAnalysis.series.grid) }
          : {});
      }
      const ngVsRef = reference ? await versusReference(ngspice, type, reference) : null;
      const tsVsRef = reference ? await versusReference(spiceTs, type, reference) : null;
      analyses.push({ type, spiceTsVsNgspice: engines, ngspiceVsXyceReference: ngVsRef, spiceTsVsXyceReference: tsVsRef });
      table.push(
        `| ${circuit.id} | translated (${type}) | ${ngspice.status}${ngAnalysis ? `, ${ngAnalysis.series.grid.length} pts` : ''} | ${spiceTs.status}${spiceAnalysis ? `, ${spiceAnalysis.series.grid.length} pts` : ''}${spiceTs.error ? `: ${spiceTs.error}` : ''} | ${engines ? fmt(worst(engines)) : 'n/a'} | ${ngVsRef ? fmt(worst(ngVsRef)) : 'n/a'} | ${tsVsRef ? fmt(worst(tsVsRef)) : 'n/a'} |`,
      );
    }
    fixtures.push({
      id: circuit.id,
      localPath: circuit.localPath,
      inputSha256: circuit.sha256,
      identicalInputForBothEngines: true,
      translation: circuit.translation,
      ngspice: { status: ngspice.status, convergence: ngspice.convergence, error: ngspice.error, runtimeMs: Math.round(ngMs) },
      spiceTs: { status: spiceTs.status, convergence: spiceTs.convergence, error: spiceTs.error, runtimeMs: Math.round(tsMs) },
      xyceReference: reference
        ? { kind: reference.kind, path: reference.path, sha256: reference.sha256, upstreamPath: reference.upstreamPath, formula: reference.analytic?.formula }
        : null,
      analyses,
    });
  }

  const report = {
    schema: 'spice-ts-xyce-spice3/v1',
    ngspice: ngspiceVersion(),
    metric: 'Absolute/relative error on the spice-ts output points; reference linearly interpolated (breakpoint-aware for spice-ts vs ngspice TRAN, as in the aggregate report). Analytic references are evaluated exactly at each engine\'s own points.',
    fixtures,
  };
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`ngspice: ${report.ngspice}`);
  console.log(table.join('\n'));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
