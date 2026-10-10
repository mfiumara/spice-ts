#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, release } from 'node:os';
import { basename, resolve } from 'node:path';

import { buildAggregateReport } from '../aggregate-report.js';

const CORPORA = ['ngspice', 'classic', 'xyce', 'corpus-d', 'corpus-e'] as const;
const CAUSES = ['success', 'parser', 'device/model', 'analysis', 'convergence', 'execution'] as const;
const REPORT_PATH = resolve('benchmarks/device-card-audit/report.json');
const MARKDOWN_PATH = resolve('benchmarks/device-card-audit/REPORT.md');
const BASELINE_PATH = resolve('benchmarks/aggregate-report.json');
const SOURCES_PATH = resolve('benchmarks/SOURCES.md');

type Cause = typeof CAUSES[number];
type Aggregate = Awaited<ReturnType<typeof buildAggregateReport>>;
type AggregateFixture = Aggregate['fixtures'][number];
type AggregateEngine = AggregateFixture['ngspice'];
type EngineName = 'ngspice' | 'spiceTs';

interface FirstFailure {
  cause: Exclude<Cause, 'success'>;
  card: string | null;
  model: string | null;
  parameter: string | null;
  evidence: string;
  owningGap: string | null;
}

interface EngineAudit {
  status: AggregateEngine['status'];
  runtimeMs: number;
  inputSha256: string;
  firstFailure: FirstFailure | null;
}

interface TransitionOutcome {
  status: string;
  cause: Cause;
  card: string | null;
  model: string | null;
  parameter: string | null;
  evidence: string | null;
}

interface AuditedFixture {
  key: string;
  category: string;
  analyses: string[];
  input: { bytes: number; sha256: string; identicalForBothEngines: true };
  ngspice: EngineAudit;
  spiceTs: EngineAudit;
  transition: { from: TransitionOutcome; to: TransitionOutcome; changed: boolean };
  deviceCardCoverage: 'completed-execution' | 'reached-execution-failed' | 'direct-device-model-gap' | 'blocked-before-execution';
}

interface BaselineReport {
  outcomeSha256: string;
  fixtures: Array<{
    key: string;
    declaredAnalyses: string[];
    ngspice: { status: string };
    spiceTs: { status: string; error?: string };
  }>;
}

export interface DeviceCardAudit {
  schemaVersion: 'spice-ts-device-card-audit/v1';
  policy: {
    fixtureCount: 100;
    input: 'byte-identical fixture bytes for both engines';
    fixtureAdaptation: 'none';
    perCircuitToleranceTuning: false;
    timing: 'single wall-clock execution per engine and fixture; descriptive only';
  };
  commands: { generate: string; check: string; ngspice: string; spiceTs: string };
  environment: { platform: string; release: string; arch: string; cpu: string; node: string };
  tools: Aggregate['tools'];
  hashes: {
    sourcesSha256: string;
    manifestsSha256: Record<typeof CORPORA[number], string>;
    fixtureSetSha256: string;
    baselineReportSha256: string;
    baselineOutcomeSha256: string;
    deterministicOutcomeSha256: string;
  };
  totals: {
    fixtures: 100;
    ngspice: Record<Cause, number>;
    spiceTs: Record<Cause, number>;
    runtimeMs: Record<EngineName, number>;
    transitions: { changed: number; unchanged: number; gains: number; regressions: number };
    deviceCardCoverage: Record<AuditedFixture['deviceCardCoverage'], number>;
  };
  exclusions: {
    fixtureAdaptation: true;
    perCircuitToleranceTuning: true;
    waveformParityClaim: true;
    speedComparisonClaim: true;
    failuresAfterFirst: true;
  };
  gapRegistry: Array<{ issue: string; state: 'OPEN'; scope: string }>;
  fixtures: AuditedFixture[];
}

function sha256(input: Buffer | string): string {
  return createHash('sha256').update(input).digest('hex');
}

function firstDiagnostic(error: string): string {
  return error
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(Boolean)
    ?.replace(/\s+/g, ' ')
    ?? 'no diagnostic emitted';
}

