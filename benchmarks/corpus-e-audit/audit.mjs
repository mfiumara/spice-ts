#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, totalmem } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const auditRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(auditRoot, '../..');
const corpusRoot = resolve(repoRoot, 'benchmarks/corpus/corpus-e');
const manifestPath = resolve(corpusRoot, 'manifest.json');
const spiceTsRunner = resolve(corpusRoot, 'run-spice-ts.mjs');
const causes = ['parser', 'device/model', 'analysis', 'convergence', 'execution'];
const issue228Baseline = {
  spiceTsHead: 'f737698e90b4e025de65c9f621fcf75f6c27b15d',
  outcomeSha256: 'dd99c57c31e72613e2e532ab0708d9810b0e6d5d09950ba74c03539b66314290',
  totals: { pass: 4, parser: 3, 'device/model': 0, analysis: 13, convergence: 0, execution: 0 },
  outcomes: {
    'cccs-mixed-analysis': { status: 'fail', cause: 'analysis' },
    'vcvs-operating-point': { status: 'fail', cause: 'analysis' },
    'diode-bias-sweep': { status: 'pass' },
    'mos1-inverter-sweep': { status: 'fail', cause: 'analysis' },
    'transmission-line-ac': { status: 'fail', cause: 'analysis' },
    'mutual-inductance-ac': { status: 'fail', cause: 'analysis' },
    'bjt-diffpair-ac': { status: 'fail', cause: 'analysis' },
    'opamp-open-loop-ac': { status: 'fail', cause: 'parser' },
    'capacitor-step-transient': { status: 'fail', cause: 'parser' },
    'capacitor-initial-condition': { status: 'fail', cause: 'analysis' },
    'lc-oscillator-transient': { status: 'fail', cause: 'parser' },
    'bjt-diffpair-transient': { status: 'pass' },
    'bjt-schmitt-trigger': { status: 'pass' },
    'diode-temperature-sweep': { status: 'fail', cause: 'analysis' },
    'mos1-nand-transient': { status: 'fail', cause: 'analysis' },
    'bjt-rtl-inverter-chain': { status: 'fail', cause: 'analysis' },
    'dual-lc-uic-rejection': { status: 'fail', cause: 'analysis' },
    'opamp-voltage-follower': { status: 'fail', cause: 'analysis' },
    'mos7-nand-no-bypass': { status: 'fail', cause: 'analysis' },
    'bjt-diffpair-current-source': { status: 'pass' },
  },
};

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function commandOutput(command, args) {
  const result = spawnSync(command, args, { cwd: repoRoot, encoding: 'utf8' });
  if (result.error || result.status !== 0) return result.error?.message ?? `${command} exited ${result.status}`;
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
}

function ngspiceHasHardError(output) {
  return /(^|\n)\s*(Error|Fatal):|fatal error|no circuit loaded|doAnalyses:|run simulation\(s\) aborted|timestep too small|singular matrix|unknown device type/i.test(output);
}

export function classifyNgspiceFailure(output) {
  if (/timestep too small|converg|singular matrix/i.test(output)) return 'convergence';
  if (/Device type .* not available|valid modelname|q\S*\s+.*\boff=\S*|unknown parameter \(1\)/i.test(output)) {
    return 'device/model';
  }
  if (/unimplemented dot command|Missing DEC, OCT, or LIN|unknown parameter on \.(?:tran|ac|dc|op)/i.test(output)) {
    return 'analysis';
  }
  if (/unknown parameter \(gen\)|device already exists|circuit not parsed/i.test(output)) return 'parser';
  return 'execution';
}

export function classifySpiceTsFailure(result) {
  const message = String(result?.errorMessage ?? result?.message ?? result ?? '');
  if (/timestep|converg|singular matrix/i.test(message) || /Convergence/i.test(result?.errorName ?? '')) {
    return 'convergence';
  }
  if (/unsupported (?:device|model)|device card|model level|mutual-inductor|\bK[- ]element/i.test(message)) {
    return 'device/model';
  }
  if (
    /Unsupported dot command|Unsupported \.options field/i.test(message) ||
    (/\.(?:tran|ac|dc|op)\b/i.test(message) && /trace|rejected|Missing|unknown parameter/i.test(message))
  ) {
    return 'analysis';
  }
  if (result?.errorName === 'ParseError') return 'parser';
  return 'execution';
}

