// Run from the repository root: pnpm exec tsx benchmarks/vbic-noise/compare.ts
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir, platform, arch } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { simulate } from '../../packages/core/src/index.js';
import { assertMatchedFrequencies, metrics, readNoiseRaw } from '../noise-raw.js';

async function main(): Promise<void> {
  const fixturePath = resolve('benchmarks/corpus/corpus-f/fixtures/tests/vbic/noise_scale_test.cir');
  const fixture = readFileSync(fixturePath);
  const sha256 = createHash('sha256').update(fixture).digest('hex');
  if (sha256 !== '2877ccad8bcb440258e65a8a817edfd8536029ae192b3049cb62f248a8a81286') {
    throw new Error(`fixture hash mismatch: ${sha256}`);
  }
  const workspace = mkdtempSync(join(tmpdir(), 'spicets-vbic-noise-'));
  try {
    const raw = join(workspace, 'reference.raw');
    const version = execFileSync('ngspice', ['--version'], { encoding: 'utf8' }).match(/ngspice-\d+/)?.[0];
    const start = performance.now();
    execFileSync('ngspice', ['-n', '-b', '-r', raw, fixturePath], { stdio: 'pipe', timeout: 30_000 });
    const ngspiceMilliseconds = performance.now() - start;
    const reference = readNoiseRaw(raw);
    const spiceStart = performance.now();
    const actual = (await simulate(fixture.toString('utf8'))).noise;
    const spiceTsMilliseconds = performance.now() - spiceStart;
    if (!actual) throw new Error('spice-ts returned no noise result');
    assertMatchedFrequencies(actual.frequencies, reference.frequencies);
    console.log(JSON.stringify({
      fixture: fixturePath, sha256, ngspice: version, machine: `${platform()} ${arch()}`,
      points: actual.frequencies.length,
      output: metrics(actual.outputNoiseDensity, reference.output),
      input: metrics(actual.inputNoiseDensity, reference.input),
      integratedOutput: { actual: actual.integratedOutputNoise, reference: reference.integratedOutput },
      integratedInput: { actual: actual.integratedInputNoise, reference: reference.integratedInput },
      ngspiceMilliseconds, spiceTsMilliseconds,
      caveat: 'Single cold run, not a performance claim. ngspice spectra omit RS/ICCP but integrated totals include them.',
    }, null, 2));
    for (const [values, expected] of [
      [actual.outputNoiseDensity, reference.output],
      [actual.inputNoiseDensity, reference.input],
    ] as const) {
      if (values.some((value, i) => !Number.isFinite(value) || Math.abs(value / expected[i] - 1) > 5e-6)) {
        throw new Error('VBIC noise density regression');
      }
    }
    for (const [value, expected] of [
      [actual.integratedOutputNoise, reference.integratedOutput],
      [actual.integratedInputNoise, reference.integratedInput],
    ] as const) {
      if (value === undefined || !Number.isFinite(value) || Math.abs(value / expected - 1) > 5e-6) {
        throw new Error('VBIC integrated noise regression');
      }
    }
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}
void main();
