import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';

// Issue #482: every circuit with a source breakpoint after t=0 (any PULSE or
// PWL deck) used the raw-RHS trapezoidal history for its linear capacitors and
// inductors. That history applies the new Newton iterate's Jacobian to the old
// solution, so a static nonlinear device whose conductance changes across the
// step misintegrates the capacitor current on its node. ngspice NIintegrate
// keeps the accepted capacitor current instead, which here is the static KCL
// residual at the accepted point. References are ngspice-47 on the identical
// decks; reproduce with `node benchmarks/trap-history-482/measure.mjs`.

/** First time `values` crosses `level` upward at or after `from`, interpolated. */
function firstRising(time: number[], values: number[], level: number, from: number): number {
  for (let index = 1; index < values.length; index++) {
    if (time[index]! < from) continue;
    const before = values[index - 1]!;
    const after = values[index]!;
    if (before < level && after >= level) {
      return time[index - 1]! + (time[index]! - time[index - 1]!) * (level - before) / (after - before);
    }
  }
  return Number.NaN;
}

/** First time `values` crosses `level` in either direction, interpolated. */
function firstCrossing(time: number[], values: number[], level: number): number {
  for (let index = 1; index < values.length; index++) {
    const before = values[index - 1]! - level;
    const after = values[index]! - level;
    if ((before < 0) !== (after < 0)) {
      return time[index - 1]! + (time[index]! - time[index - 1]!) * before / (before - after);
    }
  }
  return Number.NaN;
}

/**
 * The M2 scaling deck `cmosInverterChainTran(22)` from
 * benchmarks/performance/scaling-m2-fixture.mjs, byte for byte: 20 MOS1 stages
 * with linear 10 fF loads and no device charge.
 */
function inverterChain22(): string {
  const lines = [
    '* spice-ts generated CMOS inverter chain transient: 20 stages, 22 nodes',
    '.options acct',
    'VDD vdd 0 DC 2.5',
    'VIN s0 0 PULSE(0 2.5 0.1n 0.1n 0.1n 5n 10n)',
    '.model nch nmos level=1 vto=0.5 kp=120u lambda=0.02',
    '.model pch pmos level=1 vto=-0.5 kp=60u lambda=0.02',
  ];
  for (let stage = 1; stage <= 20; stage++) {
    lines.push(`MP${stage} s${stage} s${stage - 1} vdd vdd pch W=2u L=1u`);
    lines.push(`MN${stage} s${stage} s${stage - 1} 0 0 nch W=1u L=1u`);
    lines.push(`C${stage} s${stage} 0 10f`);
  }
  lines.push('.tran 10p 2n', '.print tran v(s20)', '.end');
  return `${lines.join('\n')}\n`;
}

describe('trapezoidal history of linear reactive elements under source breakpoints (#482)', () => {
  it('starts the unchanged mesa-oscillator fixture on the ngspice-47 first edge', async () => {
    const netlist = readFileSync(new URL(
      '../../../../benchmarks/corpus/ngspice/fixtures/tests/mesa/mesosc.cir',
      import.meta.url,
    ), 'utf8');
    const transient = (await simulate(netlist)).transient!;
    const edge = firstRising(transient.time, transient.voltage('8'), 0.33, 1e-9);
    // ngspice-47 default: 1450.52 ps. Raw-RHS history: 1498.78 ps.
    expect(Math.abs(edge - 1450.52e-12)).toBeLessThan(10e-12);
  }, 180_000);

  it('times the #477 MOS1 inverter chain like ngspice-47 at default settings', async () => {
    const transient = (await simulate(inverterChain22())).transient!;
    // ngspice-47 default 1.25 V crossings (ps). Raw-RHS history:
    // 221.39 / 314.93 / 601.13 / 1079.26.
    const reference: ReadonlyArray<readonly [string, number]> = [
      ['s1', 225.45e-12], ['s2', 319.65e-12], ['s5', 608.73e-12], ['s10', 1090.75e-12],
    ];
    const s1 = firstCrossing(transient.time, transient.voltage('s1'), 1.25);
    expect(Math.abs(s1 - 225.45e-12)).toBeLessThan(0.5e-12);
    for (const [node, expected] of reference) {
      const actual = firstCrossing(transient.time, transient.voltage(node), 1.25);
      expect(Math.abs(actual - expected), `${node}: ${actual} vs ${expected}`)
        .toBeLessThan(1e-3 * expected);
    }
  }, 60_000);
});
