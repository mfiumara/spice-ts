#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, release } from 'node:os';
import { basename, resolve } from 'node:path';
import {
  buildClassicReport,
  runNativeNgspice,
  runNativeSpiceTs,
  type ClassicManifest,
  type ConvergenceStatus,
  type EngineStatus,
} from '../classic/report.js';

export const AUDIT_SCHEMA = 'spice-ts-classic-b-failure-audit/v1' as const;
export type FailureKind = 'parser-feature' | 'unsupported-analysis/device' | 'convergence' | 'execution';

export interface EngineOutcome {
  status: EngineStatus;
  convergence: ConvergenceStatus;
  error?: string;
}

export interface FailureClassification {
  kind: FailureKind;
  cause: string;
  signature: string;
}

export interface AuditFixture {
  id: string;
  inputSha256: string;
  ngspice: EngineOutcome;
  spiceTs: EngineOutcome;
  classification: FailureClassification | null;
  evidenceSha256: string;
}

export interface AuditTotals {
  fixtures: number;
  ngspice: Record<EngineStatus, number>;
  spiceTs: Record<EngineStatus, number>;
  classifications: Record<FailureKind | 'none', number>;
  parityCandidates: number;
  losses: number;
}

interface AuditReport {
  schemaVersion: typeof AUDIT_SCHEMA;
  corpus: {
    name: string;
    revision: string;
    fixtureCount: number;
    fixtureAdaptation: 'none';
  };
  tools: { ngspice: string; spiceTs: string; node: string; pnpm: string };
  machine: { platform: string; release: string; arch: string; cpu: string };
  commands: string[];
  issueLinks: Array<{ url: string; scope: string }>;
  limitations: string[];
  totals: AuditTotals;
  suiteEvidenceSha256: string;
  fixtures: AuditFixture[];
}

const ISSUE_LINKS = [
  { url: 'https://github.com/mfiumara/spice-ts/issues/75', scope: 'advanced analyses including pole-zero and distortion' },
  { url: 'https://github.com/mfiumara/spice-ts/issues/223', scope: 'AC-only independent-source parser crash' },
  { url: 'https://github.com/mfiumara/spice-ts/issues/224', scope: 'classic no-op directives and .options fields' },
  { url: 'https://github.com/mfiumara/spice-ts/issues/225', scope: 'compound independent-source syntax with DISTOF terms' },
  { url: 'https://github.com/mfiumara/spice-ts/issues/226', scope: 'lossy LTRA transmission-line device support' },
] as const;

const LIMITATIONS = [
  'The audit classifies the first unchanged-fixture failure exposed by the existing parser/simulator path. Later failures can remain masked.',
  'A spice-ts success is only a parity candidate here. This audit does not add tolerances or declare numeric parity.',
  'The upstream bjt-mixer-distortion fixture has no enabled analysis, so ngspice exits without raw analysis data and is counted as failed.',
  'Unsupported and failed outcomes remain losses. No fixture bytes, directives, models, or per-circuit tolerances are adapted.',
] as const;

function normalizedError(outcome: EngineOutcome): string {
  return outcome.error?.trim().replaceAll(/\s+/g, ' ') ?? '';
}

