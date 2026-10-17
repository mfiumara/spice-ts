import { expect, it } from 'vitest';
import { simulate } from '../../simulate.js';

// ngspice-47, a80f6e3e95d51534905b1f23410a951802666656:
// spicelib/devices/vsrc/vsrcacct.c:99-150 schedules only the next PULSE
// corner on accept, using TIME-TD and period folding (not precomputed corners).
// xspice/icm/digital/adc_bridge/cfunc.mod:238-303 samples that analog grid;
// digital/d_jkff/cfunc.mod:643-670 captures the edge ending at ONE.
// Identical deck in ngspice-47: `run; eprint c q` gives these Q events.
// In particular the second rise samples at 40.3 ms, NOT 40.165 ms.
const deck = `Reduced JK clock sampling
vhi hi 0 5
vclk clk 0 pulse(0 5 0.1m 0.1m 0.1m 20m 40m)
aadc [hi clk hi 0] [j c k low] adc
.model adc adc_bridge(in_high=2 in_low=1 rise_delay=1n fall_delay=1n)
aff j k c low low q nq ff
.model ff d_jkff(ic=0 clk_delay=1n rise_delay=1n fall_delay=1n reset_delay=1)
aout [q] [out] dac
.model dac dac_bridge(out_low=0 out_high=5 out_undef=0.5 t_rise=1n t_fall=1n)
r out 0 1k
.tran 10m 100m
.end`;

it('samples the reduced JK clock on ngspice-47 accept-time PULSE breakpoints (#1185)', async () => {
  const result = await simulate(deck);
  const events = result.transient!.digital('q');
  expect(events.map(event => event.state)).toEqual(['0', '1', '0', '1']);
  const times = [0, 0.000144803, 0.040300003, 0.080165003];
  events.forEach((event, i) => expect(event.time).toBeCloseTo(times[i], 12));
});
