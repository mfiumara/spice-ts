#!/usr/bin/env tsx
/**
 * Corpus-g identical-input outcome report (#711): every committed deck runs unchanged through
 * ngspice-47 and spice-ts with the corpus-f runner, metric and threshold (no per-circuit tuning).
 * Writes outcomes.json and README.md, losses included.
 *
 * Usage (from the repository root, after `pnpm build`):
 *   spice-heavy pnpm exec tsx benchmarks/corpus/corpus-g/parity.ts            # regenerate outcomes.json + README.md
 *   spice-heavy pnpm exec tsx benchmarks/corpus/corpus-g/parity.ts --check    # rerun and compare, write nothing
 *   pnpm exec tsx benchmarks/corpus/corpus-g/parity.ts --relabel              # recompute buckets/issue links only
 *
 * The file is not named outcomes.ts or report.ts on purpose: corpus-f/outcomes.ts and classic/report.ts
 * start their own main() when the entry script has that base name, and this script imports both.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, release, tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPICE_TS_TIMEOUT_MS } from '../../aggregate-report.js';
import type { CorpusFCircuit } from '../corpus-f/ingest.js';
import { type EngineStatus, MATCH_THRESHOLD, type Outcome, PEAK_FLOOR, scrub } from '../corpus-f/lib.js';
import { CONTROL_ONLY_NOTE, type FixtureOutcome, outcomeDigest, runFixture, stableReport } from '../corpus-f/outcomes.js';
import type { CorpusGManifest } from './ingest.js';
import { CORPUS_ROOT, gapBucket } from './lib.js';

export const REPORT_SCHEMA = 'spice-ts-corpus-g-outcomes/v1' as const;
const MANIFEST_PATH = resolve(CORPUS_ROOT, 'manifest.json');
const JSON_PATH = resolve(CORPUS_ROOT, 'outcomes.json');
const MARKDOWN_PATH = resolve(CORPUS_ROOT, 'README.md');
/** corpus-f's runNgspice bound (600 s) plus the spice-ts bound plus slack, per fixture child. */
const CHILD_TIMEOUT_MS = 600_000 + SPICE_TS_TIMEOUT_MS + 60_000;
const CHILD_FLAG = '--corpus-g-fixture-child';

export interface CorpusGReport {
  schemaVersion: typeof REPORT_SCHEMA;
  outcomeSha256: string;
  source: { revision: string; license: string; manifestSha256: string };
  tools: { ngspice: string; spiceTs: string; node: string };
  environment: { platform: string; release: string; arch: string; cpu: string };
  commands: { generate: string; verify: string; ngspice: string; spiceTs: string };
  policy: {
    input: 'byte-identical fixture for both engines';
    fixtureAdaptation: 'none';
    perCircuitToleranceTuning: false;
    matchThreshold: number;
    matchRule: string;
    deterministicHashExcludes: ['environment', 'tools.node', 'ngspice.analyses', 'spiceTs.analyses'];
  };
  totals: {
    fixtures: number;
    ngspice: Record<EngineStatus, number>;
    spiceTs: Record<EngineStatus, number>;
    outcomes: Record<Outcome, number>;
  };
  gapBuckets: Array<{ bucket: string; fixtures: number; ngspiceSuccess: number; ids: string[]; issue: string | null }>;
  fixtures: FixtureOutcome[];
}

/**
 * Gap issues for corpus-g buckets. Existing issues are reused where the bucket is the same missing
 * capability as in corpus-f; new buckets get the issues filed for #711.
 */
