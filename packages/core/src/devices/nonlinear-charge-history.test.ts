import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';
import { createTransientSim } from '../analysis/transient-driver.js';
import { TransientChargeState } from './charge-state.js';

// Issue #456: ngspice-47 integrates every nonlinear device charge with
// NIintegrate on the accepted charge and current of that charge. Before #456
// only the diode did (#403); JFET, HFET, MESA, MOS and BJT capacitances were
// stamped as C(v)*dv/dt with a trapezoidal history built from the new-iterate
// Jacobian applied to x(n). The ngspice decks behind these references are in
// benchmarks/results/issue-456/ngspice.

function interpolate(time: number, times: ArrayLike<number>, values: ArrayLike<number>): number {
  let index = 1;
  while (index < times.length - 1 && times[index] < time) index++;
  const start = times[index - 1];
  const end = times[index];
  if (end === start) return values[index];
  return values[index - 1] + (values[index] - values[index - 1]) * (time - start) / (end - start);
}

/** Times at which `values` crosses `level`, linearly interpolated. */
function edges(times: ArrayLike<number>, values: ArrayLike<number>, level: number): number[] {
  const out: number[] = [];
  for (let index = 1; index < times.length; index++) {
    const before = values[index - 1] - level;
    const after = values[index] - level;
    if (before * after < 0) {
      out.push(times[index - 1] + (times[index] - times[index - 1]) * before / (before - after));
    }
  }
  return out;
}

async function maxDeviation(
  netlist: string,
  signal: string,
  reference: ReadonlyArray<readonly [number, number]>,
): Promise<number> {
  const result = await simulate(netlist);
  const time = result.transient!.time;
  const values = result.transient!.voltage(signal);
  return Math.max(...reference.map(([t, v]) => Math.abs(interpolate(t, time, values) - v)));
}

// jfet_gate.cir: depletion gate charge through forward bias and back.
const JFET_DECK = `jfet gate charge
V1 in 0 PULSE(-4 0.4 0 1n 1n 20n 50n)
R1 in g 1k
VD d 0 2
J1 d g 0 JM
.model JM NJF VTO=-2 BETA=1m CGS=2p CGD=1p PB=0.8 FC=0.5
.tran 0.1n 50n
.end
`;

// ngspice-47 v(g) every 2 ns of its `linearize`d output on the identical deck.
const JFET_GATE_REFERENCE: ReadonlyArray<readonly [number, number]> = [
  -3.99999999, -1.1797002, -0.186594961, 0.133414786, 0.266777798, 0.330095902,
  0.362349426, 0.379425744, 0.388660821, 0.393714088, 0.396497074, -0.346964419,
  -3.01171099, -3.80876018, -3.96543692, -3.99383094, -3.99890135, -3.99980441,
  -3.99996518, -3.99999379, -3.99999889, -3.99999979, -3.99999996, -3.99999998,
  -3.99999999, -3.99999999,
].map((value, index) => [index * 2e-9, value] as const);

// jfet-gate-forward.cir: the same deck driven to 1.5 V with IS=1e-18 so v(g)
// rises to 0.88 V, past the FC*PB = 0.4 V corner where the gate charge switches
// to ngspice's linear-capacitance continuation (jfetload.c f1/f2/f3).
const JFET_FORWARD_DECK = `jfet gate charge across FC*PB
V1 in 0 PULSE(-4 1.5 0 1n 1n 20n 50n)
R1 in g 1k
VD d 0 2
J1 d g 0 JM
.model JM NJF VTO=-2 BETA=1m CGS=2p CGD=1p PB=0.8 FC=0.5 IS=1e-18
.tran 0.1n 50n
.end
`;

// ngspice-47 v(g) every 1 ns of its `linearize`d output on the identical deck.
const JFET_FORWARD_REFERENCE: ReadonlyArray<readonly [number, number]> = [
  -3.99999999, -2.32162625, -0.604860659, 0.130994137, 0.49812481, 0.711669416,
  0.850593607, 0.880520782, 0.880935936, 0.880939002, 0.880939025, 0.880939025,
  0.880939025, 0.880939025, 0.880939025, 0.880939025, 0.880939025, 0.880939025,
  0.880939025, 0.880939025, 0.880939025, 0.880939025, 0.382678847, -1.23106409,
  -2.58404625, -3.34865183, -3.71467655, -3.87767363, -3.94803759, -3.9780137,
  -3.99071263, -3.99607962, -3.99834562, -3.99930194, -3.99970547, -3.99987573,
  -3.99994756, -3.99997787, -3.99999066, -3.99999605, -3.99999833, -3.99999929,
  -3.99999969, -3.99999987, -3.99999994, -3.99999997, -3.99999998, -3.99999999,
  -3.99999999, -3.99999999, -3.99999999,
].map((value, index) => [index * 1e-9, value] as const);

