import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release, tmpdir } from 'node:os';
import { join } from 'node:path';
import { alignAndMeasure, type SampleSeries } from '../../../comparison-harness.js';
import { runNgspiceReference, sha256 } from '../../expanded.js';
import { parseXyceCsv, runXyce, translateForXyce } from '../../xyce.js';

// Run via spice-heavy. Keep all #974 and mutual-948 historical receipts intact.
const directory = 'benchmarks/reference/investigations/974';
const executable = process.env.XYCE_BIN ?? 'Xyce';
const version = (bin: string, args: string[]) => {
  const result = spawnSync(bin, args, { encoding: 'utf8', timeout: 10_000 });
  assert.equal(result.status, 0, result.error?.message ?? result.stderr);
  return result.stdout.trim();
};
function summary(series: SampleSeries, signals: string[]) {
  return { points: series.grid.length, firstTime: series.grid[0], lastTime: series.grid.at(-1),
    signals: Object.fromEntries(signals.map(signal => {
      const values = series.signals[signal];
      return [signal, { first: values[0], last: values.at(-1),
        min: values.reduce((min, value) => Math.min(min, value.re), Infinity),
        max: values.reduce((max, value) => Math.max(max, value.re), -Infinity) }];
    })) };
}
async function main() {
  const environment = { node: process.version, platform: platform(), release: release(), arch: arch(), cpu: cpus()[0].model,
    ngspiceVersion: version('ngspice', ['--version']), xyceVersion: version(executable, ['-v']) };
  assert.match(environment.ngspiceVersion, /ngspice-47\b/);
  assert.match(environment.xyceVersion, /Release 7\.10\.0\b/);
  const historical = JSON.parse(readFileSync('benchmarks/reference/mutual-948/report.json', 'utf8'));
  const row = historical.fixtures.find((r: { key: string }) => r.key === 'ngspice/jimi-fuzz');
  const projection = row.projections[0];
  const shared = readFileSync(projection.sharedInputPath, 'utf8');
  const beforeDeck = readFileSync(projection.xyceInputPath, 'utf8');
  assert.equal(sha256(shared), projection.sharedInputSha256);
  assert.equal(sha256(beforeDeck), projection.xyceInputSha256);
  const signals: string[] = row.comparisons[0].signals;
  const fixture = { name: 'jimi-fuzz-sine-994', analysis: 'tran' as const, netlist: shared, signals };
  const translated = translateForXyce(fixture);
  // Identical capacitor IC, DC, waveform parameters, maxstep and output columns.
  assert.equal(translated.netlist, beforeDeck.replace(/\bsine(?=\()/i, 'SIN'));
  writeFileSync(`${directory}/jimi-fuzz-sine-994-xyce.cir`, translated.netlist);
  const scratch = mkdtempSync(join(tmpdir(), 'spice-ts-sine-994-'));
  try {
    writeFileSync(join(scratch, 'input.cir'), beforeDeck);
    const native = spawnSync(executable, ['input.cir'], { cwd: scratch, encoding: 'utf8', timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });
    assert.equal(native.status, 0, native.error?.message ?? native.stdout + native.stderr);
    const beforeSeries = parseXyceCsv(readFileSync(join(scratch, 'output.csv'), 'utf8'), 'tran', signals);
    const ngspice = runNgspiceReference(shared, 'tran');
    const after = await runXyce(fixture, { executable, timeoutMs: 120_000 });
    assert.equal(ngspice.status, 'success', JSON.stringify(ngspice.status));
    assert.equal(after.status, 'success', after.status === 'success' ? '' : after.error);
    if (ngspice.status !== 'success' || after.status !== 'success') return;
    const { series: ngSeries, output: ngOutput, ...ngReceipt } = ngspice;
    const { series: afterSeries, output: afterOutput, ...afterReceipt } = after;
    const metrics = {
      before: alignAndMeasure(ngSeries, beforeSeries, signals),
      after: alignAndMeasure(ngSeries, afterSeries, signals),
      afterReverse: alignAndMeasure(afterSeries, ngSeries, signals),
    };
    const report = { schemaVersion: 'spice-ts-xyce-sine/v1', environment,
      sourceHead: version('git', ['rev-parse', 'HEAD']), adapterSha256: sha256(readFileSync('benchmarks/reference/xyce.ts')),
      sharedInputPath: projection.sharedInputPath, sharedInputSha256: sha256(shared),
      beforeInputPath: projection.xyceInputPath, beforeInputSha256: sha256(beforeDeck),
      afterInputPath: `${directory}/jimi-fuzz-sine-994-xyce.cir`, afterInputSha256: sha256(translated.netlist),
      signals, changes: translated.changes,
      ngspice: { ...ngReceipt, output: ngOutput, ...summary(ngSeries, signals) },
      before: { command: [executable, 'input.cir'], output: native.stdout + native.stderr, ...summary(beforeSeries, signals) },
      after: { ...afterReceipt, output: afterOutput, ...summary(afterSeries, signals) }, metrics,
      policy: 'Fresh ngspice-47 reference on unchanged shared input; Xyce 7.10 historical export vs current adapter. Only SINE spelling changes. Device IC and solver settings remain unchanged. No parity or speed claim.',
    };
    writeFileSync(`${directory}/sine-994-report.json`, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ before: metrics.before.signals['v(3)'], after: metrics.after.signals['v(3)'],
      sourceBefore: report.before.signals['v(10)'], sourceAfter: report.after.signals['v(10)'] }, null, 2));
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