function extractDetail(evidence: string): Pick<FirstFailure, 'card' | 'model' | 'parameter'> {
  const explicitCard = /Unsupported device card:\s*['"]?([A-Za-z])\b/i.exec(evidence)?.[1]?.toUpperCase();
  const bjtCard = /Unsupported BJT Q-card form/i.test(evidence);
  const mutualCard = /K-element\b/i.test(evidence);
  const ltra = /(?:lossy transmission line|\bLTRA\b)/i.test(evidence);
  const mosModel = /\bMOS\s*(\d+)\b/i.exec(evidence)?.[1];
  const modelLevel = /model level\s*([\w.+-]+)/i.exec(evidence)?.[1];
  const modelType = /Device type\s+([A-Za-z]+\d*)/i.exec(evidence)?.[1];
  const option = /Unsupported (?:\.options|\.option|options?)\s+(?:\w+\s+)?field:\s*['"]([^'"]+)/i.exec(evidence)?.[1];
  const number = /Cannot parse number:\s*['"]([^'"]+)/i.exec(evidence)?.[1];
  const fn = /Unknown function\s*['"]([^'"]+)/i.exec(evidence)?.[1];
  const dot = /Unsupported dot command:\s*['"]([^'"]+)/i.exec(evidence)?.[1];

  return {
    card: explicitCard ?? (bjtCard ? 'Q' : mutualCard ? 'K' : ltra ? 'O/LTRA' : mosModel || /^MOS/i.test(modelType ?? '') ? 'M' : null),
    model: mosModel ? `MOS${mosModel}` : modelLevel ? `level ${modelLevel}` : modelType ?? (bjtCard ? 'BJT' : ltra ? 'LTRA' : null),
    parameter: option ?? number ?? fn ?? dot ?? (bjtCard ? 'Q-card form' : mutualCard ? 'inductor references' : null),
  };
}

export function classifyFirstFailure(error: string, analyses: readonly string[]): Omit<FirstFailure, 'owningGap'> {
  const evidence = firstDiagnostic(error);
  const detail = extractDetail(evidence);
  let cause: FirstFailure['cause'];
  if (/timestep too small|converg|singular matrix|iteration limit/i.test(evidence)) {
    cause = 'convergence';
  } else if (
    /Unsupported device card|Unsupported BJT Q-card form|K-element\b|Device type .* not available|valid modelname|unsupported model|model level|lossy transmission line|\bLTRA\b/i.test(evidence)
  ) {
    cause = 'device/model';
  } else if (/no .*result for analyses|Unknown function|unsupported analysis|\.noise\b|\.pz\b|\.disto\b/i.test(evidence)) {
    cause = 'analysis';
  } else if (/Parse error|Cannot parse|Unsupported dot command|Unsupported .*field|circuit not parsed|unknown parameter/i.test(evidence)) {
    cause = 'parser';
  } else {
    cause = 'execution';
  }
  if (cause === 'analysis' && detail.parameter === null) detail.parameter = analyses.join(',') || null;
  return { cause, ...detail, evidence };
}

function owningGap(fixture: AggregateFixture, failure: Omit<FirstFailure, 'owningGap'>): string {
  const text = `${fixture.key} ${fixture.category} ${fixture.declaredAnalyses.join(' ')} ${failure.card ?? ''} ${failure.model ?? ''} ${failure.parameter ?? ''} ${failure.evidence}`.toLowerCase();
  if (failure.cause === 'convergence' && fixture.key.startsWith('classic/')) return 'https://github.com/mfiumara/spice-ts/issues/280';
  if (failure.cause === 'execution' && /^xyce\/(?:nmos|pmos|npn|pnp)-/.test(fixture.key)) return 'https://github.com/mfiumara/spice-ts/issues/289';
  if (failure.cause === 'analysis') return /\b(?:noise|pz|pole-zero|disto|distortion)\b/.test(text)
    ? 'https://github.com/mfiumara/spice-ts/issues/75'
    : 'https://github.com/mfiumara/spice-ts/issues/76';
  if (failure.cause === 'device/model' && /\b(?:o\/ltra|ltra|transmission line)\b/.test(text)) return 'https://github.com/mfiumara/spice-ts/issues/226';
  if (failure.cause === 'device/model' && /\b(?:mos\d*|bsim|ekv)\b/.test(text)) return 'https://github.com/mfiumara/spice-ts/issues/3';
  if (failure.cause === 'device/model' && /\b(?:q|bjt|vbic|npn|pnp)\b/.test(text)) return 'https://github.com/mfiumara/spice-ts/issues/5';
  return 'https://github.com/mfiumara/spice-ts/issues/76';
}

function engineAudit(engine: EngineName, fixture: AggregateFixture): EngineAudit {
  const result = fixture[engine];
  if (result.status === 'success') {
    return { status: result.status, runtimeMs: result.runtimeMs, inputSha256: result.inputSha256, firstFailure: null };
  }
  const classified = classifyFirstFailure(result.error ?? 'no engine result', fixture.declaredAnalyses);
  return {
    status: result.status,
    runtimeMs: result.runtimeMs,
    inputSha256: result.inputSha256,
    firstFailure: { ...classified, owningGap: engine === 'spiceTs' ? owningGap(fixture, classified) : null },
  };
}

function outcome(engine: EngineAudit): string {
  return engine.status === 'success' ? 'success' : `${engine.status}/${engine.firstFailure?.cause ?? 'execution'}`;
}

function transitionOutcome(status: string, failure: Omit<FirstFailure, 'owningGap'> | FirstFailure | null): TransitionOutcome {
  return {
    status,
    cause: status === 'success' ? 'success' : failure?.cause ?? 'execution',
    card: failure?.card ?? null,
    model: failure?.model ?? null,
    parameter: failure?.parameter ?? null,
    evidence: failure?.evidence ?? null,
  };
}

function transitionIdentity(result: TransitionOutcome): string {
  const { evidence: _evidence, ...deterministicDetail } = result;
  return JSON.stringify(deterministicDetail);
}

function emptyTotals(): Record<Cause, number> {
  return Object.fromEntries(CAUSES.map(cause => [cause, 0])) as Record<Cause, number>;
}

export function fixtureSetDigest(fixtures: Array<{ key: string; sha256: string }>): string {
  return sha256(`${JSON.stringify([...fixtures].sort((a, b) => a.key.localeCompare(b.key)))}\n`);
}

function deterministicView(report: Omit<DeviceCardAudit, 'hashes'> & { hashes: Omit<DeviceCardAudit['hashes'], 'deterministicOutcomeSha256'> }): unknown {
  return JSON.parse(JSON.stringify(report, (key, value) => (
    key === 'environment' || key === 'runtimeMs' || key === 'evidence' ? undefined : value
  )));
}

function deterministicDigest(report: Omit<DeviceCardAudit, 'hashes'> & { hashes: Omit<DeviceCardAudit['hashes'], 'deterministicOutcomeSha256'> }): string {
  return sha256(`${JSON.stringify(deterministicView(report))}\n`);
}

function commandVersion(command: string, args: string[], pattern: RegExp): string {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  return pattern.exec(output)?.[0] ?? 'unavailable';
}

export async function buildDeviceCardAudit(): Promise<DeviceCardAudit> {
  const [current, baselineBytes, sourcesBytes, ...manifestBytes] = await Promise.all([
    buildAggregateReport(),
    readFile(BASELINE_PATH),
    readFile(SOURCES_PATH),
    ...CORPORA.map(corpus => readFile(resolve(`benchmarks/corpus/${corpus}/manifest.json`))),
  ]);
  const baseline = JSON.parse(baselineBytes.toString('utf8')) as BaselineReport;
  const baselineFixtures = new Map(baseline.fixtures.map(fixture => [fixture.key, fixture]));

  const fixtures: AuditedFixture[] = current.fixtures.map(fixture => {
    const ngspice = engineAudit('ngspice', fixture);
    const spiceTs = engineAudit('spiceTs', fixture);
    const beforeFixture = baselineFixtures.get(fixture.key);
    if (!beforeFixture) throw new Error(`${fixture.key}: missing from accepted aggregate baseline`);
    const baselineFailure = beforeFixture.spiceTs.status === 'success'
      ? null
      : classifyFirstFailure(beforeFixture.spiceTs.error ?? 'no engine result', beforeFixture.declaredAnalyses);
    const from = transitionOutcome(beforeFixture.spiceTs.status, baselineFailure);
    const to = transitionOutcome(spiceTs.status, spiceTs.firstFailure);
    const deviceCardCoverage: AuditedFixture['deviceCardCoverage'] = spiceTs.status === 'success'
      ? 'completed-execution'
      : spiceTs.firstFailure?.cause === 'device/model'
        ? 'direct-device-model-gap'
        : spiceTs.firstFailure?.cause === 'execution' || spiceTs.firstFailure?.cause === 'convergence'
          ? 'reached-execution-failed'
          : 'blocked-before-execution';
    return {
      key: fixture.key,
      category: fixture.category,
      analyses: fixture.declaredAnalyses,
      input: fixture.input,
      ngspice,
      spiceTs,
      transition: { from, to, changed: transitionIdentity(from) !== transitionIdentity(to) },
      deviceCardCoverage,
    };
  });

  const totalsFor = (engine: EngineName): Record<Cause, number> => {
    const totals = emptyTotals();
    for (const fixture of fixtures) {
      const result = fixture[engine];
      totals[result.status === 'success' ? 'success' : result.firstFailure?.cause ?? 'execution'] += 1;
    }
    return totals;
  };
  const changed = fixtures.filter(fixture => fixture.transition.changed).length;
  const gains = fixtures.filter(fixture => fixture.transition.from.status !== 'success' && fixture.transition.to.status === 'success').length;
  const regressions = fixtures.filter(fixture => fixture.transition.from.status === 'success' && fixture.transition.to.status !== 'success').length;
  const coverage = Object.fromEntries(
    ['completed-execution', 'reached-execution-failed', 'direct-device-model-gap', 'blocked-before-execution'].map(state => [
      state,
      fixtures.filter(fixture => fixture.deviceCardCoverage === state).length,
    ]),
  ) as DeviceCardAudit['totals']['deviceCardCoverage'];

  const manifestsSha256 = Object.fromEntries(
    CORPORA.map((corpus, index) => [corpus, sha256(manifestBytes[index])]),
  ) as DeviceCardAudit['hashes']['manifestsSha256'];
  const hashesWithoutOutcome = {
    sourcesSha256: sha256(sourcesBytes),
    manifestsSha256,
    fixtureSetSha256: fixtureSetDigest(fixtures.map(fixture => ({ key: fixture.key, sha256: fixture.input.sha256 }))),
    baselineReportSha256: sha256(baselineBytes),
    baselineOutcomeSha256: baseline.outcomeSha256,
  };
  const base = {
    schemaVersion: 'spice-ts-device-card-audit/v1' as const,
    policy: {
      fixtureCount: 100 as const,
      input: 'byte-identical fixture bytes for both engines' as const,
      fixtureAdaptation: 'none' as const,
      perCircuitToleranceTuning: false as const,
      timing: 'single wall-clock execution per engine and fixture; descriptive only' as const,
    },
    commands: {
      generate: 'pnpm exec tsx benchmarks/device-card-audit/audit.ts',
      check: 'pnpm exec tsx benchmarks/device-card-audit/audit.ts --check',
      ngspice: 'ngspice -b -r <raw> <identical-fixture>',
      spiceTs: '@spice-ts/core simulate(<identical-fixture>)',
    },
    environment: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model ?? 'unknown', node: process.version },
    tools: { ...current.tools, ngspice: commandVersion('ngspice', ['--version'], /ngspice-\d+(?:\.\d+)*/i) },
    hashes: hashesWithoutOutcome,
    totals: {
      fixtures: 100 as const,
      ngspice: totalsFor('ngspice'),
      spiceTs: totalsFor('spiceTs'),
      runtimeMs: {
        ngspice: Number(fixtures.reduce((sum, fixture) => sum + fixture.ngspice.runtimeMs, 0).toFixed(3)),
        spiceTs: Number(fixtures.reduce((sum, fixture) => sum + fixture.spiceTs.runtimeMs, 0).toFixed(3)),
      },
      transitions: { changed, unchanged: 100 - changed, gains, regressions },
      deviceCardCoverage: coverage,
    },
    exclusions: {
      fixtureAdaptation: true as const,
      perCircuitToleranceTuning: true as const,
      waveformParityClaim: true as const,
      speedComparisonClaim: true as const,
      failuresAfterFirst: true as const,
    },
    gapRegistry: [
      { issue: 'https://github.com/mfiumara/spice-ts/issues/76', state: 'OPEN' as const, scope: 'unsupported cards, parser syntax, directives, and expressions' },
      { issue: 'https://github.com/mfiumara/spice-ts/issues/7', state: 'OPEN' as const, scope: 'transmission-line devices' },
      { issue: 'https://github.com/mfiumara/spice-ts/issues/226', state: 'OPEN' as const, scope: 'lossy LTRA transmission-line cards' },
      { issue: 'https://github.com/mfiumara/spice-ts/issues/5', state: 'OPEN' as const, scope: 'BJT and VBIC model coverage' },
      { issue: 'https://github.com/mfiumara/spice-ts/issues/3', state: 'OPEN' as const, scope: 'MOS, BSIM, and EKV model coverage' },
      { issue: 'https://github.com/mfiumara/spice-ts/issues/75', state: 'OPEN' as const, scope: 'noise, pole-zero, and distortion analyses' },
      { issue: 'https://github.com/mfiumara/spice-ts/issues/280', state: 'OPEN' as const, scope: 'newly exposed classic-corpus convergence and execution failures' },
      { issue: 'https://github.com/mfiumara/spice-ts/issues/289', state: 'OPEN' as const, scope: 'Xyce primitive DC output-symbol execution failures' },
    ],
    fixtures,
  };
  return {
    ...base,
    hashes: { ...hashesWithoutOutcome, deterministicOutcomeSha256: deterministicDigest(base) },
  };
}

function markdown(report: DeviceCardAudit): string {
  const formatTransition = (result: TransitionOutcome): string => {
    const outcome = result.cause === 'success' ? 'success' : `${result.status}/${result.cause}`;
    if (result.cause === 'success') return outcome;
    return `${outcome} [card=${result.card ?? 'n/a'}; model=${result.model ?? 'n/a'}; parameter=${result.parameter ?? 'n/a'}; diagnostic=${result.evidence?.replaceAll('|', '\\|') ?? 'n/a'}]`;
  };
  const rows = report.fixtures.map(fixture => {
    const format = (engine: EngineAudit): string => {
      if (engine.status === 'success') return `success (${engine.runtimeMs} ms)`;
      const failure = engine.firstFailure;
      return `${engine.status}/${failure?.cause} (${engine.runtimeMs} ms): ${failure?.evidence.replaceAll('|', '\\|')}`;
    };
    const failure = fixture.spiceTs.firstFailure;
    const detail = failure
      ? `card=${failure.card ?? 'n/a'}; model=${failure.model ?? 'n/a'}; parameter=${failure.parameter ?? 'n/a'}; [gap](${failure.owningGap})`
      : 'n/a';
    return `| ${fixture.key} | \`${fixture.input.sha256}\` | ${format(fixture.ngspice)} | ${format(fixture.spiceTs)} | ${detail} | ${formatTransition(fixture.transition.from)} → ${formatTransition(fixture.transition.to)} | ${fixture.deviceCardCoverage} |`;
  });
  const { totals } = report;
  return `# Unsupported device-card coverage audit\n\nThis audit reruns all 100 provenance-tracked fixtures byte-for-byte through ngspice-47 and spice-ts. It publishes execution coverage and first failures; it does not claim waveform parity, milestone completion, or speed superiority.\n\n## Results\n\n- ngspice first outcomes: ${CAUSES.map(cause => `${cause}=${totals.ngspice[cause]}`).join(', ')}.\n- spice-ts first outcomes: ${CAUSES.map(cause => `${cause}=${totals.spiceTs[cause]}`).join(', ')}.\n- Device-card reach: ${Object.entries(totals.deviceCardCoverage).map(([key, value]) => `${key}=${value}`).join(', ')}. Successes completed execution; convergence and execution failures reached execution; parser and analysis failures were blocked before execution. Any non-device/model first failure can hide a later device card that this audit intentionally does not infer.\n- First-failure transitions (status, cause, card, model, and parameter) from accepted aggregate baseline \`${report.hashes.baselineOutcomeSha256}\`: changed=${totals.transitions.changed}, unchanged=${totals.transitions.unchanged}, gains=${totals.transitions.gains}, regressions=${totals.transitions.regressions}.\n- Descriptive one-run totals: ngspice=${totals.runtimeMs.ngspice} ms; spice-ts=${totals.runtimeMs.spiceTs} ms. These timings are published, not compared as a performance claim.\n- Deterministic outcome SHA-256 (environment, runtimes, and diagnostic wording excluded): \`${report.hashes.deterministicOutcomeSha256}\`.\n\n## Reproduction and identity\n\n- Generate: \`${report.commands.generate}\`.\n- Check committed receipt: \`${report.commands.check}\`.\n- Input policy: ${report.policy.input}; adaptation=${report.policy.fixtureAdaptation}; per-circuit tolerance tuning=${report.policy.perCircuitToleranceTuning}.\n- Tools: ${report.tools.ngspice}; spice-ts ${report.tools.spiceTs}; pnpm ${report.tools.pnpm}; Node ${report.environment.node}.\n- Machine: ${report.environment.cpu}; ${report.environment.platform} ${report.environment.release} ${report.environment.arch}.\n- Fixture-set SHA-256: \`${report.hashes.fixtureSetSha256}\`.\n- benchmarks/SOURCES.md SHA-256: \`${report.hashes.sourcesSha256}\`.\n- Manifest SHA-256: ${Object.entries(report.hashes.manifestsSha256).map(([name, hash]) => `${name}=\`${hash}\``).join('; ')}.\n- Accepted aggregate receipt SHA-256: \`${report.hashes.baselineReportSha256}\`.\n\n## Classification and exclusions\n\nThe first hard diagnostic is classified as parser, device/model, analysis, convergence, or execution. Each spice-ts failure records card, model, parameter, and an owning open gap when extractable; non-applicable fields remain explicit as n/a. Later failures are excluded because changing or adapting fixtures to expose them would violate the byte-identity policy. Runtime variation, error wording, waveform parity, and any speed claim are excluded from the deterministic outcome.\n\nAll observed first failures map to the open gap registry below. Issue #289 was filed for the previously untracked four-fixture Xyce execution gap; no duplicate issue was filed for already-tracked failures.\n\n${report.gapRegistry.map(gap => `- [${gap.issue.split('/').at(-1)}](${gap.issue}) (${gap.state}): ${gap.scope}.`).join('\n')}\n\n## Per-fixture outcomes\n\n| Fixture | Input SHA-256 | ngspice | spice-ts | spice-ts first-failure detail | spice-ts transition | device-card reach |\n|---|---|---|---|---|---|---|\n${rows.join('\n')}\n\nEvery success, loss, transition, runtime, and first-failure exclusion is represented above. Status success means execution completed, not that waveforms match.\n\n## /poteto-mode receipt\n\nThe feature lane followed RED/GREEN/REFACTOR: the focused test first failed because the audit module did not exist; GREEN introduced only this isolated benchmark directory and reused the established 100-fixture dual-engine runner; REFACTOR centralized deterministic projection, classification, hashes, and Markdown rendering. The lower-surface design imports the existing runner rather than duplicating simulator execution or editing shared benchmark and simulator files.\n`;
}

function stableJson(report: DeviceCardAudit): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function comparable(report: DeviceCardAudit): string {
  return JSON.stringify(deterministicView({ ...report, hashes: {
    sourcesSha256: report.hashes.sourcesSha256,
    manifestsSha256: report.hashes.manifestsSha256,
    fixtureSetSha256: report.hashes.fixtureSetSha256,
    baselineReportSha256: report.hashes.baselineReportSha256,
    baselineOutcomeSha256: report.hashes.baselineOutcomeSha256,
  } }));
}

async function main(): Promise<void> {
  const report = await buildDeviceCardAudit();
  if (process.argv.includes('--check')) {
    const [committedJson, committedMarkdown] = await Promise.all([
      readFile(REPORT_PATH, 'utf8'),
      readFile(MARKDOWN_PATH, 'utf8'),
    ]);
    const committed = JSON.parse(committedJson) as DeviceCardAudit;
    if (comparable(committed) !== comparable(report)) throw new Error('committed deterministic audit differs from regenerated outcomes');
    if (committed.hashes.deterministicOutcomeSha256 !== report.hashes.deterministicOutcomeSha256) throw new Error('deterministic audit hash mismatch');
    if (committedMarkdown !== markdown(committed)) throw new Error('committed Markdown differs from committed JSON');
  } else {
    await Promise.all([
      writeFile(REPORT_PATH, stableJson(report)),
      writeFile(MARKDOWN_PATH, markdown(report)),
    ]);
  }
  process.stderr.write(`device-card audit: 100 fixtures; ${report.hashes.deterministicOutcomeSha256}\n`);
}

if (basename(process.argv[1] ?? '') === 'audit.ts') {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
