import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { UnsupportedModelLevelError } from '../errors.js';
import { simulate } from '../simulate.js';

/**
 * Issue #747: ngspice-47 has no EKV model behind `LEVEL=260`. Its INPfindLev
 * (src/spicelib/parser/inpfindl.c) rounds the level to `(int)(level + 0.5)` and
 * replaces anything above 99 (or below 0) with 1, printing "Illegal value for
 * level. Level must be < 99 (Setting Level to 1)", for every model type that
 * dispatches on it (npn/pnp, njf/pjf, nmf/pmf/nhfet/phfet, nmos/pmos/nsoi/psoi, r).
 * Level 0 shares case 1 in every one of those switches.
 *
 * The decks and ngspice-47 references live in benchmarks/results/issue-747
 * (generate-references.ts); both engines read the same bytes.
 */
const ISSUE_DIR = new URL('../../../../benchmarks/results/issue-747/', import.meta.url);

interface Reference {
  deckSha256: string;
  levelNotice: boolean;
  grid: number[];
  signals: Record<string, number[] | Array<[number, number]>>;
}

function deck(name: string): string {
  return readFileSync(new URL(`decks/${name}.cir`, ISSUE_DIR), 'utf8');
}

function reference(name: string): Reference {
  const ref = JSON.parse(readFileSync(new URL(`references/${name}.json`, ISSUE_DIR), 'utf8')) as Reference;
  // Identical input bytes, and ngspice-47 took the level > 99 path on this deck.
  expect(createHash('sha256').update(deck(name)).digest('hex')).toBe(ref.deckSha256);
  expect(ref.levelNotice).toBe(true);
  return ref;
}

function real(ref: Reference, signal: string): number[] {
  return ref.signals[signal] as number[];
}

function interpolate(time: ArrayLike<number>, values: ArrayLike<number>, at: number): number {
  let index = 1;
  while (index < time.length - 1 && time[index] < at) index++;
  const fraction = (at - time[index - 1]) / (time[index] - time[index - 1]);
  return values[index - 1] + fraction * (values[index] - values[index - 1]);
}

// #4 now implements EKV at LEVEL=260. Preserve #747's historical MOS1
// reference arrays by exercising the still-unmapped LEVEL=100 instead.
const fallbackDeck = (name: string): string => deck(name).replaceAll('LEVEL=260', 'LEVEL=100');
const LEVEL_WARNING = /LEVEL=100 .*level=1 assumed/;

