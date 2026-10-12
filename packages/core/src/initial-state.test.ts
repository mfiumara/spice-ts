import { describe, expect, it } from 'vitest';
import { createTransientSim, parse, simulate } from './index.js';

describe('initial-state semantics', () => {
  it('parses .ic and .nodeset into distinct typed node state', () => {
    const compiled = parse(`
      V1 in 0 DC 1
      R1 in out 1k
      R2 out 0 1k
      .ic V(out)=3 V(in) = 2
      .nodeset V(out)=0.25
      .tran 1u 2u UIC
    `).compile();

    expect(compiled.initialConditions).toEqual([
      { node: 'out', value: 3 },
      { node: 'in', value: 2 },
    ]);
    expect(compiled.nodeSets).toEqual([{ node: 'out', value: 0.25 }]);
    expect(compiled.analyses).toContainEqual({
      type: 'tran', timestep: 1e-6, stopTime: 2e-6, useInitialConditions: true,
    });
  });

  it('deduplicates .ic and .nodeset node names case-insensitively', () => {
    const compiled = parse(`
      R1 OUT 0 1k
      C1 OUT 0 1u
      .ic V(OUT)=1 V(out)=3
      .nodeset V(Out)=0.25 V(oUT)=0.5
      .tran 1u 2u UIC
    `).compile();

    expect(compiled.initialConditions).toEqual([{ node: 'out', value: 3 }]);
    expect(compiled.nodeSets).toEqual([{ node: 'oUT', value: 0.5 }]);
  });

  it('holds a source-driven .ic node through the source branch like ngspice (#531)', async () => {
    const result = await simulate(`
      V1 out 0 DC 1
      R1 out 0 1k
      .ic V(out)=3
      .tran 1u 2u
    `);

    expect(result.transient?.time[0]).toBe(0);
    expect(result.transient?.voltage('out')[0]).toBeCloseTo(1, 9);
    // ngspice-47 prints i(v1) = 2e10 A at t=0 (1e10 S hold against 2 V), then -1 mA.
    const current = result.transient!.current('V1');
    expect(current[0] / 2e10).toBeCloseTo(1, 9);
    expect(current[1]).toBeCloseTo(-1e-3, 12);
  });

  // #531: ngspice-47 cktload.c holds `.ic` nodes during the transient
  // operating point (MODETRANOP without UIC), then releases them at t=0.
  it('holds .ic nodes in the transient operating point without UIC (#531)', async () => {
    const result = await simulate(`
      c1 1 0 1uF
      R1 1 2 1K
      v1 2 0 0V
      .ic v(1)=1
      .tran 1e-4 5ms
    `);

    const time = result.transient!.time;
    const v1 = result.transient!.voltage('1');
    expect(time[0]).toBe(0);
    expect(v1[0]).toBeCloseTo(1, 9);
    // Released at t=0: the capacitor discharges as exp(-t/1ms).
    for (let i = 1; i < time.length; i++) {
      expect(Math.abs(v1[i] - Math.exp(-time[i] / 1e-3))).toBeLessThan(3e-3);
    }
  });

  it('holds a source-free .ic node in the transient operating point (#531)', async () => {
    const result = await simulate(`
      c1 1 0 1u
      R1 1 0 1k
      .ic v(1)=1
      .tran 0.5u 5u
    `);

    const time = result.transient!.time;
    const v1 = result.transient!.voltage('1');
    expect(v1[0]).toBeCloseTo(1, 9);
    expect(v1.at(-1)!).toBeCloseTo(Math.exp(-time.at(-1)! / 1e-3), 5);
  });

  it('holds .ic nodes in the createTransientSim operating point (#531)', async () => {
    const sim = await createTransientSim(`
      c1 1 0 1u
      R1 1 0 1k
      .ic v(1)=1
      .tran 0.5u 5u
    `);
    const step = sim.advance();
    expect(step.voltages.get('1')!).toBeCloseTo(Math.exp(-step.time / 1e-3), 6);
  });

  // #588: ngspice-47 cktload.c ZeroNoncurRow zeroes the voltage columns of a
  // held row and overwrites its RHS. Without a branch-current column the row
  // becomes `v = ic` exactly, so the node's own conductances (here the 1 uOhm
  // R1 to the 1 V source) no longer pull it off the .ic value.
  it('pins a source-free .ic node exactly in the transient operating point like ngspice ZeroNoncurRow (#588)', async () => {
    const result = await simulate(`
      V1 a 0 1
      R1 a b 1u
      C1 b 0 1u
      R2 b 0 1k
      .ic v(b)=0
      .tran 1n 100n
    `);

    const transient = result.transient!;
    expect(transient.time[0]).toBe(0);
    // ngspice-47: v(b) = 0 and i(v1) = -1e6 A at t=0.
    expect(transient.voltage('b')[0]).toBe(0);
    expect(transient.voltage('a')[0]).toBeCloseTo(1, 12);
    expect(transient.current('V1')[0] / -1e6).toBeCloseTo(1, 9);
  });

  it('keeps the branch-current column of a held .ic row and replaces its node conductances (#588)', async () => {
    // Row `out` has the V1 branch column: ngspice-47 keeps it, zeroes the R1
    // conductance, adds 1e10 to the diagonal and sets the RHS to 1e10*ic, so
    // i(v1) = 1e10*(3 - 1) exactly with no R1 contribution.
    const result = await simulate(`
      V1 out 0 DC 1
      R1 out 0 1
      .ic V(out)=3
      .tran 1u 2u
    `);

    const current = result.transient!.current('V1');
    expect(result.transient!.voltage('out')[0]).toBeCloseTo(1, 12);
    // Keeping R1's 1 S would give 2e10 - 1 A.
    expect(Math.abs(current[0] - 2e10)).toBeLessThan(1e-2);
  });

  it('pins a nonlinear .ic node exactly through source ramping (#588)', async () => {
    const result = await simulate(`
      V1 a 0 1
      R1 a b 1k
      D1 b 0 dm
      C1 b 0 1n
      .model dm d is=1e-14
      .ic v(b)=0.2
      .tran 1n 10n
    `);

    // ngspice-47: v(b) = 0.2 V and i(v1) = -0.8 mA at t=0 (the diode
    // current at 0.2 V no longer pulls the held node).
    expect(result.transient!.voltage('b')[0]).toBe(0.2);
    expect(result.transient!.current('V1')[0]).toBeCloseTo(-8e-4, 15);
  });

  it('does not hold .ic nodes in a .op operating point', async () => {
    const result = await simulate(`
      V1 2 0 1
      R2 2 1 1k
      R1 1 0 1k
      .ic V(1)=3
      .op
    `);

    expect(result.dc?.voltage('1')).toBeCloseTo(0.5, 9);
  });

  it('uses .nodeset as a Newton initial guess without forcing the operating point', async () => {
    const result = await simulate(`
      V1 in 0 DC 1
      R1 in out 1k
      R2 out 0 1k
      .nodeset V(out)=9
      .op
    `);

    expect(result.dc?.voltage('out')).toBeCloseTo(0.5, 9);
  });

  it('skips the operating point and applies .ic at t=0 with UIC', async () => {
    const result = await simulate(`
      R1 out 0 1k
      C1 out 0 1u
      .ic V(out)=3
      .tran 1u 2u UIC
    `);

    expect(result.transient?.time[0]).toBe(0);
    expect(result.transient?.voltage('out')[0]).toBeCloseTo(3, 9);
    expect(result.transient?.voltage('out').at(-1)).toBeLessThan(3);
  });

  it('resolves mixed-case .ic node names with UIC', async () => {
    const result = await simulate(`
      R1 OUT 0 1k
      C1 OUT 0 1u
      .ic V(out)=3
      .tran 1u 2u UIC
    `);

    expect(result.transient?.voltage('OUT')[0]).toBeCloseTo(3, 9);
  });

  it('resolves mixed-case .nodeset node names as Newton guesses', async () => {
    const result = await simulate(`
      V1 IN 0 DC 1
      R1 IN OUT 1k
      R2 OUT 0 1k
      .nodeset V(out)=9
      .op
    `);

    expect(result.dc?.voltage('OUT')).toBeCloseTo(0.5, 9);
  });
});
