#!/usr/bin/env tsx
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { simulate } from '../../packages/core/src/index.js';

const fixtures = ['lin', 'dec', 'oct'].map(sweep => ({
  sweep,
  path: `benchmarks/diode-noise/diode-noise-${sweep}.cir`,
}));
const repetitions = 5;

interface Spectrum {
  frequencies: number[];
  output: number[];
  input: number[];
  integratedOutput: number;
  integratedInput: number;
}

void main();

async function main(): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), 'spicets-diode-noise-'));
  const comparisons: object[] = [];
  const failures: Array<{ fixture: string; simulator: string; error: string }> = [];
  try {
    const versionResult = spawnSync('ngspice', ['--version'], { encoding: 'utf8' });
    const versionOutput = `${versionResult.stdout ?? ''}\n${versionResult.stderr ?? ''}`;
    const ngspiceVersion = versionOutput.match(/ngspice-\d+/)?.[0] ?? 'unavailable';

    for (const fixture of fixtures) {
      const netlist = readFileSync(resolve(fixture.path), 'utf8');
      const instrumentedPath = join(directory, `${fixture.sweep}.cir`);
      writeFileSync(instrumentedPath, addOutputControls(netlist));
      try {
        const ngStarted = performance.now();
        const ngResult = spawnSync('ngspice', ['-b', '-n', instrumentedPath], {
          encoding: 'utf8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024,
        });
        const ngWallMs = performance.now() - ngStarted;
        const ngOutput = `${ngResult.stdout ?? ''}\n${ngResult.stderr ?? ''}`;
        if (ngResult.error) throw ngResult.error;
        if (ngResult.status !== 0) throw new Error(`ngspice exited ${ngResult.status}: ${ngOutput}`);
        const ngspice = parseNgspice(ngOutput);

        const spiceTsTimesMs: number[] = [];
        let spiceTsResult: Awaited<ReturnType<typeof simulate>> | undefined;
        for (let run = 0; run < repetitions; run++) {
          const started = performance.now();
          spiceTsResult = await simulate(netlist);
          spiceTsTimesMs.push(performance.now() - started);
        }
        const noise = spiceTsResult!.noise;
        if (!noise) throw new Error('spice-ts returned no noise result');
        const spiceTs: Spectrum = {
          frequencies: noise.frequencies,
          output: noise.outputNoiseDensity,
          input: noise.inputNoiseDensity,
          integratedOutput: noise.integratedOutputNoise!,
          integratedInput: noise.integratedInputNoise!,
        };
        comparisons.push({
          fixture: fixture.path,
          sweep: fixture.sweep.toUpperCase(),
          identicalNetlistSha256: createHash('sha256').update(netlist).digest('hex'),
          points: { spiceTs: spiceTs.frequencies.length, ngspice: ngspice.frequencies.length },
          errors: {
            frequencyHz: metrics(spiceTs.frequencies, ngspice.frequencies),
            outputDensityVPerSqrtHz: metrics(spiceTs.output, ngspice.output),
            inputDensityVPerSqrtHz: metrics(spiceTs.input, ngspice.input),
            integratedOutputV: scalarMetrics(spiceTs.integratedOutput, ngspice.integratedOutput),
            integratedInputV: scalarMetrics(spiceTs.integratedInput, ngspice.integratedInput),
          },
          runtimeDiagnosticsMs: {
            spiceTsPublicApi: { samples: spiceTsTimesMs, median: median(spiceTsTimesMs) },
            ngspiceFreshCliWall: ngWallMs,
          },
        });
      } catch (error) {
        failures.push({
          fixture: fixture.path,
          simulator: 'comparison',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    console.log(JSON.stringify({
      referenceSimulator: ngspiceVersion,
      repetitions,
      method: 'Committed netlist bytes are passed unchanged to spice-ts; ngspice receives only appended batch output-control commands.',
      comparisons,
      failures,
      unsupported: [
        'BJT and MOSFET device noise',
        'unexpanded diode series-resistance noise',
        'temperature-card and per-instance diode temperature noise',
        'stepped noise analysis',
        'differential and current noise outputs',
        'current-source input referral',
      ],
    }, null, 2));
    if (failures.length > 0) process.exitCode = 1;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function addOutputControls(netlist: string): string {
  return netlist.replace(/\.end\s*$/i, `.control\nset numdgt=15\nrun\nsetplot noise1\nprint all\nsetplot noise2\nprint all\n.endc\n.end\n`);
}

function parseNgspice(output: string): Spectrum {
  const frequencies: number[] = [];
  const input: number[] = [];
  const outputDensity: number[] = [];
  for (const line of output.split('\n')) {
    const match = line.match(/^\s*\d+\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s*$/);
    if (!match) continue;
    frequencies.push(Number(match[1]));
    input.push(Number(match[2]));
    outputDensity.push(Number(match[3]));
  }
  if (frequencies.length === 0) throw new Error('ngspice spectrum table was not found');
  const integratedInput = Number(output.match(/inoise_total\s*=\s*([\d.eE+-]+)/)?.[1]);
  const integratedOutput = Number(output.match(/onoise_total\s*=\s*([\d.eE+-]+)/)?.[1]);
  if (!Number.isFinite(integratedInput) || !Number.isFinite(integratedOutput)) {
    throw new Error('ngspice integrated totals were not found');
  }
  return { frequencies, input, output: outputDensity, integratedInput, integratedOutput };
}

function metrics(actual: number[], expected: number[]): object {
  if (actual.length !== expected.length) {
    return { status: 'count-mismatch', spiceTsCount: actual.length, ngspiceCount: expected.length };
  }
  const absolute = actual.map((value, index) => Math.abs(value - expected[index]));
  const relative = absolute.map((value, index) => value / Math.max(Math.abs(expected[index]), Number.MIN_VALUE));
  return {
    status: 'matched',
    maxAbsolute: Math.max(...absolute),
    rmsAbsolute: rms(absolute),
    maxRelative: Math.max(...relative),
    rmsRelative: rms(relative),
  };
}

function scalarMetrics(actual: number, expected: number): object {
  const absolute = Math.abs(actual - expected);
  return { spiceTs: actual, ngspice: expected, absolute, relative: absolute / Math.abs(expected) };
}

function rms(values: number[]): number {
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}
