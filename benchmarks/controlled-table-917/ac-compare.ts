// SPDX-License-Identifier: MIT
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulate } from '../../packages/core/src/simulate.js';
import { parseNgspiceRaw } from '../comparison-harness.js';

async function main(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const run = join(here, '.run');
  mkdirSync(run, { recursive: true });
  writeFileSync(join(run, '.spiceinit'), 'set ngbehavior=ltps\nset filetype=ascii\n');
  const deck = readFileSync(join(here, 'ac.cir'));
  const path = join(run, 'ac.cir');
  const raw = join(run, 'ac.cir.raw');
  writeFileSync(path, deck);
  const version = spawnSync('ngspice', ['--version'], { encoding: 'utf8', timeout: 30_000 });
  if (version.status !== 0 || !/ngspice-47/.test(version.stdout)) throw new Error('ngspice-47 required');
  const reference = spawnSync('ngspice', ['-b', '-r', raw, path], { cwd: run, encoding: 'utf8', timeout: 30_000 });
  if (reference.status !== 0) throw new Error('AC reference failed');
  const plot = parseNgspiceRaw(readFileSync(raw, 'utf8')).find(plot => /AC Analysis/i.test(plot.plotName));
  if (!plot || plot.grid.length !== 1) throw new Error('Expected one AC reference row');
  const result = await simulate(deck.toString('utf8'));
  const native = result.ac!.voltage('out');
  if (native.length !== 1 || result.ac!.frequencies[0] !== plot.grid[0]) throw new Error('AC grids differ');
  const referenceVoltage = plot.signals['v(out)'][0];
  const referenceMagnitude = Math.hypot(referenceVoltage.re, referenceVoltage.im);
  const referencePhase = Math.atan2(referenceVoltage.im, referenceVoltage.re) * 180 / Math.PI;
  const maxError = Math.max(Math.abs(native[0].magnitude - referenceMagnitude), Math.abs(native[0].phase - referencePhase));
  if (!readFileSync(path).equals(deck)) throw new Error('AC input bytes changed');
  const receipt = {
    sha256: createHash('sha256').update(deck).digest('hex'), identicalBytes: true,
    ngspiceVersion: version.stdout.trim(), frequencies: plot.grid,
    ngspice: { exit: reference.status, voltage: { magnitude: referenceMagnitude, phase: referencePhase } },
    spiceTs: { rows: native.length, voltage: native[0] }, maxError,
    errorUnits: 'max of magnitude error in V/V and phase error in degrees',
  };
  writeFileSync(join(here, 'ac-after.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt, null, 2));
  if (!Number.isFinite(maxError) || maxError > 1e-8) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
