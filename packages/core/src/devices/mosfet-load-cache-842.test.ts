import { describe, expect, it } from 'vitest';
import { parse } from '../parser/index.js';
import { MNAAssembler } from '../mna/assembler.js';
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

  it('keeps an empty list a no-op', () => {
    const { assembler } = lockedSide();
    assembler.clear();
    MOSFET.batchStamp([], assembler.gValues, assembler.b, assembler.solution, assembler.stampIndex);
    expect(assembler.gValues.every(value => value === 0)).toBe(true);
  });
});
