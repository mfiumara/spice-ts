import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse } from '../../packages/core/src/parser/index.js';
import { simulate } from '../../packages/core/src/simulate.js';
import { solveDCSweep } from '../../packages/core/src/analysis/dc-sweep.js';
import { resolveOptions, withNetlistOptions } from '../../packages/core/src/types.js';

// Run with spice-heavy pnpm exec tsx benchmarks/diode-self-heating/compare.ts.
// Source/licence: benchmarks/SOURCES.md, corpus-f ngspice-47 examples (BSD).
void main();
async function main(): Promise<void> {
const path = resolve('benchmarks/corpus/corpus-f/fixtures/examples/soa/diode-soa-sh.cir');
const bytes = readFileSync(path);
const directory = mkdtempSync(join(tmpdir(), 'diode-self-heating-'));
const raw = join(directory, 'reference.raw');
const wrapper = join(directory, 'run.cir');
writeFileSync(wrapper, `Reference output wrapper\n.control\nsource ${path}\nset filetype=ascii\nwrite ${raw} v(tj) i(v1)\nquit\n.endc\n.end\n`);
const ngStart = performance.now();
// Source the exact original file. Only output instrumentation is sent separately.
const ng = spawnSync('ngspice', ['-n', '-b', wrapper], {
  encoding: 'utf8', timeout: 60000,
});
writeFileSync(join(directory, 'ngspice.log'), ng.stdout + ng.stderr);
if (ng.error || ng.status !== 0) throw ng.error ?? new Error(`ngspice exit ${ng.status}`);
const ngMs = performance.now() - ngStart;
const text = readFileSync(raw, 'utf8');
const values = text.split('Values:')[1].trim().split('\n').filter(line => line.trim())
  .map(line => Number(line.trim().split(/\s+/).at(-1)));
const variables = Number(/No. Variables:\s*(\d+)/.exec(text)![1]);
const points = Number(/No. Points:\s*(\d+)/.exec(text)![1]);
if (values.length !== points * variables) throw new Error('Incomplete ngspice raw data');
let originalOutcome: string;
try {
  await simulate(bytes.toString());
  originalOutcome = 'success';
} catch (error) {
  originalOutcome = (error as Error).message;
}
// Isolate the electrical/thermal solver from unsupported SOA control postprocessing.
// The circuit still comes from the original bytes; no fixture/tolerance edits.
const compiled = parse(bytes.toString()).compile();
const start = performance.now();
const result = solveDCSweep(compiled, { type: 'dc', source: 'v1', start: 0.02, stop: 2, step: 0.02 },
  resolveOptions(withNetlistOptions(compiled.simulationOptions)));
const tsMs = performance.now() - start;
const metrics = (actual: number[], index: number) => {
  const reference = Array.from({ length: points }, (_, i) => values[i * variables + index]);
  const peak = Math.max(...reference.map(Math.abs));
  const maxAbsoluteError = Math.max(...reference.map((v, i) => Math.abs(v - actual[i])));
  return { peak, maxAbsoluteError, errorOfPeak: maxAbsoluteError / peak, pass: maxAbsoluteError <= 0.01 * peak };
};
console.log(JSON.stringify({
  identicalInputSha256: createHash('sha256').update(bytes).digest('hex'),
  originalOutcome,
  isolatedSolver: { points: result.sweepValues.length, referencePoints: points,
    temperatureRise: metrics(result.voltage('tj'), 1), sourceCurrent: metrics(result.current('v1'), 2) },
  runtimeMs: { ngspiceInteractiveWithPostprocessing: ngMs, spiceTsSolverOnly: tsMs },
  referenceLog: join(directory, 'ngspice.log'),
}, null, 2));
}
