import { describe, it, expect } from 'vitest';
import { MNAAssembler } from '../mna/assembler.js';
import { MOSFET } from './mosfet.js';

/** Lock a 4-terminal topology; `extra` adds structure that shifts value slots. */
function lockedAssembler(extra: boolean): MNAAssembler {
  const size = extra ? 5 : 4;
  const asm = new MNAAssembler(size, 0);
  const ctx = asm.getStampContext();
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) ctx.stampG(row, col, 0);
  }
  if (extra) {
    for (let node = 0; node < 5; node++) {
      ctx.stampG(node, 4, 0);
      ctx.stampG(4, node, 0);
    }
  }
  asm.lockTopology();
  return asm;
}

function stampAt(mosfet: MOSFET, asm: MNAAssembler, voltages: readonly number[]): number[] {
  asm.clear();
  asm.solution.fill(0);
  asm.solution.set(voltages);
  MOSFET.batchStamp([mosfet], asm.gValues, asm.b, asm.solution, asm.stampIndex);
  const values: number[] = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) values.push(asm.gValues[asm.stampIndex(row, col)]);
    values.push(asm.b[row]);
  }
  return values;
}

const model = (polarity: number): Record<string, number> => ({
  LEVEL: 1, VTO: 0.5 * polarity, KP: 1.2e-4, LAMBDA: 0.02, W: 2e-6, L: 1e-6, polarity,
});

describe('MOSFET.batchStamp value slots', () => {
  // D, G, S, B node voltages: forward (vDS > 0) and reversed (drain/source swap).
  const cases: Array<[string, number, readonly number[]]> = [
    ['NMOS forward', 1, [1.2, 1.5, 0.2, 0]],
    ['NMOS reversed', 1, [0.2, 1.5, 0.6, 0]],
    ['PMOS forward', -1, [0.3, 0.2, 2.5, 2.5]],
    ['PMOS reversed', -1, [2.4, 0.2, 2.1, 2.5]],
  ];

  for (const [label, polarity, voltages] of cases) {
    it(`stamps identical values at every position after a topology change (${label})`, () => {
      const reused = new MOSFET('M1', [0, 1, 2, 3], model(polarity));
      const plain = stampAt(reused, lockedAssembler(false), voltages);
      // Same instance, new locked topology with every slot shifted.
      const shifted = stampAt(reused, lockedAssembler(true), voltages);
      // A fresh instance that never saw the first topology.
      const fresh = stampAt(new MOSFET('M2', [0, 1, 2, 3], model(polarity)), lockedAssembler(true), voltages);

      expect(shifted).toEqual(plain);
      expect(fresh).toEqual(plain);
      expect(plain.some(value => value !== 0)).toBe(true);
    });
  }

  it('skips ground terminals', () => {
    const mosfet = new MOSFET('M1', [0, 1, -1, -1], model(1));
    const asm = new MNAAssembler(2, 0);
    const ctx = asm.getStampContext();
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 2; col++) ctx.stampG(row, col, 0);
    }
    asm.lockTopology();
    asm.solution.set([1, 1.5]);
    MOSFET.batchStamp([mosfet], asm.gValues, asm.b, asm.solution, asm.stampIndex);
    expect(asm.gValues[asm.stampIndex(0, 0)]).toBeGreaterThan(0);
    expect(asm.gValues[asm.stampIndex(0, 1)]).toBeGreaterThan(0);
    expect(asm.gValues[asm.stampIndex(1, 0)]).toBe(0);
    expect(asm.gValues[asm.stampIndex(1, 1)]).toBe(0);
  });
});