export const GAP_ISSUES: Record<string, string> = {
  'device: XSPICE A-element code models': 'https://github.com/mfiumara/spice-ts/issues/487',
  'control: ngspice control-language scripting (set/let/save/foreach/meas/...)': 'https://github.com/mfiumara/spice-ts/issues/488',
  'control: analysis commands inside .control (tran/dc/op/ac/...)': 'https://github.com/mfiumara/spice-ts/issues/489',
  'device: Q/D instance forms (AREA=/M= keywords, thermal nodes, VBIC PNP)': 'https://github.com/mfiumara/spice-ts/issues/490',
  'device: P/Y-element lossy multiconductor lines (CPL, TXL)': 'https://github.com/mfiumara/spice-ts/issues/491',
  'source: parenthesised and extended waveform syntax': 'https://github.com/mfiumara/spice-ts/issues/492',
  'expression: quoted/brace expressions in values (TEMPER, functions)': 'https://github.com/mfiumara/spice-ts/issues/493',
  'directive: other .options fields (noinit, bypass, warn, ramptime, seedinfo)': 'https://github.com/mfiumara/spice-ts/issues/494',
  'expression: B-source V= and expression functions/operators': 'https://github.com/mfiumara/spice-ts/issues/495',
  'directive: numparam extensions (.func, .csparam, .if, string/vector .param)': 'https://github.com/mfiumara/spice-ts/issues/496',
  'device: R-card forms (r=, ac=, noisy=, resistor models)': 'https://github.com/mfiumara/spice-ts/issues/498',
  'model: MESFET/HFET levels and parameters (NMF/NHFET, Z-card)': 'https://github.com/mfiumara/spice-ts/issues/500',
  'source: TRNOISE/EXTERNAL waveforms': 'https://github.com/mfiumara/spice-ts/issues/501',
  'directive: .global': 'https://github.com/mfiumara/spice-ts/issues/502',
  'model: VERSION= strings on BSIM model cards': 'https://github.com/mfiumara/spice-ts/issues/503',
  'model: BSIM3 revisions other than 3.3 (VERSION=3.0/3.1/3.2.x)': 'https://github.com/mfiumara/spice-ts/issues/594',
  'model: BSIM3 non-quasi-static model (NQSMOD=1)': 'https://github.com/mfiumara/spice-ts/issues/692',
  'model: BSIM4 (LEVEL=14/54)': 'https://github.com/mfiumara/spice-ts/issues/3',
  'analysis: .pz beyond ideal R, L, C': 'https://github.com/mfiumara/spice-ts/issues/504',
  'directive: .measure': 'https://github.com/mfiumara/spice-ts/issues/505',
  'model: VDMOS power MOSFET': 'https://github.com/mfiumara/spice-ts/issues/506',
  'device: S/W-element switches': 'https://github.com/mfiumara/spice-ts/issues/507',
  'directive: .temp / .options temp': 'https://github.com/mfiumara/spice-ts/issues/459',
};

/** Findings beyond the gap buckets (correctness mismatches and harness defects) exposed by this batch. */
export const FOLLOW_UP_ISSUES: ReadonlyArray<{ url: string; scope: string }> = [];

const OUTCOMES: Outcome[] = ['matched', 'mismatch', 'not-compared', 'spice-ts-loss', 'ngspice-failed', 'both-failed'];
const STATUSES: EngineStatus[] = ['success', 'failed', 'unsupported'];

export function summarize(fixtures: FixtureOutcome[]): Pick<CorpusGReport, 'totals' | 'gapBuckets'> {
  const count = <T extends string>(keys: T[], pick: (fixture: FixtureOutcome) => T): Record<T, number> =>
    Object.fromEntries(keys.map(key => [key, fixtures.filter(fixture => pick(fixture) === key).length])) as Record<T, number>;
  const buckets = new Map<string, FixtureOutcome[]>();
  for (const fixture of fixtures) {
    if (!fixture.gapBucket) continue;
    buckets.set(fixture.gapBucket, [...(buckets.get(fixture.gapBucket) ?? []), fixture]);
  }
  return {
    totals: {
      fixtures: fixtures.length,
      ngspice: count(STATUSES, fixture => fixture.ngspice.status),
      spiceTs: count(STATUSES, fixture => fixture.spiceTs.status),
      outcomes: count(OUTCOMES, fixture => fixture.outcome),
    },
    gapBuckets: [...buckets.entries()]
      .map(([bucket, members]) => ({
        bucket,
        fixtures: members.length,
        ngspiceSuccess: members.filter(member => member.ngspice.status === 'success').length,
        ids: members.map(member => member.id),
        issue: GAP_ISSUES[bucket] ?? null,
      }))
      .sort((left, right) => right.fixtures - left.fixtures || left.bucket.localeCompare(right.bucket)),
  };
}

/** The corpus-f runner takes a CorpusFCircuit; corpus-g circuits carry the same fields. */
function asRunnerCircuit(circuit: CorpusGManifest['circuits'][number]): CorpusFCircuit {
  return { ...circuit, licence: 'BSD-3-Clause' as const };
}

