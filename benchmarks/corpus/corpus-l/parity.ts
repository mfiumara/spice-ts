import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, release, tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { deserialize, serialize } from 'node:v8';
import { fileURLToPath } from 'node:url';
import type { ClassicCircuit } from '../classic/report.js';
import { MATCH_RULE, outcomeDigest, runNgspicePacked, runBoundedSimulatePacked, type ReferenceRun } from '../corpus-f/outcomes.js';
import type { PackedExecution } from '../corpus-f/packed.js';
import { parityReport, type CorpusHReport } from '../corpus-h/parity.js';
import { gapBucket as previousGapBucket } from '../corpus-i/lib.js';
import type { EngineStatus } from '../corpus-f/lib.js';
import { reduceRow, type Circuit, type Manifest } from '../corpus-j/parity.js';
import { ROOT, hash } from './survey.js';
export { ROOT };
export function gapBucket(error: string | undefined, status: EngineStatus) {
  if (status === 'success') return undefined;
  if (/has no ngspice temperature model in spice-ts/.test(error ?? '')) return 'device: non-nominal temperature unsupported';
  return previousGapBucket(error, status);
}
export const report = parityReport({ name: 'corpus-l', root: ROOT, scriptUrl: import.meta.url,
  title: '# corpus-l: original public MOS3, gain-stage and Sandler decks (#1045)', earlierRules: 'corpus-i/h/f',
  gapIssues: {}, followUpIssues: [], gapBucket });
