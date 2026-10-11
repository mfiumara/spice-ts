import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';

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
});