function runChild(id: string): Promise<FixtureOutcome | { id: string; error: string }> {
  return new Promise(resolvePromise => {
    const child = spawn(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), CHILD_FLAG, id], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    const timer = setTimeout(() => child.kill('SIGKILL'), CHILD_TIMEOUT_MS);
    child.on('close', code => {
      clearTimeout(timer);
      const line = stdout.trim().split('\n').at(-1) ?? '';
      try {
        resolvePromise(JSON.parse(line) as FixtureOutcome);
      } catch {
        resolvePromise({ id, error: `fixture child exited ${code}: ${scrub(stderr || stdout)}` });
      }
    });
  });
}

function commandVersion(command: string, args: string[], pattern: RegExp): string {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error || result.status !== 0) return 'unavailable';
  return pattern.exec(`${result.stdout}\n${result.stderr}`)?.[0] ?? 'unknown';
}

export async function buildReport(manifest: CorpusGManifest, manifestSha256: string, jobs: number): Promise<CorpusGReport> {
  const circuits = manifest.circuits;
  const results = new Array<FixtureOutcome>(circuits.length);
  let next = 0;
  let done = 0;
  const worker = async (): Promise<void> => {
    while (next < circuits.length) {
      const index = next;
      next += 1;
      const result = await runChild(circuits[index].id);
      if ('error' in result && !('outcome' in result)) throw new Error(`${circuits[index].id}: ${result.error}`);
      results[index] = result as FixtureOutcome;
      done += 1;
      process.stderr.write(`corpus-g: ${done}/${circuits.length} ${circuits[index].id} ${results[index].outcome}\n`);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, jobs) }, worker));
  const base: Omit<CorpusGReport, 'outcomeSha256'> = {
    schemaVersion: REPORT_SCHEMA,
    source: { revision: manifest.source.revision, license: manifest.source.license, manifestSha256 },
    tools: {
      ngspice: commandVersion('ngspice', ['--version'], /ngspice-\d+(?:\.\d+)*/i),
      spiceTs: (JSON.parse(await readFile(resolve('packages/core/package.json'), 'utf8')) as { version: string }).version,
      node: process.version,
    },
    environment: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model ?? 'unknown' },
    commands: {
      generate: 'pnpm build && spice-heavy pnpm exec tsx benchmarks/corpus/corpus-g/parity.ts',
      verify: 'spice-heavy pnpm exec tsx benchmarks/corpus/corpus-g/parity.ts --check',
      ngspice: 'ngspice -b -r <raw> <identical-fixture> (HOME=<tmp> with .spiceinit "set filetype=ascii")',
      spiceTs: '@spice-ts/core simulate(<identical-fixture>) in a bounded child process (no parse() pre-check)',
    },
    policy: {
      input: 'byte-identical fixture for both engines',
      fixtureAdaptation: 'none',
      perCircuitToleranceTuning: false,
      matchThreshold: MATCH_THRESHOLD,
      matchRule: `matched = both engines succeed, every spice-ts analysis has an ngspice counterpart, and for every common signal max|spice-ts - ngspice| <= ${MATCH_THRESHOLD} x max(peak |ngspice signal|, ${PEAK_FLOOR}). Errors are taken at spice-ts points with ngspice interpolated (transient breakpoint alignment as in the aggregate report).`,
      deterministicHashExcludes: ['environment', 'tools.node', 'ngspice.analyses', 'spiceTs.analyses'],
    },
    ...summarize(results),
    fixtures: results,
  };
  return { ...base, outcomeSha256: outcomeDigest(base as never) };
}

