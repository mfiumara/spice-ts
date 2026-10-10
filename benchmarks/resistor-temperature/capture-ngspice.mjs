#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

const fixturePath = resolve('benchmarks/resistor-temperature/tc-list.cir');
const outputPath = resolve('benchmarks/resistor-temperature/ngspice-47-output.txt');
const referencePath = resolve('benchmarks/resistor-temperature/ngspice-47-reference.json');
const csvPath = resolve('benchmarks/resistor-temperature/ngspice-47-reference.csv');
const temperatures = [-55, 25, 72];
const fixture = readFileSync(fixturePath, 'utf8');
const stepLine = '.step TEMP LIST -55 25 72';
if (!fixture.includes(stepLine)) throw new Error(`fixture does not contain exact driver line: ${stepLine}`);

const versionRun = spawnSync('ngspice', ['--version'], { encoding: 'utf8' });
if (versionRun.error) throw versionRun.error;
if (versionRun.status !== 0) throw new Error(versionRun.stderr || `ngspice --version exited ${versionRun.status}`);
const versionOutput = `${versionRun.stdout}${versionRun.stderr}`;
const version = versionOutput.match(/ngspice-\d+(?:\.\d+)*/)?.[0];
if (version !== 'ngspice-47') throw new Error(`expected ngspice-47, got ${version ?? 'unparsed version'}`);

const directStepAttempt = spawnSync('ngspice', ['-b', fixturePath], { encoding: 'utf8', timeout: 30_000 });
if (directStepAttempt.error) throw directStepAttempt.error;
const directStepOutput = `${directStepAttempt.stdout}${directStepAttempt.stderr}`;
if (directStepAttempt.status === 0 || !directStepOutput.includes("unimplemented dot command '.step'")) {
  throw new Error(`ngspice-47 .step boundary changed; update the driver adaptation\n${directStepOutput}`);
}

const workspace = mkdtempSync(join(tmpdir(), 'spicets-resistor-temperature-'));
const samples = [];
const outputSections = [
  `COMMAND: ngspice --version\n${versionOutput.trimEnd()}\n`,
  `DIRECT_STEP_COMMAND: ngspice -b ${fixturePath}\nDIRECT_STEP_EXIT_STATUS: ${directStepAttempt.status}\nDIRECT_STEP_OUTPUT:\n${directStepOutput.trimEnd()}\n`,
];
try {
  writeFileSync(join(workspace, '.spiceinit'), 'set filetype=ascii\n');
  for (const temperatureC of temperatures) {
    const deck = fixture.replace(stepLine, `.temp ${temperatureC}`);
    const deckPath = join(workspace, `temp-${temperatureC}.cir`);
    const rawPath = join(workspace, `temp-${temperatureC}.raw`);
    writeFileSync(deckPath, deck);

    const command = `ngspice -b -r ${rawPath} ${deckPath}`;
    const started = performance.now();
    const run = spawnSync('ngspice', ['-b', '-r', rawPath, deckPath], {
      cwd: workspace,
      encoding: 'utf8',
      timeout: 30_000,
    });
    const wallClockMilliseconds = performance.now() - started;
    if (run.error) throw run.error;
    const processOutput = `${run.stdout}${run.stderr}`;
    if (run.status !== 0) throw new Error(`${command} exited ${run.status}\n${processOutput}`);
    const rawOutput = readFileSync(rawPath, 'utf8');
    const vectors = parseOperatingPoint(rawOutput);
    const outputVoltageV = value(vectors, 'v(out)');
    const sourceCurrentA = value(vectors, 'i(v1)');
    const effectiveResistanceOhm = -1 / sourceCurrentA - 2000;
    const deltaC = temperatureC - 27;
    const expectedResistanceOhm = 1000 * (1 + 1e-3 * deltaC + 2e-6 * deltaC * deltaC);
    const expectedOutputVoltageV = 2000 / (2000 + expectedResistanceOhm);
    assertClose(effectiveResistanceOhm, expectedResistanceOhm, `R1 at ${temperatureC} C`);
    assertClose(outputVoltageV, expectedOutputVoltageV, `V(out) at ${temperatureC} C`);
    samples.push({ temperatureC, outputVoltageV, sourceCurrentA, effectiveResistanceOhm, wallClockMilliseconds });
    outputSections.push([
      `TEMPERATURE_C: ${temperatureC}`,
      `DRIVER_ADAPTATION: ${stepLine} -> .temp ${temperatureC}`,
      `COMMAND: ${command}`,
      `WALL_CLOCK_MILLISECONDS: ${wallClockMilliseconds}`,
      'PROCESS_OUTPUT:',
      processOutput.trimEnd(),
      'RAW_OUTPUT:',
      rawOutput.trimEnd(),
      '',
    ].join('\n'));
  }
} finally {
  rmSync(workspace, { recursive: true, force: true });
}

