import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { simulate } from '../../packages/core/dist/index.js';
import { readNgspiceRawFile } from '../corpus/corpus-f/raw-stream.js';

async function main() {
// Export every existing plot from the byte-identical original, not a rewritten deck.
const path = 'benchmarks/corpus/corpus-j/fixtures/ngspice-current/examples/mos/nmos_pmos_BSIM330.sp';
const input = await readFile(path);
const directory = await mkdtemp(resolve(tmpdir(), 'dc-temp-956-'));
try {
  await writeFile(resolve(directory, 'fixture.cir'), input);
  await writeFile(resolve(directory, '.spiceinit'), 'set filetype=ascii\n');
  const wrapper = ['* all six original DC plots, output only', '.control', 'source fixture.cir',
    ...Array.from({ length: 6 }, (_, i) => `setplot dc${i + 1}\nwrite dc${i + 1}.raw all`), '.endc', '.end'].join('\n');
  await writeFile(resolve(directory, 'wrapper.cir'), wrapper);
  const ng = spawnSync('ngspice', ['-b', 'wrapper.cir'], {
    cwd: directory, env: { ...process.env, HOME: directory, DISPLAY: '' }, encoding: 'utf8', timeout: 20_000,
  });
  if (ng.status !== 0) throw new Error(ng.stderr);
  const result = await simulate(input.toString());
  const plots = [];
  for (let index = 0; index < 6; index++) {
    const [reference] = await readNgspiceRawFile(resolve(directory, `dc${index + 1}.raw`));
    const sweep = result.control!.runs[index].result.dcSweep!;
    if (reference.grid.length !== sweep.sweepValues.length) throw new Error('point count mismatch');
    reference.grid.forEach((value, i) => {
      if (Math.abs(value - sweep.sweepValues[i]) > 1e-12) throw new Error('grid mismatch');
    });
    const signals = Object.fromEntries([
      ...[...sweep.voltages].map(([name, values]) => [`v(${name.toLowerCase()})`, values] as const),
      ...[...sweep.currents].map(([name, values]) => [`i(${name.toLowerCase()})`, values] as const),
    ]);
    const groups = new Map<number, number[]>();
    sweep.secondarySweepValues!.forEach((value, i) => groups.set(value, [...(groups.get(value) ?? []), i]));
    const metrics = (indices: number[]) => Object.fromEntries(Object.entries(signals).map(([name, values]) => {
      const expected = reference.signals[name];
      if (!expected) throw new Error(`missing reference ${name}`);
      const absolute = indices.map(i => Math.abs(values[i] - expected[i].re));
      const relative = indices.filter(i => expected[i].re !== 0).map(i => Math.abs((values[i] - expected[i].re) / expected[i].re));
      const stats = (errors: number[]) => ({ max: errors.length ? Math.max(...errors) : null,
        rms: errors.length ? Math.sqrt(errors.reduce((sum, value) => sum + value * value, 0) / errors.length) : null });
      return [name, { points: indices.length, absoluteError: stats(absolute), relativeError: stats(relative), excludedZeroReferences: indices.length - relative.length }];
    }));
    plots.push({ plot: `dc${index + 1}`, points: reference.grid.length, signals: metrics(Array.from(reference.grid, (_, i) => i)),
      groups: [...groups].map(([value, indices]) => ({ secondaryValue: value, points: indices.length, signals: metrics(indices) })) });
  }
  await writeFile('benchmarks/dc-temp-956/all-plots.json', JSON.stringify({ fixture: path,
    sha256: createHash('sha256').update(input).digest('hex'), engine: 'ngspice-47', command: 'spice-heavy pnpm exec tsx benchmarks/dc-temp-956/all-plots.ts',
    policy: 'byte-identical original fixture, all six original control analyses; indexed pairing with verified equal grids; no tolerance overrides; relative errors exclude exact zero reference samples',
    temperaturePlots: ['dc3', 'dc6'], plots }, null, 2) + '\n');
  await writeFile('benchmarks/dc-temp-956/all-plots-ngspice.log', ng.stdout + ng.stderr);
} finally {
  await rm(directory, { recursive: true, force: true });
}
}
main().catch(error => { console.error(error); process.exitCode = 1; });