export function parityGaps(fixtures: CorpusHReport['fixtures']) {
  const buckets = new Map<string, string[]>();
  for (const row of fixtures) {
    if (row.ngspice.status !== 'success' || row.outcome === 'matched') continue;
    const bucket = row.outcome === 'mismatch'
      ? `waveform: ${row.worstSignal?.split(' ')[0] ?? 'unknown analysis'} mismatch above uniform threshold (root cause not diagnosed)`
      : gapBucket(row.spiceTs.firstErrorLine, row.spiceTs.status) ?? 'comparison: no comparable result';
    buckets.set(bucket, [...(buckets.get(bucket) ?? []), row.id]);
  }
  return [...buckets].map(([bucket, ids]) => ({ bucket, count: ids.length, ids }));
}
export function renderMarkdown(result: CorpusHReport) {
  return report.renderMarkdown(result)
    .replace('static rules plus an ngspice-47 reference probe, see SOURCES.md', 'static/hash source-family rules only, no engine-success filter; see SOURCES.md')
    .replace('Gap buckets apply the corpus-l rules in `lib.ts` first, then the corpus-i/h/f rules.', 'Gap buckets apply error-line rules in corpus-l/parity.ts, then unchanged corpus-i/h/f rules.')
    .replace(/- Bounds: ngspice 600 s, spice-ts 120 s per fixture\./, '- Bounds: each serial owned engine process group has a uniform 119 s execution deadline (120 s boundary).')
    .replace(/\n## Transient fine-step reference \(#592\)[\s\S]*$/, '\n') + '\n## All ngspice-success parity gaps\n\nIncludes execution losses and numerical mismatches, without asserting an undiagnosed root cause.\n\n| Bucket | Count | IDs |\n|---|---|---|\n' + parityGaps(result.fixtures).map(b => `| ${b.bucket} | ${b.count} | ${b.ids.join(', ')} |`).join('\n') + '\n\n## Measurement boundary\n\nDetailed matched-point max/RMS absolute and relative metrics are in outcomes.json, using unchanged corpus-j reduceRow and corpus-f comparison helpers. Null/empty metrics mean no comparison, never zero error. Both engines receive original bytes; no fine-step adapted reference is run. Cold engine group wall includes Node/tsx startup, adapter, parse/solve and export/serialization. No solver-only or speed-superiority claim. This batch is new baseline evidence, not a before/after improvement. Production core is unchanged. Aggregate incorporation belongs to nightly #855, not this PR.\n';
}
async function bounded(circuit: Circuit, engine: 'ngspice' | 'spiceTs') {
  const directory = await mkdtemp(resolve(tmpdir(), 'corpus-l-'));
  const output = resolve(directory, 'execution.bin');
  const start = performance.now();
  try {
    const result = await new Promise<{ code: number | null; timedOut: boolean }>((done, reject) => {
      const child = spawn(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), '--engine', engine, circuit.id, output], { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* exited */ } } }, 119_000);
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('close', code => { clearTimeout(timer); done({ code, timedOut }); });
    });
    const wallMs = performance.now() - start;
    if (result.code === 0 && !result.timedOut) return { run: deserialize(await readFile(output)) as ReferenceRun<PackedExecution>, wallMs };
    const error = result.timedOut ? 'owned engine group exceeded uniform 119 s deadline' : `engine exited ${result.code}`;
    return { run: { status: 'failed' as const, firstErrorLine: error, execution: { status: 'failed' as const, convergence: 'failed' as const, analyses: [], error } }, wallMs };
  } finally { await rm(directory, { recursive: true, force: true }); }
}
async function main() {
  const bytes = await readFile(`${ROOT}/manifest.json`);
  const manifest = JSON.parse(bytes.toString()) as Manifest;
  if (process.argv[2] === '--render') {
    const committed = JSON.parse(await readFile(`${ROOT}/outcomes.json`, 'utf8'));
    if (committed.manifestSha256 !== hash(bytes)) throw new Error('manifest changed; rerun engines');
    const fixtures = committed.fixtures.map((row: CorpusHReport['fixtures'][number]) => ({ ...row, gapBucket: gapBucket(row.spiceTs.firstErrorLine, row.spiceTs.status) ?? null }));
    const { outcomeSha256: _old, ...rest } = committed;
    const base = { ...rest, ...report.summarize(fixtures), fixtures, parityGaps: parityGaps(fixtures) };
    const result = { ...base, outcomeSha256: outcomeDigest(base as never) };
    await writeFile(`${ROOT}/outcomes.json`, JSON.stringify(result, null, 2) + '\n');
    await writeFile(`${ROOT}/README.md`, renderMarkdown(result)); return;
  }
  if (process.argv[2] === '--engine') {
    const circuit = manifest.circuits.find(c => c.id === process.argv[4]);
    if (!circuit) throw new Error('unknown fixture');
    const input = await readFile(circuit.localPath);
    if (hash(input) !== circuit.sha256) throw new Error('fixture hash mismatch');
    if (process.argv[3] !== 'ngspice' && process.argv[3] !== 'spiceTs') throw new Error('unknown engine');
    const run = process.argv[3] === 'ngspice' ? await runNgspicePacked(input, circuit) : await (async () => {
      const execution = await runBoundedSimulatePacked(input, { ...circuit, category: 'corpus-l', ngspice: { expectedStatus: 'pass' }, spiceTs: { expectedStatus: 'pass' } } as unknown as ClassicCircuit);
      return { status: execution.status, execution };
    })();
    await writeFile(process.argv[5], serialize(run)); return;
  }
  if (!/ngspice-47\b/.test(spawnSync('ngspice', ['--version'], { encoding: 'utf8' }).stdout)) throw new Error('requires ngspice-47');
  const fixtures = [];
  for (const circuit of manifest.circuits) {
    const ng = await bounded(circuit, 'ngspice');
    const spice = await bounded(circuit, 'spiceTs');
    const reduced = reduceRow(circuit, ng.run, spice.run.execution);
    const row = { ...reduced, gapBucket: gapBucket(reduced.spiceTs.firstErrorLine, reduced.spiceTs.status) ?? null,
      runtime: { ngspiceChildWallMs: ng.wallMs, spiceTsChildWallMs: spice.wallMs } };
    fixtures.push(row);
    await writeFile(`${ROOT}/checkpoint.json`, JSON.stringify(fixtures, null, 2) + '\n');
    console.log(`${circuit.id} ${row.outcome}: ng=${row.ngspice.status} ts=${row.spiceTs.status} ${row.spiceTs.firstErrorLine ?? ''}`);
  }
  const base = { schemaVersion: 'spice-ts-corpus-l-outcomes/v1', sources: manifest.sources, manifestSha256: hash(bytes),
    coreTree: spawnSync('git', ['rev-parse', 'HEAD:packages/core'], { encoding: 'utf8' }).stdout.trim(),
    tools: { ngspice: 'ngspice-47', spiceTs: JSON.parse(await readFile('packages/core/package.json', 'utf8')).version, node: process.version },
    environment: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model },
    commands: { generate: `spice-heavy pnpm exec tsx ${ROOT}/parity.ts`, verify: `pnpm exec tsx --test ${ROOT}/corpus-l.test.ts`, ngspice: 'unchanged corpus-f runNgspicePacked on original bytes', spiceTs: 'unchanged corpus-f runBoundedSimulatePacked on original bytes' },
    policy: { input: 'byte-identical fixture for both engines', fixtureAdaptation: 'none', perCircuitToleranceTuning: false, matchThreshold: 0.01, matchRule: MATCH_RULE,
      deterministicHashExcludes: ['environment', 'tools.node', 'ngspice.analyses', 'spiceTs.analyses'], fineReference: 'none: no adapted deck', executionDeadlineMs: 119_000,
      runtimeBoundary: 'serial cold owned engine group wall, not solver-only or warm runtime' }, ...report.summarize(fixtures), fixtures, parityGaps: parityGaps(fixtures) };
  const result = { ...base, outcomeSha256: outcomeDigest(base as never) };
  await writeFile(`${ROOT}/outcomes.json`, JSON.stringify(result, null, 2) + '\n');
  await writeFile(`${ROOT}/README.md`, renderMarkdown(result as unknown as CorpusHReport));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
