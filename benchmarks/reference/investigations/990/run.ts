import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, platform, arch, cpus } from 'node:os';
import { join } from 'node:path';
import { alignAndMeasure, runNgspice } from '../../../comparison-harness.js';
import { parseXyceCsv, runXyce, translateForXyce } from '../../xyce.js';

const directory = 'benchmarks/reference/investigations/990';
const sha256 = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const executable = process.env.XYCE_BIN ?? 'Xyce';
const version = (bin: string, args: string[]) => {
  const result = spawnSync(bin, args, { encoding: 'utf8', timeout: 10_000 });
  assert.equal(result.status, 0, result.error?.message ?? result.stderr);
  return result.stdout.trim();
};

async function main() {
  const ngspiceVersion = version('ngspice', ['--version']);
  const xyceVersion = version(executable, ['-v']);
  assert.match(ngspiceVersion, /ngspice-47\b/);
  assert.match(xyceVersion, /Release 7\.10\.0\b/);
  const manifest = JSON.parse(readFileSync('benchmarks/reference/mutual-948/hash-manifest.json', 'utf8'));
  const row = manifest.find((r: { key: string }) => r.key === 'classic/rca3040-wideband-amplifier');
  const projection = row.projections[0];
  const netlist = readFileSync(projection.sharedInputPath, 'utf8');
  const beforeDeck = readFileSync(projection.xyceInputPath, 'utf8');
  assert.equal(sha256(netlist), projection.sharedInputSha256);
  assert.equal(sha256(beforeDeck), projection.xyceInputSha256);
  const signals = ['v(8)', 'v(9)', 'v(14)', 'v(15)', 'v(10)', 'v(11)'];
  const fixture = { name: 'rca3040-990', netlist, analysis: 'ac' as const, signals };
  const translated = translateForXyce(fixture);
  writeFileSync(`${directory}/after.cir`, translated.netlist);
  const scratch = mkdtempSync(join(tmpdir(), 'spice-ts-990-'));
  try {
    // Execute the hash-pinned historical Xyce export, never approximate the old
    // adapter by undoing only this circuit's parameter change in today's code.
    writeFileSync(join(scratch, 'input.cir'), beforeDeck);
    const native = spawnSync(executable, ['input.cir'], { cwd: scratch, encoding: 'utf8', timeout: 60_000 });
    assert.equal(native.status, 0, native.error?.message ?? native.stdout + native.stderr);
    const before = { command: [executable, 'input.cir'], output: native.stdout + native.stderr,
      series: parseXyceCsv(readFileSync(join(scratch, 'output.csv'), 'utf8'), 'ac', signals) };
    const ngspice = await runNgspice(fixture);
    const after = await runXyce(fixture, { executable });
    assert.equal(ngspice.status, 'success', JSON.stringify(ngspice));
    assert.equal(after.status, 'success', JSON.stringify(after));
    if (ngspice.status !== 'success' || after.status !== 'success') return;
    const metrics = {
      before: alignAndMeasure(ngspice.series, before.series, signals),
      after: alignAndMeasure(ngspice.series, after.series, signals),
    };
    const report = {
      schemaVersion: 'spice-ts-xyce-bare-bjt/v1',
      environment: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0].model, ngspiceVersion, xyceVersion },
      sourceHead: version('git', ['rev-parse', 'HEAD']),
      adapterSha256: sha256(readFileSync('benchmarks/reference/xyce.ts')),
      sharedInputPath: projection.sharedInputPath, sharedInputSha256: sha256(netlist),
      beforeInputPath: projection.xyceInputPath, beforeInputSha256: sha256(beforeDeck),
      afterInputPath: `${directory}/after.cir`, afterInputSha256: sha256(translated.netlist),
      changes: translated.changes, signals, ngspice, before, after, metrics,
      policy: 'Same ngspice-47 input and tolerances before/after. Only Xyce BJT assignment syntax and native output selection change. No full-corpus refresh or speed claim.',
    };
    writeFileSync(`${directory}/report.json`, JSON.stringify(report) + '\n');
    console.log(JSON.stringify(metrics, null, 2));
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
void main();
