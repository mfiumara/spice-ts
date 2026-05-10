import { describe, it, expect } from 'vitest';
import { simulate } from '../simulate.js';

describe('Mutual inductance (K-element)', () => {
  it('parses K-line and produces coupled-inductor response (Chua & Lin 8-7)', async () => {
    // Full Chua & Lin page 343 benchmark — three coupled inductors with
    // K1, K2, K3 and an asymmetric IC seed. Verifies the K-element
    // contribution actually reaches the dynamic system: coupled vs.
    // uncoupled traces differ by a measurable amount on the inductor
    // currents.
    const tplt = (kLines: string) => `
      V1 inp 0 DC 1
      R10 inp x 0.5
      C2 x 0 2
      L8 x c 2H ic=2
      C12 x y 5 ic=2
      L9 y c 2H
      C3 y 0 4 ic=5
      R11 y out 0.25
      R5 out 0 2
      I1 0 out DC 1
      L6 c n1 4H
      R4 n1 0 1
      ${kLines}
      .tran 0.5 5 0 0.5 uic`;
    const coupled = (await simulate(tplt(
      'K1 L6 L8 -0.3535534\nK2 L6 L9 -0.3535534\nK3 L8 L9 -0.5',
    ))).transient!;
    const uncoupled = (await simulate(tplt('* no coupling'))).transient!;

    const ic = coupled.current('L9');
    const iu = uncoupled.current('L9');
    let maxDiff = 0;
    for (let i = 0; i < Math.min(ic.length, iu.length); i++) {
      maxDiff = Math.max(maxDiff, Math.abs(ic[i] - iu[i]));
    }
    expect(maxDiff).toBeGreaterThan(0.1);
  });

  it('throws on K referencing an unknown inductor', async () => {
    await expect(simulate(`
      V1 a 0 DC 1
      L1 a 0 1m
      K1 L1 L99 0.5
      .tran 1u 1m
    `)).rejects.toThrow(/K-element/);
  });
});

describe('Initial conditions (.tran ... uic)', () => {
  it('seeds capacitor voltages and inductor currents from ic= values', async () => {
    // RC discharge: C with ic=5V, no source. With UIC, V across cap starts
    // at 5V and decays through R toward 0.
    const r = await simulate(`
      C1 a 0 1u ic=5
      R1 a 0 1k
      .tran 100u 5m uic
    `);
    const v = r.transient!.voltage('a');
    expect(v[0]).toBeCloseTo(5, 1);
    expect(v[v.length - 1]).toBeLessThan(0.1); // 5 RC settled
  });

  it('seeds inductor branch current from ic=', async () => {
    // RL freewheel: L with ic=2A discharging through R.
    const r = await simulate(`
      L1 a 0 1m ic=2
      R1 a 0 100
      .tran 1u 50u uic
    `);
    const i = r.transient!.current('L1');
    expect(i[0]).toBeCloseTo(2, 1);
    expect(Math.abs(i[i.length - 1])).toBeLessThan(0.2); // ~5 L/R settled
  });
});
