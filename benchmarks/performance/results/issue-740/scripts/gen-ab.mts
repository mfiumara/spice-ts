/**
 * Issue #740: in-process A/B of two @spice-ts/core builds on the AC decks of
 * the existing benchmark generators (benchmarks/circuits), plus the largest
 * relative difference between the two builds' results.
 *
 *   npx tsx benchmarks/performance/results/issue-740/scripts/gen-ab.mts <before-dist> <after-dist> <rounds>
 *
 * Both builds are loaded into one process; each round runs every deck once
 * per build, alternating which goes first, after two warmups each. Reports
 * median wall ms per build, the median of the per-round before/after ratios,
 * and max over nodes/branches/frequencies of |x_after - x_before| / max|x_before|
 * (complex phasors rebuilt from magnitude/phase).
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
// benchmarks/circuits is CommonJS under tsx (no "type": "module"), so take
// the named exports from the namespace or its default.
type Generators = typeof import('../../../../circuits/generators.js');
type Blocks = typeof import('../../../../circuits/analog-blocks.js');
const generators = (await import('../../../../circuits/generators.js')) as Generators & { default?: Generators };
const blocks = (await import('../../../../circuits/analog-blocks.js')) as Blocks & { default?: Blocks };
const { rcChainAC, bjtCEAmplifier, mosfetCSAmplifier } = generators.default ?? generators;
const { cascodeAmplifier, foldedCascodeOpAmp } = blocks.default ?? blocks;

type Phasor = { magnitude: number; phase: number };
type Simulate = (netlist: string) => Promise<{ ac?: { voltages: Map<string, Phasor[]>; currents: Map<string, Phasor[]> } }>;

const [beforeDir, afterDir, roundsArg] = process.argv.slice(2);
if (!beforeDir || !afterDir || !roundsArg) throw new Error('usage: gen-ab.mts <before-dist> <after-dist> <rounds>');
const load = async (dir: string) => ((await import(pathToFileURL(resolve(dir, 'index.js')).href)) as { simulate: Simulate }).simulate;
const builds: Array<[string, Simulate]> = [['before', await load(beforeDir)], ['after', await load(afterDir)]];

const decks: Array<[string, string]> = [
  ['rcChainAC(1000)', rcChainAC(1000)],
  ['rcChainAC(5000)', rcChainAC(5000)],
  ['bjtCEAmplifier', bjtCEAmplifier()],
  ['mosfetCSAmplifier', mosfetCSAmplifier()],
  ['cascodeAmplifier', cascodeAmplifier()],
  ['foldedCascodeOpAmp', foldedCascodeOpAmp()],
];

const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function difference(a: Awaited<ReturnType<Simulate>>, b: Awaited<ReturnType<Simulate>>): number {
  let diff = 0;
  let scale = 0;
  for (const kind of ['voltages', 'currents'] as const) {
    for (const [name, pointsB] of b.ac![kind]) {
      const pointsA = a.ac![kind].get(name)!;
      pointsB.forEach((pb, k) => {
        const pa = pointsA[k];
        const rad = Math.PI / 180;
        const bRe = pb.magnitude * Math.cos(pb.phase * rad);
        const bIm = pb.magnitude * Math.sin(pb.phase * rad);
        diff = Math.max(diff, Math.hypot(pa.magnitude * Math.cos(pa.phase * rad) - bRe, pa.magnitude * Math.sin(pa.phase * rad) - bIm));
        scale = Math.max(scale, pb.magnitude);
      });
    }
  }
  return diff / scale;
}

console.log('| deck | before median ms | after median ms | paired before/after ratio median (min..max) | max relative difference |');
console.log('|---|---:|---:|---:|---:|');
for (const [label, netlist] of decks) {
  for (const [, simulate] of builds) { await simulate(netlist); await simulate(netlist); }
  const times: Record<string, number[]> = { before: [], after: [] };
  const ratios: number[] = [];
  for (let round = 0; round < Number(roundsArg); round++) {
    const order = round % 2 === 0 ? builds : [...builds].reverse();
    const pair: Record<string, number> = {};
    for (const [name, simulate] of order) {
      const start = performance.now();
      await simulate(netlist);
      pair[name] = performance.now() - start;
      times[name].push(pair[name]);
    }
    ratios.push(pair.before / pair.after);
  }
  const diff = difference(await builds[1][1](netlist), await builds[0][1](netlist));
  console.log(`| ${label} | ${median(times.before).toFixed(2)} | ${median(times.after).toFixed(2)} | ${median(ratios).toFixed(2)} (${Math.min(...ratios).toFixed(2)}..${Math.max(...ratios).toFixed(2)}) | ${diff.toExponential(2)} |`);
}
