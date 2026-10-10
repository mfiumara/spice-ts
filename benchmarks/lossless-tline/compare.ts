#!/usr/bin/env tsx
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { parse, simulate } from '../../packages/core/src/index.js';

const fixtures = ['matched.cir', 'mismatched.cir'];
const directory = resolve('benchmarks/lossless-tline');

void main();

async function main(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), 'spicets-tline-'));
  try {
    const versionOutput = execFileSync('ngspice', ['--version'], { encoding: 'utf8' });
    const version = versionOutput.match(/ngspice-(\d+)/)?.[0] ?? 'ngspice (version not parsed)';
    const comparisons = [];

    for (const name of fixtures) {
      const fixturePath = join(directory, name);
      const bytes = readFileSync(fixturePath);
      const dataPath = join(workspace, `${basename(name, '.cir')}.dat`);
      const deckPath = join(workspace, name);
      const deck = bytes.toString('utf8').replace(/^\.end\s*$/im, '')
        + `\n.control\nrun\nset wr_singlescale\nset wr_vecnames\nwrdata ${dataPath} v(input) v(output)\nquit\n.endc\n.end\n`;
      writeFileSync(deckPath, deck);
      execFileSync('ngspice', ['-b', deckPath], { encoding: 'utf8', timeout: 30_000 });

      const reference = readWaveform(dataPath);
      const simulation = await simulate(parse(bytes.toString('utf8')));
      if (!simulation.transient) throw new Error(`${name}: spice-ts returned no transient result`);
      const time = [...simulation.transient.time];
      const spiceInput = [...simulation.transient.voltage('input')];
      const spiceOutput = [...simulation.transient.voltage('output')];
      const matchedInput = reference.time.map(point => interpolate(time, spiceInput, point));
      const matchedOutput = reference.time.map(point => interpolate(time, spiceOutput, point));
      const inputTransition = transition(reference.time, reference.input, 0.25);
      const outputTransition = transition(reference.time, reference.output, 0.25);

      comparisons.push({
        fixture: `benchmarks/lossless-tline/${name}`,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        identicalNetlistForBothEngines: true,
        ngspiceCommand: `ngspice -b <temporary-deck-with-wrdata> benchmarks/lossless-tline/${name}`,
        matchedPointCount: reference.time.length,
        waveformErrors: {
          input: metrics(matchedInput, reference.input),
          output: metrics(matchedOutput, reference.output),
        },
        propagation: {
          inputTransition,
          outputTransition,
          measuredDelay: inputTransition === null || outputTransition === null
            ? null
            : outputTransition - inputTransition,
          configuredDelay: 5e-9,
        },
        reflections: name === 'mismatched.cir' ? {
          loadArrival: transition(reference.time, reference.output, 0.75),
          sourceReturn: transition(reference.time, reference.input, 0.75),
          amplitudes: {
            initialInput: sample(reference.time, reference.input, 1.2e-9),
            firstLoad: sample(reference.time, reference.output, 6.2e-9),
            returnedInput: sample(reference.time, reference.input, 11.2e-9),
            secondLoad: sample(reference.time, reference.output, 16.2e-9),
          },
        } : {
          maximumInputDeviationAfterRoundTrip: maxDeviation(
            reference.time,
            reference.input,
            11.2e-9,
            0.5,
          ),
        },
      });
    }

    const report = JSON.stringify({
      referenceSimulator: version,
      redReceipt: "pnpm -C packages/core exec vitest run src/parser/transmission-line-parser.test.ts src/devices/transmission-line.test.ts => 2 files failed; missing transmission-line module and Unsupported device card: 'T'",
      implementation: 'bounded lossless T-card with positive Z0 and TD only',
      relativeErrorDenominator: 'max(abs(ngspice reference), 1e-9 V); near-zero relative losses are intentionally retained',
      unsupported: ['F/NL frequency-length form', 'IC', 'REL/ABS', 'O-card LTRA/lossy lines'],
      comparisons,
    }, null, 2);
    const outputIndex = process.argv.indexOf('--output');
    if (outputIndex >= 0) {
      const outputPath = process.argv[outputIndex + 1];
      if (!outputPath) throw new Error('--output requires a path');
      writeFileSync(resolve(outputPath), `${report}\n`);
    }
    console.log(report);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

function readWaveform(path: string): { time: number[]; input: number[]; output: number[] } {
  const rows = readFileSync(path, 'utf8').trim().split('\n').slice(1)
    .map(line => line.trim().split(/\s+/).map(Number));
  return {
    time: rows.map(row => row[0]),
    input: rows.map(row => row[1]),
    output: rows.map(row => row[2]),
  };
}

function interpolate(time: number[], values: number[], target: number): number {
  if (target <= time[0]) return values[0];
  for (let index = 1; index < time.length; index++) {
    if (target <= time[index]) {
      const fraction = (target - time[index - 1]) / (time[index] - time[index - 1]);
      return values[index - 1] + fraction * (values[index] - values[index - 1]);
    }
  }
  return values[values.length - 1];
}

function metrics(actual: number[], expected: number[]): object {
  const absolute = actual.map((value, index) => Math.abs(value - expected[index]));
  const relative = absolute.map((value, index) => value / Math.max(Math.abs(expected[index]), 1e-9));
  return {
    maximumAbsoluteError: Math.max(...absolute),
    rmsAbsoluteError: Math.sqrt(absolute.reduce((sum, value) => sum + value * value, 0) / absolute.length),
    maximumRelativeError: Math.max(...relative),
    rmsRelativeError: Math.sqrt(relative.reduce((sum, value) => sum + value * value, 0) / relative.length),
  };
}

function transition(time: number[], values: number[], threshold: number): number | null {
  const index = values.findIndex(value => value >= threshold);
  return index < 0 ? null : time[index];
}

function sample(time: number[], values: number[], target: number): number {
  return interpolate(time, values, target);
}

function maxDeviation(time: number[], values: number[], start: number, expected: number): number {
  return Math.max(...values.filter((_value, index) => time[index] >= start)
    .map(value => Math.abs(value - expected)), 0);
}