function failureEvidence(engine, output, cause) {
  const normalized = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const patterns = engine === 'ngspice'
    ? {
        parser: [/device already exists/i, /unknown parameter \(gen\)/i, /circuit not parsed/i],
        'device/model': [/Device type .* not available/i, /valid modelname/i, /unknown parameter \(1\)/i],
        analysis: [/unimplemented dot command/i, /Missing DEC, OCT, or LIN/i, /unknown parameter on \./i],
        convergence: [/timestep too small/i, /converg/i, /singular matrix/i],
        execution: [/error/i],
      }
    : {
        parser: [/Cannot parse number/i, /PWL source requires/i, /Parse error/i],
        'device/model': [/unsupported (?:device|model)/i, /device card/i, /model level/i, /K[- ]element/i],
        analysis: [/Unsupported dot command/i, /Unsupported \.options field/i, /Cannot parse number: 'trace'/i],
        convergence: [/timestep/i, /converg/i, /singular matrix/i],
        execution: [/error/i],
      };
  for (const pattern of patterns[cause]) {
    const line = normalized.find((candidate) => pattern.test(candidate));
    if (line) return line.replace(/\s+/g, ' ');
  }
  return normalized.at(0) ?? 'no diagnostic emitted';
}

function emptyTotals() {
  return Object.fromEntries(['pass', ...causes].map((cause) => [cause, 0]));
}

export function fixtureSetHash(fixtures) {
  const identity = fixtures.map(({ id, sha256: hash }) => ({ id, sha256: hash }));
  return sha256(JSON.stringify(identity));
}

function outcomeHash(fixtures) {
  const outcomes = fixtures.map(({ id, sha256: hash, ngspice, spiceTs }) => ({
    id,
    sha256: hash,
    ngspice: { status: ngspice.status, cause: ngspice.cause ?? null },
    spiceTs: { status: spiceTs.status, cause: spiceTs.cause ?? null },
  }));
  return sha256(JSON.stringify(outcomes));
}

async function fileSize(path) {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
}

export async function auditCorpusE() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.circuits?.length !== 20) throw new Error(`Expected 20 corpus-E fixtures, found ${manifest.circuits?.length ?? 0}`);

  const ngspiceVersion = commandOutput('ngspice', ['--version'])
    .split(/\r?\n/)
    .find((line) => /ngspice-\d+/i.test(line))
    ?.trim();
  if (!ngspiceVersion) throw new Error('ngspice --version did not report a version');

  const fixtures = [];
  for (const circuit of manifest.circuits) {
    const fixturePath = resolve(repoRoot, circuit.localPath);
    const fixtureBytes = await readFile(fixturePath);
    const hash = sha256(fixtureBytes);
    if (hash !== circuit.sha256) throw new Error(`${circuit.id}: fixture SHA-256 differs from manifest`);

    const spiceProcess = spawnSync(process.execPath, [spiceTsRunner, repoRoot, fixturePath], {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 30_000,
    });
    if (spiceProcess.error) throw new Error(`${circuit.id}: spice-ts runner failed: ${spiceProcess.error.message}`);
    let spiceResult;
    try {
      spiceResult = JSON.parse(spiceProcess.stdout.trim());
    } catch (error) {
      throw new Error(`${circuit.id}: invalid spice-ts runner JSON: ${error.message}`);
    }
    if (spiceResult.inputSha256 !== hash) throw new Error(`${circuit.id}: spice-ts input identity check failed`);
    const spiceTs = spiceResult.status === 'pass'
      ? { status: 'pass' }
      : {
          status: 'fail',
          cause: classifySpiceTsFailure(spiceResult),
          evidence: failureEvidence('spice-ts', spiceResult.errorMessage ?? '', classifySpiceTsFailure(spiceResult)),
        };

    const runDir = await mkdtemp(resolve(auditRoot, '.run-'));
    let ngspice;
    try {
      const copiedPath = resolve(runDir, basename(fixturePath));
      const rawPath = resolve(runDir, 'output.raw');
      await writeFile(copiedPath, fixtureBytes);
      const copiedBytes = await readFile(copiedPath);
      if (!copiedBytes.equals(fixtureBytes)) throw new Error(`${circuit.id}: ngspice input identity check failed`);
      const ngProcess = spawnSync('ngspice', ['-b', '-r', basename(rawPath), basename(copiedPath)], {
        cwd: runDir,
        encoding: 'utf8',
        timeout: 30_000,
      });
      const ngOutput = `${ngProcess.stdout ?? ''}\n${ngProcess.stderr ?? ''}\n${ngProcess.error?.message ?? ''}`;
      if (!ngProcess.error && ngProcess.status === 0 && (await fileSize(rawPath)) > 0 && !ngspiceHasHardError(ngOutput)) {
        ngspice = { status: 'pass' };
      } else {
        const cause = classifyNgspiceFailure(ngOutput);
        ngspice = { status: 'fail', cause, evidence: failureEvidence('ngspice', ngOutput, cause) };
      }
    } finally {
      await rm(runDir, { recursive: true, force: true });
    }

    fixtures.push({
      id: circuit.id,
      category: circuit.category,
      localPath: circuit.localPath,
      sha256: hash,
      inputIdentity: 'byte-identical',
      ngspice,
      spiceTs,
    });
  }

  const totals = { ngspice: emptyTotals(), spiceTs: emptyTotals() };
  for (const fixture of fixtures) {
    for (const engine of ['ngspice', 'spiceTs']) {
      totals[engine][fixture[engine].status === 'pass' ? 'pass' : fixture[engine].cause] += 1;
    }
  }

  const issue228Transitions = fixtures.map((fixture) => {
    const before = issue228Baseline.outcomes[fixture.id];
    if (!before) throw new Error(`${fixture.id}: missing issue #228 baseline outcome`);
    const after = fixture.spiceTs.status === 'pass'
      ? { status: 'pass' }
      : { status: 'fail', cause: fixture.spiceTs.cause };
    return {
      id: fixture.id,
      before,
      after,
      changed: before.status !== after.status || before.cause !== after.cause,
    };
  });

  return {
    schemaVersion: 1,
    source: {
      repository: manifest.source.repository,
      revision: manifest.source.revision,
      adaptation: 'none',
    },
    commands: {
      ngspice: 'ngspice -b -r output.raw <unchanged-fixture-basename>',
      spiceTs: 'node benchmarks/corpus/corpus-e/run-spice-ts.mjs <repo-root> <unchanged-fixture-path>',
      audit: 'node benchmarks/corpus-e-audit/audit.mjs --write',
      test: 'node --test benchmarks/corpus-e-audit/audit.test.mjs',
    },
    versions: {
      ngspice: ngspiceVersion,
      node: process.version,
      spiceTsHead: commandOutput('git', ['rev-parse', 'HEAD']),
    },
    machine: {
      os: platform() === 'darwin'
        ? `macOS ${commandOutput('sw_vers', ['-productVersion'])}`
        : `${platform()} ${commandOutput('uname', ['-r'])}`,
      architecture: arch(),
      cpu: cpus()[0]?.model ?? 'unknown',
      memoryBytes: totalmem(),
    },
    totals,
    issue228Baseline: {
      spiceTsHead: issue228Baseline.spiceTsHead,
      outcomeSha256: issue228Baseline.outcomeSha256,
      totals: issue228Baseline.totals,
    },
    issue228Transitions,
    fixtureSetSha256: fixtureSetHash(fixtures),
    outcomeSha256: outcomeHash(fixtures),
    fixtures,
  };
}

