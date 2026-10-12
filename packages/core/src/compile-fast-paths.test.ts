import { describe, expect, it } from 'vitest';
import { parse } from './parser/index.js';
import { simulate } from './simulate.js';
import { resolveResistor } from './devices/resistor-model.js';

// Guard tests for the #796 compile fast paths: raw node references are folded
// once per distinct spelling and resolved directly when they are already the
// display spelling, and a resistor without a model card skips the
// model-default merge. Each case pins the behaviour the folding paths had
// before (#728, #754). The element-name cases pin K, F/H, W and B i()
// binding, which a lazily filled element-name map (measured and not kept,
// see benchmarks/performance/results/issue-796) would have to preserve.

/** Deterministic xorshift32 in [0, 1). */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 2 ** 32;
  };
}

/** Random-case spelling of `name`. */
function spell(name: string, random: () => number): string {
  return [...name].map(ch => (random() < 0.5 ? ch.toUpperCase() : ch.toLowerCase())).join('');
}

/**
 * The node index of every device terminal by the plain folding rule: map a
 * `.global` spelling first, keep the first display spelling per lower-case
 * fold, sort the display names, and give ground -1.
 */
function referenceIndices(globals: string[], nodeLists: string[][]): number[][] {
  const globalByUpper = new Map<string, string>();
  for (const g of globals) if (!globalByUpper.has(g.toUpperCase())) globalByUpper.set(g.toUpperCase(), g);
  const mapGlobal = (n: string): string => globalByUpper.get(n.toUpperCase()) ?? n;
  const display = new Map<string, string>();
  for (const nodes of nodeLists) {
    for (const n of nodes) {
      const g = mapGlobal(n);
      if (!display.has(g.toLowerCase())) display.set(g.toLowerCase(), g);
    }
  }
  const names = [...display.values()].filter(n => n !== '0').sort();
  return nodeLists.map(nodes => nodes.map(n => (n === '0'
    ? -1
    : names.indexOf(display.get(mapGlobal(n).toLowerCase())!))));
}

describe('compile node resolution fast path (#796)', () => {
  it('matches the folding rule on random mixed-case decks with and without .global', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const random = rng(seed);
      const base = ['a', 'bb', 'n1', 'n2', 'vdd', 'mid', 'out', 'x9'];
      const globals = seed % 2 === 0 ? [spell('vdd', random), spell('mid', random)] : [];
      const nodeLists: string[][] = [];
      const lines = [`random deck ${seed}`];
      if (globals.length > 0) lines.push(`.global ${globals.join(' ')}`);
      lines.push(`V1 ${spell('a', random)} 0 1`);
      nodeLists.push([lines[lines.length - 1].split(' ')[1], '0']);
      for (let i = 0; i < 30; i++) {
        const p = random() < 0.1 ? '0' : spell(base[Math.floor(random() * base.length)], random);
        let q = spell(base[Math.floor(random() * base.length)], random);
        if (q.toLowerCase() === p.toLowerCase()) q = '0';
        lines.push(`R${i} ${p} ${q} ${1 + Math.floor(random() * 9)}k`);
        nodeLists.push([p, q]);
      }
      // Tie every node to ground so the deck is solvable whatever was drawn.
      base.forEach((n, i) => {
        const p = spell(n, random);
        lines.push(`RG${i} ${p} 0 1meg`);
        nodeLists.push([p, '0']);
      });
      lines.push('.op', '.end');
      const compiled = parse(lines.join('\n')).compile();
      const expected = referenceIndices(globals, nodeLists);
      expect(compiled.devices.map(d => [...d.nodes]), `seed ${seed}`).toEqual(expected);
    }
  });

  it('resolves a defaulted MOS bulk and a later case variant of an earlier node', async () => {
    const dc = (await simulate(`bulk default
.model nm nmos level=1 vto=0.7 kp=1e-4
VDD Vdd 0 5
VG G 0 2
RD vdd D 10k
M1 d g 0 nm
.op
.end`)).dc!;
    expect(dc.voltages.size).toBe(3);
    // Square law, plus the GMIN leakage at the 1e-8 level.
    expect(dc.voltage('D')).toBeCloseTo(5 - 10e3 * 0.5e-4 * 1.3 ** 2, 6);
  });
});

