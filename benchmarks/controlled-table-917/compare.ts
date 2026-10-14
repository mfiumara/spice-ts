// SPDX-License-Identifier: MIT
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulate } from '../../packages/core/src/simulate.js';
import { ParseError } from '../../packages/core/src/errors.js';
import { parseNgspiceRaw } from '../comparison-harness.js';

async function main(): Promise<void> {
const here = dirname(fileURLToPath(import.meta.url));
const run = join(here, '.run');
mkdirSync(run, { recursive: true });
writeFileSync(join(run, '.spiceinit'), 'set ngbehavior=ltps\nset filetype=ascii\n');
const sha256 = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const version = spawnSync('ngspice', ['--version'], { encoding: 'utf8', timeout: 30_000 });
if (version.status !== 0 || !/ngspice-47/.test(version.stdout)) throw new Error('ngspice-47 required');

const cases = [];
for (const name of ['e.cir', 'g-subckt.cir']) {
  const deck = readFileSync(join(here, name));
  const path = join(run, name);
  const raw = join(run, `${name}.raw`);
  writeFileSync(path, deck);
  const started = performance.now();
  const reference = spawnSync('ngspice', ['-b', '-r', raw, path], {
    cwd: run, encoding: 'utf8', timeout: 30_000,
  });
  const ngspiceMilliseconds = performance.now() - started;
  writeFileSync(join(run, `${name}.log`), reference.stdout + reference.stderr);
  if (reference.status !== 0) throw new Error(`Reference failed for ${name}`);
  const plot = parseNgspiceRaw(readFileSync(raw, 'utf8')).find(p => /dc transfer/i.test(p.plotName));
  if (!plot || plot.grid.length !== 81) throw new Error(`Missing 81-row sweep for ${name}`);
  let native: Record<string, unknown>;
  const nativeStarted = performance.now();
  try {
    const result = await simulate(deck.toString('utf8'));
    native = { status: 'success', values: Array.from(result.dcSweep!.voltage('out')) };
  } catch (error) {
    native = {
      status: error instanceof ParseError ? 'unsupported' : 'failure',
      errorName: (error as Error).name,
      message: (error as Error).message,
      tableUnsupported: error instanceof ParseError && /TABLE.*not supported/.test(error.message),
      line: error instanceof ParseError ? error.line : null,
    };
  }
  native.milliseconds = performance.now() - nativeStarted;
  if (sha256(readFileSync(path)) !== sha256(deck)) throw new Error('Input bytes changed');
  cases.push({
    name, sha256: sha256(deck), identicalBytes: true,
    ngspice: { exit: reference.status, milliseconds: ngspiceMilliseconds,
      grid: plot.grid, values: plot.signals['v(out)'].map(v => v.re) },
    spiceTs: native, maxError: null, rmsError: null,
  });
}
const output = process.argv[2] ?? 'after.json';
if (!/^(before|after)\.json$/.test(output)) throw new Error('Expected before.json or after.json');
writeFileSync(join(here, output), JSON.stringify({
  configuration: 'set ngbehavior=ltps\nset filetype=ascii\n',
  ngspiceVersion: version.stdout.trim(), scope: 'fail-closed safety, not numeric parity', cases,
}, null, 2) + '\n');
console.log(JSON.stringify(cases.map(c => ({ name: c.name, rows: c.ngspice.grid.length,
  native: c.spiceTs.status, tableUnsupported: c.spiceTs.tableUnsupported })), null, 2));
if (output === 'after.json' && cases.some(c => c.spiceTs.status !== 'unsupported')) process.exitCode = 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
