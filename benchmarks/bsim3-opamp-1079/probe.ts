// Evidence-only diagnostic. No bias from this probe enters the public corpus run.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { solveAC } from '../../packages/core/src/analysis/ac.js';
import { solveDCOperatingPoint } from '../../packages/core/src/analysis/dc.js';
import { BSIM3v3 } from '../../packages/core/src/devices/bsim3v3.js';
import { MOS3 } from '../../packages/core/src/devices/mos3.js';
import { MNAAssembler } from '../../packages/core/src/mna/assembler.js';
import { parse } from '../../packages/core/src/parser/index.js';
import { resolveOptions } from '../../packages/core/src/types.js';

interface NativePoint { frequency: number; real: number; imaginary: number }
interface Phasor { magnitude: number; phase: number }
const root = 'benchmarks/bsim3-opamp-1079';
const fixture = 'benchmarks/corpus/corpus-m/fixtures/xyce/Netlists/ACtests/bsim3/op-amp.cir';
const deck = readFileSync(fixture, 'utf8');
const compiled = parse(deck).compile();
const mos = compiled.devices.filter((d): d is MOS3 => d instanceof MOS3);
const { assembler } = solveDCOperatingPoint(compiled, resolveOptions());
const nodes = Object.fromEntries(compiled.nodeNames.map((n, i) => [n, assembler.solution[i]]));
function devicePoints(solution: Float64Array) {
  return mos.map(d => {
    const v = d.nodes.map(n => n < 0 ? 0 : solution[n]);
    const type = d.model.polarity;
    const vgs = type * (v[1] - v[2]);
    const vds = type * (v[0] - v[2]);
    const vbs = type * (v[3] - v[2]);
    const a = new MNAAssembler(compiled.nodeCount, compiled.branchCount);
    a.solution.set(solution);
    d.stamp(a.getStampContext());
    d.stampDynamic(a.getStampContext());
    return {
      name: d.name, level: d.model.level, vgs, vds, vbs,
      channel: d.evaluateChannel(vgs, vds, vbs),
      // Physical-node matrix, including repeated nodes when source and bulk coincide.
      capacitance: d.nodes.map(r => d.nodes.map(c => r < 0 || c < 0 ? 0 : a.C.get(r, c))),
    };
  });
}
const devices = devicePoints(assembler.solution);
const directory = resolve(process.env.TMPDIR!, '1079-native');
mkdirSync(directory, { recursive: true });
function native(input: string, control: string[], label: string): string {
  writeFileSync(resolve(directory, `${label}.cir`), input.replace(/^\.end\s*$/m,
    `.control\nset numdgt=15\n${control.join('\n')}\nquit\n.endc\n.end`));
  const run = spawnSync('ngspice', ['-b', `${label}.cir`], {
    cwd: directory, env: { ...process.env, HOME: directory }, encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  writeFileSync(`${root}/native-${label}.txt.gz`, gzipSync(run.stdout));
  writeFileSync(`${root}/native-${label}-stderr.txt.gz`, gzipSync(run.stderr));
  if (run.error || run.status !== 0) throw new Error(`ngspice ${label} exit ${run.status}: ${run.error ?? run.stderr}`);
  return run.stdout;
}
const quantities = ['id', 'gm', 'gds', 'gmb', 'von', 'vdsat', 'vgs', 'vds', 'vbs', 'cgs', 'cgd', 'cgb', 'cbd', 'cbs'];
const stdout = native(deck, [
  'ac lin 1 100 100',
  ...mos.map(d => 'print ' + quantities.map(q => `@${d.name.toLowerCase()}[${q}]`).join(' ')),
  'op', 'print ' + compiled.nodeNames.map(n => `v(${n})`).join(' '),
  'ac dec 10 100 100Meg', 'echo BEGIN_AC', 'print v(out)', 'echo END_AC',
], 'op');
function real(text: string, expression: string): number {
  const escaped = expression.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`^${escaped} = (\\S+)$`, 'm'));
  if (!match || !Number.isFinite(Number(match[1]))) throw new Error(`missing real ${expression}`);
  return Number(match[1]);
}
const nativeNodes = Object.fromEntries(compiled.nodeNames.map(n => [n, real(stdout, `v(${n})`)]));
const nativeDevices = mos.map(d => ({ name: d.name, ...Object.fromEntries(
  quantities.map(q => [q, real(stdout, `@${d.name.toLowerCase()}[${q}]`)]),
) }));
const nativeSolution = new Float64Array(assembler.solution);
compiled.nodeNames.forEach((n, i) => { nativeSolution[i] = nativeNodes[n]; });
const acDirective = compiled.analyses.find(a => a.type === 'ac');
if (!acDirective || acDirective.type !== 'ac') throw new Error('no AC');
const originalAc = solveAC(compiled, acDirective, resolveOptions(), assembler.solution).voltage('out');
const frozenAc = solveAC(compiled, acDirective, resolveOptions(), nativeSolution).voltage('out');
const bias2OnlySolution = new Float64Array(assembler.solution);
bias2OnlySolution[compiled.nodeNames.indexOf('bias2')] = nativeNodes.bias2;
const bias2OnlyAc = solveAC(compiled, acDirective, resolveOptions(), bias2OnlySolution).voltage('out');
const frozenDevices = devicePoints(nativeSolution);
const acText = stdout.split('BEGIN_AC\n')[1].split('END_AC')[0];
const nativeAc: NativePoint[] = [...acText.matchAll(/^\d+[\t ]+(\S+)[\t ]+(\S+),[\t ]+(\S+)[\t ]*$/gm)]
  .map(m => ({ frequency: Number(m[1]), real: Number(m[2]), imaginary: Number(m[3]) }));
if (nativeAc.length !== 61) throw new Error(`expected 61 native AC points, got ${nativeAc.length}`);
function error(actual: Phasor[]): number {
  return Math.max(...actual.map((p, i) => Math.hypot(
    p.magnitude * Math.cos(p.phase * Math.PI / 180) - nativeAc[i].real,
    p.magnitude * Math.sin(p.phase * Math.PI / 180) - nativeAc[i].imaginary,
  ))) / Math.max(...nativeAc.map(p => Math.hypot(p.real, p.imaginary)));
}
const minimal = native(readFileSync(`${root}/minimal.cir`, 'utf8'), [
  'ac lin 1 100 100', 'print ' + quantities.map(q => `@medge[${q}]`).join(' '),
], 'minimal');
const reduction = Object.fromEntries(quantities.map(q => [q, real(minimal, `@medge[${q}]`)]));
const result = {
  fixture, fixtureSha256: createHash('sha256').update(deck).digest('hex'),
  engine: execFileSync('ngspice', ['--version'], { encoding: 'utf8' }),
  nodes, devices, bsim3Count: compiled.devices.filter(d => d instanceof BSIM3v3).length,
  nativeNodes, nativeDevices, frozenDevices, nativeAc, originalAc, frozenAc,
  originalError: error(originalAc), frozenError: error(frozenAc),
  bias2OnlyAc, bias2OnlyError: error(bias2OnlyAc), reduction,
};
writeFileSync(`${root}/ts-op.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ originalError: result.originalError, frozenError: result.frozenError, reduction }, null, 2));
