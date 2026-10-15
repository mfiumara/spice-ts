#!/usr/bin/env tsx
/** Published numeric references are independent of both current engines. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { ComplexValue, SampleSeries } from '../../comparison-harness.js';
import { runNativeNgspice, runNativeSpiceTs, type ClassicCircuit, type EngineExecution } from '../classic/report.js';

export interface PublishedPoint {
  signal: string;
  coordinate: number;
  publishedToken: string;
  published: number;
  roundingHalfWidth: number;
  digitizationUncertainty: number;
  unit: string;
  quantity: 'real' | 'magnitude' | 'phase';
}
export interface PublishedCase {
  id: string;
  analysis: 'op' | 'dc' | 'ac' | 'tran';
  netlist: string;
  netlistSha256: string;
  source: { url: string; retrieved: string; author: string; title: string; example: string; licence: string };
  referenceKind: 'published-simulation';
  measuredReference: null;
  extraction: string;
  assumptions: string[];
  exclusion: string | null;
  points: PublishedPoint[];
}
interface Observation {
  status: 'compared' | 'missing';
  actual: number | null;
  absoluteError: number | null;
  relativeError: number | null;
  roundingUnits: number | null;
  withinPublishedRounding: boolean | null;
}

function complexAt(series: SampleSeries, signal: string, x: number): ComplexValue | undefined {
  const values = series.signals[signal];
  if (!values || !series.grid.length || x < series.grid[0] - 1e-14 || x > series.grid.at(-1)! + 1e-14) return undefined;
  for (let i = 0; i < series.grid.length; i++) {
    if (Math.abs(series.grid[i] - x) <= 1e-12 * Math.max(Math.abs(x), 1e-12)) return values[i];
    if (series.grid[i] > x && i > 0) {
      const weight = (x - series.grid[i - 1]) / (series.grid[i] - series.grid[i - 1]);
      return {
        re: values[i - 1].re + weight * (values[i].re - values[i - 1].re),
        im: values[i - 1].im + weight * (values[i].im - values[i - 1].im),
      };
    }
  }
  return undefined;
}

export function evaluatePoint(series: SampleSeries, point: PublishedPoint): Observation {
  const missing: Observation = { status: 'missing', actual: null, absoluteError: null, relativeError: null, roundingUnits: null, withinPublishedRounding: null };
  const signal = point.signal.replace(/^vp\(/, 'v(').replace(/^ip\(/, 'i(');
  let value = complexAt(series, signal, point.coordinate);
  const differential = /^v\(([^,]+),([^,]+)\)$/.exec(signal);
  if (!value && differential) {
    const voltage = (node: string) => node === '0' ? { re: 0, im: 0 } : complexAt(series, `v(${node})`, point.coordinate);
    const positive = voltage(differential[1]);
    const negative = voltage(differential[2]);
    if (positive && negative) value = { re: positive.re - negative.re, im: positive.im - negative.im };
  }
  if (!value || !Number.isFinite(value.re) || !Number.isFinite(value.im)) return missing;
  const rawActual = point.quantity === 'magnitude' ? Math.hypot(value.re, value.im)
    : point.quantity === 'phase' ? Math.atan2(value.im, value.re) * 180 / Math.PI : value.re;
  // JSON cannot retain signed zero; canonicalize it for exact receipt replay.
  const actual = Object.is(rawActual, -0) ? 0 : rawActual;
  const residual = actual - point.published;
  const absoluteError = point.quantity === 'phase'
    ? Math.abs(((residual + 180) % 360 + 360) % 360 - 180) : Math.abs(residual);
  const width = point.roundingHalfWidth + point.digitizationUncertainty;
  return {
    status: 'compared', actual, absoluteError,
    relativeError: point.published === 0 ? null : absoluteError / Math.abs(point.published),
    roundingUnits: absoluteError / width,
    withinPublishedRounding: absoluteError <= width,
  };
}

export function summarize(observations: Observation[]) {
  const compared = observations.filter(p => p.status === 'compared');
  const units = compared.map(p => p.roundingUnits!);
  return {
    observations: observations.length,
    compared: compared.length,
    missing: observations.length - compared.length,
    outsidePublishedRounding: compared.filter(p => !p.withinPublishedRounding).length,
    maximumRoundingUnits: units.length ? Math.max(...units) : null,
    rmsRoundingUnits: units.length ? Math.sqrt(units.reduce((sum, x) => sum + x * x, 0) / units.length) : null,
  };
}

const directory = dirname(fileURLToPath(import.meta.url));
const sha256 = (input: Buffer) => createHash('sha256').update(input).digest('hex');

function measure(execution: EngineExecution, fixture: PublishedCase, runtimeMs: number) {
  const analysis = execution.analyses.find(a => a.type === fixture.analysis);
  const points = fixture.points.map(p => evaluatePoint(analysis?.series ?? { grid: [], signals: {} }, p));
  return { status: execution.status, convergence: execution.convergence, error: execution.error ?? null,
    runtimeMs, gridPoints: analysis?.series.grid.length ?? 0, summary: summarize(points), points };
}

export async function createReport() {
  const nativeVersion = execFileSync('ngspice', ['--version'], { encoding: 'utf8' }).match(/ngspice-\d+/)?.[0];
  assert.equal(nativeVersion, 'ngspice-47', 'this corpus requires ngspice-47');
  const manifestBytes = readFileSync(join(directory, 'manifest.json'));
  const fixtures = (JSON.parse(manifestBytes.toString()) as { cases: PublishedCase[] }).cases;
  assert.equal(fixtures.length, 20);
  const results = [];
  for (const fixture of fixtures) {
    const input = readFileSync(join(directory, fixture.netlist));
    assert.equal(sha256(input), fixture.netlistSha256, fixture.id + ': changed deck');
    const circuit: ClassicCircuit = { id: fixture.id, category: 'published-reference', analyses: [fixture.analysis],
      sourcePath: fixture.source.url, sourceUrl: fixture.source.url, localPath: fixture.netlist,
      sha256: fixture.netlistSha256, ngspice: { expectedStatus: 'pass' }, spiceTs: { expectedStatus: 'pass' } };
    let started = performance.now();
    const native = await runNativeNgspice(input, circuit);
    const ngspice = measure(native, fixture, performance.now() - started);
    started = performance.now();
    const ts = await runNativeSpiceTs(input, circuit);
    const spiceTs = measure(ts, fixture, performance.now() - started);
    results.push({ ...fixture, identicalEngineInputSha256: sha256(input), ngspice, spiceTs });
    process.stderr.write(`${fixture.id}: TS=${spiceTs.status}, ngspice=${ngspice.status}\n`);
  }
  const eligible = results.filter(c => !c.exclusion);
  return {
    schemaVersion: 'spice-ts-published-reference/v1', generatedAt: new Date().toISOString(),
    manifestSha256: sha256(manifestBytes),
    runnerSha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
    tools: { ngspice: nativeVersion, node: process.version,
      spiceTs: JSON.parse(readFileSync(resolve('packages/core/package.json'), 'utf8')).version,
      codeRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() },
    machine: { platform: platform(), release: release(), architecture: arch(), cpu: cpus()[0]?.model },
    policy: { identicalNetlists: true, perCircuitTuning: false, reference: 'published SPICE2g6 tables, not current ngspice',
      interpolation: 'linear rectangular phasors at published coordinates; no extrapolation',
      uncertainty: 'zero digitization; half last displayed digit for tabulation rounding, not physical or historical solver uncertainty',
      runtime: 'one cold ngspice process per circuit; TS runs sequentially in-process; not a speed comparison',
      command: 'spice-heavy pnpm exec tsx benchmarks/corpus/vendor-published/compare.ts' },
    totals: { cases: results.length, eligibleCases: eligible.length, excludedCases: results.length - eligible.length,
      publishedSimulationCases: results.length, measuredCases: 0,
      ngspice: summarize(eligible.flatMap(c => c.ngspice.points)),
      spiceTs: summarize(eligible.flatMap(c => c.spiceTs.points)) },
    cases: results,
  };
}

type Report = Awaited<ReturnType<typeof createReport>>;
const number = (n: number | null) => n === null ? 'missing' : n.toExponential(6);

function markdown(report: Report): string {
  const lines = [
    '# Published-reference corpus (#1113)', '',
    'This baseline contains 20 distinct worked circuits from Tony R. Kuphaldt’s *Lessons in Electric Circuits* (seven chapters, one author/source family). Textbook-style published examples are explicitly permitted by #1113. The directory name is the requested umbrella, not a claim that these are vendor measurements. All reference data here are published historical SPICE simulation tables. There are no measured references, vendor app-note cases or commercial-simulator runs in this baseline.', '',
    'Circuit selection used availability of complete components and numerical output, before running either engine. Sweeps remain one case each. Losses, missing samples and ambiguous reconstruction are retained. No simulator code or existing corpus totals change.', '',
    '## Reproduce', '',
    '```sh', 'pnpm install --frozen-lockfile', 'pnpm build',
    'pnpm exec tsx --test benchmarks/corpus/vendor-published/report.test.ts',
    'spice-heavy pnpm exec tsx benchmarks/corpus/vendor-published/compare.ts --check',
    '# Optional: re-fetch source facts; inspect upstream changes before accepting',
    'python3 benchmarks/corpus/vendor-published/fetch-references.py', '```', '',
    '`compare.ts` without `--check` rewrites the JSON receipt and this document. `--check` re-runs both engines and verifies the committed receipt’s observations, statuses, hashes and totals (not timings). It does not require engines to match a historical reference: that would erase published losses. Run from repo root. No simulator install or accounts are required; ngspice-47 must already be available.', '',
    '## Reference and uncertainty policy', '',
    'The fetcher locates zero-based HTML PRE blocks, extracts numeric tokens and retains every displayed digit, source URL, retrieval date and page SHA-256 in `manifest.json`. No plots are digitized in this baseline: digitization uncertainty is 0. Rounding half-width is half the last displayed decimal place, including scientific notation. This is a transcription interval only, not experimental uncertainty, model uncertainty or the historical SPICE2g6 solver error. No undocumented extra tolerance is applied. A value outside that interval is reported even if both modern engines agree. Missing data is never a zero-error observation.', '',
    'Voltages are differential rectangular phasors before magnitude/phase reduction. Phase residuals use the shortest angular distance in degrees. Relative error is absolute residual / absolute published value and is null for an exactly zero reference. Every point has absolute and relative errors in the JSON receipt. Since volts, amperes and degrees cannot honestly share an absolute-error RMS, the overall table reports dimensionless error / published rounding half-width; per-point absolute errors retain their units.', '',
    'Both engines receive the exact committed deck bytes. Engine defaults are not adjusted; incomplete legacy AC `sin` tokens are removed only for AC-only sources. Initial DC values omitted by the book are filled with sweep starts. Legacy print/plot output is replaced by raw data; implicit operating-point examples receive explicit `.op`. Original sensor orientations, tiny resistors and coupling factors remain intact. No restricted model is used. The BJT keeps the published generic NPN model with BF=50; other parameters use engine defaults, so historical default differences are possible and not calibrated away.', '',
    'No copyrighted figure, PDF or chapter HTML is redistributed. Each chapter footer links to the [CC BY 4.0 appendix](https://www.ibiblio.org/kuphaldt/electricCircuits/Ref/REF_A3.html) and [licence](https://creativecommons.org/licenses/by/4.0/). Attribution is Tony R. Kuphaldt, *Lessons in Electric Circuits*. Source links and adapted factual component reconstructions are retained per case; normalization changes are listed below. `benchmarks/SOURCES.md` records this source family. The author does not endorse this comparison.', '',
    '## Overall results', '',
    `Tools: ${report.tools.ngspice}; spice-ts ${report.tools.spiceTs}; ${report.tools.node}. Simulator base revision: \`${report.tools.codeRevision}\` (no simulator changes; new harness fingerprint \`${report.runnerSha256}\`). Machine: ${report.machine.platform} ${report.machine.release}, ${report.machine.architecture}, ${report.machine.cpu}. Generated ${report.generatedAt}.`, '',
    `Cases: ${report.totals.cases}; eligible: ${report.totals.eligibleCases}; ambiguous/excluded: ${report.totals.excludedCases}. Published simulated cases: ${report.totals.publishedSimulationCases}; measured cases: ${report.totals.measuredCases}.`, '',
    '| Engine | Compared points | Missing points | Outside printed rounding | Max rounding units | RMS rounding units |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...(['spiceTs', 'ngspice'] as const).map(engine => {
      const s = report.totals[engine];
      return `| ${engine} | ${s.compared} | ${s.missing} | ${s.outsidePublishedRounding} | ${number(s.maximumRoundingUnits)} | ${number(s.rmsRoundingUnits)} |`;
    }), '',
    'The maximum/RMS rounding-unit totals are dominated by the instrumentation-amplifier table’s near-zero cancellation residue (~1e-10 V), not a large physical voltage error. Keep those points, but do not interpret this normalization as engineering accuracy or engine superiority. Shared modern-vs-historical losses occur in RC transient output, rounded phase output and the generic BJT sweep. Both engines lack the RC UIC time-zero sample; it is missing, not extrapolated. The BJT has both TS-only and ngspice-only outside-rounding observations; neither engine is treated as the published oracle.', '',
    '## Per-case summary', '',
    '| Case | Analysis | Published simulation points | Measured | TS status / outside / missing | ngspice status / outside / missing | Included |',
    '| --- | --- | ---: | --- | --- | --- | --- |',
    ...report.cases.map(c => `| ${c.id} | ${c.analysis} | ${c.points.length} | none | ${c.spiceTs.status} / ${c.spiceTs.summary.outsidePublishedRounding} / ${c.spiceTs.summary.missing} | ${c.ngspice.status} / ${c.ngspice.summary.outsidePublishedRounding} / ${c.ngspice.summary.missing} | ${c.exclusion ? 'no' : 'yes'} |`), '',
    '## All reference points and residuals', '',
    'Published values below are simulated, not measured. Each ± interval is printed rounding; digitization uncertainty is 0 throughout. Timings and all relative errors are in `corpus/vendor-published/results.json`. One process startup per ngspice case and warm in-process TS execution make these timing receipts unsuitable for a speed claim.', '',
  ];
  for (const c of report.cases) {
    lines.push(`### ${c.id}`, '', `Source: [${c.source.title}: ${c.source.example}](${c.source.url}), retrieved ${c.source.retrieved}.`, '',
      ...(c.exclusion ? [`Excluded: ${c.exclusion}`, ''] : []), ...c.assumptions.map(a => `- ${a}`), '',
      '| Coordinate | Signal | Unit | Published simulated | ± rounding | spice-ts | TS abs error | ngspice-47 | ng abs error |',
      '| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |');
    for (const [i, p] of c.points.entries()) {
      const ts = c.spiceTs.points[i], ng = c.ngspice.points[i];
      lines.push(`| ${p.coordinate} | ${p.signal} | ${p.unit} | ${p.publishedToken} | ${number(p.roundingHalfWidth)} | ${number(ts.actual)} | ${number(ts.absoluteError)} | ${number(ng.actual)} | ${number(ng.absoluteError)} |`);
    }
    lines.push('');
  }
  lines.push('## Coverage boundary', '',
    'This is a reproducible textbook baseline, not evidence of vendor-model, commercial-simulator, semiconductor I–V/C–V or bench-measurement parity. Vendor/paper and measured/plot-digitized expansion remains separate future work. No before/after simulator claim: production code is unchanged; this PR adds 20 reference circuits / 270 published observations where this corpus previously had none.', '');
  return lines.join('\n');
}

function receiptComparable(report: Report) {
  return { manifestSha256: report.manifestSha256, runnerSha256: report.runnerSha256, totals: report.totals,
    cases: report.cases.map(c => ({ id: c.id, sha256: c.identicalEngineInputSha256, exclusion: c.exclusion,
      ngspice: { status: c.ngspice.status, convergence: c.ngspice.convergence, points: c.ngspice.points },
      spiceTs: { status: c.spiceTs.status, convergence: c.spiceTs.convergence, points: c.spiceTs.points } })) };
}

async function main() {
  const report = await createReport();
  if (process.argv.includes('--check')) {
    const committed = JSON.parse(readFileSync(join(directory, 'results.json'), 'utf8')) as Report;
    assert.deepEqual(receiptComparable(report), receiptComparable(committed), 'published-reference receipt changed');
    console.log('Published-reference receipt reproduced exactly (excluding timings and environment metadata).');
  } else {
    writeFileSync(join(directory, 'results.json'), JSON.stringify(report, null, 2) + '\n');
    writeFileSync(resolve('benchmarks/VENDOR_PUBLISHED.md'), markdown(report));
  }
  console.log(JSON.stringify(report.totals, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
