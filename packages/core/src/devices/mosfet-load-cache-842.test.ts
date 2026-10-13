import { describe, expect, it } from 'vitest';
import { parse } from '../parser/index.js';
import { MNAAssembler } from '../mna/assembler.js';
import { simulate } from '../simulate.js';
import { MOSFET } from './mosfet.js';

// Issue #842: MOSFET.batchStamp reuses a device's last batched load when its
// inputs (terminal voltages, previous limited junction voltages, gmin) are
// bit-identical. The stamped system and every MOS1 state value must stay
// exactly what the uncached per-device MOSFET.stamp produces, including when
// per-device stamps, temperature changes and gmin changes interleave.

const NETLIST = `
VDD vdd 0 3.3
VIN in 0 PULSE(0 3.3 1n 100p 100p 2n 5n)
M1 out in 0 0 NM W=2u L=1u
M2 out in vdd vdd PM W=4u L=1u
R1 out mid 1k
M3 o2 out 0 0 NM W=2u L=1u
M4 o2 out vdd vdd PM W=4u L=1u
M5 o3 o2 mid sub NM W=1u L=0.5u
M6 mid o3 o2 o2 PM W=3u L=1u
R2 o3 0 10k
R3 sub 0 1meg
M7 vdd o3 o2 0 NM W=1u L=1u
M8 0 in o3 0 NM W=1u L=1u
M9 o3 vdd in 0 NM W=1u L=1u
.model NM NMOS(VTO=0.7 KP=110u GAMMA=0.4 LAMBDA=0.04 PHI=0.65 IS=1e-15)
.model PM PMOS(VTO=-0.7 KP=50u GAMMA=0.57 LAMBDA=0.05 PHI=0.65)
.tran 0.1n 10n
`;

// Bulk junction charge: zero-bias CBD/CBS on one model, area/sidewall CJ/CJSW
// (with AD/AS/PD/PS) plus Meyer gate charge (TOX) and overlaps on the other.
const JUNCTION_CAP_NETLIST = `
VDD vdd 0 3.3
VIN in 0 1.1
M1 out in 0 0 NM W=2u L=1u AD=4p AS=4p
M2 out in vdd vdd PM W=4u L=1u AD=8p AS=8p PD=12u PS=12u
M3 o2 out 0 0 NM W=2u L=1u
M4 o2 out vdd vdd PM W=4u L=1u AD=8p AS=8p PD=12u PS=12u
M5 vdd o2 o3 0 NM W=1u L=1u AD=2p AS=2p
R1 o3 0 10k
.model NM NMOS(VTO=0.7 KP=110u GAMMA=0.4 LAMBDA=0.04 CBD=20f CBS=20f)
.model PM PMOS(VTO=-0.7 KP=50u CJ=2e-4 CJSW=1e-9 MJ=0.5 MJSW=0.33 PB=0.8 TOX=20n CGSO=1e-10 CGDO=1e-10)
.tran 0.1n 10n
`;

/** A `stages`-inverter CMOS chain with bulk junction capacitance on every device. */
function junctionCapChain(stages: number): string {
  const lines = ['* MOS1 chain with junction caps', 'VDD vdd 0 3.3', 'VIN n0 0 PULSE(0 3.3 1n 0.2n 0.2n 4n 10n)'];
  for (let i = 0; i < stages; i++) {
    lines.push(`MN${i} n${i + 1} n${i} 0 0 NM W=2u L=1u AD=4p AS=4p`);
    lines.push(`MP${i} n${i + 1} n${i} vdd vdd PM W=4u L=1u AD=8p AS=8p PD=12u PS=12u`);
  }
  lines.push(
    '.model NM NMOS(VTO=0.7 KP=110u CBD=100f CBS=100f)',
    '.model PM PMOS(VTO=-0.7 KP=50u CJ=2e-4 CJSW=1e-9 TOX=20n CGSO=1e-10 CGDO=1e-10)',
    '.tran 0.2n 30n',
    '.end',
  );
  return lines.join('\n');
}

interface Side {
  readonly assembler: MNAAssembler;
  readonly mosfets: MOSFET[];
  /** Unknown of node \`in\`: only M1-M4 and M8 read it, all as their gate. */
  readonly gateOnly: number;
}

function lockedSide(): Side {
  const compiled = parse(NETLIST).compile();
  const assembler = new MNAAssembler(compiled.nodeCount, compiled.branchCount);
  assembler.clear();
  const ctx = assembler.getStampContext();
  for (const device of compiled.devices) device.stamp(ctx);
  assembler.lockTopology();
  const mosfets = compiled.devices.filter((device): device is MOSFET => device instanceof MOSFET);
  return { assembler, mosfets, gateOnly: compiled.nodeNames.indexOf('in') };
}

