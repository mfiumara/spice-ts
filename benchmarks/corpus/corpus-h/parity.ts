#!/usr/bin/env tsx
/**
 * Corpus-h identical-input outcome report (#785): every committed deck runs unchanged through
 * ngspice-47 and spice-ts with the corpus-f runner, metric and threshold (no per-circuit tuning).
 * Writes outcomes.json and README.md, losses included.
 *
 * Usage (from the repository root, after `pnpm build`):
 *   spice-heavy pnpm exec tsx benchmarks/corpus/corpus-h/parity.ts            # regenerate outcomes.json + README.md
 *   spice-heavy pnpm exec tsx benchmarks/corpus/corpus-h/parity.ts --check    # rerun and compare, write nothing
 *   pnpm exec tsx benchmarks/corpus/corpus-h/parity.ts --relabel              # recompute buckets/issue links only
 *
 * Not named outcomes.ts or report.ts: corpus-f/outcomes.ts and classic/report.ts start their own
 * main() when the entry script has that base name, and this script imports both.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, release, tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPICE_TS_TIMEOUT_MS } from '../../aggregate-report.js';
import type { CorpusFCircuit } from '../corpus-f/ingest.js';
import { CURRENT_PEAK_FLOOR, type EngineStatus, MATCH_THRESHOLD, type Outcome, PEAK_FLOOR, scrub, VOLTAGE_PEAK_FLOOR } from '../corpus-f/lib.js';
import { CONTROL_ONLY_NOTE, type FixtureOutcome, outcomeDigest, runFixture, stableReport } from '../corpus-f/outcomes.js';
import type { CorpusHManifest } from './ingest.js';
import { CORPUS_ROOT, gapBucket } from './lib.js';

export const REPORT_SCHEMA = 'spice-ts-corpus-h-outcomes/v1' as const;
const MANIFEST_PATH = resolve(CORPUS_ROOT, 'manifest.json');
const JSON_PATH = resolve(CORPUS_ROOT, 'outcomes.json');
const MARKDOWN_PATH = resolve(CORPUS_ROOT, 'README.md');
/** corpus-f's runNgspice bound (600 s) plus the spice-ts bound plus slack, per fixture child. */
const CHILD_TIMEOUT_MS = 600_000 + SPICE_TS_TIMEOUT_MS + 60_000;
const CHILD_FLAG = '--corpus-h-fixture-child';

export interface CorpusHReport {
  schemaVersion: typeof REPORT_SCHEMA;
  outcomeSha256: string;
  sources: Array<{ key: string; revision: string; license: string }>;
  manifestSha256: string;
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
    bySource: Record<string, Record<Outcome, number>>;
  };
  gapBuckets: Array<{ bucket: string; fixtures: number; ngspiceSuccess: number; ids: string[]; issue: string | null }>;
  fixtures: FixtureOutcome[];
}

/**
 * Gap issues for corpus-h buckets, filed for #785 after searching open and closed issues. The
 * `convergence` bucket links #772: all three decks in it use KiCad's `GND` ground node, and each
 * runs once `GND` reads as ground (diagnostic in the #772 thread; fixtures stay byte-identical).
 * Buckets of one or two decks share #790.
 */
export const GAP_ISSUES: Record<string, string> = {
  'control: edit command and # comment lines inside .control': 'https://github.com/mfiumara/spice-ts/issues/787',
  'control: failed setplot aborts the script (ngspice-47 continues)': 'https://github.com/mfiumara/spice-ts/issues/798',
  'expression: bare parameter names as values (X-card R=R1, M = 10)': 'https://github.com/mfiumara/spice-ts/issues/788',
  'crash: uncaught TypeError instead of a structured error': 'https://github.com/mfiumara/spice-ts/issues/789',
  'convergence': 'https://github.com/mfiumara/spice-ts/issues/772',
  'directive: bare .probe card': 'https://github.com/mfiumara/spice-ts/issues/790',
  'directive: other .options fields ngspice-47 accepts (INTERP, ysep, ...)': 'https://github.com/mfiumara/spice-ts/issues/790',
  'directive: .four': 'https://github.com/mfiumara/spice-ts/issues/790',
  'syntax: non-ASCII unit suffixes on numbers (27°C)': 'https://github.com/mfiumara/spice-ts/issues/790',
  'syntax: parenthesised node pairs on controlled-source cards': 'https://github.com/mfiumara/spice-ts/issues/790',
};