function cell(text: string | null | undefined): string {
  if (!text) return '';
  return text.replace(/\|/g, '\\|').replace(/`/g, "'");
}

export function renderMarkdown(report: CorpusGReport): string {
  const { totals } = report;
  const ngspiceSuccess = report.fixtures.filter(fixture => fixture.ngspice.status === 'success');
  const matched = report.fixtures.filter(fixture => fixture.outcome === 'matched');
  const losses = report.fixtures.filter(fixture => fixture.outcome !== 'matched');
  const row = (fixture: FixtureOutcome): string => {
    const errors = [
      fixture.ngspice.firstErrorLine ? `ngspice: ${fixture.ngspice.firstErrorLine}` : '',
      fixture.ngspice.note ? `ngspice note: ${fixture.ngspice.note}` : '',
      fixture.spiceTs.firstErrorLine ? `spice-ts: ${fixture.spiceTs.firstErrorLine}` : '',
    ].filter(Boolean).join(' / ');
    const local = fixture.sourcePath.replace(/^Netlists\//, '');
    return `| [${local}](fixtures/${local})${fixture.sameNameAs.length > 0 ? ' †' : ''} | ${fixture.ngspice.status} | ${fixture.spiceTs.status} | ${fixture.outcome} | ${fixture.worstNormalizedError ?? ''} | ${cell(fixture.worstSignal)} | ${cell(errors)} |`;
  };
  const header = ['| Fixture | ngspice | spice-ts | Outcome | Worst | Worst signal | First error line (ngspice / spice-ts) |', '|---|---|---|---|---|---|---|'];
  const lines = [
    '# corpus-g: Xyce Regression Suite decks that ngspice runs unchanged (#711)',
    '',
    'Generated by `pnpm exec tsx benchmarks/corpus/corpus-g/parity.ts`; do not edit by hand. Provenance, per-file licence, the selection rules and every exclusion are in [SOURCES.md](SOURCES.md).',
    '',
    `Every deck below is byte-identical to Xyce_Regression \`${report.source.revision}\` (${report.source.license}) and runs unchanged through both engines. Decks were selected without running spice-ts (static rules plus an ngspice-47 reference probe, see SOURCES.md). No fixture is edited and no tolerance is tuned per circuit. Every spice-ts failure and mismatch is published as a loss.`,
    '',
    '## Totals',
    '',
    `- Fixtures: ${totals.fixtures}. Outcome SHA-256: \`${report.outcomeSha256}\`.`,
    `- ngspice (${report.tools.ngspice}): ${totals.ngspice.success} success, ${totals.ngspice.failed} failed, ${totals.ngspice.unsupported} unsupported.`,
    `- spice-ts (${report.tools.spiceTs}): ${totals.spiceTs.success} success, ${totals.spiceTs.failed} failed, ${totals.spiceTs.unsupported} unsupported.`,
    `- Outcomes: ${OUTCOMES.map(name => `${name} ${totals.outcomes[name]}`).join(', ')}.`,
    `- Of the ${ngspiceSuccess.length} decks ngspice runs successfully, spice-ts matches ${totals.outcomes.matched}, mismatches ${totals.outcomes.mismatch}, produces no comparable result for ${totals.outcomes['not-compared']} and fails ${totals.outcomes['spice-ts-loss']}.`,
    '',
    '## Method',
    '',
    `- ngspice: \`${report.commands.ngspice}\`. Status success means exit 0 and at least one op/dc/ac/tran/pz/noise/disto plot in the raw file; failed/unsupported is classified from ngspice's own output.`,
    `- spice-ts: \`${report.commands.spiceTs}\`. The runner and metric are corpus-f's (\`benchmarks/corpus/corpus-f/{outcomes,lib}.ts\`), imported unchanged. Gap buckets apply the corpus-g rules in \`lib.ts\` first, then the corpus-f rules.`,
    `- ${report.policy.matchRule}`,
    '- "worst" is that normalised error for the worst signal.',
    `- Bounds: ngspice 600 s, spice-ts ${SPICE_TS_TIMEOUT_MS / 1000} s per fixture. The outcome hash excludes ${report.policy.deterministicHashExcludes.join(', ')}.`,
    `- Regenerate: \`${report.commands.generate}\`; verify without writing: \`${report.commands.verify}\`.`,
    `- Machine: ${report.environment.platform} ${report.environment.release} ${report.environment.arch}, ${report.environment.cpu}; Node ${report.tools.node}.`,
    `- ${report.fixtures.filter(fixture => fixture.sameNameAs.length > 0).length} fixtures share a file name with a fixture of another public corpus (different bytes). They are marked † below.`,
    '',
    '## Follow-up issues',
    '',
    ...(FOLLOW_UP_ISSUES.length > 0 ? FOLLOW_UP_ISSUES.map(issue => `- ${issue.url}: ${issue.scope}.`) : ['- none']),
    '',
    '## spice-ts gap buckets',
    '',
    'Grouped from spice-ts\'s own first error line (corpus-g rules, then corpus-f rules). "ngspice ok" counts the fixtures in the bucket that ngspice runs successfully.',
    '',
    '| Bucket | Fixtures | ngspice ok | Issue |',
    '|---|---|---|---|',
    ...report.gapBuckets.map(bucket => `| ${cell(bucket.bucket)} | ${bucket.fixtures} | ${bucket.ngspiceSuccess} | ${bucket.issue ?? (bucket.ngspiceSuccess === 0 ? 'none: ngspice also fails every fixture in this bucket' : 'none filed')} |`),
    '',
    `## Losses (${losses.length})`,
    '',
    'Every fixture that is not matched: spice-ts failures, mismatches above the threshold, and results that could not be compared.',
    '',
    ...header,
    ...losses.map(row),
    '',
    `## Wins (${matched.length})`,
    '',
    'Fixtures where spice-ts matches ngspice-47 within the uniform threshold on every common signal.',
    '',
    ...header,
    ...matched.map(row),
    '',
  ];
  return lines.join('\n');
}

