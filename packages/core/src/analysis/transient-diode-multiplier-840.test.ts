import { describe, expect, it } from 'vitest';
import { parse } from '../parser/index.js';
import { simulate } from '../simulate.js';

// Issue #840: corpus-i VACASK diode voltage multiplier
// (benchmarks/corpus/corpus-i/fixtures/vacask/benchmark/mul/xyce/runme.sim,
// AGPL-3.0-only, pinned fb8cc2055a4f) reported tran i(vs) 3.9 % of peak off
// ngspice-47 (#841). This deck is the fixture netlist unchanged except the stop
// time (5 ms -> 100 us): TMAX is the 10 ns TSTEP either way, so ngspice-47
// accepts the same first 10017 points and spice-ts reproduced the same 0.0392
// worst error inside this window before #836.
//
// The error sat on the diode turn-on/turn-off edges of the first ~300 us,
// where i(vs) swings by ~1 A within two 10 ns steps. Transient Newton skipped
// ngspice-47 NIconvTest's branch-current test (RELTOL*max + ABSTOL), so
// iterates ngspice refines once more were accepted; the accepted points drifted
// by up to 6.3 ns from ngspice's, which on these edges is tenths of an ampere.
// #836 restored the branch-current test; the grids now agree within 23 ps and
// the full fixture's worst error is 0.00056. `method=gear maxord=2` behind
// the Xyce TIMEINT package keyword was honoured throughout.
const DECK = `Diode cascade

.model D1N4007 D IS=76.9p RS=42.0m BV=1.00k IBV=5.00u CJO=26.5p  M=0.333 N=1.45
* TT=4.32u

vs a 0 0 sin 0 50 100k
r1 a 1 0.01
c1 1 2 100n
d1 0 2 d1n4007
c2 0 10 100n
d2 2 10 d1n4007
c3 2 3  100n
d3 10 3 d1n4007
c4 10 20 100n
d4 3 20 d1n4007

.options timeint method=gear maxord=2
.tran 0.01u 100u 0 0.01u
.end
`;

// ngspice-47 (`ngspice -b -r`, ascii raw) accepted i(vs) points on the four
// diode edges with the largest pre-#836 error: [time s, i(vs) A].
const NGSPICE: ReadonlyArray<readonly [number, number]> = [
  [5.50014490e-5, 2.08922573e-3],
  [5.50114490e-5, 2.49164734e-1],
  [5.50203904e-5, 9.73832725e-1],
  [6.00095163e-5, -4.63243463e-2],
  [6.00176919e-5, -5.76528338e-1],
  [6.00264442e-5, -8.53654173e-1],
  [6.52364442e-5, 2.32965140e-3],
  [6.52464442e-5, 2.97333485e-1],
  [6.52564442e-5, 1.02760351],
  [7.02459709e-5, -1.26055686e-1],
  [7.02543533e-5, -6.86434184e-1],
  [7.54431019e-5, 6.69641207e-3],
  [7.54531019e-5, 5.07479827e-1],
  [7.54631019e-5, 1.05508357],
];
/** ngspice-47 peak |i(vs)| over the fixture run. */
const PEAK = 3.142;

function interpolate(time: number[], values: number[], at: number): number {
  const index = time.findIndex(t => t >= at);
  if (index <= 0) return values[Math.max(index, 0)]!;
  const t0 = time[index - 1]!;
  const t1 = time[index]!;
  return values[index - 1]! + (values[index]! - values[index - 1]!) * (at - t0) / (t1 - t0);
}

describe('VACASK diode multiplier i(vs) matches ngspice-47 on diode edges (#840)', () => {
  it('applies method=gear maxord=2 behind the Xyce TIMEINT package keyword', () => {
    expect(parse(DECK).simulationOptions.integrationMethod).toBe('gear2');
  });

  it('tracks ngspice-47 i(vs) across the steepest diode edges within 1% of peak', async () => {
    const result = await simulate(DECK);
    const transient = result.transient!;
    const time = Array.from(transient.time);
    const current = transient.current('vs');
    expect(time.length).toBe(10017);
    const errors = NGSPICE.map(([at, reference]) => Math.abs(interpolate(time, current, at) - reference) / PEAK);
    // Before #836: 0.045 (6.52464e-5 s). After: 3.4e-4.
    expect(Math.max(...errors)).toBeLessThan(0.01);
  });
});
