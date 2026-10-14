// Evidence only: never rewrites historical receipts or production inputs.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release } from 'node:os';
import { gunzipSync, gzipSync } from 'node:zlib';
import { runNgspicePacked, runBoundedSimulatePacked } from '../../corpus/corpus-f/outcomes.js';
import { unpackExecution } from '../../corpus/corpus-f/packed.js';
import { reduceRow, type Manifest } from '../../corpus/corpus-j/parity.js';
import type { ClassicCircuit, EngineExecution } from '../../corpus/classic/report.js';

const root = 'benchmarks/results/issue-1001';
const manifest = JSON.parse(readFileSync('benchmarks/corpus/corpus-k/manifest.json', 'utf8')) as Manifest;

export function linear(ts: EngineExecution, ng: EngineExecution) {
  return ts.analyses.flatMap(a => {
    const b = ng.analyses.find(p => p.type === a.type);
    if (!b) return [];
    return Object.keys(a.series.signals).filter(s => s in b.series.signals).map(signal => {
      const values = b.series.signals[signal].map(v => v.re);
      const peak = Math.max(signal.startsWith('v(') ? 1e-4 : 1e-10, ...values.map(Math.abs));
      let cursor = 1, maxAbs = 0, sumSquares = 0, count = 0, worstTime = 0;
      let first: number | null = null;
      let initialAbs: number | null = null;
      for (let i = 0; i < a.series.grid.length; i++) {
        const t = a.series.grid[i];
        if (t < b.series.grid[0] || t > b.series.grid.at(-1)!) continue;
        while (cursor < b.series.grid.length - 1 && b.series.grid[cursor] <= t) cursor++;
        const low = b.series.grid[Math.max(0, cursor - 1)], high = b.series.grid[cursor];
        const ref = values.length === 1 ? values[0] : high === low ? values[cursor]
          : values[cursor - 1] + (values[cursor] - values[cursor - 1]) * (t - low) / (high - low);
        const delta = Math.abs(a.series.signals[signal][i].re - ref);
        initialAbs ??= delta;
        if (delta > maxAbs) { maxAbs = delta; worstTime = t; }
        if (first === null && delta / peak > 0.01) first = t;
        sumSquares += delta * delta; count++;
      }
      return { signal, peak, maxAbs, normalized: maxAbs / peak, rmsNormalized: Math.sqrt(sumSquares / count) / peak, initialAbs, worstTime, first };
    });
  }).sort((a, b) => b.normalized - a.normalized);
}
async function main() {
  const version = execFileSync('ngspice', ['--version'], { encoding: 'utf8' });
  if (!/ngspice-47\b/.test(version)) throw new Error('ngspice-47 required');
  mkdirSync(root, { recursive: true });
  const rows = [];
  const jobs: { name: string; id: string; deck: string; analysis: 'op' | 'tran' }[] = [];
  for (const name of ['k-5-original', 'k-5-op', 'k-5-fine', 'k-5-latch-op', 'k-10-original', 'k-10-op', 'k-10-fine', 'k-10-reduced', 'k-15-original', 'k-15-op', 'k-15-fine', 'k-15-stages-5']) {
    const capture = JSON.parse(gunzipSync(readFileSync(`evidence/996/runs/${name}.json.gz`)).toString());
    jobs.push({ name, id: capture.id, deck: capture.deck, analysis: name.endsWith('op') ? 'op' : 'tran' });
  }
  const pump = readFileSync(manifest.circuits.find(c => c.id === 'k-13')!.localPath, 'utf8');
  // Remove unused PMOS model, comments and output requests. Preserve active model,
  // single transistor, capacitors, stimulus, options and the first five cycles.
  const reduced = pump.replace(/\.model penh pmos[\s\S]*?(?=md2)/i, '')
    .replace(/^\*.*\n/gm, '').replace(/^\.print.*\n/gmi, '')
    .replace(/^\+.*50\.2ns[\s\S]*?(?=\n\n\.tran)/m, '')
    .replace(/50\.0ns 5\.0\n/, '50.0ns 5.0)\n').replace('.tran .2ns 100ns', '.tran .2ns 50ns');
  writeFileSync(`${root}/pump-reduced.cir`, reduced);
  for (const [name, deck] of [['k-13-original', pump], ['pump-reduced', reduced]] as const) {
    jobs.push({ name, id: 'k-13', deck, analysis: 'tran' });
    jobs.push({ name: `${name}-op`, id: 'k-13', deck: deck.replace(/^\.tran[^\n]*/mi, '.op'), analysis: 'op' });
    // Uniform diagnostic TSTEP/20 maxstep, identical in both engines.
    jobs.push({ name: `${name}-fine`, id: 'k-13', deck: deck.replace(/^(\.tran\s+\S+\s+\S+)[^\n]*/mi, '$1 0 10ps'), analysis: 'tran' });
  }
  for (const job of jobs) {
    const bytes = Buffer.from(job.deck), sha256 = createHash('sha256').update(bytes).digest('hex');
    const source = manifest.circuits.find(c => c.id === job.id)!;
    const circuit = { ...source, category: 'corpus-k', analyses: [job.analysis], ngspice: { expectedStatus: 'pass' }, spiceTs: { expectedStatus: 'pass' } } as unknown as ClassicCircuit;
    const native = await runNgspicePacked(bytes, circuit as unknown as Parameters<typeof runNgspicePacked>[1]);
    const actual = await runBoundedSimulatePacked(bytes, circuit);
    const ts = unpackExecution(actual), ng = unpackExecution(native.execution);
    const errors = linear(ts, ng);
    const canonical = reduceRow({ ...source, sha256, analyses: [job.analysis] }, native, actual);
    const row = { name: job.name, sha256, spiceTsStatus: ts.status, ngspiceStatus: ng.status,
      tsPoints: ts.analyses.map(a => a.series.grid.length), ngPoints: ng.analyses.map(a => a.series.grid.length), errors, canonical };
    rows.push(row);
    writeFileSync(`${root}/${job.name}.json.gz`, gzipSync(JSON.stringify({ input: job.deck, sha256, spiceTs: ts, reference: ng })));
    writeFileSync(`${root}/receipt.json`, JSON.stringify({ base: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      coreTree: execFileSync('git', ['rev-parse', 'HEAD:packages/core'], { encoding: 'utf8' }).trim(),
      environment: { node: process.version, ngspice: version, arch: arch(), platform: platform(), release: release(), cpu: cpus()[0].model },
      metric: 'Historical #996 linear native-to-TS interpolation, peak floors 1e-4 V / 1e-10 A, 1% threshold; canonical shared scorer also retained separately.', rows }, null, 2) + '\n');
    console.log(job.name, ts.status, ng.status, row.tsPoints, row.ngPoints, errors[0]?.signal, errors[0]?.normalized, 'canonical', canonical.worstNormalizedError);
  }
  if (rows.length !== 18) throw new Error(`expected 18, got ${rows.length}`);
}
if (process.argv[1]?.endsWith('/run.ts')) main().catch(error => { console.error(error); process.exitCode = 1; });
