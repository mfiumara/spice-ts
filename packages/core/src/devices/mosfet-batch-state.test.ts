import { describe, expect, it } from 'vitest';
import { parse } from '../parser/index.js';
import { MNAAssembler } from '../mna/assembler.js';
import { MOSFET } from './mosfet.js';

// Issue #653: MOSFET.batchStamp reads each list's per-device constants and
// Newton state (vbs, vbd, von) from contiguous struct-of-arrays storage
// instead of per-instance heap fields. Every stamp must stay bit-identical to
// MOSFET.stamp on the same instance history, whichever lists the instances
// are batched in, and the state must stay shared with the per-device paths
// (MOSFET.stamp, limitNewtonStep).

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
.model NM NMOS(VTO=0.7 KP=110u GAMMA=0.4 LAMBDA=0.04 PHI=0.65 IS=1e-15)
.model PM PMOS(VTO=-0.7 KP=50u GAMMA=0.57 LAMBDA=0.05 PHI=0.65)
.tran 0.1n 10n
`;

interface Side {
  readonly assembler: MNAAssembler;
  readonly mosfets: MOSFET[];
}

/** An independent compile (MOSFETs carry Newton state) on a locked topology. */
function side(): Side {
  const compiled = parse(NETLIST).compile();
  const assembler = new MNAAssembler(compiled.nodeCount, compiled.branchCount);
  assembler.clear();
  const ctx = assembler.getStampContext();
  for (const device of compiled.devices) device.stamp(ctx);
  assembler.lockTopology();
  assembler.deviceGmin = 3.7e-11;
  const mosfets = compiled.devices.filter((device): device is MOSFET => device instanceof MOSFET);
  return { assembler, mosfets };
}

function setSolution(assembler: MNAAssembler, pass: number): void {
  // Swings every MOSFET through forward, reverse (vds < 0), cut-off and
  // junction-limited regions.
  for (let i = 0; i < assembler.systemSize; i++) {
    assembler.solution[i] = 2.5 * Math.sin(1.3 * i + 0.9 * pass) - 0.4 * ((i + pass) % 3);
  }
}

function expectIdentical(actual: Float64Array, expected: Float64Array): void {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    if (!Object.is(actual[i], expected[i])) {
      throw new Error(`entry ${i}: ${actual[i]} !== ${expected[i]}`);
    }
  }
}

describe('MOSFET.batchStamp struct-of-arrays state (#653)', () => {
  it('matches MOSFET.stamp bit for bit across overlapping lists, per-device stamps and temperature changes', () => {
    const expected = side();
    const actual = side();
    const all = actual.mosfets;
    // Overlapping sub-lists merge their instances' state stores (the first two
    // lists merge twice, invalidating the first list's cached batch); fresh
    // array copies of the same instances rebuild their batch from the store.
    const head = all.slice(0, 4);
    const lists: MOSFET[][] = [
      head, all.slice(2), all, head, [...all], all.slice(1, 3), [all[6], all[0], all[3]], all,
    ];
    for (let pass = 0; pass < 24; pass++) {
      const list = lists[pass % lists.length];
      const indices = list.map(mosfet => all.indexOf(mosfet));
      if (pass === 11) {
        for (const index of [1, 4]) {
          expected.mosfets[index].setTemperature(85);
          actual.mosfets[index].setTemperature(85);
        }
      }
      setSolution(expected.assembler, pass);
      setSolution(actual.assembler, pass);

      expected.assembler.clear();
      const ctxE = expected.assembler.getStampContext(1);
      for (const index of indices) expected.mosfets[index].stamp(ctxE);

      actual.assembler.clear();
      if (pass % 5 === 4) {
        // The per-device path must read and update the same state.
        const ctxA = actual.assembler.getStampContext(1);
        for (const index of indices) actual.mosfets[index].stamp(ctxA);
      } else {
        const { assembler } = actual;
        MOSFET.batchStamp(
          list, assembler.gValues, assembler.b, assembler.solution, assembler.stampIndex,
          assembler.deviceGmin,
        );
      }
      expectIdentical(actual.assembler.gValues, expected.assembler.gValues);
      expectIdentical(actual.assembler.b, expected.assembler.b);

      // limitedLastStamp (mos1load.c icheck -> CKTnoncon, #664) reports what
      // the last stamp of each instance did, batched or not.
      for (let index = 0; index < all.length; index++) {
        expect(actual.mosfets[index].limitedLastStamp())
          .toBe(expected.mosfets[index].limitedLastStamp());
      }
      if (pass === 0) {
        expect(indices.some(index => expected.mosfets[index].limitedLastStamp())).toBe(true);
      }

      // limitNewtonStep reads the threshold (von) the last stamp stored.
      const previous = new Float64Array(actual.assembler.solution);
      const candidate = previous.map((value, i) => value + 0.8 * Math.cos(i + pass));
      for (let index = 0; index < all.length; index++) {
        expect(actual.mosfets[index].limitNewtonStep(previous, candidate))
          .toBe(expected.mosfets[index].limitNewtonStep(previous, candidate));
      }
    }
  });

  it('keeps an instance state across a topology relock', () => {
    const expected = side();
    const actual = side();
    for (let pass = 0; pass < 6; pass++) {
      if (pass === 3) {
        for (const { assembler } of [expected, actual]) {
          assembler.invalidateTopology();
          assembler.clear();
          const ctx = assembler.getStampContext();
          for (const mosfet of (assembler === actual.assembler ? actual : expected).mosfets) mosfet.stamp(ctx);
          assembler.lockTopology();
        }
      }
      setSolution(expected.assembler, pass);
      setSolution(actual.assembler, pass);
      expected.assembler.clear();
      const ctxE = expected.assembler.getStampContext(1);
      for (const mosfet of expected.mosfets) mosfet.stamp(ctxE);
      const { assembler } = actual;
      assembler.clear();
      MOSFET.batchStamp(
        actual.mosfets, assembler.gValues, assembler.b, assembler.solution, assembler.stampIndex,
        assembler.deviceGmin,
      );
      expectIdentical(actual.assembler.gValues, expected.assembler.gValues);
      expectIdentical(actual.assembler.b, expected.assembler.b);
    }
  });

  it('accepts an empty list', () => {
    const { assembler } = side();
    const before = new Float64Array(assembler.gValues);
    MOSFET.batchStamp([], assembler.gValues, assembler.b, assembler.solution, assembler.stampIndex);
    expectIdentical(assembler.gValues, before);
  });
});