describe('element-name references (#754, #796)', () => {
  // Same deck as the #754 K-card test, with the K card placed before, between
  // and after its inductors: every placement must couple the same pair.
  const deck = (order: string[]): string => `k placement
V1 1 0 SIN(0 1 10k)
R1 1 2 10
${order.join('\n')}
R3 3 0 100
.tran 1u 100u 0 0.1u
.end`;

  it('couples inductors whether the K card comes before, between or after them', async () => {
    const after = (await simulate(deck(['L1 2 0 1m', 'l2 3 0 4m', 'k1 l1 L2 0.5']))).transient!;
    const before = (await simulate(deck(['K1 L1 l2 0.5', 'L1 2 0 1m', 'l2 3 0 4m']))).transient!;
    const between = (await simulate(deck(['L1 2 0 1m', 'K1 l1 L2 0.5', 'l2 3 0 4m']))).transient!;
    // ngspice-47: vmax=0.457010 (case-folding.test.ts #754).
    expect(Math.max(...Array.from(after.voltage('3')))).toBeCloseTo(0.45701, 3);
    for (const other of [before, between]) {
      expect(other.time).toEqual(after.time);
      expect(Array.from(other.voltage('3'))).toEqual(Array.from(after.voltage('3')));
    }
  });

  it('binds F, H, W and B i() references to case variants of earlier and later sources', async () => {
    const dc = (await simulate(`named references
VIN in 0 2
RIN in 0 1k
VSENSE in s 0
RS s 0 1k
F1 0 f vsense 3
RF f 0 1k
H1 h 0 VSense 500
RH h 0 1k
B1 b 0 I=2*i(vSENSE)
RB b 0 1k
W1 w 0 vsense sw
.model sw csw it=1m ron=1 roff=1meg
VW vdd 0 1
RW vdd w 1k
.op
.end`)).dc!;
    // i(vsense) = 2 V / 1 k = 2 mA.
    expect(dc.current('vsense')).toBeCloseTo(2e-3, 12);
    expect(dc.voltage('f')).toBeCloseTo(3 * 2e-3 * 1e3, 9);
    expect(dc.voltage('h')).toBeCloseTo(500 * 2e-3, 9);
    expect(dc.voltage('b')).toBeCloseTo(-2 * 2e-3 * 1e3, 9);
    // The switch is on (2 mA > 1 mA): 1 V across 1 k + 1 Ohm.
    expect(dc.voltage('w')).toBeCloseTo(1 / 1001, 9);
  });

  it('still reports an unknown controlling source', () => {
    expect(() => parse(`unknown control
V1 1 0 1
R1 1 0 1k
F1 0 2 vmissing 2
R2 2 0 1k
.op
.end`).compile()).toThrow(/vmissing/);
  });
});

describe('resolveResistor without a model card (#796)', () => {
  it('reads instance parameters directly and leaves them untouched', () => {
    const params = { TC1: 1e-3, M: 2, SCALE: 3, AC: 50, NOISY: 0 };
    const snapshot = { ...params };
    const resolved = resolveResistor('R1', 100, undefined, params);
    expect(params).toEqual(snapshot);
    expect(resolved.resistance).toBe(100);
    expect(resolved.parameters).toMatchObject({
      tc1: 1e-3, multiplier: 2, scale: 3, acResistance: 50, noisy: false,
    });
    expect(resolveResistor('R2', undefined, undefined, { R: 47 }).resistance).toBe(47);
  });

  it('still applies model instance defaults under instance values', () => {
    const model = { name: 'rm', type: 'R', params: { RESISTANCE: 10, TC: 2e-3, SCALE: 4, NOISY: 0 } };
    const fromModel = resolveResistor('R1', undefined, model, {});
    expect(fromModel.resistance).toBe(10);
    expect(fromModel.parameters).toMatchObject({ tc1: 2e-3, scale: 4, noisy: false });
    const overridden = resolveResistor('R2', undefined, model, { R: 20, SCALE: 1 });
    expect(overridden.resistance).toBe(20);
    expect(overridden.parameters.scale).toBe(1);
  });
});
