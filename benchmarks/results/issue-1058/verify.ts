import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release } from 'node:os';
import { resolve } from 'node:path';
import { parse } from '../../../packages/core/src/parser/index.js';
import { resolveOptions } from '../../../packages/core/src/types.js';
import { solveDCOperatingPoint } from '../../../packages/core/src/analysis/dc.js';
import { MOS6 } from '../../../packages/core/src/devices/mos6.js';
import { MNAAssembler } from '../../../packages/core/src/mna/assembler.js';
import { runNgspicePacked, runBoundedSimulatePacked } from '../../corpus/corpus-f/outcomes.js';
import { reduceRow, type Circuit } from '../../corpus/corpus-j/parity.js';
import type { ClassicCircuit } from '../../corpus/classic/report.js';

// Evidence only. Reuse the published runners and metric without changing either.
async function main(): Promise<void> {
const root = 'benchmarks/results/issue-1058';
const sourceCommit = '66d67caff2f10e4d6a36d2e59898cc52d661b98d';
const fixturePath = 'benchmarks/corpus/corpus-l/fixtures/xyce/Netlists/ACtests/mos/gain-stage6.cir';
const input = readFileSync(`${root}/gain-stage6.cir`);
const original = execFileSync('git', ['show', `${sourceCommit}:${fixturePath}`]);
assert.deepEqual(input, original, 'fixture must retain original bytes');
const version = execFileSync('ngspice', ['--version'], { encoding: 'utf8' });
assert.match(version, /ngspice-47\b/);
const manifest = JSON.parse(execFileSync('git', ['show', `${sourceCommit}:benchmarks/corpus/corpus-l/manifest.json`], { encoding: 'utf8' }));
const circuit: Circuit = { ...manifest.circuits.find((entry: Circuit) => entry.id === 'l-10'), localPath: `${root}/gain-stage6.cir` };
assert.equal(createHash('sha256').update(input).digest('hex'), circuit.sha256);
const ng = await runNgspicePacked(input, circuit);
const spice = await runBoundedSimulatePacked(input, {
  ...circuit, category: 'corpus-l', ngspice: { expectedStatus: 'pass' }, spiceTs: { expectedStatus: 'pass' },
} as unknown as ClassicCircuit);
assert.equal(ng.status, 'success');
assert.equal(spice.status, 'success');
const rerun = reduceRow(circuit, ng, spice);
const ngAC = ng.execution.analyses.find(plot => plot.type === 'ac')!;
const tsAC = spice.analyses.find(plot => plot.type === 'ac')!;
assert.equal(ngAC.grid.length, tsAC.grid.length);
const signals = ['i(vdd1)', 'v(3)', 'v(2)', 'i(vin)'];
const ac = Array.from(tsAC.grid, (frequency, index) => ({
  frequency, referenceFrequency: ngAC.grid[index],
  signals: Object.fromEntries(signals.map(name => [name, {
    ngspice: { re: ngAC.signals[name].re[index], im: ngAC.signals[name].im?.[index] ?? 0 },
    spiceTs: { re: tsAC.signals[name].re[index], im: tsAC.signals[name].im?.[index] ?? 0 },
  }])),
}));

// Separate observation driver SOURCES the same original, rather than adding .OP
// or changing .SAVE/.OPTIONS in the scored fixture.
const scratch = process.env.TMPDIR;
assert.ok(scratch, 'TMPDIR must point at the managed scratch directory');
const directory = mkdtempSync(resolve(scratch, 'issue-1058-'));
const quantities = ['v(1)', 'v(2)', 'v(3)', 'v(vdd)', 'i(vdd1)', '@m1[id]', '@m1[gm]', '@m1[gds]', '@m1[cgs]', '@m1[cgd]', '@m1[cgb]', '@m1[cbs]', '@m1[cbd]'];
let ngValues: Record<string, number>;
try {
  writeFileSync(`${directory}/.spiceinit`, '');
  writeFileSync(`${directory}/probe.cir`, `Issue 1058 OP observation driver\n.control\nset numdgt=17\nsource ${resolve(root, 'gain-stage6.cir')}\nop\nprint ${quantities.join(' ')}\nquit\n.endc\n.end\n`);
  const run = spawnSync('ngspice', ['-b', 'probe.cir'], { cwd: directory, env: { ...process.env, HOME: directory }, encoding: 'utf8', timeout: 30_000 });
  assert.equal(run.status, 0, run.stderr);
  writeFileSync(`${root}/ngspice-op.txt`, run.stdout + run.stderr);
  ngValues = Object.fromEntries([...run.stdout.matchAll(/^(\S+) = ([+-]?[\d.eE+-]+)$/gm)].map(match => [match[1], Number(match[2])]));
  for (const name of quantities) assert.ok(Number.isFinite(ngValues[name]), `missing OP quantity ${name}`);
} finally { rmSync(directory, { recursive: true, force: true }); }
const compiled = parse(input.toString()).compile();
const op = solveDCOperatingPoint(compiled, resolveOptions());
const device = compiled.devices.find(item => item instanceof MOS6) as MOS6;
assert.ok(device);
const voltage = (node: number) => node < 0 ? 0 : op.assembler.solution[node];
const [d, g, s, b] = device.nodes;
const channel = device.evaluateChannel(voltage(g) - voltage(s), voltage(d) - voltage(s), voltage(b) - voltage(s));
const caps = new MNAAssembler(compiled.nodeCount, compiled.branchCount);
caps.solution.set(op.assembler.solution);
const capContext = caps.getStampContext();
const entries = new Map<string, number>();
capContext.stampC = (row, column, value) => entries.set(`${row},${column}`, (entries.get(`${row},${column}`) ?? 0) + value);
device.stampDynamic(capContext);
// This fixture grounds S and B and has zero overlaps/junction caps.
const cgd = -(entries.get(`${g},${d}`) ?? 0);
const cgs = (entries.get(`${g},${g}`) ?? 0) - cgd;
const native: Record<string, number> = {
  'v(1)': op.result.voltage('1'), 'v(2)': op.result.voltage('2'), 'v(3)': op.result.voltage('3'),
  'v(vdd)': op.result.voltage('vdd'), 'i(vdd1)': op.result.current('vdd1'),
  // Drain terminal current includes the drain-body leakage. Rload supplies it.
  '@m1[id]': (op.result.voltage('vdd') - op.result.voltage('3')) / 25_000,
  '@m1[gm]': channel.gm, '@m1[gds]': channel.gds,
  '@m1[cgs]': cgs, '@m1[cgd]': cgd, '@m1[cgb]': 0, '@m1[cbs]': 0, '@m1[cbd]': 0,
};
const operatingPoint = quantities.map(quantity => ({ quantity, ngspice: ngValues[quantity], spiceTs: native[quantity], absoluteError: Math.abs(native[quantity] - ngValues[quantity]) }));
const report = {
  sourceCommit, fixturePath, sha256: circuit.sha256, source: manifest.sources,
  environment: { node: process.version, platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model },
  ngspiceVersion: version.trim(), commands: { rerun: `spice-heavy pnpm exec tsx ${root}/verify.ts`, reference: 'unchanged runNgspicePacked: ngspice -b -r output.raw gain-stage6.cir', op: 'ngspice -b probe.cir; separate .control source original; op; print' },
  attribution: 'ngspice-47 MOS6 has DEVacLoad=NULL. OP agrees; reference omits the entire MOS6 AC conductance/capacitance stamp. This is an oracle capability gap, not only metric amplification and not evidence of a native MOS6 bug.',
  operatingPoint, channel, ac, rerun,
};
writeFileSync(`${root}/report.json`, JSON.stringify(report, null, 2) + '\n');
const columns = ['frequency_Hz', 'reference_frequency_Hz', ...signals.flatMap(name =>
  ['ngspice', 'spiceTs'].flatMap(engine => [`${engine}_${name}_re`, `${engine}_${name}_im`]))];
const rows = ac.map(point => [point.frequency, point.referenceFrequency, ...signals.flatMap(name => {
  const pair = point.signals[name];
  return [pair.ngspice.re, pair.ngspice.im, pair.spiceTs.re, pair.spiceTs.im];
})].join(','));
writeFileSync(`${root}/ac.csv`, [columns.join(','), ...rows].join('\n') + '\n');
console.log(JSON.stringify({ operatingPoint, outcome: rerun.outcome, worst: rerun.worstNormalizedError, worstSignal: rerun.worstSignal, points: ac.length }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
