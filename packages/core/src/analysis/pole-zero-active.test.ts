import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { InvalidCircuitError } from '../errors.js';
import { parse } from '../parser/index.js';
import { simulate } from '../simulate.js';

// `.pz` on circuits with independent sources, controlled sources, nonlinear
// devices and differential terminal pairs (#504). Expected values are the
// Pole-Zero plot that `ngspice -b -r` (ngspice-47) writes for the identical
// netlist, in ngspice's order.
type Root = { real: number; imaginary: number };
const root = (real: number, imaginary = 0): Root => ({ real, imaginary });

function expectNgspiceRoots(actual: readonly Root[], expected: readonly Root[], tolerance = 1e-9): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((value, index) => {
    const scale = Math.hypot(value.real, value.imaginary);
    const distance = Math.hypot(actual[index].real - value.real, actual[index].imaginary - value.imaginary);
    if (scale === 0) expect(actual[index]).toEqual({ real: 0, imaginary: 0 });
    else expect(distance / scale).toBeLessThan(tolerance);
  });
}

const corpusF = (name: string): string => readFileSync(
  new URL(`../../../../benchmarks/corpus/corpus-f/fixtures/tests/polezero/${name}`, import.meta.url),
  'utf8',
);

describe('.pz with sources and active elements against ngspice-47 (#504)', () => {
  it('solves corpus-f filt_bridge_t.cir (AC input source, vol pz)', async () => {
    const { poleZero } = await simulate(corpusF('filt_bridge_t.cir'));
    expectNgspiceRoots(poleZero!.poles, [root(-2.618033988749895e3), root(-3.819660112501052e2)]);
    expectNgspiceRoots(poleZero!.zeros, [root(-1e3), root(-1e3)], 1e-6);
  });

  it('solves corpus-f filt_multistage.cir (VCVS stages, vol pz)', async () => {
    const { poleZero } = await simulate(corpusF('filt_multistage.cir'));
    expectNgspiceRoots(poleZero!.poles, [
      root(-5.000000000000001e10), root(-8.000000000000001e8), root(-1e8),
    ]);
    expect(poleZero!.zeros).toEqual([]);
  });

  it('solves corpus-f filt_rc.cir (AC input source, vol pz)', async () => {
    const { poleZero } = await simulate(corpusF('filt_rc.cir'));
    expectNgspiceRoots(poleZero!.poles, [root(-1e8)]);
    expect(poleZero!.zeros).toEqual([]);
  });

  it('opens an independent voltage source that has an AC value (ngspice VSRCpzLoad)', async () => {
    const { poleZero } = await simulate(`ac source open via ladder
iin 1 0 ac 1
r1 1 0 1k
c1 1 0 1n
vs 1 2 0 ac 1
r2 2 0 2k
c2 2 0 1n
r3 1 3 1k
c3 3 0 1n
.pz 1 0 3 0 cur pz
.end`);
    expectNgspiceRoots(poleZero!.poles, [root(-2.618033988749895e6), root(-5e5), root(-3.819660112501052e5)]);
    expectNgspiceRoots(poleZero!.zeros, [root(-5e5)]);
  });

  it('shorts an independent voltage source without an AC value', async () => {
    const { poleZero } = await simulate(`dc source shorts in pz
iin 1 0 ac 1
r1 1 0 1k
c1 1 0 1n
vs 1 2 0
r2 2 0 2k
c2 2 0 1n
r3 2 3 1k
c3 3 0 1n
.pz 1 0 3 0 cur pz
.end`);
    expectNgspiceRoots(poleZero!.poles, [root(-1.843070330817253e6), root(-4.069296691827464e5)]);
    expect(poleZero!.zeros).toEqual([]);
  });

  it('linearises a forward-biased diode at the DC operating point', async () => {
    const { poleZero } = await simulate(`biased diode pz
vdd 3 0 5
r1 3 1 1k
d1 1 0 dmod
c1 1 2 10p
r2 2 0 1k
.model dmod d is=1e-14 cjo=2p tt=1n
.pz 1 0 2 0 cur pz
.end`);
    // ~9e-7 relative: the DC operating point agrees to Newton tolerance only.
    expectNgspiceRoots(poleZero!.poles, [root(-9.925731148169667e8), root(-9.934065300355741e7)], 2e-6);
    expectNgspiceRoots(poleZero!.zeros, [root(0)]);
  });

  // Published loss: roots agree with ngspice-47 to ~1.1e-3 relative, not 1e-6.
  // The gap is upstream of .pz: spice-ts's own .ac on this deck differs from
  // ngspice-47 by the same ~8e-4 (|V(5)| at 100 kHz: 144.140 vs 144.253) and
  // its OP by ~2e-5 (V(5) 6.297355 vs 6.297471), i.e. the BJT linearisation.
  it('linearises a common-emitter BJT stage with voltage input', async () => {
    const { poleZero } = await simulate(`common emitter pz
vcc 4 0 12
vin 1 0 0 ac 1
rs 1 2 1k
cin 2 3 1u
rb1 4 3 100k
rb2 3 0 22k
q1 5 3 6 qn
rc 4 5 4.7k
re 6 0 1k
ce 6 0 10u
cl 5 0 10p
.model qn npn bf=100 is=1e-15 cje=2p cjc=1p tf=0.3n
.pz 1 0 5 0 vol pz
.end`);
    expectNgspiceRoots(poleZero!.poles, [
      root(-2.306468478104187e8), root(-7.473942678454462e6),
      root(-3.671440117123284e3), root(-5.636793652056068e1),
    ], 2e-3);
    expectNgspiceRoots(poleZero!.zeros, [
      root(-1.000000052634854e2), root(0), root(8.842041041764552e10),
    ], 2e-3);
  });

  it('accepts differential input and output pairs with current input', async () => {
    const { poleZero } = await simulate(`differential pz
iin 1 2 ac 1
r1 1 0 1k
r2 2 0 1k
c1 1 2 1n
r3 1 3 1k
c3 3 0 1n
r4 2 4 2k
c4 4 0 1n
.pz 1 2 3 4 cur pz
.end`);
    expect(poleZero).toMatchObject({
      inputPositive: '1', inputNegative: '2', outputPositive: '3', outputNegative: '4',
    });
    expectNgspiceRoots(poleZero!.poles, [
      root(-1.327985277605682e6), root(-4.089909514938964e5), root(-2.630237709004218e5),
    ]);
    expectNgspiceRoots(poleZero!.zeros, [root(-4e5)]);
  });

  it('accepts differential input and output pairs with voltage input', async () => {
    const { poleZero } = await simulate(`differential vol pz
r1 1 0 1k
r2 2 0 1k
c1 1 2 1n
r3 1 3 1k
c3 3 0 1n
r4 2 4 2k
c4 4 0 1n
.pz 1 2 3 4 vol pz
.end`);
    expectNgspiceRoots(poleZero!.poles, [root(-7.734590803390136e5), root(-3.693980625181293e5)]);
    expectNgspiceRoots(poleZero!.zeros, [root(-4e5)]);
  });

  it('computes zeros only for the zer mode', async () => {
    const { poleZero } = await simulate(`zeros only
r1 1 0 1k
c1 1 2 1n
r2 2 0 1k
c2 2 0 2n
.pz 1 0 2 0 cur zer
.end`);
    expect(poleZero!.poles).toEqual([]);
    expectNgspiceRoots(poleZero!.zeros, [root(0)]);
  });

  it.each([
    ['.pz 1 1 2 0 cur pz', 'Input is shorted'],
    ['.pz 1 0 2 2 cur pz', 'Output is shorted'],
    ['.pz 1 0 1 0 vol pz', 'Transfer function is unity'],
    ['.pz 1 2 2 1 vol pz', 'Transfer function is -1'],
  ])('rejects the degenerate ngspice terminal combination %s', async (directive, message) => {
    const run = simulate(`degenerate pz\nr1 1 0 1k\nc1 1 2 1n\nr2 2 0 1k\n${directive}\n.end`);
    await expect(run).rejects.toBeInstanceOf(InvalidCircuitError);
    await expect(run).rejects.toThrow(message);
  });

  it('parses the differential form', () => {
    expect(parse('diff\nr1 a b 1k\n.pz a b c d vol pol').poleZeroAnalyses).toEqual([{
      type: 'pz',
      inputPositive: 'a',
      inputNegative: 'b',
      outputPositive: 'c',
      outputNegative: 'd',
      inputType: 'vol',
      mode: 'pol',
    }]);
  });
});
