/** All corpus execution must run under spice-heavy. Mirrors immutable expanded.ts policy. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release } from 'node:os';
import { join } from 'node:path';
import { alignAndMeasure, type SampleSeries } from '../comparison-harness.js';
import { canonicalize, projectAnalysis } from './canonical.js';
import { loadCorpus, summarize } from './compare.js';
import { fixtureStatus, runNgspiceReference, sha256 } from './expanded.js';
import { runXyce, translateForXyce, type ReferenceRun } from './xyce.js';

/** Same bytes as JSON.stringify(series), without constructing a V8-limit-sized string. */
export function hashSeries(series: SampleSeries): string {
  const digest = createHash('sha256');
  const array = (values: unknown[]) => {
    digest.update('[');
    for (let offset = 0; offset < values.length; offset += 4096) {
      if (offset) digest.update(',');
      digest.update(JSON.stringify(values.slice(offset, offset + 4096)).slice(1, -1));
    }
    digest.update(']');
  };
  digest.update('{"grid":'); array(series.grid); digest.update(',"signals":{');
  for (const [index, [key, values]] of Object.entries(series.signals).entries()) {
    if (index) digest.update(',');
    digest.update(JSON.stringify(key) + ':'); array(values);
  }
  return digest.update('}}').digest('hex');
}

function compact(run: ReferenceRun, outputPath: string): object {
  writeFileSync(outputPath, run.output ?? '');
  const { output, ...rest } = run;
  const warnings = (output ?? '').split(/\r?\n/).flatMap((line, i, lines) => /warning|ignored|unrecognized|not supported/i.test(line) ? lines.slice(i, i + 3) : []);
  if ('series' in rest) {
    const { series, ...fields } = rest;
    return { ...fields, points: series.grid.length, signals: Object.keys(series.signals), seriesSha256: hashSeries(series), outputPath, outputSha256: sha256(output ?? ''), warnings };
  }
  return { ...rest, outputPath, outputSha256: sha256(output ?? ''), warnings };
}