export function classifySpiceTsOutcome(outcome: EngineOutcome): FailureClassification | null {
  if (outcome.status === 'success') return null;
  const error = normalizedError(outcome);

  if (outcome.convergence === 'failed' || /converg|singular|timestep/i.test(error)) {
    return { kind: 'convergence', cause: 'solver-convergence', signature: 'convergence-error' };
  }
  if (/Lossy transmission line|\bLTRA\b.*unsupported/i.test(error)) {
    return { kind: 'unsupported-analysis/device', cause: 'ltra-device', signature: 'unsupported-ltra-card' };
  }
  if (/no spice-ts result for analyses:\s*pz/i.test(error)) {
    return { kind: 'unsupported-analysis/device', cause: 'pole-zero-analysis', signature: 'missing-result-pz' };
  }
  if (/Unsupported dot command: '\.width'/i.test(error)) {
    return { kind: 'parser-feature', cause: 'legacy-output-directive', signature: 'unsupported-dot-width' };
  }
  if (/Unsupported dot command: '\.opt'/i.test(error)) {
    return { kind: 'parser-feature', cause: 'legacy-options-directive', signature: 'unsupported-dot-opt' };
  }
  if (/Unsupported \.options field: 'limpts'/i.test(error)) {
    return { kind: 'parser-feature', cause: 'legacy-output-limit-option', signature: 'unsupported-option-limpts' };
  }
  if (/Unsupported \.options field: 'ACCT'/i.test(error)) {
    return { kind: 'parser-feature', cause: 'legacy-accounting-option', signature: 'unsupported-option-acct' };
  }
  if (/Unsupported \.options field: 'itl5'/i.test(error)) {
    return { kind: 'parser-feature', cause: 'legacy-iteration-option', signature: 'unsupported-option-itl5' };
  }
  if (/Cannot read properties of undefined.*trim.*\b[vi]\S*\s+\S+\s+\S+.*\bac\b/i.test(error)) {
    return { kind: 'parser-feature', cause: 'ac-only-independent-source', signature: 'ac-source-missing-dc-value' };
  }
  if (/Cannot parse number: '(?:sin|distof1)'/i.test(error)) {
    return { kind: 'parser-feature', cause: 'compound-independent-source', signature: 'compound-source-distof' };
  }
  if (/parse error|unsupported dot command|unsupported \.options field/i.test(error)) {
    return { kind: 'parser-feature', cause: 'other-parser-feature', signature: 'other-parser-error' };
  }
  return { kind: 'execution', cause: 'unclassified-execution', signature: 'execution-error' };
}

function stableFixtureEvidence(fixture: Omit<AuditFixture, 'evidenceSha256'>): object {
  return {
    id: fixture.id,
    inputSha256: fixture.inputSha256,
    ngspice: fixture.ngspice,
    spiceTs: fixture.spiceTs,
    classification: fixture.classification,
  };
}

export function evidenceHash(fixture: Omit<AuditFixture, 'evidenceSha256'> | AuditFixture): string {
  return createHash('sha256').update(JSON.stringify(stableFixtureEvidence(fixture))).digest('hex');
}

export function summarizeAudit(fixtures: AuditFixture[]): AuditTotals {
  const totals: AuditTotals = {
    fixtures: fixtures.length,
    ngspice: { success: 0, failed: 0, unsupported: 0 },
    spiceTs: { success: 0, failed: 0, unsupported: 0 },
    classifications: {
      'parser-feature': 0,
      'unsupported-analysis/device': 0,
      convergence: 0,
      execution: 0,
      none: 0,
    },
    parityCandidates: 0,
    losses: 0,
  };
  for (const fixture of fixtures) {
    totals.ngspice[fixture.ngspice.status] += 1;
    totals.spiceTs[fixture.spiceTs.status] += 1;
    totals.classifications[fixture.classification?.kind ?? 'none'] += 1;
    if (fixture.spiceTs.status === 'success') totals.parityCandidates += 1;
    else totals.losses += 1;
  }
  return totals;
}

function toolVersion(command: string, args: string[], pattern?: RegExp): string {
  const completed = spawnSync(command, args, { encoding: 'utf8' });
  if (completed.error) return 'unavailable';
  const output = `${completed.stdout}\n${completed.stderr}`.trim();
  return pattern?.exec(output)?.[0] ?? output.split(/\r?\n/).find(Boolean) ?? 'unknown';
}

function engineOutcome(engine: { status: EngineStatus; convergence: ConvergenceStatus; error?: string }): EngineOutcome {
  return {
    status: engine.status,
    convergence: engine.convergence,
    ...(engine.error ? { error: engine.error } : {}),
  };
}