/** Findings beyond the gap buckets (correctness mismatches and harness defects) exposed by this batch. */
export const FOLLOW_UP_ISSUES: ReadonlyArray<{ url: string; scope: string }> = [
  { url: 'https://github.com/mfiumara/spice-ts/issues/791', scope: 'triage of the 3 SpiceSharpParser cookbook decks (astable-led-flasher, bjt-relay-driver, transmission-line-termination) where both engines succeed but spice-ts exceeds the 1% parity threshold' },
  { url: 'https://github.com/mfiumara/spice-ts/issues/797', scope: 'SpiceSharpParser example01.cir op mismatch (comma-separated subcircuit instance parameter lists), runnable since #789' },
  { url: 'https://github.com/mfiumara/spice-ts/issues/804', scope: 'WRspice mosamp2.cir residual transient mismatch after the MOS LEVEL=2 fix for #799 (transient step sequence across a fast edge)' },
  { url: 'https://github.com/mfiumara/spice-ts/issues/809', scope: 'KiCad QA tlines.spice and legacy_sources.spice mismatches, runnable since GND reads as ground (#772)' },
  { url: 'https://github.com/mfiumara/spice-ts/issues/810', scope: 'SpiceSharpParser Example04.cir, Example04_reversed.cir and Example05.cir op mismatch (X-card `M = 10` multiplicity is ignored), runnable since #788' },
  { url: 'https://github.com/mfiumara/spice-ts/issues/826', scope: 'SpiceSharpParser Example04_nested.cir: a .subckt defined inside another .subckt is not visible (Undefined subcircuit), runnable past parsing since #788' },
];

const OUTCOMES: Outcome[] = ['matched', 'mismatch', 'not-compared', 'spice-ts-loss', 'ngspice-failed', 'both-failed'];
const STATUSES: EngineStatus[] = ['success', 'failed', 'unsupported'];

function sourceKey(fixture: FixtureOutcome): string {
  return fixture.sourcePath.split('/')[0];
}

