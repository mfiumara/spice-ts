import { describe, expect, it } from 'vitest';
import type { DeviceModel, StampContext } from '../devices/device.js';
import { ConvergenceError } from '../errors.js';
import { MNAAssembler } from '../mna/assembler.js';
import { resolveOptions } from '../types.js';
import { newtonRaphson } from './newton-raphson.js';

/**
 * The MOS2 CMOS inverter at VIN=0.25 V with ABSTOL=1E-18 (mos2.test.ts): the
 * PMOS is in deep triode (gds = 1.17 mS), so one ulp of V(out) = 5 V moves its
 * drain current by 1.04e-18 A, which is above ABSTOL. The mos2conv.c test then
 * passes only on an exact bitwise Newton fixed point. The exactly solved
 * stamped system has that fixed point (the value ngspice-47 prints), but LU
 * rounding can return one ulp off it, and Newton then cycles between the two
 * adjacent doubles forever. The device conductance stamped below toggles the
 * solve by exactly one ulp per load in the same way.
 */
class RoundingFloorDevice implements DeviceModel {
  readonly name = 'X1';
  readonly nodes = [0];
  readonly branches: number[] = [];
  readonly isNonlinear = true;
  private loads = 0;
  private loadedAt = Number.NaN;

  constructor(private readonly step: number) {}

  stamp(ctx: StampContext): void {
    this.loadedAt = ctx.getVoltage(0);
    ctx.stampG(0, 0, 1);
    ctx.stampB(0, this.loads++ % 2 === 0 ? 5 : 5 + this.step);
  }

  /** Converged only on an exact fixed point, as at the ABSTOL floor. */
  convergenceTest(solution: Float64Array): boolean {
    return solution[0] === this.loadedAt;
  }
}

function solve(device: DeviceModel): number {
  const options = { ...resolveOptions(), gmin: 0 };
  const assembler = new MNAAssembler(1, 0);
  return newtonRaphson(assembler, [device], options, 100, ['out']);
}

describe('Newton at the floating-point floor of the device convergence test', () => {
  it('accepts an exact two-cycle between adjacent doubles of the node voltages', () => {
    const ulp = 4 * Number.EPSILON; // spacing of doubles in [4, 8)
    expect(5 + ulp).not.toBe(5);
    expect(solve(new RoundingFloorDevice(ulp))).toBeLessThan(100);
  });

  it('still fails a two-cycle wider than the rounding floor', () => {
    // 1 nV passes the node test (VNTOL 1 uV) but is real non-convergence.
    expect(() => solve(new RoundingFloorDevice(1e-9))).toThrow(ConvergenceError);
  });
});
