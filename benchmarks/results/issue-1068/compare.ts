import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { arch, cpus, platform, release } from 'node:os';
import { runNativeNgspice, runNativeSpiceTs, type ClassicCircuit, type EngineExecution } from '../../corpus/classic/report.js';
import { alignAndMeasure } from '../../comparison-harness.js';

// Build the baseline in a disposable archive of the recorded commit, not a second worktree.
// Usage: spice-heavy pnpm exec tsx benchmarks/results/issue-1068/compare.ts .issue-1068-baseline
const root = process.cwd();
const baseline = resolve(process.argv[2] ?? '.issue-1068-baseline');
const paths = [
  'benchmarks/results/issue-1068/weak-diode.cir',
  'benchmarks/results/issue-1068/weak-diode-default.cir',
  'benchmarks/results/issue-1068/bjt.cir',
  'benchmarks/results/issue-1068/mos1.cir',
  'benchmarks/results/issue-1068/jfet.cir',
  'benchmarks/results/issue-1068/diode-ac.cir',
  'benchmarks/convergence/circuits/gmin-reverse-diode.cir',
  'benchmarks/convergence/circuits/source-step-bjt.cir',
  'benchmarks/convergence/circuits/timestep-diode-rectifier.cir',
  'benchmarks/corpus/corpus-g/fixtures/GMIN_STEPPING/gstep_cont3a.cir',
  'benchmarks/corpus/corpus-g/fixtures/BJT_ANALYTIC/ramp_test1.cir',
  'benchmarks/corpus/xyce/fixtures/DIODE/diode.cir',
];
function summarize(engine: EngineExecution) {
  return { status: engine.status, convergence: engine.convergence, error: engine.error,
    analyses: engine.analyses.map(a => ({ type: a.type, points: a.series.grid.length,
      first: Object.fromEntries(Object.entries(a.series.signals).map(([key, values]) => [key, values[0]])),
      last: Object.fromEntries(Object.entries(a.series.signals).map(([key, values]) => [key, values.at(-1)])),
    })),
  };
}
function comparisons(own: EngineExecution, reference: EngineExecution) {
  return own.analyses.map((a, index) => {
    const ref = reference.analyses.find(r => r.type === a.type);
    if (!ref) return { type: a.type, unmatched: true };
    const common = Object.keys(a.series.signals).filter(k => k in ref.series.signals).sort();
    return { type: a.type, index, signals: common, metrics: alignAndMeasure(a.series, ref.series, common) };
  });
}
async function main(): Promise<void> {
  const rows = [];
  for (const path of paths) {
    process.chdir(root);
    const input = await readFile(path);
    const analyses = [...new Set([...input.toString().matchAll(/^\s*\.(op|dc|ac|tran)\b/gim)]
      .map(m => m[1].toLowerCase()))] as ClassicCircuit['analyses'];
    const circuit: ClassicCircuit = { id: path, category: 'issue-1068', analyses, sourcePath: path,
      sourceUrl: 'https://github.com/mfiumara/spice-ts/issues/1068', localPath: path,
      sha256: createHash('sha256').update(input).digest('hex'),
      // The engine runners do not score these declarations; actual failures are retained below.
      ngspice: { expectedStatus: 'pass' }, spiceTs: { expectedStatus: 'pass' } };
    const ngspice = await runNativeNgspice(input, circuit);
    process.chdir(baseline);
    const before = await runNativeSpiceTs(input, circuit);
    process.chdir(root);
    const after = await runNativeSpiceTs(input, circuit);
    rows.push({ path, inputSha256: circuit.sha256, identicalBytes: true,
      explicitGmin: /^\s*\.options?[^\n]*\bgmin\s*=/im.test(input.toString()),
      ngspice: summarize(ngspice), before: summarize(before), after: summarize(after),
      beforeMetrics: comparisons(before, ngspice), afterMetrics: comparisons(after, ngspice) });
    console.log(path, ngspice.status, before.status, after.status);
    await writeFile(resolve(root, 'benchmarks/results/issue-1068/delta.json'), JSON.stringify({
      baseline: 'd39157cd467ddd63ce501334b330609e7ee0a644', ngspice: '47', rows,
      environment: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model, node: process.version },
      policy: 'Identical bytes, unchanged tolerances, linear alignment, all requested decks retained including failures',
    }, null, 2) + '\n');
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