export function summarize(fixtures: FixtureOutcome[]): Pick<CorpusHReport, 'totals' | 'gapBuckets'> {
  const count = <T extends string>(keys: T[], members: FixtureOutcome[], pick: (fixture: FixtureOutcome) => T): Record<T, number> =>
    Object.fromEntries(keys.map(key => [key, members.filter(fixture => pick(fixture) === key).length])) as Record<T, number>;
  const buckets = new Map<string, FixtureOutcome[]>();
  for (const fixture of fixtures) {
    if (!fixture.gapBucket) continue;
    buckets.set(fixture.gapBucket, [...(buckets.get(fixture.gapBucket) ?? []), fixture]);
  }
  const keys = [...new Set(fixtures.map(sourceKey))].sort();
  return {
    totals: {
      fixtures: fixtures.length,
      ngspice: count(STATUSES, fixtures, fixture => fixture.ngspice.status),
      spiceTs: count(STATUSES, fixtures, fixture => fixture.spiceTs.status),
      outcomes: count(OUTCOMES, fixtures, fixture => fixture.outcome),
      bySource: Object.fromEntries(keys.map(key => [key, count(OUTCOMES, fixtures.filter(fixture => sourceKey(fixture) === key), fixture => fixture.outcome)])),
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

/** The corpus-f runner takes a CorpusFCircuit; the licence field is not read by the runner. */
function asRunnerCircuit(circuit: CorpusHManifest['circuits'][number]): CorpusFCircuit {
  return {
    id: circuit.id,
    sourcePath: circuit.sourcePath,
    sourceUrl: circuit.sourceUrl,
    localPath: circuit.localPath,
    sha256: circuit.sha256,
    bytes: circuit.bytes,
    licence: 'BSD-3-Clause' as const,
    analyses: circuit.analyses,
    unmappedAnalyses: circuit.unmappedAnalyses,
    sameNameAs: circuit.sameNameAs,
  };
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

export async function buildReport(manifest: CorpusHManifest, manifestSha256: string, jobs: number): Promise<CorpusHReport> {
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
      process.stderr.write(`corpus-h: ${done}/${circuits.length} ${circuits[index].id} ${results[index].outcome}\n`);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, jobs) }, worker));
  const base: Omit<CorpusHReport, 'outcomeSha256'> = {
    schemaVersion: REPORT_SCHEMA,
    sources: manifest.sources.map(source => ({ key: source.key, revision: source.revision, license: source.license })),
    manifestSha256,
    tools: {
      ngspice: commandVersion('ngspice', ['--version'], /ngspice-\d+(?:\.\d+)*/i),
      spiceTs: (JSON.parse(await readFile(resolve('packages/core/package.json'), 'utf8')) as { version: string }).version,
      node: process.version,
    },
    environment: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model ?? 'unknown' },
    commands: {
      generate: 'pnpm build && spice-heavy pnpm exec tsx benchmarks/corpus/corpus-h/parity.ts',
      verify: 'spice-heavy pnpm exec tsx benchmarks/corpus/corpus-h/parity.ts --check',
      ngspice: 'ngspice -b -r <raw> <identical-fixture> (HOME=<tmp> with .spiceinit "set filetype=ascii")',
      spiceTs: '@spice-ts/core simulate(<identical-fixture>) in a bounded child process (no parse() pre-check)',
    },
    policy: {
      input: 'byte-identical fixture for both engines',
      fixtureAdaptation: 'none',
      perCircuitToleranceTuning: false,
      matchThreshold: MATCH_THRESHOLD,
      matchRule: `matched = both engines succeed, every spice-ts analysis has an ngspice counterpart, and for every common signal max|spice-ts - ngspice| <= ${MATCH_THRESHOLD} x max(peak |ngspice signal|, floor), with the corpus-f floor: ${VOLTAGE_PEAK_FLOOR} V for node voltages, ${CURRENT_PEAK_FLOOR} A for branch currents, ${PEAK_FLOOR} otherwise. Errors are taken at spice-ts points with ngspice interpolated (transient breakpoint alignment as in the aggregate report).`,
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

export function renderMarkdown(report: CorpusHReport): string {
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
    const link = `fixtures/${fixture.sourcePath.split('/').map(encodeURIComponent).join('/')}`;
    return `| [${cell(fixture.sourcePath)}](${link})${fixture.sameNameAs.length > 0 ? ' †' : ''} | ${fixture.ngspice.status} | ${fixture.spiceTs.status} | ${fixture.outcome} | ${fixture.worstNormalizedError ?? ''} | ${cell(fixture.worstSignal)} | ${cell(errors)} |`;
  };
  const header = ['| Fixture | ngspice | spice-ts | Outcome | Worst | Worst signal | First error line (ngspice / spice-ts) |', '|---|---|---|---|---|---|---|'];
  const lines = [
    '# corpus-h: public non-Xyce SPICE decks that ngspice runs unchanged (#785)',
    '',
    'Generated by `pnpm exec tsx benchmarks/corpus/corpus-h/parity.ts`; do not edit by hand. Provenance, per-file licence, the selection rules and every exclusion are in [SOURCES.md](SOURCES.md).',
    '',
    `Every deck below is byte-identical to its pinned upstream revision (${report.sources.map(source => `${source.key} \`${source.revision.slice(0, 12)}\` ${source.license}`).join('; ')}) and runs unchanged through both engines. Decks were selected without running spice-ts (static rules plus an ngspice-47 reference probe, see SOURCES.md). No fixture is edited and no tolerance is tuned per circuit. Every spice-ts failure and mismatch is published as a loss.`,
    '',
    '## Totals',
    '',
    `- Fixtures: ${totals.fixtures}. Outcome SHA-256: \`${report.outcomeSha256}\`.`,
    `- ngspice (${report.tools.ngspice}): ${totals.ngspice.success} success, ${totals.ngspice.failed} failed, ${totals.ngspice.unsupported} unsupported.`,
    `- spice-ts (${report.tools.spiceTs}): ${totals.spiceTs.success} success, ${totals.spiceTs.failed} failed, ${totals.spiceTs.unsupported} unsupported.`,
    `- Outcomes: ${OUTCOMES.map(name => `${name} ${totals.outcomes[name]}`).join(', ')}.`,
    `- Of the ${ngspiceSuccess.length} decks ngspice runs successfully, spice-ts matches ${totals.outcomes.matched}, mismatches ${totals.outcomes.mismatch}, produces no comparable result for ${totals.outcomes['not-compared']} and fails ${totals.outcomes['spice-ts-loss']}.`,
    '',
    '| Source | Fixtures | Matched | Mismatch | Not compared | spice-ts loss | ngspice failed | Both failed |',
    '|---|---|---|---|---|---|---|---|',
    ...Object.entries(totals.bySource).map(([key, counts]) => `| \`${key}\` | ${OUTCOMES.reduce((sum, name) => sum + counts[name], 0)} | ${counts.matched} | ${counts.mismatch} | ${counts['not-compared']} | ${counts['spice-ts-loss']} | ${counts['ngspice-failed']} | ${counts['both-failed']} |`),
    '',
    '## Method',
    '',
    `- ngspice: \`${report.commands.ngspice}\`. Status success means exit 0 and at least one op/dc/ac/tran/pz/noise/disto plot in the raw file; failed/unsupported is classified from ngspice's own output.`,
    `- spice-ts: \`${report.commands.spiceTs}\`. The runner and metric are corpus-f's (\`benchmarks/corpus/corpus-f/{outcomes,lib}.ts\`), imported unchanged. Gap buckets apply the corpus-h rules in \`lib.ts\` first, then the corpus-g and corpus-f rules.`,
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
    'Grouped from spice-ts\'s own first error line (corpus-h rules, then corpus-g and corpus-f rules). "ngspice ok" counts the fixtures in the bucket that ngspice runs successfully.',
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
export function relabel(report: CorpusHReport): CorpusHReport {
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
    const report = relabel(JSON.parse(await readFile(JSON_PATH, 'utf8')) as CorpusHReport);
    await writeFile(JSON_PATH, stableReport(report as never));
    await writeFile(MARKDOWN_PATH, renderMarkdown(report));
    process.stderr.write(`corpus-h --relabel: outcome ${report.outcomeSha256}\n`);
    return;
  }
  const check = argv.includes('--check');
  const jobsIndex = argv.indexOf('--jobs');
  const jobs = jobsIndex >= 0 ? Number(argv[jobsIndex + 1]) : 4;
  process.stderr.write(`corpus-h report${check ? ' --check' : ''}: pid ${process.pid}; stop with: kill ${process.pid}\n`);
  const manifestBytes = await readFile(MANIFEST_PATH);
  const manifest = JSON.parse(manifestBytes.toString('utf8')) as CorpusHManifest;
  const report = await buildReport(manifest, createHash('sha256').update(manifestBytes).digest('hex'), jobs);
  if (check) {
    const committed = JSON.parse(await readFile(JSON_PATH, 'utf8')) as CorpusHReport;
    if (committed.outcomeSha256 !== report.outcomeSha256) {
      const regenerated = resolve(tmpdir(), `corpus-h-outcomes-check-${process.pid}.json`);
      await writeFile(regenerated, stableReport(report as never));
      throw new Error(`corpus-h outcome differs: committed ${committed.outcomeSha256}, regenerated ${report.outcomeSha256} (written to ${regenerated})`);
    }
    if ((await readFile(MARKDOWN_PATH, 'utf8')) !== renderMarkdown(committed)) throw new Error('corpus-h README.md differs from the committed outcomes.json');
  } else {
    await writeFile(JSON_PATH, stableReport(report as never));
    await writeFile(MARKDOWN_PATH, renderMarkdown(report));
  }
  process.stderr.write(`corpus-h: ${report.totals.fixtures} fixtures; outcome ${report.outcomeSha256}; ${JSON.stringify(report.totals.outcomes)}\n`);
}

if (process.argv[2] === CHILD_FLAG) {
  (async () => {
    const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as CorpusHManifest;
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
