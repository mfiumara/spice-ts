import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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

export const ROOT = 'benchmarks/corpus/corpus-k';
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
export function gapBucket(error: string | undefined, status: EngineStatus) {
  if (status === 'success') return undefined;
  if (/MOSFET level 2 model .*series resistance parameter (?:RD|RS|RSH) is not supported/.test(error ?? '')) return 'MOS2: drain/source series resistance';
  if (/Unsupported \.options maxord value: '1'/.test(error ?? '')) return 'integration: MAXORD=1 unsupported';
  return previousGapBucket(error, status);
}
export const report = parityReport({ name: 'corpus-k', root: ROOT, scriptUrl: import.meta.url,
  title: '# corpus-k: original public CMOS, op-amp and oscillator decks (#980)', earlierRules: 'corpus-i/h/f',
  gapIssues: { 'MOS2: drain/source series resistance': 'https://github.com/mfiumara/spice-ts/issues/982',
    'integration: MAXORD=1 unsupported': 'https://github.com/mfiumara/spice-ts/issues/983' }, followUpIssues: [], gapBucket });
export function renderMarkdown(result: CorpusHReport) {
  return report.renderMarkdown(result)
    .replace('static rules plus an ngspice-47 reference probe, see SOURCES.md', 'static/hash rules only, no engine-success filter; see SOURCES.md')
    .replace('Gap buckets apply the corpus-k rules in `lib.ts` first, then the corpus-i/h/f rules.', 'Gap buckets apply error-line rules in corpus-k/parity.ts, then unchanged corpus-i/h/f rules.')
    .replace(/- Bounds: ngspice 600 s, spice-ts 120 s per fixture\./, '- Bounds: each serial owned engine process group has a uniform 119 s execution deadline (120 s boundary).')
    .replace(/\n## Transient fine-step reference \(#592\)[\s\S]*$/, '\n') + '\n## Measurement boundary\n\nDetailed matched-point max/RMS absolute and relative metrics are in outcomes.json, imported unchanged from corpus-j reduceRow and corpus-f comparison helpers. Null/empty metrics mean no comparison, never zero error. Both engines receive original bytes; no fine-step adapted reference is run. Cold engine group wall includes Node/tsx startup, adapter, parse/solve and export/serialization. No solver-only or speed-superiority claim. Aggregate incorporation belongs to nightly #855, not this PR.\n';
}
async function bounded(circuit: Circuit, engine: string) {
  const directory = await mkdtemp(resolve(tmpdir(), 'corpus-k-'));
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
  if (process.argv[2] === '--render') {
    const committed = JSON.parse(await readFile(`${ROOT}/outcomes.json`, 'utf8'));
    const manifestBytes = await readFile(`${ROOT}/manifest.json`);
    const manifest = JSON.parse(manifestBytes.toString());
    if (committed.fixtures.length !== manifest.circuits.length || committed.fixtures.some((row: CorpusHReport['fixtures'][number], index: number) =>
      row.id !== manifest.circuits[index].id || row.sha256 !== manifest.circuits[index].sha256)) throw new Error('fixture inputs changed; rerun engines instead of rendering');
    const fixtures = committed.fixtures.map((row: CorpusHReport['fixtures'][number], index: number) => ({ ...row,
      sameNameAs: manifest.circuits[index].sameNameAs, gapBucket: gapBucket(row.spiceTs.firstErrorLine, row.spiceTs.status) ?? null }));
    const { outcomeSha256: _old, ...rest } = committed;
    const base = { ...rest, sources: manifest.sources, manifestSha256: hash(manifestBytes), ...report.summarize(fixtures), fixtures };
    const result = { ...base, outcomeSha256: outcomeDigest(base as never) };
    await writeFile(`${ROOT}/outcomes.json`, JSON.stringify(result, null, 2) + '\n');
    await writeFile(`${ROOT}/README.md`, renderMarkdown(result)); return;
  }
  const bytes = await readFile(`${ROOT}/manifest.json`);
  const manifest = JSON.parse(bytes.toString()) as Manifest;
  if (process.argv[2] === '--engine') {
    const circuit = manifest.circuits.find(c => c.id === process.argv[4]);
    if (!circuit) throw new Error('unknown fixture');
    const input = await readFile(circuit.localPath);
    if (hash(input) !== circuit.sha256) throw new Error('fixture hash mismatch');
    const run = process.argv[3] === 'ngspice' ? await runNgspicePacked(input, circuit) : await (async () => {
      const execution = await runBoundedSimulatePacked(input, { ...circuit, category: 'corpus-k', ngspice: { expectedStatus: 'pass' }, spiceTs: { expectedStatus: 'pass' } } as unknown as ClassicCircuit);
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
  const base = { schemaVersion: 'spice-ts-corpus-k-outcomes/v1', sources: manifest.sources, manifestSha256: hash(bytes),
    coreTree: spawnSync('git', ['rev-parse', 'HEAD:packages/core'], { encoding: 'utf8' }).stdout.trim(),
    tools: { ngspice: 'ngspice-47', spiceTs: JSON.parse(await readFile('packages/core/package.json', 'utf8')).version, node: process.version },
    environment: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model },
    commands: { generate: `spice-heavy pnpm exec tsx ${ROOT}/parity.ts`, verify: `pnpm exec tsx --test ${ROOT}/corpus-k.test.ts`, ngspice: 'unchanged corpus-f runNgspicePacked on original bytes', spiceTs: 'unchanged corpus-f runBoundedSimulatePacked on original bytes' },
    policy: { input: 'byte-identical fixture for both engines', fixtureAdaptation: 'none', perCircuitToleranceTuning: false, matchThreshold: 0.01, matchRule: MATCH_RULE,
      deterministicHashExcludes: ['environment', 'tools.node', 'ngspice.analyses', 'spiceTs.analyses'], fineReference: 'none: no adapted deck', executionDeadlineMs: 119_000,
      runtimeBoundary: 'serial cold owned engine group wall, not solver-only or warm runtime' }, ...report.summarize(fixtures), fixtures };
  const result = { ...base, outcomeSha256: outcomeDigest(base as never) };
  await writeFile(`${ROOT}/outcomes.json`, JSON.stringify(result, null, 2) + '\n');
  await writeFile(`${ROOT}/README.md`, renderMarkdown(result as unknown as CorpusHReport));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