// BSIM3v3 (capacitance-only, Meyer averaged charge increment) inverter chain:
// the same circuit as the bsim3.bench chain, three stages. The junction
// areas/perimeters are the values spice-ts used to default implicitly
// (W*0.5um, W+1um) before #589 adopted ngspice's AD=AS=PD=PS=0 defaults, so
// the circuit (and its junction capacitances) is unchanged by that switch.
function bsim3InverterChain(tran: string, options = ''): string {
  const lines = [
    '* BSIM3v3 CMOS inverter chain - 3 stages',
    '.model NMOD NMOS (LEVEL=49 VTH0=0.5 K1=0.6 U0=400 TOX=4n VSAT=1.5e5 PCLM=1.3 PDIBLC1=0.39 PDIBLC2=0.0086 CGSO=2.5e-10 CGDO=2.5e-10 CJ=1e-3 CJSW=5e-10 MJ=0.5 PB=1)',
    '.model PMOD PMOS (LEVEL=49 VTH0=-0.5 K1=0.6 U0=150 TOX=4n VSAT=1.2e5 PCLM=1.3 PDIBLC1=0.39 PDIBLC2=0.0086 CGSO=2.5e-10 CGDO=2.5e-10 CJ=1e-3 CJSW=5e-10 MJ=0.5 PB=1)',
    'VDD vdd 0 DC 1.8',
    'VIN in 0 PULSE(0 1.8 1n 100p 100p 5n 10n)',
  ];
  for (let stage = 1; stage <= 3; stage++) {
    const input = stage === 1 ? 'in' : `inv${stage - 1}`;
    lines.push(`MP${stage} inv${stage} ${input} vdd vdd PMOD W=2u L=0.18u AD=1p AS=1p PD=3u PS=3u`);
    lines.push(`MN${stage} inv${stage} ${input} 0 0 NMOD W=1u L=0.18u AD=0.5p AS=0.5p PD=2u PS=2u`);
  }
  if (options) lines.push(options);
  lines.push(tran, '.end');
  return lines.join('\n');
}

// NHFET level-5 inverter chain (benchmarks/corpus/ngspice/fixtures/tests/hfet).
// The reference is ngspice-47 v(4) on the same circuit run to convergence
// (RELTOL=1e-6, TMAX=0.1 ps, hfet-inverter-converged.cir) across the
// 1.0-1.2 ns rising edge. The Z cards there are listed driver first, which is
// electrically identical but keeps ngspice's leaking HFET inverse flag (#448)
// from selecting a different operating point; spice-ts is order independent.
const HFET_EDGE_REFERENCE: ReadonlyArray<readonly [number, number]> = [
  0.206341895, 0.0981934807, 0.0351273609, 0.0401224402, 0.0520986275, 0.0662495462,
  0.0846217001, 0.113448054, 0.185603551, 1.03898952, 1.7374936, 1.87238645,
  1.92876296, 1.95940602, 1.97650212, 1.98591888, 1.99102507, 1.99375824,
  1.99520556, 1.99596494, 1.9963602,
].map((value, index) => [1e-9 + index * 1e-11, value] as const);

