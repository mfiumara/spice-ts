import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';

/**
 * mos1load.c limits the bulk junction with DEVpnjlim and then reports the
 * iterate as not converged (icheck -> CKTnoncon). With both terminals held by
 * voltage sources the node voltages never move, so without that flag Newton
 * stopped after 3 iterations on a junction still limited near vcrit. This
 * became reachable once the operating point runs plain Newton first, as
 * ngspice's CKTop does (#622), instead of ramping the sources.
 *
 * Reference: ngspice-47 `op; print i(vd)` (numdgt=12) on this deck:
 * 9.002319493985e+69 (the forward-biased drain-bulk junction at 5 V).
 */
describe('MOS1 bulk junction limiting blocks Newton convergence (ngspice CKTnoncon)', () => {
  it('drives a 5 V forward-biased drain junction to the ngspice-47 current', async () => {
    const result = await simulate(`mos1 forward drain junction
vd d 0 -5
vg g 0 -5
m1 d g 0 0 p1
.model p1 nmos level=1 vto=-1.2 kp=2
.op
.end
`);
    const current = result.dc!.current('vd');
    expect(Math.abs(current / 9.002319493985e69 - 1)).toBeLessThan(1e-9);
  });
});