const report = {
  fixture: 'benchmarks/resistor-temperature/tc-list.cir',
  fixtureSha256: createHash('sha256').update(fixture).digest('hex'),
  source: {
    url: 'https://github.com/mfiumara/spice-ts/issues/318',
    revision: 'issue-318 project-authored reference fixture',
    licence: 'MIT',
  },
  referenceSimulator: version,
  exactVersionOutput: versionOutput.trimEnd(),
  machine: {
    platform: platform(),
    release: release(),
    architecture: arch(),
    cpu: cpus()[0]?.model ?? 'unknown',
    node: process.version,
  },
  canonicalDriver: stepLine,
  directStepSupport: {
    ngspice: "unsupported: unimplemented dot command '.step'",
    command: `ngspice -b ${fixturePath}`,
    exitStatus: directStepAttempt.status,
  },
  ngspiceDriverAdaptation: 'ngspice-47 does not implement .step. For each LIST value, replace only the canonical .step TEMP LIST line with .temp <value>; topology, component values, model parameters, analysis, and tolerances remain unchanged.',
  commands: {
    reproduce: 'node benchmarks/resistor-temperature/capture-ngspice.mjs',
    version: 'ngspice --version',
    eachPoint: 'ngspice -b -r <temporary-raw-path> <temporary-deck-with-only-driver-line-adapted>',
  },
  runtimeCaveat: 'Each wall-clock measurement includes a separate ngspice process startup and raw-file write; no speed claim is made.',
  samples,
};
writeFileSync(referencePath, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(csvPath, [
  'temperature_c,output_voltage_v,source_current_a,effective_r1_ohm,wall_clock_ms',
  ...samples.map(sample => [sample.temperatureC, sample.outputVoltageV, sample.sourceCurrentA, sample.effectiveResistanceOhm, sample.wallClockMilliseconds].join(',')),
  '',
].join('\n'));
writeFileSync(outputPath, outputSections.join('\n'));
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

function parseOperatingPoint(raw) {
  const variablesMarker = 'Variables:\n';
  const valuesMarker = 'Values:\n';
  const variablesStart = raw.indexOf(variablesMarker);
  const valuesStart = raw.indexOf(valuesMarker);
  if (variablesStart < 0 || valuesStart < 0) throw new Error('ngspice raw output is missing Variables or Values');
  const names = raw.slice(variablesStart + variablesMarker.length, valuesStart)
    .trim().split('\n').map(line => line.trim().split(/\s+/)[1]);
  const tokens = raw.slice(valuesStart + valuesMarker.length).trim().split(/\s+/);
  const numbers = tokens.slice(1).map(Number);
  if (numbers.length !== names.length || numbers.some(number => !Number.isFinite(number))) {
    throw new Error(`invalid operating-point raw output: expected ${names.length} values, got ${numbers.length}`);
  }
  return Object.fromEntries(names.map((name, index) => [name.toLowerCase(), numbers[index]]));
}

function value(vectors, name) {
  const result = vectors[name];
  if (!Number.isFinite(result)) throw new Error(`ngspice raw output is missing ${name}`);
  return result;
}

function assertClose(actual, expected, description) {
  if (Math.abs(actual - expected) > 1e-12 * Math.max(Math.abs(expected), 1)) {
    throw new Error(`${description}: expected ${expected}, got ${actual}`);
  }
}