describe('nonlinear device charge integration matches ngspice-47 (#456)', () => {
  it('integrates the JFET gate depletion charge through forward bias and back', async () => {
    // Before #456 (C(v)*dv/dt companion): 21.9 mV at these samples (30.2 mV over
    // ngspice's 517 points); after: 0.39 mV.
    expect(await maxDeviation(JFET_DECK, 'g', JFET_GATE_REFERENCE)).toBeLessThan(5e-3);
  });

  it('follows the converged NHFET inverter-chain edge on the unchanged fixture', async () => {
    const netlist = readFileSync(new URL(
      '../../../../benchmarks/corpus/ngspice/fixtures/tests/hfet/inverter.cir',
      import.meta.url,
    ), 'utf8');
    // Before #456: 85.5 mV on this edge (spice-ts lagged the converged edge); after: 21.2 mV.
    expect(await maxDeviation(netlist, '4', HFET_EDGE_REFERENCE)).toBeLessThan(4e-2);
  });

  it('integrates the JFET gate charge past the FC*PB forward-bias corner', async () => {
    // Before #456 (C(v)*dv/dt companion): 49.95 mV at these samples; after: 1.04 mV.
    expect(await maxDeviation(JFET_FORWARD_DECK, 'g', JFET_FORWARD_REFERENCE)).toBeLessThan(5e-3);
  });

  it('keeps the BSIM3v3 inverter chain at default tolerances on its converged waveform', async () => {
    // No ngspice reference: spice-ts BSIM3v3 is capacitance-only (Meyer), not
    // ngspice's charge-based capMod, so this checks integration self-consistency.
    // The reference is the same deck at RELTOL=1e-6, TMAX=1 ps; converged runs
    // do not depend on how the charge history is integrated.
    const converged = await simulate(bsim3InverterChain('.tran 50p 10n 0 1p', '.options reltol=1e-6'));
    const time = converged.transient!.time;
    const values = converged.transient!.voltage('inv3');
    const reference = Array.from(time, (t, index) => [t, values[index]] as const);
    // Default RELTOL at TMAX=5 ps, so the check is on the charge integration,
    // not on the timestep control. Before #456 (C(v)*dv/dt companion, default
    // TMAX): 200 mV; after: 10.0 mV; with the #589 b3ld.c DC core: 10.9 mV.
    // At TMAX=5 ps after #638: 19.2 mV.
    expect(await maxDeviation(bsim3InverterChain('.tran 50p 10n 0 5p'), 'inv3', reference)).toBeLessThan(3e-2);

    // Default tolerances and TMAX. Since #638 the BSIM3 nodes are sized by
    // charge truncation alone, as in ngspice-47 (no node-voltage LTE). Both
    // engines then take TMAX-bound steps: ngspice-47 222 accepted, spice-ts 218
    // (588 with node-voltage LTE). Each engine's 0.9 V edges against its own
    // converged run: ngspice-47 1.0 / 2.8 ps (max |dv| 248 mV), spice-ts
    // 5.6 / 11.0 ps (max |dv| 458 mV; 0.2 / 0.1 ps and 10.9 mV with node LTE).
    // The gap at equal step count is the Meyer capacitance model against
    // ngspice's charge-based capMod (#626), published as a loss.
    const coarse = await simulate(bsim3InverterChain('.tran 50p 10n'));
    const coarseEdges = edges(coarse.transient!.time, coarse.transient!.voltage('inv3'), 0.9);
    const convergedEdges = edges(time, values, 0.9);
    expect(coarseEdges).toHaveLength(convergedEdges.length);
    coarseEdges.forEach((edge, index) => {
      expect(Math.abs(edge - convergedEdges[index])).toBeLessThan(15e-12);
    });
  });

  it('replays the identical JFET trajectory after a transient reset', async () => {
    const sim = await createTransientSim(JFET_FORWARD_DECK);
    const first = sim.advanceUntil(25e-9);
    sim.reset();
    const second = sim.advanceUntil(25e-9);
    expect(second.length).toBe(first.length);
    for (let index = 0; index < first.length; index++) {
      expect(second[index].time).toBe(first[index].time);
      expect(second[index].voltages.get('g')).toBe(first[index].voltages.get('g'));
    }
    sim.dispose();
  });

  it('forgets the accepted charge history on reset, back to the MODEINITTRAN state', () => {
    const state = new TransientChargeState(1);
    const trap = { method: 'trapezoidal', dt: 1e-9 } as const;
    state.accept(0, 2e-12, 1, 2e-12);
    state.commit();
    state.begin(trap);
    state.accept(0, 3e-12, 1.5, 2e-12);
    state.commit();
    expect(state.acceptedChargeCurrent(0)).toBeCloseTo(2e-3, 15);
    expect(state.incrementalCharge(0, 2, 2e-12)).toBeCloseTo(4e-12, 24);

    state.reset();
    // Before the first accepted point: q = C*v, no capacitor current, no
    // averaging with a stale C(v(n)).
    expect(state.acceptedChargeCurrent(0)).toBe(0);
    expect(state.incrementalCharge(0, 2, 5e-12, true)).toBeCloseTo(1e-11, 24);
    expect(state.incrementalCapacitance(0, 5e-12, true)).toBe(5e-12);
    state.begin(trap);
    expect(state.current(0, 1e-11)).toBe(0);
    // The first accepted point after reset is at rest, and Gear-2 must
    // bootstrap with order 1 rather than reuse the pre-reset q(n-1).
    state.accept(0, 1e-11, 2, 5e-12);
    state.commit();
    expect(state.acceptedChargeCurrent(0)).toBe(0);
    state.begin({ method: 'gear2', dt: 1e-9, prevDt: 1e-9 });
    expect(state.factor).toBeCloseTo(1e9, 0); // order-1 1/dt, not Gear-2 1.5/dt
  });
});
