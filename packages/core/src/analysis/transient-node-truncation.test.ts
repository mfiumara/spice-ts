import { describe, expect, it } from 'vitest';
import { parse } from '../parser/index.js';
import { simulate } from '../simulate.js';
import { chargeTruncatedNodes } from './transient-node-truncation.js';
import type { DeviceModel } from '../devices/device.js';

// Issue #638: ngspice-47 controls the transient timestep with CKTtrunc (device
// charge truncation) alone; it has no node-voltage LTE (`.option newtrunc` is
// not compiled in). On nodes whose every charge is truncated by a full DEVtrunc
// port (BSIM3trunc), spice-ts's node-voltage LTE was an extra, stricter check
// that took 6x more steps than ngspice on this chain and >20x on adder_mos_circ.
const CHAIN = `* BSIM3 CMOS inverter chain, ngspice default model card
VDD vdd 0 DC 3.3
VIN in 0 PULSE(0 3 5n 2n 2n 40n 80n)
MP1 a in vdd vdd p1 W=3u L=1u
MN1 a in 0 0 n1 W=3u L=2u
MP2 b a vdd vdd p1 W=3u L=1u
MN2 b a 0 0 n1 W=3u L=2u
MP3 out b vdd vdd p1 W=3u L=1u
MN3 out b 0 0 n1 W=3u L=2u
.model n1 nmos level=8 version=3.3.0
.model p1 pmos level=8 version=3.3.0
.tran 1n 200n
.end
`;

// ngspice-47 (Homebrew), `ngspice -b` on CHAIN with `.options acct`:
// 265 accepted / 19 rejected timepoints, 942 transient iterations.
// `meas tran when v(out)=1.65 cross=1..5`.
const NGSPICE_ACCEPTED = 265;
const NGSPICE_CROSSINGS = [9.57355e-9, 5.12024e-8, 8.95482e-8, 1.31202e-7, 1.69548e-7];
// spice-ts edges trail ngspice-47 by 0.8-1.3 ns. That is the BSIM3 transient
// model gap (#626), present before #638 with node-voltage LTE step control
// too (0.81-1.15 ns late at 1658 steps); the step control moves them < 0.2 ns.
const EDGE_GAP_BOUND = 1.5e-9;

function crossings(time: number[], values: number[], level: number): number[] {
  const out: number[] = [];
  for (let i = 1; i < time.length; i++) {
    const a = values[i - 1] - level;
    const b = values[i] - level;
    if (a === 0 || a * b < 0) out.push(time[i - 1] + (time[i] - time[i - 1]) * (a / (a - b)));
  }
  return out;
}

describe('node-voltage LTE on BSIM3-truncated nodes (#638)', () => {
  it('takes the ngspice-47 step count on a BSIM3 inverter chain without moving its edges', async () => {
    const result = await simulate(parse(CHAIN));
    const steps = result.convergence!.transient;
    expect(steps.acceptedSteps).toBeLessThanOrEqual(Math.ceil(1.25 * NGSPICE_ACCEPTED));

    const transient = result.transient!;
    const edges = crossings(transient.time, transient.voltage('out'), 1.65);
    expect(edges).toHaveLength(NGSPICE_CROSSINGS.length);
    edges.forEach((edge, index) => {
      expect(Math.abs(edge - NGSPICE_CROSSINGS[index])).toBeLessThan(EDGE_GAP_BOUND);
    });
  });
});

describe('chargeTruncatedNodes', () => {
  const device = (nodes: number[], extra: Partial<DeviceModel> = {}): DeviceModel => ({
    name: 'X', nodes, branches: [], isNonlinear: false, stamp: () => {}, ...extra,
  }) as DeviceModel;
  const covering = (nodes: number[]) => device(nodes, {
    isNonlinear: true,
    integratesTransientCharge: true,
    truncateTransientStep: () => Infinity,
    truncationCoversCharges: true,
  });

  it('exempts nodes whose only charges are truncated by covering devices', () => {
    const exempt = chargeTruncatedNodes(4, [
      covering([0, 1, -1, -1]),
      device([1, -1]), // static (e.g. a resistor or source)
    ]);
    expect([...exempt]).toEqual([1, 1, 0, 0]);
  });

  it('keeps the node LTE where an untruncated reactive element shares the node', () => {
    const capacitor = device([1, -1], { stampDynamic: () => {} });
    const exempt = chargeTruncatedNodes(2, [covering([0, 1, -1, -1]), capacitor]);
    expect([...exempt]).toEqual([1, 0]);
  });

  it('keeps the node LTE for devices whose truncation does not cover every charge', () => {
    const partial = device([0, 1], {
      isNonlinear: true, stampDynamic: () => {}, truncateTransientStep: () => Infinity,
    });
    const stateful = device([1, -1], { acceptTransientStep: () => {} });
    const exempt = chargeTruncatedNodes(2, [covering([0, 1]), partial, stateful]);
    expect([...exempt]).toEqual([0, 0]);
  });

  it('treats a device that stores no charge as static', () => {
    const diode = device([1, -1], { stampDynamic: () => {}, storesCharge: false });
    const exempt = chargeTruncatedNodes(2, [covering([1, -1]), diode]);
    expect([...exempt]).toEqual([0, 1]);
  });
});