export async function createAuditReport(): Promise<AuditReport> {
  const repoRoot = resolve('.');
  const manifest = JSON.parse(
    await readFile(resolve(repoRoot, 'benchmarks/corpus/classic/manifest.json'), 'utf8'),
  ) as ClassicManifest;
  const corePackage = JSON.parse(
    await readFile(resolve(repoRoot, 'packages/core/package.json'), 'utf8'),
  ) as { version: string };
  const ngspiceVersion = toolVersion('ngspice', ['--version'], /ngspice-\d+(?:\.\d+)*/i);
  if (ngspiceVersion !== 'ngspice-47') {
    throw new Error(`classic corpus-B audit requires ngspice-47, observed ${ngspiceVersion}`);
  }
  const comparison = await buildClassicReport(manifest, {
    readFixture: localPath => readFile(resolve(repoRoot, localPath)),
    runNgspice: runNativeNgspice,
    runSpiceTs: runNativeSpiceTs,
    tools: { ngspice: ngspiceVersion, spiceTs: corePackage.version },
  });
  const fixtures = comparison.fixtures.map(source => {
    const fixture: Omit<AuditFixture, 'evidenceSha256'> = {
      id: source.id,
      inputSha256: source.input.sha256,
      ngspice: engineOutcome(source.ngspice),
      spiceTs: engineOutcome(source.spiceTs),
      classification: classifySpiceTsOutcome(source.spiceTs),
    };
    return { ...fixture, evidenceSha256: evidenceHash(fixture) };
  });
  const suiteEvidenceSha256 = createHash('sha256')
    .update(fixtures.map(fixture => fixture.evidenceSha256).join('\n'))
    .digest('hex');

  return {
    schemaVersion: AUDIT_SCHEMA,
    corpus: {
      name: manifest.source.name,
      revision: manifest.source.revision,
      fixtureCount: manifest.circuits.length,
      fixtureAdaptation: 'none',
    },
    tools: {
      ngspice: ngspiceVersion,
      spiceTs: corePackage.version,
      node: process.version,
      pnpm: toolVersion('pnpm', ['--version']),
    },
    machine: {
      platform: platform(),
      release: release(),
      arch: arch(),
      cpu: cpus()[0]?.model ?? 'unknown',
    },
    commands: [
      'pnpm install --frozen-lockfile',
      'pnpm build',
      'pnpm exec tsx benchmarks/corpus/classic-b-audit/audit.ts --output benchmarks/corpus/classic-b-audit/report.json --markdown benchmarks/corpus/classic-b-audit/README.md',
      'pnpm exec tsx benchmarks/corpus/classic-b-audit/audit.ts --check',
      'pnpm exec tsx --test benchmarks/corpus/classic-b-audit/audit.test.ts',
      'pnpm lint',
      'pnpm test',
      'pnpm bench:accuracy',
      'git diff --check',
    ],
    issueLinks: [...ISSUE_LINKS],
    limitations: [...LIMITATIONS],
    totals: summarizeAudit(fixtures),
    suiteEvidenceSha256,
    fixtures,
  };
}