/** Recomputes gap buckets, issue links, totals and the outcome digest without rerunning either engine. */
export function relabel(report: CorpusGReport): CorpusGReport {
  const fixtures = report.fixtures.map(fixture => ({
    ...fixture,
    ngspice: fixture.ngspice.note ? { ...fixture.ngspice, note: CONTROL_ONLY_NOTE } : fixture.ngspice,
    gapBucket: gapBucket(fixture.spiceTs.firstErrorLine, fixture.spiceTs.status) ?? null,
  }));
  const { outcomeSha256: _previous, ...rest } = report;
  const base = { ...rest, ...summarize(fixtures), fixtures };
  return { ...base, outcomeSha256: outcomeDigest(base as never) };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes('--relabel')) {
    const report = relabel(JSON.parse(await readFile(JSON_PATH, 'utf8')) as CorpusGReport);
    await writeFile(JSON_PATH, stableReport(report as never));
    await writeFile(MARKDOWN_PATH, renderMarkdown(report));
    process.stderr.write(`corpus-g --relabel: outcome ${report.outcomeSha256}\n`);
    return;
  }
  const check = argv.includes('--check');
  const jobsIndex = argv.indexOf('--jobs');
  const jobs = jobsIndex >= 0 ? Number(argv[jobsIndex + 1]) : 4;
  process.stderr.write(`corpus-g report${check ? ' --check' : ''}: pid ${process.pid}; stop with: kill ${process.pid}\n`);
  const manifestBytes = await readFile(MANIFEST_PATH);
  const manifest = JSON.parse(manifestBytes.toString('utf8')) as CorpusGManifest;
  const report = await buildReport(manifest, createHash('sha256').update(manifestBytes).digest('hex'), jobs);
  if (check) {
    const committed = JSON.parse(await readFile(JSON_PATH, 'utf8')) as CorpusGReport;
    if (committed.outcomeSha256 !== report.outcomeSha256) {
      const regenerated = resolve(tmpdir(), `corpus-g-outcomes-check-${process.pid}.json`);
      await writeFile(regenerated, stableReport(report as never));
      throw new Error(`corpus-g outcome differs: committed ${committed.outcomeSha256}, regenerated ${report.outcomeSha256} (written to ${regenerated})`);
    }
    if ((await readFile(MARKDOWN_PATH, 'utf8')) !== renderMarkdown(committed)) throw new Error('corpus-g README.md differs from the committed outcomes.json');
  } else {
    await writeFile(JSON_PATH, stableReport(report as never));
    await writeFile(MARKDOWN_PATH, renderMarkdown(report));
  }
  process.stderr.write(`corpus-g: ${report.totals.fixtures} fixtures; outcome ${report.outcomeSha256}; ${JSON.stringify(report.totals.outcomes)}\n`);
}

if (process.argv[2] === CHILD_FLAG) {
  (async () => {
    const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as CorpusGManifest;
    const circuit = manifest.circuits.find(candidate => candidate.id === process.argv[3]);
    if (!circuit) throw new Error(`unknown fixture ${process.argv[3]}`);
    const result = await runFixture(asRunnerCircuit(circuit));
    result.gapBucket = gapBucket(result.spiceTs.firstErrorLine, result.spiceTs.status) ?? null;
    process.stdout.write(`${JSON.stringify(result)}\n`);
  })().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
} else if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