/** Every MOS1 state value of the device (VBS, VBD, VON, limited, the mos1conv.c load). */
function stateRow(mosfet: MOSFET): number[] {
  const { stateStore, stateBase } = mosfet as unknown as {
    stateStore: { values: Float64Array }; stateBase: number;
  };
  return Array.from(stateStore.values.subarray(stateBase, stateBase + 15));
}

function expectSameBits(actual: ArrayLike<number>, expected: ArrayLike<number>, what: string): void {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < actual.length; i++) {
    if (!Object.is(actual[i], expected[i])) {
      throw new Error(`${what}[${i}]: ${actual[i]} !== ${expected[i]}`);
    }
  }
}

describe('MOS1 batched load cache (#842)', () => {
  it('stamps and records exactly what the uncached per-device load does', () => {
    const cached = lockedSide();
    const reference = lockedSide();
    const lists = (side: Side): MOSFET[][] => {
      const all = side.mosfets;
      return [all, all, all.slice(0, 5), all.slice(3), [all[7], all[2], all[5]], all];
    };
    const cachedLists = lists(cached);
    const referenceLists = lists(reference);
    const size = cached.assembler.systemSize;
    let solution = new Float64Array(size);
    let signedZeroPasses = 0;

    for (let pass = 0; pass < 96; pass++) {
      const which = pass % cachedLists.length;
      // Most passes repeat the previous solution exactly (the cache case), or
      // move only some unknowns; every eighth pass moves everything.
      if (pass % 8 === 0) {
        solution = Float64Array.from({ length: size }, (_, i) => 2.5 * Math.sin(1.3 * i + 0.9 * pass) - 0.4 * ((i + pass) % 3));
      } else if (pass % 8 === 3) {
        solution[pass % size] += 0.25;
      } else if (pass % 8 === 5) {
        // Exact zeros of either sign on two unknowns: -0 and +0 are different inputs.
        const sign = (pass >> 3) % 2 === 0 ? -0 : 0;
        solution[1] = sign;
        solution[2] = Object.is(sign, -0) ? 0 : -0;
        signedZeroPasses++;
      } else if (pass % 8 === 6) {
        // Same solution with the zeros' signs flipped.
        solution[1] = Object.is(solution[1], -0) ? 0 : -0;
        solution[2] = Object.is(solution[2], -0) ? 0 : -0;
      }
      if (pass === 42) {
        // Constants change on a repeated solution: every cached load is stale.
        for (const side of [cached, reference]) for (const mosfet of [side.mosfets[1], side.mosfets[4]]) mosfet.setTemperature(85);
      }
      // Switched on a repeated solution, like a gmin-stepping level.
      const gmin = pass >= 60 && pass < 72 ? 1e-9 : 1e-12;

      for (const side of [cached, reference]) {
        side.assembler.solution.set(solution);
        side.assembler.clear();
        side.assembler.deviceGmin = gmin;
      }
      if (pass % 11 === 7) {
        // A per-device stamp at a different gate voltage between two batched
        // loads at the same solution rewrites the gate-dependent state of
        // those devices but leaves their junction voltages (part of the cache
        // key) unchanged; the next batched load must not reuse its cached load.
        const shifted = Float64Array.from(solution);
        shifted[cached.gateOnly] += 0.3;
        for (const side of [cached, reference]) {
          side.assembler.solution.set(shifted);
          const ctx = side.assembler.getStampContext(2);
          for (const mosfet of side.mosfets.slice(0, 6)) mosfet.stamp(ctx);
          side.assembler.solution.set(solution);
          side.assembler.clear();
        }
      }

      const { assembler } = cached;
      MOSFET.batchStamp(
        cachedLists[which], assembler.gValues, assembler.b, assembler.solution, assembler.stampIndex, gmin,
      );
      const ctx = reference.assembler.getStampContext(1 + which);
      for (const mosfet of referenceLists[which]) mosfet.stamp(ctx);

      expectSameBits(assembler.gValues, reference.assembler.gValues, `pass ${pass} G`);
      expectSameBits(assembler.b, reference.assembler.b, `pass ${pass} b`);
      for (let m = 0; m < cached.mosfets.length; m++) {
        expectSameBits(stateRow(cached.mosfets[m]), stateRow(reference.mosfets[m]), `pass ${pass} M${m + 1} state`);
        const tolerances = { reltol: 1e-3, abstol: 1e-12, vntol: 1e-6 };
        expect(cached.mosfets[m].convergenceTest(solution, tolerances))
          .toBe(reference.mosfets[m].convergenceTest(solution, tolerances));
      }
    }
    expect(signedZeroPasses).toBeGreaterThan(5);
  });

  it('stays exact when stampTransientCharge folds junction charge currents into the state', () => {
    // PR #859 review: stampTransientCharge folds the bulk junction charge
    // currents into STATE_CD/CBD/GBD/CBS/GBS after every load (mos1load.c).
    // A cache hit must restore the pre-fold load first, or the folds stack.
    const side = (): Side => {
      const compiled = parse(JUNCTION_CAP_NETLIST).compile();
      const assembler = new MNAAssembler(compiled.nodeCount, compiled.branchCount);
      assembler.clear();
      const ctx = assembler.getStampContext();
      for (const device of compiled.devices) device.stamp(ctx);
      for (const device of compiled.devices) device.stampTransientCharge?.(ctx, { method: 'euler', dt: 1e-10 });
      assembler.lockTopology();
      const mosfets = compiled.devices.filter((device): device is MOSFET => device instanceof MOSFET);
      return { assembler, mosfets, gateOnly: compiled.nodeNames.indexOf('in') };
    };
    const cached = side();
    const reference = side();
    const size = cached.assembler.systemSize;
    const tolerances = { reltol: 1e-3, abstol: 1e-12, vntol: 1e-6 };
    let solution = Float64Array.from({ length: size }, (_, i) => 0.3 + 0.7 * i);
    for (let pass = 0; pass < 24; pass++) {
      // Repeat each solution a few times (cache hits), then move it.
      if (pass % 4 === 0 && pass > 0) {
        solution = Float64Array.from({ length: size }, (_, i) => 1.6 * Math.sin(0.9 * i + 0.7 * pass) + 1.2);
      }
      const integration = pass < 12
        ? { method: 'euler' as const, dt: 1e-10 }
        : { method: 'trapezoidal' as const, dt: 5e-11 };
      for (const s of [cached, reference]) {
        s.assembler.solution.set(solution);
        s.assembler.clear();
      }
      const { assembler } = cached;
      MOSFET.batchStamp(cached.mosfets, assembler.gValues, assembler.b, assembler.solution, assembler.stampIndex);
      const cachedCtx = assembler.getStampContext();
      for (const mosfet of cached.mosfets) mosfet.stampTransientCharge(cachedCtx, integration);
      const referenceCtx = reference.assembler.getStampContext();
      for (const mosfet of reference.mosfets) mosfet.stamp(referenceCtx);
      for (const mosfet of reference.mosfets) mosfet.stampTransientCharge(referenceCtx, integration);

      expectSameBits(assembler.gValues, reference.assembler.gValues, `pass ${pass} G`);
      expectSameBits(assembler.b, reference.assembler.b, `pass ${pass} b`);
      const moved = Float64Array.from(solution, value => value + 0.01);
      for (let m = 0; m < cached.mosfets.length; m++) {
        expectSameBits(stateRow(cached.mosfets[m]), stateRow(reference.mosfets[m]), `pass ${pass} M${m + 1} state`);
        expect(cached.mosfets[m].convergenceTest(moved, tolerances))
          .toBe(reference.mosfets[m].convergenceTest(moved, tolerances));
      }
    }
  });

  it('never stacks a junction charge fold on the previous fold in a transient', async () => {
    // A fold that starts from the state row the previous fold left behind (no
    // load in between rewrote it) stacks: 13,250 of them in the PR #859
    // review's 25-stage chain at 8b561cbb, 0 on the uncached base.
    const proto = MOSFET.prototype as unknown as {
      stampTransientCharge(this: MOSFET, ...args: unknown[]): void;
    };
    const original = proto.stampTransientCharge;
    const lastPostFold = new Map<MOSFET, number[]>();
    let folds = 0;
    let stacked = 0;
    proto.stampTransientCharge = function (this: MOSFET, ...args: unknown[]): void {
      const before = stateRow(this);
      original.apply(this, args);
      const after = stateRow(this);
      if (after[13] !== before[13] || after[14] !== before[14]) {
        folds++;
        const previous = lastPostFold.get(this);
        if (previous !== undefined && previous[13] === before[13] && previous[14] === before[14]) stacked++;
      }
      lastPostFold.set(this, after);
    };
    try {
      const result = await simulate(junctionCapChain(8));
      expect(result.transient!.time.length).toBeGreaterThan(50);
    } finally {
      proto.stampTransientCharge = original;
    }
    expect(folds).toBeGreaterThan(1000);
    expect(stacked).toBe(0);
  });

  it('keeps an empty list a no-op', () => {
    const { assembler } = lockedSide();
    assembler.clear();
    MOSFET.batchStamp([], assembler.gValues, assembler.b, assembler.solution, assembler.stampIndex);
    expect(assembler.gValues.every(value => value === 0)).toBe(true);
  });
});
