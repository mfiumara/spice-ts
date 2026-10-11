import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { appendFile, cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { describe, it } from 'node:test';
import { resolve } from 'node:path';
import {
  comparisonMethodLines,
  matchedPointEnvelope,
  preflightAggregateInputs,
  runBoundedSpiceTs,
  SPICE_TS_TIMEOUT_MS,
  validateAggregateAccounting,
  verifyCommittedArtifacts,
  writeAggregateArtifacts,
} from './aggregate-report.js';
import { runNativeSpiceTs } from './corpus/classic/report.js';

const JSON_PATH = resolve('benchmarks/aggregate-report.json');
const MARKDOWN_PATH = resolve('benchmarks/AGGREGATE_PARITY.md');
const SCRIPT_PATH = resolve('benchmarks/aggregate-report.ts');
const TSX_PATH = resolve('node_modules/.bin/tsx');
const CORPORA = ['ngspice', 'classic', 'xyce', 'corpus-d', 'corpus-e'];
const FAIL_FAST_LIMIT_MS = 30_000;

/** Copies the aggregate inputs and committed artifacts into an isolated repository-shaped root. */
async function isolatedRoot(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), 'spice-ts-aggregate-test-'));
  await Promise.all(CORPORA.map(corpus => cp(
    resolve(`benchmarks/corpus/${corpus}`),
    resolve(root, `benchmarks/corpus/${corpus}`),
    { recursive: true },
  )));
  await Promise.all(['SOURCES.md', 'aggregate-report.json', 'AGGREGATE_PARITY.md'].map(name => cp(
    resolve('benchmarks', name),
    resolve(root, 'benchmarks', name),
  )));
  return root;
}

async function treeDigest(directory: string): Promise<string> {
  const hash = createHash('sha256');
  const visit = async (path: string): Promise<void> => {
    const entries = (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const child = resolve(path, entry.name);
      hash.update(child);
      if (entry.isDirectory()) await visit(child);
      else hash.update(await readFile(child));
    }
  };
  await visit(directory);
  return hash.digest('hex');
}

interface CheckRun { code: number | null; elapsedMs: number; output: string }

function runCheck(cwd: string): Promise<CheckRun> {
  return new Promise(done => {
    const started = Date.now();
    const child = spawn(TSX_PATH, [SCRIPT_PATH, '--check'], { cwd, detached: true });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    // Stop only this run's own process group if it does not fail fast.
    const timer = setTimeout(() => process.kill(-(child.pid as number), 'SIGTERM'), FAIL_FAST_LIMIT_MS);
    child.on('exit', code => {
      clearTimeout(timer);
      done({ code, elapsedMs: Date.now() - started, output });
    });
  });
}

async function committedArtifacts(): Promise<{ json: string; markdown: string }> {
  const [json, markdown] = await Promise.all([
    readFile(JSON_PATH, 'utf8'),
    readFile(MARKDOWN_PATH, 'utf8'),
  ]);
  return { json, markdown };
}

