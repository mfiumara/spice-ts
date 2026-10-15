import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';
import { readFileSync } from 'node:fs';

describe('VDMOS self heating (#559)', () => {
  it('integrates CTHJ after a gate step with the expected thermal time constant', async () => {
    const result = await simulate(`thermal transient
m1 d g 0 tj tc power thermal
.model power vdmos vto=1 kp=2 mu=0 rthjc=2 cthj=1m cgs=0 cgdmin=0 cgdmax=0 cjo=0
vd d 0 2
vg g 0 pulse(0 3 1m 1n 1n 20m 40m)
vc tc 0 27
.tran 10u 5m
.end
`);
    const tran = result.transient!;
    const tj = tran.voltage('tj');
    const index = Array.from(tran.time).findIndex(t => t >= 0.003);
    const expected = 27 + 16 * (1 - Math.exp(-(tran.time[index] - 0.001) / 0.002));
    expect(Math.abs(tj[index] - expected)).toBeLessThan(0.02);
  });
  it('matches ngspice-47 on the unchanged corpus-f self-heating sweep', async () => {
    const deck = readFileSync(new URL('../../../../benchmarks/corpus/corpus-f/fixtures/examples/vdmos/self-heating.sp', import.meta.url), 'utf8');
    const result = await simulate(deck);
    const dc = result.dcSweep!;
    expect(dc.sweepValues.length).toBe(2495);
    // ngspice-47 ASCII raw export, same deck, only `write ... all` added.
    for (const [i, tj, tc, current] of [
      [0, 0.003618145727779173, 0.002970061661818526, -0.3240420429808509],
      [498, 8.329574578961502, 5.949996842160471, -2.384351420618038],
      [499, 0.006310054699010336, 0.004892826316060011, -0.7086142014751633],
      [1247, 81.43689687103901, 58.16876678264526, -46.53627282866886],
      [2494, 330.7067766285617, 236.2161373612961, -94.68004655461681],
    ]) {
      for (const [actual, expected] of [[dc.voltage('tj')[i], tj], [dc.voltage('tc')[i], tc], [dc.current('vd')[i], current]]) {
        expect(Math.abs(actual - expected)).toBeLessThan(0.01 * Math.abs(expected) + 1e-8);
      }
    }
  });
  it.each(['thermal', 'thermal=1'])('balances DC channel power through Tj/Tc (%s)', async flag => {
    const result = await simulate(`thermal balance
m1 d g 0 tj tc power ${flag}
.model power vdmos vto=1 kp=2 mu=0 rthjc=2 rthca=3 cthj=1m
vd d 0 2
vg g 0 3
.options reltol=1e-9
.op
.end
`);
    const op = result.dc!;
    const power = -2 * op.current('vd');
    expect(Math.abs(op.voltage('tj') - op.voltage('tc') - 2 * power)).toBeLessThan(1e-6 * power);
    expect(Math.abs(op.voltage('tc') - 27 - 3 * power)).toBeLessThan(1e-6 * power);
  });
});
