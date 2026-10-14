// SPDX-License-Identifier: MIT
// Diagnosis only. Vendor bytes stay in the ignored fetch directory.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, symlinkSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseAsync } from '../../packages/core/src/parser/index.js';
import { simulate } from '../../packages/core/src/simulate.js';
import { MNAAssembler } from '../../packages/core/src/mna/assembler.js';
import { GilbertPeierlsSolver } from '../../packages/core/src/solver/gilbert-peierls.js';
import type { CscMatrix } from '../../packages/core/src/solver/csc-matrix.js';
import * as harnessModule from '../comparison-harness.js';
const { parseNgspiceRaw } = (harnessModule as { default?: typeof harnessModule }).default ?? harnessModule;

type Factor = { deviceGmin: number; sourceScale: number; nonfinite: number; rows: [string, string, number][]; error?: string };
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const vendor = resolve('benchmarks/corpus/ngspice-bugs/fetched/795');
const output = resolve(process.argv[2] ?? 'benchmarks/ticket795-singular-917/receipt.json');
const nativeDir = resolve('benchmarks/ticket795-singular-917/.native');
mkdirSync(nativeDir, { recursive: true });
if (!existsSync(resolve(nativeDir, 'spice_lib'))) symlinkSync(resolve(vendor, 'spice_lib'), resolve(nativeDir, 'spice_lib'));
writeFileSync(resolve(nativeDir, '.spiceinit'), 'set filetype=ascii\n');
const originalGet = MNAAssembler.prototype.getSparseSolver;
const originalFactor = GilbertPeierlsSolver.prototype.factorize;
let assembler: MNAAssembler;
let factors: Factor[] = [];
let names: string[] = [];
let targets: number[] = [];
MNAAssembler.prototype.getSparseSolver = function () { assembler = this; return originalGet.call(this); };
GilbertPeierlsSolver.prototype.factorize = function (matrix: CscMatrix) {
  const rows: Factor['rows'] = [];
  for (let col = 0; col < matrix.size; col++) {
    for (let p = matrix.colPtr[col]; p < matrix.colPtr[col + 1]; p++) {
      if (targets.includes(matrix.rowIdx[p]) && matrix.values[p] !== 0) {
        rows.push([names[matrix.rowIdx[p]], names[col], matrix.values[p]]);
      }
    }
  }
  const receipt: Factor = { deviceGmin: assembler.deviceGmin, sourceScale: assembler.sourceScale,
    nonfinite: [...matrix.values].filter(v => !Number.isFinite(v)).length, rows };
  factors.push(receipt);
  try { return originalFactor.call(this, matrix); }
  catch (error) { receipt.error = String(error); throw error; }
};
const pins: Record<string, string> = {
  'base_37.local.cir': 'd9310705e01c9ead00f033a7418e3c9cc5e5badc4699081fa0841f89031373a5',
  'variant_37.local.cir': 'fb1a6f8645a33268ab5a614a10b42d358b99f500d6d38b9add4c3cfd11d71562',
};
const receipts = [];
try {
  for (const name of [...Object.keys(pins), 'floating-diode.cir']) {
    const directory = name === 'floating-diode.cir' ? resolve('benchmarks/ticket795-singular-917') : vendor;
    if (pins[name] && !existsSync(resolve(directory, name))) {
      const original = readFileSync(resolve(directory, name.replace('.local.cir', '.cir')), 'utf8');
      const local = original.replaceAll('\r\n', '\n').replace(/"[A-Za-z]:\/(.*?)"/g, '$1');
      if (hash(local) !== pins[name]) throw new Error(`Reconstruction pin mismatch ${name}`);
      writeFileSync(resolve(directory, name), local);
    }
    const deck = readFileSync(resolve(directory, name), 'utf8');
    if (pins[name] && hash(deck) !== pins[name]) throw new Error(`Input pin mismatch ${name}`);
    const includes: Record<string, string> = {};
    const resolveInclude = async (path: string) => {
      const bytes = readFileSync(resolve(directory, path));
      includes[path] = hash(bytes);
      return bytes.toString('utf8');
    };
    const compiled = (await parseAsync(deck, resolveInclude)).compile();
    names = [...compiled.nodeNames, ...compiled.branchNames];
    targets = compiled.nodeNames.map((n, i) => /Net-_D183-[AK]_|^D183\.rs$|^a$|^k$/.test(n) ? i : -1).filter(i => i >= 0);
    const attached = compiled.devices.filter(d => d.nodes.some(i => targets.includes(i))).map(d => ({
      name: d.name, type: d.constructor.name, nodes: d.nodes.map(i => i < 0 ? '0' : names[i]),
    }));
    factors = [];
    let error: string | null = null;
    let stack: string | null = null;
    try { await simulate(deck, { resolveInclude }); }
    catch (e) { error = String(e); stack = (e as Error).stack?.split('\n').map(l => l.replaceAll(process.cwd(), '<repo>')).join('\n') ?? null; }
    const native = [];
    for (const [mode, configuration] of [
      ['default', 'set filetype=ascii\n'],
      ['ltps', 'set filetype=ascii\nset ngbehavior=ltps\n'],
      ['no-optran', 'set filetype=ascii\noptran 1 1 1 0 0 0\n'],
    ]) {
      writeFileSync(resolve(nativeDir, '.spiceinit'), configuration);
      const raw = resolve(nativeDir, `${name}.${mode}.raw`);
      rmSync(raw, { force: true });
      const ng = spawnSync('ngspice', ['-b', '-r', raw, resolve(directory, name)], { cwd: nativeDir,
        encoding: 'utf8', timeout: 120000 });
      const log = ng.stdout + ng.stderr;
      const summary = log.split('\n').filter(l => /No\. of Data Rows|Starting|started|finished|completed|deselected|failed|singular matrix|successful|timestep too small|trouble with|aborted|Direct Linear Solver|compatibility mode/.test(l));
      writeFileSync(resolve(nativeDir, `${name}.${mode}.log`), log);
      const plots = existsSync(raw) ? parseNgspiceRaw(readFileSync(raw, 'utf8')).map(plot => ({
        name: plot.plotName, points: plot.grid.length,
        nonfinite: Object.values(plot.signals).flat().filter(v => !Number.isFinite(v.re) || !Number.isFinite(v.im)).length,
        targetVoltages: Object.fromEntries(targets.map(i => [names[i], plot.signals[`v(${names[i].toLowerCase()})`]?.[0]?.re ?? null])),
      })) : [];
      native.push({ mode, configuration, command: ['ngspice', '-b', '-r', '<raw>', name],
        exitCode: ng.status, error: ng.error?.message ?? null, summary, plots });
    }
    if (hash(readFileSync(resolve(directory, name))) !== hash(deck)) throw new Error(`Deck changed ${name}`);
    for (const [path, digest] of Object.entries(includes)) {
      if (hash(readFileSync(resolve(directory, path))) !== digest) throw new Error(`Include changed ${path}`);
    }
    receipts.push({ name, sha256: hash(deck), includes, nodeCount: compiled.nodeCount,
      branchCount: compiled.branchCount, targets: targets.map(i => names[i]), attached,
      spiceTs: { error, stack, factorAttempts: factors.length, first: factors[0], last: factors.at(-1),
        failedFactors: factors.filter(f => f.error).length, maxError: null, rmsError: null },
      ngspice: native,
    });
  }
} finally {
  MNAAssembler.prototype.getSparseSolver = originalGet;
  GilbertPeierlsSolver.prototype.factorize = originalFactor;
}
writeFileSync(output, JSON.stringify({ baseline: spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim(),
  node: process.version, ngspice: spawnSync('ngspice', ['--version'], { encoding: 'utf8' }).stdout, receipts }, null, 2) + '\n');
console.log(JSON.stringify(receipts, null, 2));