describe('aggregate report artifact verification', () => {
  it('accounts for exactly 20 unique fixtures from each of five corpora', async () => {
    const { json } = await committedArtifacts();
    const report = JSON.parse(json);

    assert.doesNotThrow(() => validateAggregateAccounting(report));
    assert.deepEqual(report.totals.corpusFixtures, {
      ngspice: 20,
      classic: 20,
      xyce: 20,
      'corpus-d': 20,
      'corpus-e': 20,
    });
  });

  it('commits the transition ledger against the latest accepted report', async () => {
    const { json } = await committedArtifacts();
    const report = JSON.parse(json);

    assert.equal(report.comparisonToPrevious.issueUrl, 'https://github.com/mfiumara/spice-ts/issues/321');
    assert.equal(report.comparisonToPrevious.pullRequestUrl, 'https://github.com/mfiumara/spice-ts/pull/325');
    assert.equal(report.comparisonToPrevious.headSha, 'ad7ba71b65848053afa7bc64ba22fd989ef89ca4');
    assert.equal(report.comparisonToPrevious.outcomeSha256, '68aa8e2e7b78b82f801da84cf5c88c489634d203f44bca5df9345a1946deddb9');
    assert.deepEqual(
      report.comparisonToPrevious.statusTransitions.map((transition: Record<string, string>) => [
        transition.engine,
        transition.fixture,
        transition.from,
        transition.to,
      ]),
      [
        ['spiceTs', 'classic/diode-distortion', 'failed', 'success'],
        ['spiceTs', 'ngspice/vbic-fo', 'unsupported', 'success'],
        ['spiceTs', 'ngspice/hfet-inverter', 'unsupported', 'success'],
        ['spiceTs', 'classic/bjt-noise', 'unsupported', 'success'],
        ['spiceTs', 'classic/resistor-noise', 'unsupported', 'success'],
        ['spiceTs', 'xyce/inductor-transient', 'failed', 'success'],
        ['spiceTs', 'ngspice/probe-ac', 'unsupported', 'success'],
        ['spiceTs', 'classic/bjt-mixer-distortion', 'unsupported', 'failed'],
        ['spiceTs', 'ngspice/mesa-oscillator', 'unsupported', 'success'],
      ],
    );
    assert.deepEqual(report.totals.ngspice, { success: 52, failed: 9, unsupported: 39 });
    assert.deepEqual(report.totals.spiceTs, { success: 63, failed: 1, unsupported: 36 });
    assert.equal(report.totals.comparedAnalyses, 70);
    assert.equal(report.totals.comparedFixtures, 51);
    const vbicAc = report.fixtures.find((fixture: { key: string }) => fixture.key === 'ngspice/vbic-common-emitter-ac');
    assert.equal(vbicAc.spiceTs.status, 'success');
    assert.deepEqual(vbicAc.comparisons.map((comparison: { analysis: string }) => comparison.analysis), ['ac', 'pz']);
    assert.ok(vbicAc.comparisons[0].metrics.signals['i(vmeas)'].relativeError.max < 1e-6);
    // Pencil-eigenvalue .pz (#451, PR #466): the same 7 poles and 6 zeros as ngspice, each within 1e-6 relative.
    const vbicPz = Object.entries(vbicAc.comparisons[1].metrics.signals as Record<string, { status: string; relativeError: { max: number } }>);
    assert.equal(vbicPz.filter(([name]) => name.startsWith('v(pole(')).length, 7);
    assert.equal(vbicPz.filter(([name]) => name.startsWith('v(zero(')).length, 6);
    for (const [name, signal] of vbicPz) {
      assert.equal(signal.status, 'compared', name);
      assert.ok(signal.relativeError.max < 1e-6, `${name} relative max ${signal.relativeError.max}`);
    }
    assert.ok(report.comparisonToPrevious.metricTransitions.some((text: string) => text.includes('PR #466') && text.includes('PR #463') && text.includes('PR #471')));
    // VBIC substrate terminal (#453, PR #473): the PZ abs envelope moves to pole(1) at 7175.3, with every pole and zero closer to ngspice.
    assert.ok(report.comparisonToPrevious.metricTransitions.some((text: string) => text.includes('PR #476') && text.includes('PR #473') && text.includes('PR #481') && text.includes('7175.34033203125')));
    assert.equal(vbicAc.comparisons[1].metrics.signals['v(pole(1))'].absoluteError.max, report.matchedPointEnvelope.maximumAbsoluteError);
    for (const key of ['ngspice/mos6-inverter-transient', 'ngspice/mos6-simple-inverter-transient', 'classic/mos6-inverter-chain']) {
      const mos6 = report.fixtures.find((fixture: { key: string }) => fixture.key === key);
      const worst = Math.max(...Object.values(mos6.comparisons[0].metrics.signals as Record<string, { absoluteError: { max: number } }>).map(signal => signal.absoluteError.max));
      assert.ok(worst < 0.3, `${key} worst absolute max ${worst}`);
    }
    assert.ok(report.comparisonToPrevious.metricTransitions.some((text: string) => text.includes('PR #449') && text.includes('PR #457') && text.includes('PR #455')));
    const inductor = report.fixtures.find((fixture: { key: string }) => fixture.key === 'xyce/inductor-transient');
    assert.equal(inductor.spiceTs.status, 'success');
    assert.ok(inductor.gapIssues.includes('https://github.com/mfiumara/spice-ts/issues/366'));
    const distortion = report.fixtures.find((fixture: { key: string }) => fixture.key === 'classic/diode-distortion');
    assert.equal(distortion.spiceTs.status, 'success');
    assert.equal(distortion.spiceTs.error, undefined);
    assert.deepEqual(
      distortion.comparisons.map((comparison: { analysis: string; signals: string[] }) => [comparison.analysis, comparison.signals]),
      Array.from({ length: 3 }, () => ['disto', ['i(vcc)', 'i(vcc2)', 'v(1)', 'v(2)', 'v(3)']]),
    );
    for (const comparison of distortion.comparisons) {
      assert.deepEqual(comparison.metrics.grid, { spiceTsPoints: 101, ngspicePoints: 101, alignedPoints: 100, excludedOutOfRange: 1 });
      assert.ok(comparison.metrics.signals['v(2)'].relativeError.max < 5e-4);
    }
    assert.ok(report.comparisonToPrevious.metricTransitions.some((text: string) => text.includes('PR #452') && text.includes('PR #454') && text.includes('PR #458') && text.includes('#391')));
    assert.ok(report.gapIssues.some((issue: { url: string }) => issue.url === 'https://github.com/mfiumara/spice-ts/issues/391'));
    const mixer = report.fixtures.find((fixture: { key: string }) => fixture.key === 'classic/bjt-mixer-distortion');
    assert.equal(mixer.spiceTs.error, 'No analysis command specified');
    assert.equal(mixer.ngspice.status, 'failed');
    const mos1Inverter = report.fixtures.find((fixture: { key: string }) => fixture.key === 'corpus-e/mos1-inverter-sweep');
    assert.ok(mos1Inverter.gapIssues.includes('https://github.com/mfiumara/spice-ts/issues/427'));
    const spike = report.gapIssues.find((issue: { url: string }) => issue.url === 'https://github.com/mfiumara/spice-ts/issues/427');
    assert.match(spike.scope, /closed by PR #436/);
    const mos1Tran = mos1Inverter.comparisons.find((comparison: { analysis: string }) => comparison.analysis === 'tran');
    assert.ok(mos1Tran.metrics.signals['i(vdd)'].absoluteError.max < 1e-4);
    assert.ok(report.comparisonToPrevious.metricTransitions.some((text: string) => text.includes('PR #436') && text.includes('PR #437') && text.includes('PR #439')));
    assert.ok(!report.comparisonToPrevious.metricTransitions.some((text: string) => /worst DC\/TRAN abs max still about 4\.35 V/.test(text)));
    const mesa = report.fixtures.find((fixture: { key: string }) => fixture.key === 'ngspice/mesa-oscillator');
    assert.equal(mesa.spiceTs.status, 'success');
    assert.ok(mesa.gapIssues.includes('https://github.com/mfiumara/spice-ts/issues/432'));
    const tstart = report.gapIssues.find((issue: { url: string }) => issue.url === 'https://github.com/mfiumara/spice-ts/issues/432');
    assert.match(tstart.scope, /closed by PR #440/);
    const mesaTran = mesa.comparisons.find((comparison: { analysis: string }) => comparison.analysis === 'tran');
    assert.deepEqual(mesaTran.metrics.grid, { spiceTsPoints: 3861, ngspicePoints: 201, alignedPoints: 3838, excludedOutOfRange: 23 });
    assert.ok(report.comparisonToPrevious.metricTransitions.some((text: string) => text.includes('PR #440') && text.includes('PR #443') && text.includes('PR #442')));
    assert.ok(!report.comparisonToPrevious.statusTransitions.some((transition: { explanation: string }) => /3219 of those are before TSTART/.test(transition.explanation)));
    assert.deepEqual(report.comparisonToPrevious.totals.ngspice, { success: 52, failed: 9, unsupported: 39 });
    assert.deepEqual(report.comparisonToPrevious.totals.spiceTs, { success: 55, failed: 2, unsupported: 43 });
    assert.equal(report.comparisonToPrevious.totals.comparedAnalyses, 58);
    assert.equal(report.comparisonToPrevious.totals.comparedFixtures, 43);
  });

  it('locks the current aggregate corpus tree and unchanged source catalogue', async () => {
    const { json } = await committedArtifacts();
    const report = JSON.parse(json);

    assert.deepEqual(report.provenance, {
      fixtureTreeSha256: '13b4675cfb97766fc7caed79d023ca514840880d17cb924c0e70561ff8b82e00',
      sourcesSha256: '53cd510ca559ac9409c40e543c8a1da5c7cbe5bc5fa80338f5086bce701e0228',
    });
  });

  it('commits matched-point envelopes derived from every compared signal', async () => {
    const { json } = await committedArtifacts();
    const report = JSON.parse(json);

    assert.deepEqual(report.matchedPointEnvelope, matchedPointEnvelope(report.fixtures));
    assert.equal(report.matchedPointEnvelope.comparedSignals, 969);
    assert.equal(report.matchedPointEnvelope.relativeComparedSignals, 933);
    assert.equal(report.matchedPointEnvelope.maximumAbsoluteError, 7175.34033203125);
    assert.equal(report.matchedPointEnvelope.maximumAbsoluteRms, 7175.34033203125);
    assert.equal(report.matchedPointEnvelope.maximumRelativeError, 248284946174.52246);
    assert.equal(report.matchedPointEnvelope.maximumRelativeRms, 5233588211.050267);
  });

  it('commits runtime sums derived from all 100 engine receipts', async () => {
    const { json } = await committedArtifacts();
    const report = JSON.parse(json);
    const sum = (engine: 'ngspice' | 'spiceTs') => Number(report.fixtures
      .reduce((total: number, fixture: Record<string, { runtimeMs: number }>) => total + fixture[engine].runtimeMs, 0)
      .toFixed(3));

    assert.deepEqual(report.totals.runtimeMs, {
      ngspice: sum('ngspice'),
      spiceTs: sum('spiceTs'),
    });
  });

  it('rejects duplicate fixture paths and content hashes', async () => {
    const { json } = await committedArtifacts();
    const duplicatePath = JSON.parse(json);
    duplicatePath.fixtures[99].localPath = duplicatePath.fixtures[0].localPath;
    assert.throws(() => validateAggregateAccounting(duplicatePath), /unique local paths/);

    const duplicateHash = JSON.parse(json);
    duplicateHash.fixtures[99].input.sha256 = duplicateHash.fixtures[0].input.sha256;
    duplicateHash.fixtures[99].ngspice.inputSha256 = duplicateHash.fixtures[0].input.sha256;
    duplicateHash.fixtures[99].spiceTs.inputSha256 = duplicateHash.fixtures[0].input.sha256;
    assert.throws(() => validateAggregateAccounting(duplicateHash), /unique input hashes/);
  });

  it('rejects outcome totals that do not reconcile to all fixtures', async () => {
    const { json } = await committedArtifacts();
    const report = JSON.parse(json);
    report.totals.ngspice.success += 1;

    assert.throws(() => validateAggregateAccounting(report), /ngspice outcomes must reconcile/);
  });

  it('excludes documented volatile host, runtime, and error fields from deterministic verification', async () => {
    const { json, markdown } = await committedArtifacts();
    const generated = JSON.parse(json);
    generated.environment.cpu = 'different host';
    generated.fixtures[0].ngspice.runtimeMs += 1;
    generated.fixtures[0].ngspice.error = 'different volatile diagnostic';

    assert.doesNotThrow(() => verifyCommittedArtifacts(generated, json, markdown));
  });

  it('rejects tampered deterministic JSON content even when its stored outcome hash is unchanged', async () => {
    const { json, markdown } = await committedArtifacts();
    const generated = JSON.parse(json);
    const tampered = JSON.parse(json);
    tampered.totals.fixtures = 59;

    assert.throws(
      () => verifyCommittedArtifacts(generated, `${JSON.stringify(tampered, null, 2)}\n`, markdown),
      /deterministic JSON projection/,
    );
  });

  it('names the fixtures whose regenerated outcome differs from the committed artifact', async () => {
    const { json, markdown } = await committedArtifacts();
    const generated = JSON.parse(json);
    generated.fixtures[0].spiceTs.status = 'failed';

    assert.throws(
      () => verifyCommittedArtifacts(generated, json, markdown),
      new RegExp(`differing fixtures: ${generated.fixtures[0].key.replace('/', '\\/')} \\(spice-ts `),
    );
  });

  it('runs spice-ts in a bounded child process with the in-process execution result', async () => {
    const manifest = JSON.parse(await readFile(resolve('benchmarks/corpus/xyce/manifest.json'), 'utf8'));
    const circuit = manifest.circuits.find((candidate: { id: string }) => candidate.id === 'rlc-transient');
    const input = await readFile(resolve(circuit.localPath));

    const bounded = await runBoundedSpiceTs(input, circuit, SPICE_TS_TIMEOUT_MS);
    const inProcess = await runNativeSpiceTs(input, circuit);

    assert.equal(SPICE_TS_TIMEOUT_MS, 120_000);
    assert.equal(bounded.execution.status, 'success');
    assert.ok(bounded.runtimeMs > 0);
    assert.deepEqual(bounded.execution, inProcess);
  });

  it('reports a spice-ts run that exceeds the bound as a failed execution', async () => {
    const manifest = JSON.parse(await readFile(resolve('benchmarks/corpus/xyce/manifest.json'), 'utf8'));
    const circuit = manifest.circuits.find((candidate: { id: string }) => candidate.id === 'rlc-transient');
    const input = await readFile(resolve(circuit.localPath));

    const bounded = await runBoundedSpiceTs(input, circuit, 1);

    assert.equal(bounded.execution.status, 'failed');
    assert.equal(bounded.execution.convergence, 'failed');
    assert.deepEqual(bounded.execution.analyses, []);
    assert.match(bounded.execution.error ?? '', /exceeded the 1 ms aggregate execution bound/);
  });

  it('rejects tampered Markdown even when the committed JSON is unchanged', async () => {
    const { json, markdown } = await committedArtifacts();
    const generated = JSON.parse(json);

    assert.throws(
      () => verifyCommittedArtifacts(generated, json, markdown.replace('100-circuit', '101-circuit')),
      /Markdown/,
    );
  });

  it('describes the comparison grid the committed report was generated with (#445)', async () => {
    const { json, markdown } = await committedArtifacts();
    const policy = JSON.parse(json).policy;
    for (const line of comparisonMethodLines(policy)) assert.ok(markdown.includes(line), line);

    const current = comparisonMethodLines({
      ...policy,
      breakpointAlignment: 'one-sided at time points shared by both transient grids; linear metric retained',
    }).join('\n');
    assert.match(current, /Breakpoint alignment/);
    assert.match(current, /linearMetrics/);
    assert.match(current, /issues\/445/);
  });
});

describe('aggregate report fail-fast preflight and concurrency', () => {
  it('rejects a changed source catalogue before any fixture runs, naming the file, both hashes, and the refresh command', async () => {
    const root = await isolatedRoot();
    try {
      // The committed report records the pinned provenance (validateAggregateAccounting enforces equality).
      const PINNED_SOURCES = JSON.parse((await committedArtifacts()).json).provenance.sourcesSha256;
      await appendFile(resolve(root, 'benchmarks/SOURCES.md'), '\nstale provenance probe\n');
      const actual = createHash('sha256').update(await readFile(resolve(root, 'benchmarks/SOURCES.md'))).digest('hex');

      await assert.rejects(preflightAggregateInputs(root), (error: Error) => {
        assert.match(error.message, /benchmarks\/SOURCES\.md/);
        assert.match(error.message, new RegExp(`pinned ${PINNED_SOURCES}`));
        assert.match(error.message, new RegExp(`actual ${actual}`));
        assert.match(error.message, /pnpm exec tsx benchmarks\/aggregate-report\.ts/);
        return true;
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects a tampered fixture by corpus, id, and path before any fixture runs', async () => {
    const root = await isolatedRoot();
    try {
      const manifest = JSON.parse(await readFile(resolve(root, 'benchmarks/corpus/xyce/manifest.json'), 'utf8'));
      const circuit = manifest.circuits[3];
      await appendFile(resolve(root, circuit.localPath), '* tampered\n');

      await assert.rejects(
        preflightAggregateInputs(root),
        new RegExp(`xyce/${circuit.id}: fixture SHA-256 mismatch for ${circuit.localPath.replaceAll('.', '\\.')}`),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('fails --check on stale provenance in under 30 s', async () => {
    const root = await isolatedRoot();
    try {
      await appendFile(resolve(root, 'benchmarks/SOURCES.md'), '\nstale provenance probe\n');
      const run = await runCheck(root);

      assert.equal(run.code, 1, run.output);
      assert.ok(run.elapsedMs < FAIL_FAST_LIMIT_MS, `took ${run.elapsedMs} ms`);
      assert.match(run.output, /aggregate provenance is stale: benchmarks\/SOURCES\.md/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('runs two concurrent --check invocations without interference or writes', async () => {
    const root = await isolatedRoot();
    try {
      await appendFile(resolve(root, 'benchmarks/SOURCES.md'), '\nstale provenance probe\n');
      const before = await treeDigest(root);
      const [first, second] = await Promise.all([runCheck(root), runCheck(root)]);

      for (const run of [first, second]) {
        assert.equal(run.code, 1, run.output);
        assert.match(run.output, /aggregate provenance is stale: benchmarks\/SOURCES\.md/);
      }
      assert.equal(await treeDigest(root), before);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('publishes generated artifacts atomically through per-run temporary files', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'spice-ts-aggregate-write-'));
    try {
      const jsonPath = resolve(directory, 'aggregate-report.json');
      const markdownPath = resolve(directory, 'AGGREGATE_PARITY.md');
      await writeFile(jsonPath, 'old json');
      const payloads = Array.from({ length: 8 }, (_, index) => ({
        json: `${JSON.stringify({ run: index, padding: 'x'.repeat(2_000_000) })}\n`,
        markdown: `# run ${index}\n${'y'.repeat(200_000)}\n`,
      }));
      const complete = new Set(['old json', ...payloads.map(payload => payload.json)]);
      const torn: number[] = [];
      let writing = true;
      const reader = (async () => {
        while (writing) {
          const seen = await readFile(jsonPath, 'utf8');
          if (!complete.has(seen)) torn.push(seen.length);
        }
      })();

      for (let round = 0; round < 5; round += 1) {
        await Promise.all(payloads.map(payload => writeAggregateArtifacts(
          { jsonPath, markdownPath },
          payload.json,
          payload.markdown,
        )));
      }
      writing = false;
      await reader;

      assert.deepEqual(torn, [], 'a concurrent reader observed a partially written report');
      assert.ok(payloads.some(payload => payload.json === readFileSyncText(jsonPath)));
      assert.ok(payloads.some(payload => payload.markdown === readFileSyncText(markdownPath)));
      assert.deepEqual((await readdir(directory)).sort(), ['AGGREGATE_PARITY.md', 'aggregate-report.json']);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

function readFileSyncText(path: string): string {
  return readFileSync(path, 'utf8');
}
