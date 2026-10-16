import { expect, it } from 'vitest';
import { simulate } from '../../simulate.js';

it('does not apply artificial node-voltage LTE to square edges (#1211)', async () => {
  // cm_square uses phase arithmetic and temporary corner breakpoints, not
  // cm_analog_integrate/CKTterr. With tmax longer than the edges, ngspice
  // visits their endpoints without inserting node-voltage LTE substeps.
  const result = await simulate(`square edge truncation
v1 c 0 0
a1 c o sq
.model sq square(cntl_array=[0 1] freq_array=[1 1] out_low=-2 out_high=6 duty_cycle=0.25 rise_time=0.001 fall_time=0.002)
r1 o 0 1k
.tran 0.01 2.2
.end`);
  const tran = result.transient!;
  for (const value of tran.voltage('o')) {
    expect(Math.min(Math.abs(value + 2), Math.abs(value - 6))).toBeLessThan(1e-8);
  }
  for (const corner of [0.75, 0.751, 1, 1.002, 1.75, 1.751, 2, 2.002]) {
    expect(tran.time.some(time => Math.abs(time - corner) < 1e-10)).toBe(true);
  }
});
