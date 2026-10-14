import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { simulate } from '../../packages/core/src/simulate.js';
import { parse } from '../../packages/core/src/parser/index.js';
import { BSIM4 } from '../../packages/core/src/devices/bsim4/device.js';

interface Point { vgs: number; vds: number; vbs: number; id: number; gm: number; gds: number; gmbs: number }
interface GridCase { name: string; polarity: string; modelCard: string; geometry: string; points: Point[] }
interface NativeAnalysis { command: string; vectors: Record<string, number[]> }
interface Oracle { cases: GridCase[]; pairDc: { analyses: NativeAnalysis[] }; binningOp: { vectors: Record<string, number> } }
interface Metrics { samples: number; maxAbsError: number; rmsError: number; maxRelativeError: number; rmsRelativeError: number }
const here = new URL('./', import.meta.url);
const oracle = JSON.parse(readFileSync(new URL('native/reference/reference.json', here), 'utf8')) as Oracle;
function metrics(got: readonly number[], want: readonly number[]): Metrics {
  if (got.length !== want.length || !got.length) throw new Error('Unmatched sample count');
  const errors = got.map((x, i) => {
    if (!Number.isFinite(x) || !Number.isFinite(want[i])) throw new Error('Nonfinite sample');
    return Math.abs(x - want[i]);
  });
  const relative = errors.map((x, i) => x / Math.max(Math.abs(want[i]), 1e-18));
  return { samples: got.length, maxAbsError: Math.max(...errors), rmsError: Math.sqrt(errors.reduce((s, x) => s + x * x, 0) / errors.length),
    maxRelativeError: Math.max(...relative), rmsRelativeError: Math.sqrt(relative.reduce((s, x) => s + x * x, 0) / relative.length) };
}
const grid = oracle.cases.map(reference => {
  const deck = `BSIM4 oracle card\n${reference.modelCard}\nM1 d g 0 b DUT ${reference.geometry}\nVd d 0 0\nVg g 0 0\nVb b 0 0\n.temp 27\n.op\n.end`;
  try {
    const device = parse(deck).compile().devices.find(d => d.name === 'M1') as BSIM4;
    const sign = reference.polarity === 'n' ? 1 : -1;
    const values = reference.points.map(point => device.evaluate({ vgs: sign * point.vgs, vds: sign * point.vds, vbs: sign * point.vbs }));
    return { name: reference.name, status: 'compared', signals: Object.fromEntries(
      ([['id', 'ids'], ['gm', 'gm'], ['gds', 'gds'], ['gmbs', 'gmbs']] as const).map(([q, key]) => [q, metrics(values.map(x => x[key]), reference.points.map(x => x[q]))])) };
  } catch (error) {
    return { name: reference.name, status: 'unsupported', error: error instanceof Error ? error.message : String(error), signals: null };
  }
});
const originals = JSON.parse(readFileSync(new URL('native/originals.json', here), 'utf8')) as {
  originals: Array<{ path: string; sha256: string; exitCode: number; diagnostics: string[] }>;
};
const baseline = JSON.parse(readFileSync(new URL('../../packages/core/src/devices/__fixtures__/bsim4/baseline.json', here), 'utf8')) as {
  sourceHead: string; fixtures: Array<{ path: string; status: string; errorName: string; errorCode: string }>;
};
const fixtures = [];
for (const native of originals.originals) {
  const input = readFileSync(native.path, 'utf8');
  if (createHash('sha256').update(input).digest('hex') !== native.sha256) throw new Error('Original bytes changed');
  const before = baseline.fixtures.find(row => row.path === native.path);
  if (!before) throw new Error('Missing baseline');
  try {
    const result = await simulate(input);
    const runs = result.control?.runs.filter(run => run.result.dcSweep) ?? [];
    if (runs.length !== oracle.pairDc.analyses.length) throw new Error('Missing DC plots');
    const analyses = runs.map((run, i) => {
      const sweep = run.result.dcSweep!;
      const reference = oracle.pairDc.analyses[i];
      const actual: Record<string, number[]> = Object.fromEntries([
        ...[...sweep.voltages].map(([name, values]) => [`v(${name.toLowerCase()})`, Array.from(values)] as const),
        ...[...sweep.currents].map(([name, values]) => [`i(${name.toLowerCase()})`, Array.from(values)] as const),
      ]);
      const scale = Object.keys(reference.vectors).find(name => name === 'v(v-sweep)' || name === 'temp-sweep');
      if (!scale) throw new Error(`Unknown native scale: ${Object.keys(reference.vectors)}`);
      actual[scale] = Array.from(sweep.sweepValues);
      if (metrics(actual[scale], reference.vectors[scale]).maxAbsError > 1e-12) throw new Error('Primary coordinate mismatch');
      const signals = Object.fromEntries(Object.entries(reference.vectors).map(([name, values]) => {
        if (!actual[name]) throw new Error(`Missing native signal ${name}`);
        return [name, metrics(actual[name], values)];
      }));
      const missingNativeSignals = Object.keys(actual).filter(name => !reference.vectors[name]);
      if (missingNativeSignals.length) throw new Error(`Extra spice-ts signals: ${missingNativeSignals}`);
      // Compare every point in source order, including repeated inner coordinates.
      // Nested coordinate values derive from the original command, not interpolation.
      const words = reference.command.split(/\s+/);
      const outer = words[5];
      const start = Number(words[6]), step = Number(words[8]);
      const innerCount = Math.round((Number(words[3]) - Number(words[2])) / Number(words[4])) + 1;
      const expectedOuter = Array.from({ length: sweep.sweepValues.length }, (_, n) => start + Math.floor(n / innerCount) * step);
      if (!sweep.secondarySweepValues) throw new Error('Missing outer coordinates');
      const coordinates = metrics(Array.from(sweep.secondarySweepValues), expectedOuter);
      if (coordinates.maxAbsError > 1e-12) throw new Error('Outer coordinate mismatch');
      return { plot: run.plot, command: reference.command, points: sweep.sweepValues.length, outer, coordinates, signals };
    });
    fixtures.push({ ...native, before, after: 'compared', analyses });
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    const code = 'code' in error ? error.code : null;
    if (code !== 'UNSUPPORTED_MODEL_PARAMETER' && code !== 'UNSUPPORTED_MODEL_LEVEL') throw error;
    const signals = native.path.includes('binning-1') ? Object.keys(oracle.binningOp.vectors) : [];
    fixtures.push({ ...native, before, after: 'unsupported', errorName: error.name, errorCode: code, message: error.message,
      comparedSignals: 0, maxAbsError: null, rmsError: null,
      analyses: [], unavailableSignals: signals.map(signal => ({ signal, maxAbsError: null, rmsError: null })) });
  }
}
const report = { schemaVersion: 1, sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  baselineHead: baseline.sourceHead, command: 'pnpm exec tsx benchmarks/bsim4-validation-3/compare.ts',
  policy: { identicalOriginalBytes: true, outputOnlyNativeInstrumentation: true, perCircuitTuning: false,
    pointMatching: 'source order, full six plots; primary and secondary coordinates verified', relativeFloor: 1e-18 }, grid, fixtures };
writeFileSync(new URL('after.json', here), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ grid: grid.map(x => ({ name: x.name, status: x.status })),
  fixtures: fixtures.map(x => ({ path: x.path, after: x.after, analyses: x.analyses.length })) }, null, 2));