export async function runCandidates(candidates: ReturnType<typeof loadCorpus>, directory: string, resume = false): Promise<void> {
  mkdirSync(directory, { recursive: true });
  const version = (exe: string, args: string[]) => {
    const r = spawnSync(exe, args, { encoding: 'utf8', timeout: 10_000 });
    if (r.error || r.status !== 0) throw new Error(`${exe}: ${r.error?.message ?? r.stderr}`);
    return r.stdout.trim();
  };
  const executable = process.env.XYCE_BIN ?? 'Xyce';
  const xyceVersion = version(executable, ['-v']), ngspiceVersion = version('ngspice', ['--version']);
  if (!/Release 7\.10\.0\b/.test(xyceVersion) || !/ngspice-47\b/.test(ngspiceVersion)) throw new Error('Expected Xyce 7.10.0 and ngspice 47');
  const report = {
    schemaVersion: 'spice-ts-reference-canonical/v1', generatedAt: new Date().toISOString(), head: version('git', ['rev-parse', 'HEAD']),
    environment: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model, node: process.version },
    tools: { xyce: xyceVersion, ngspice: ngspiceVersion },
    adapterSourceHashes: Object.fromEntries(['canonical.ts', 'xyce.ts', 'expanded.ts', 'compare.ts', 'subset.ts', 'subset-runner.ts'].map(file => [file, sha256(readFileSync(`benchmarks/reference/${file}`))])),
    manifestHashes: Object.fromEntries(['ngspice', 'classic', 'xyce', 'corpus-d', 'corpus-e', 'corpus-f', 'corpus-g', 'corpus-h', 'corpus-i', 'corpus-j'].map(corpus => [corpus, sha256(readFileSync(`benchmarks/corpus/${corpus}/manifest.json`))])),
    policy: JSON.parse(readFileSync('benchmarks/reference/adapter-948/report.json', 'utf8')).policy,
    totals: {} as object, fixtures: [] as Array<Record<string, any>>,
  };
  const prior = resume ? JSON.parse(readFileSync(join(directory, 'report.json'), 'utf8')) : null;
  if (prior) {
    for (const file of ['canonical.ts', 'xyce.ts', 'expanded.ts', 'compare.ts']) {
      if (prior.adapterSourceHashes[file] !== report.adapterSourceHashes[file]) throw new Error(`Cannot resume changed native policy: ${file}`);
    }
    if (JSON.stringify(prior.manifestHashes) !== JSON.stringify(report.manifestHashes)) throw new Error('Cannot resume changed manifests');
    if (prior.fixtures.length > candidates.length) throw new Error('Invalid resume prefix');
    prior.fixtures.forEach((row: any, i: number) => {
      if (row.key !== candidates[i].key || row.originalSha256 !== sha256(candidates[i].input) || row.canonicalSha256 !== sha256(canonicalize(candidates[i].input.toString('utf8')).netlist)) throw new Error('Resume prefix mismatch');
      for (const p of row.projections) {
        if (sha256(readFileSync(p.sharedInputPath)) !== p.sharedInputSha256) throw new Error('Resume input hash mismatch');
        if (p.xyceInputPath && sha256(readFileSync(p.xyceInputPath)) !== p.xyceInputSha256) throw new Error('Resume Xyce input hash mismatch');
        for (const receipt of [p.ngspice, p.xyce]) if (receipt.outputPath && sha256(readFileSync(receipt.outputPath)) !== receipt.outputSha256) throw new Error('Resume output hash mismatch');
      }
    });
    report.fixtures = prior.fixtures;
  }
  const startOrdinal = report.fixtures.length;
  const executionSegments = prior ? (prior.executionSegments ?? [{ startOrdinal: 0, endOrdinal: startOrdinal, adapterSourceHashes: prior.adapterSourceHashes, generatedAt: prior.generatedAt, head: prior.head, environment: prior.environment, tools: prior.tools }]) : [];
  const segment = { startOrdinal, endOrdinal: startOrdinal, adapterSourceHashes: report.adapterSourceHashes, generatedAt: report.generatedAt, head: report.head, environment: report.environment, tools: report.tools };
  executionSegments.push(segment);
  const save = () => {
    segment.endOrdinal = report.fixtures.length;
    report.totals = summarize(report.fixtures as Parameters<typeof summarize>[0]);
    writeFileSync(join(directory, 'report.json'), JSON.stringify({ ...report, executionSegments }, null, 2) + '\n');
    writeFileSync(join(directory, 'hash-manifest.json'), JSON.stringify(report.fixtures.map(row => ({ key: row.key, originalSha256: row.originalSha256,
      canonicalSha256: row.canonicalSha256, canonicalPath: row.canonicalPath, limitations: row.limitations,
      projections: row.projections.map((p: any) => ({ ordinal: p.ordinal, analysis: p.analysis, sharedInputPath: p.sharedInputPath,
        sharedInputSha256: p.sharedInputSha256, xyceInputPath: p.xyceInputPath, xyceInputSha256: p.xyceInputSha256 })) })), null, 2) + '\n');
  };
  save();
  for (const { key, input } of candidates.slice(startOrdinal)) {
    const plan = canonicalize(input.toString('utf8'));
    const rowDir = join(directory, key); mkdirSync(rowDir, { recursive: true });
    const canonicalPath = join(rowDir, 'canonical.cir'); writeFileSync(canonicalPath, plan.netlist);
    const ngRuns: ReferenceRun[] = [], xyRuns: ReferenceRun[] = [];
    const projections: Array<Record<string, any>> = [], comparisons: Array<Record<string, any>> = [], losses: string[] = [];
    if (plan.limitations.length) {
      const ng = runNgspiceReference(plan.netlist); ngRuns.push(ng);
      const xy: ReferenceRun = { status: 'unsupported', convergence: 'unsupported', failureKind: 'translation', runtimeMs: 0, command: [], error: plan.limitations.join('; ') }; xyRuns.push(xy);
      projections.push({ ordinal: null, analysis: null, sharedInputPath: canonicalPath, sharedInputSha256: sha256(plan.netlist), ngspice: compact(ng, join(rowDir, 'ngspice-diagnostic.log')), xyce: xy });
    } else {
      for (const [ordinal, spec] of plan.analyses.entries()) {
        const shared = projectAnalysis(plan, ordinal);
        const sharedInputPath = join(rowDir, `${ordinal}-${spec.type}.cir`); writeFileSync(sharedInputPath, shared);
        const ng = runNgspiceReference(shared, spec.type); ngRuns.push(ng);
        const signals = ng.status === 'success' ? Object.keys(ng.series.signals).filter(s => /^[vi]\([^()]+\)$/i.test(s)).sort() : ['v(0)'];
        const fixture = { name: key, analysis: spec.type, netlist: shared, signals };
        let translated: ReturnType<typeof translateForXyce> | undefined;
        try { translated = translateForXyce(fixture); } catch { /* runXyce retains the typed limitation */ }
        const xyceInputPath = translated ? join(rowDir, `${ordinal}-${spec.type}-xyce.cir`) : null;
        if (xyceInputPath && translated) writeFileSync(xyceInputPath, translated.netlist);
        const xy = await runXyce(fixture, { executable, timeoutMs: 20_000 }); xyRuns.push(xy);
        if (/ignored|unrecognized|not supported|unknown parameter/i.test(xy.output ?? '')) losses.push(`analysis ${ordinal}: Xyce ignored/unsupported statement warning`);
        if (/ignored|unrecognized parameter|unknown parameter/i.test(ng.output ?? '')) losses.push(`analysis ${ordinal}: ngspice ignored/unsupported statement warning`);
        if (ng.status === 'success' && xy.status === 'success') comparisons.push({ ordinal, analysis: spec.type, signals, metrics: alignAndMeasure(ng.series, xy.series, signals) });
        projections.push({ ordinal, analysis: spec.type, directive: spec.directive, sharedInputPath, sharedInputSha256: sha256(shared), xyceInputPath,
          xyceInputSha256: translated ? sha256(translated.netlist) : null, outputDifferences: translated?.changes ?? [],
          ngspiceOutputDirectives: ['argv -r output.raw', '.spiceinit: set filetype=ascii'],
          ngspice: compact(ng, join(rowDir, `${ordinal}-ngspice.log`)), xyce: compact(xy, join(rowDir, `${ordinal}-xyce.log`)) });
      }
    }
    const ngStatus = fixtureStatus(ngRuns), xyStatus = fixtureStatus(xyRuns);
    const eligible = !plan.limitations.length && !losses.length && ngStatus === 'success' && xyStatus === 'success';
    report.fixtures.push({ key, originalSha256: sha256(input), canonicalSha256: sha256(plan.netlist), canonicalPath, changes: plan.changes, limitations: plan.limitations, losses,
      eligibility: eligible ? 'comparable' : plan.limitations.length ? 'unsupported' : losses.length ? 'transformed-with-loss' : 'native-failure',
      ngspice: { status: ngStatus }, xyce: { status: xyStatus }, projections, comparisons: eligible ? comparisons : [], partialComparisons: eligible ? [] : comparisons });
    console.log(`${report.fixtures.length}/${candidates.length} ${key} ngspice=${ngStatus} Xyce=${xyStatus} ${report.fixtures.at(-1)!.eligibility}`);
    save();
  }
}