export function serializeAudit(report: AuditReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function renderAuditMarkdown(report: AuditReport): string {
  const lines = [
    '# Classic SPICE3 corpus-B failure audit',
    '',
    `Evidence suite SHA-256: \`${report.suiteEvidenceSha256}\`.`,
    '',
    '## Scope and totals',
    '',
    `All ${report.totals.fixtures} provenance-tracked fixtures ran unchanged through the existing ngspice and spice-ts paths. Fixture adaptation: ${report.corpus.fixtureAdaptation}.`,
    '',
    `- ngspice: ${report.totals.ngspice.success} success, ${report.totals.ngspice.failed} failed, ${report.totals.ngspice.unsupported} unsupported.`,
    `- spice-ts: ${report.totals.spiceTs.success} success, ${report.totals.spiceTs.failed} failed, ${report.totals.spiceTs.unsupported} unsupported.`,
    `- spice-ts losses: ${report.totals.losses}. Parser feature ${report.totals.classifications['parser-feature']}; unsupported analysis/device ${report.totals.classifications['unsupported-analysis/device']}; convergence ${report.totals.classifications.convergence}; execution ${report.totals.classifications.execution}.`,
    `- spice-ts parity candidates: ${report.totals.parityCandidates}. These are not parity claims because this audit does not compare numeric tolerances.`,
    '',
    '## Environment',
    '',
    `- ngspice: \`${report.tools.ngspice}\``,
    `- spice-ts: \`${report.tools.spiceTs}\``,
    `- Node: \`${report.tools.node}\`; pnpm: \`${report.tools.pnpm}\``,
    `- Machine: \`${report.machine.platform} ${report.machine.release} ${report.machine.arch}\`, \`${report.machine.cpu}\``,
    '',
    '## Commands',
    '',
    ...report.commands.map(command => `- \`${command}\``),
    '',
    '## Every fixture outcome',
    '',
    '| Fixture | ngspice | spice-ts | Classification | Cause | Evidence SHA-256 |',
    '|---|---|---|---|---|---|',
    ...report.fixtures.map(fixture => `| ${fixture.id} | ${fixture.ngspice.status} | ${fixture.spiceTs.status} | ${fixture.classification?.kind ?? 'none'} | ${fixture.classification?.cause ?? 'parity candidate'} | \`${fixture.evidenceSha256}\` |`),
    '',
    '## Failure evidence',
    '',
    ...report.fixtures.filter(fixture => fixture.spiceTs.status !== 'success').flatMap(fixture => [
      `### ${fixture.id}`,
      '',
      `- Input SHA-256: \`${fixture.inputSha256}\``,
      `- ngspice: ${fixture.ngspice.status}, ${fixture.ngspice.convergence}${fixture.ngspice.error ? `, \`${fixture.ngspice.error}\`` : ''}`,
      `- spice-ts: ${fixture.spiceTs.status}, ${fixture.spiceTs.convergence}, ${fixture.classification?.kind}/${fixture.classification?.cause}, signature \`${fixture.classification?.signature}\``,
      `- Error: \`${fixture.spiceTs.error ?? 'none'}\``,
      `- Evidence SHA-256: \`${fixture.evidenceSha256}\``,
      '',
    ]),
    '## Gap issues',
    '',
    ...report.issueLinks.map(issue => `- ${issue.url}: ${issue.scope}.`),
    '',
    '## Limitations',
    '',
    ...report.limitations.map(limitation => `- ${limitation}`),
    '',
  ];
  return lines.join('\n');
}

function stableReport(report: AuditReport): object {
  return {
    schemaVersion: report.schemaVersion,
    corpus: report.corpus,
    totals: report.totals,
    suiteEvidenceSha256: report.suiteEvidenceSha256,
    fixtures: report.fixtures,
  };
}

async function main(): Promise<void> {
  const report = await createAuditReport();
  const outputIndex = process.argv.indexOf('--output');
  const markdownIndex = process.argv.indexOf('--markdown');
  const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
  const markdownPath = markdownIndex >= 0 ? process.argv[markdownIndex + 1] : undefined;
  if (outputIndex >= 0 && !outputPath) throw new Error('--output requires a path');
  if (markdownIndex >= 0 && !markdownPath) throw new Error('--markdown requires a path');
  if (outputPath) await writeFile(resolve(outputPath), serializeAudit(report));
  if (markdownPath) await writeFile(resolve(markdownPath), renderAuditMarkdown(report));

  if (process.argv.includes('--check')) {
    const committed = JSON.parse(
      await readFile(resolve('benchmarks/corpus/classic-b-audit/report.json'), 'utf8'),
    ) as AuditReport;
    assertStableReport(committed, report);
  } else if (!outputPath && !markdownPath) {
    process.stdout.write(serializeAudit(report));
  }
  process.stderr.write(`classic corpus-B audit: ${report.totals.losses} losses; evidence ${report.suiteEvidenceSha256}\n`);
}

function assertStableReport(committed: AuditReport, current: AuditReport): void {
  if (JSON.stringify(stableReport(committed)) !== JSON.stringify(stableReport(current))) {
    throw new Error('classic corpus-B stable audit evidence differs; regenerate and review every outcome');
  }
}

if (basename(process.argv[1] ?? '') === 'audit.ts') {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