describe('model LEVEL above 99 falls back to level 1 like ngspice-47 inpfindl.c (issue #747)', () => {
  it('NMOS unmapped LEVEL=100 drain sweep retains the historical MOS1 reference', async () => {
    const ref = reference('nmos-dc-level260');
    const result = await simulate(fallbackDeck('nmos-dc-level260'));
    const id = result.dcSweep!.current('VD');
    const ib = result.dcSweep!.current('VB');
    expect(id.length).toBe(ref.grid.length);
    ref.grid.forEach((_, index) => {
      // No internal nodes: only rounding separates the engines.
      expect(Math.abs(id[index] - real(ref, 'i(vd)')[index]), `I(VD) point ${index}`)
        .toBeLessThan(1e-15 + 1e-9 * Math.abs(real(ref, 'i(vd)')[index]));
      expect(Math.abs(ib[index] - real(ref, 'i(vb)')[index]), `I(VB) point ${index}`)
        .toBeLessThan(1e-15 + 1e-9 * Math.abs(real(ref, 'i(vb)')[index]));
    });
    expect(result.warnings.some(warning => LEVEL_WARNING.test(warning.message))).toBe(true);
  });

  it('NMOS unmapped LEVEL=100 AC retains the historical MOS1 reference', async () => {
    const ref = reference('cs-amp-ac-level260');
    const result = await simulate(fallbackDeck('cs-amp-ac-level260'));
    const out = result.ac!.voltage('out');
    expect(out.length).toBe(ref.grid.length);
    const expected = ref.signals['v(out)'] as Array<[number, number]>;
    expected.forEach(([re, im], index) => {
      const radians = out[index].phase * Math.PI / 180;
      const magnitude = Math.hypot(re, im);
      // The operating point is a Newton solution (output node), so agreement is at the convergence tolerance.
      expect(Math.abs(out[index].magnitude * Math.cos(radians) - re), `Re v(out) point ${index}`)
        .toBeLessThan(1e-6 * magnitude);
      expect(Math.abs(out[index].magnitude * Math.sin(radians) - im), `Im v(out) point ${index}`)
        .toBeLessThan(1e-6 * magnitude);
    });
  });

  it('CMOS inverter with unmapped LEVEL=100 retains the historical MOS1 transient', async () => {
    const ref = reference('cmos-inverter-tran-level260');
    const result = await simulate(fallbackDeck('cmos-inverter-tran-level260'));
    const time = result.transient!.time;
    const out = result.transient!.voltage('out');
    const expected = real(ref, 'v(out)');
    let worst = 0;
    ref.grid.forEach((at, index) => {
      worst = Math.max(worst, Math.abs(interpolate(time, out, at) - expected[index]));
    });
    // 3 V swing; 2.3 mV worst on main at the time of writing, step placement on the edges (different timestep grids).
    expect(worst).toBeLessThan(5e-3);
  });

  it('NPN LEVEL=260 operating point matches the ngspice-47 Gummel-Poon reference', async () => {
    const ref = reference('npn-op-level260');
    const result = await simulate(deck('npn-op-level260'));
    for (const node of ['b', 'c']) {
      const expected = real(ref, `v(${node})`)[0];
      expect(Math.abs(result.dc!.voltage(node) - expected), `v(${node})`).toBeLessThan(1e-6 * Math.abs(expected));
    }
  });

  it('applies the same fallback, with the warning, to a .model card inside a .subckt', async () => {
    const result = await simulate(`subckt-local LEVEL=100 model
VD d 0 DC 2
VG g 0 DC 2
X1 d g cell
.SUBCKT cell d g
M1 d g 0 0 NE W=10U L=2U
.MODEL NE NMOS (LEVEL=100 VTO=0.7 KP=110U)
.ENDS
.OP
.END`);
    // MOS1 saturation: KP/2 * W/L * (VGS - VTO)^2 * (1 + LAMBDA*VDS) with LAMBDA=0.
    expect(result.dc!.current('VD')).toBeCloseTo(-0.5 * 110e-6 * 5 * 1.3 ** 2, 10);
    expect(result.warnings.some(warning => LEVEL_WARNING.test(warning.message))).toBe(true);
  });

  it.each(['100', '1E3', '-3'])('LEVEL=%s simulates bit-identically to LEVEL=1', async level => {
    const netlist = (value: string) => deck('nmos-dc-level260').replace('NMOS (LEVEL=260', `NMOS (LEVEL=${value}`);
    const clamped = await simulate(netlist(level));
    const level1 = await simulate(netlist('1'));
    expect(Array.from(clamped.dcSweep!.current('VD'))).toEqual(Array.from(level1.dcSweep!.current('VD')));
  });

  it('rounds the level like INPfindLev: LEVEL=0 and LEVEL=1.4 select level 1, LEVEL=1.6 selects level 2', async () => {
    const netlist = (value: string) => deck('nmos-dc-level260').replace('NMOS (LEVEL=260', `NMOS (LEVEL=${value}`);
    const level1 = Array.from((await simulate(netlist('1'))).dcSweep!.current('VD'));
    const level2 = Array.from((await simulate(netlist('2'))).dcSweep!.current('VD'));
    expect(Array.from((await simulate(netlist('0'))).dcSweep!.current('VD'))).toEqual(level1);
    expect(Array.from((await simulate(netlist('1.4'))).dcSweep!.current('VD'))).toEqual(level1);
    expect(Array.from((await simulate(netlist('1.6'))).dcSweep!.current('VD'))).toEqual(level2);
  });

  it.each(['7', '99'])('still rejects the unimplemented in-range LEVEL=%s', async level => {
    const netlist = deck('nmos-dc-level260').replace('NMOS (LEVEL=260', `NMOS (LEVEL=${level}`);
    await expect(simulate(netlist)).rejects.toBeInstanceOf(UnsupportedModelLevelError);
  });
});