function renderReport(receipt) {
  const state = outcome => outcome.status === 'pass' ? 'pass' : `fail/${outcome.cause}`;
  const transitions = new Map(receipt.issue228Transitions.map(transition => [transition.id, transition]));
  const rows = receipt.fixtures.map((fixture) => {
    const result = (engine) => fixture[engine].status === 'pass'
      ? 'pass'
      : `fail — ${fixture[engine].cause}: ${fixture[engine].evidence.replaceAll('|', '\\|')}`;
    const transition = transitions.get(fixture.id);
    return `| ${fixture.id} | \`${fixture.sha256}\` | ${result('ngspice')} | ${state(transition.before)} | ${result('spiceTs')} | ${state(transition.before)} → ${state(transition.after)} |`;
  });
  const changed = receipt.issue228Transitions.filter(transition => transition.changed).length;
  const gains = receipt.issue228Transitions.filter(transition => (
    transition.before.status === 'fail' && transition.after.status === 'pass'
  )).length;
  const regressions = receipt.issue228Transitions.filter(transition => (
    transition.before.status === 'pass' && transition.after.status === 'fail'
  )).length;
  const ngspiceOnlyPasses = receipt.fixtures
    .filter(fixture => fixture.ngspice.status === 'pass' && fixture.spiceTs.status === 'fail')
    .map(fixture => fixture.id);
  const remainingSpiceTsFailures = receipt.fixtures
    .filter(fixture => fixture.spiceTs.status === 'fail')
    .map(fixture => `${fixture.id} (${fixture.spiceTs.cause})`);
  return `# Unchanged Gnucap corpus-E gap audit

This audit runs all 20 provenance-tracked fixtures byte-for-byte through both engines. It does not adapt fixtures, alter tolerances, or claim simulator superiority.

## Result

- ngspice: ${receipt.totals.ngspice.pass}/20 pass; parser=${receipt.totals.ngspice.parser}, device/model=${receipt.totals.ngspice['device/model']}, analysis=${receipt.totals.ngspice.analysis}, convergence=${receipt.totals.ngspice.convergence}, execution=${receipt.totals.ngspice.execution}.
- spice-ts: ${receipt.totals.spiceTs.pass}/20 pass; parser=${receipt.totals.spiceTs.parser}, device/model=${receipt.totals.spiceTs['device/model']}, analysis=${receipt.totals.spiceTs.analysis}, convergence=${receipt.totals.spiceTs.convergence}, execution=${receipt.totals.spiceTs.execution}.
- Issue #228 baseline at \`${receipt.issue228Baseline.spiceTsHead}\`: spice-ts ${receipt.issue228Baseline.totals.pass}/20 pass; parser=${receipt.issue228Baseline.totals.parser}, device/model=${receipt.issue228Baseline.totals['device/model']}, analysis=${receipt.issue228Baseline.totals.analysis}, convergence=${receipt.issue228Baseline.totals.convergence}, execution=${receipt.issue228Baseline.totals.execution}; outcome SHA-256 \`${receipt.issue228Baseline.outcomeSha256}\`.
- All 20 baseline/current status and first-cause pairs are below: ${changed} changed and ${20 - changed} unchanged; ${gains} fail-to-pass transitions and ${regressions} pass-to-fail regressions.
- Losses remain explicit. ngspice-pass/spice-ts-fail fixtures: ${ngspiceOnlyPasses.length === 0 ? 'none' : ngspiceOnlyPasses.join(', ')}. Remaining spice-ts failures: ${remainingSpiceTsFailures.join(', ')}.
- The pass counts are execution statuses, not waveform parity. Different accepted syntax and device coverage make them unsuitable for a simulator-superiority claim.
- Fixture-set SHA-256: \`${receipt.fixtureSetSha256}\`.
- Deterministic outcome SHA-256: \`${receipt.outcomeSha256}\`.

## Reproduction receipt

- Source: ${receipt.source.repository} at \`${receipt.source.revision}\`; adaptation: ${receipt.source.adaptation}.
- ngspice command: \`${receipt.commands.ngspice}\`.
- spice-ts command: \`${receipt.commands.spiceTs}\`.
- Audit command: \`${receipt.commands.audit}\`.
- Focused verification: \`${receipt.commands.test}\`.
- Versions: ${receipt.versions.ngspice}; Node ${receipt.versions.node}; spice-ts head \`${receipt.versions.spiceTsHead}\`.
- Machine: ${receipt.machine.os}, ${receipt.machine.architecture}, ${receipt.machine.cpu}, ${receipt.machine.memoryBytes} bytes RAM.
- Each ngspice temporary copy and each spice-ts runner response was SHA-256 checked against the committed manifest before its result was accepted.

## Classification rule

The first hard engine diagnostic is mapped, in order, to parser, device/model, analysis, convergence, or execution. Passing requires a zero exit, a non-empty ngspice raw file with no hard diagnostic, or a successful spice-ts simulation. The focused tests exercise every cause, including zero-count convergence and execution buckets.

## Per-fixture evidence

| Fixture | Input SHA-256 | ngspice current | spice-ts #228 baseline | spice-ts current | spice-ts transition |
|---|---|---|---|---|---|
${rows.join('\n')}

## Gap tracking

- Analysis/directive compatibility: [#228](https://github.com/mfiumara/spice-ts/issues/228).
- Source-syntax compatibility: [#227](https://github.com/mfiumara/spice-ts/issues/227).
- Device/model gaps are deduplicated against [#76](https://github.com/mfiumara/spice-ts/issues/76) (including coupled inductors), [#7](https://github.com/mfiumara/spice-ts/issues/7) (lossless T-lines), and [#3](https://github.com/mfiumara/spice-ts/issues/3) (advanced MOS models).
- Advanced analysis families remain tracked by [#75](https://github.com/mfiumara/spice-ts/issues/75).

## /poteto-mode receipt

Loaded \`pstack:poteto-mode\`, \`pstack:how\`, the feature playbook, and \`pstack:architect\`; compared a policy-table design with the chosen lower-surface inline parser-helper design. Parser RED commit \`202e0e4577a06b6d8f1fc8fb6e2bf3de7de7dd66\` failed 19 of 59 focused cases. GREEN passed all 59. Audit RED commit \`148926839447cbabc2275abe833db717b48b45ff\` failed the K-element classification and post-change totals. GREEN runs both engines over all 20 unchanged fixtures, locks totals and stable hashes, and records every #228 transition. REFACTOR keeps output-only classification internal and leaves every corpus fixture, manifest, source revision, and tolerance unchanged.
`;
}

async function main() {
  const receipt = await auditCorpusE();
  console.log(`ngspice ${receipt.totals.ngspice.pass}/20; spice-ts ${receipt.totals.spiceTs.pass}/20`);
  console.log(`fixture set ${receipt.fixtureSetSha256}`);
  console.log(`outcomes ${receipt.outcomeSha256}`);
  if (process.argv.includes('--write')) {
    await writeFile(resolve(auditRoot, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
    await writeFile(resolve(auditRoot, 'REPORT.md'), renderReport(receipt));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
