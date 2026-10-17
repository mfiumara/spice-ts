import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { InvalidCircuitError } from '../errors.js';
import { parse } from '../parser/index.js';
import { simulate } from '../simulate.js';
import type { StampContext } from './device.js';
import { VBIC, resolveVBICParams } from './vbic.js';

describe('VBIC open parasitic base resistor RBP=0 (#1302)', () => {
  it('compiles a minimal RBP=0 card without collapsing the BP node', () => {
    const circuit = parse('RBP zero\nQ1 c b 0 qv\n.model qv NPN(LEVEL=4 RBP=0)\n.op\n.end').compile();
    const device = circuit.devices.find(d => d instanceof VBIC)!;
    expect(device).toBeInstanceOf(VBIC);
    expect(device.nodes).toHaveLength(7);
    expect(device.nodes[5]).toBeGreaterThanOrEqual(0);
    expect(device.nodes[5]).not.toBe(device.nodes[0]);
    expect(device.nodes[5]).not.toBe(device.nodes[2]);
    expect(resolveVBICParams({ RBP: 0 }, 1).RBP).toBe(0);
  });

  it.each([-1, -1e-30, NaN, Infinity, -Infinity])('rejects invalid RBP=%s with the same structured error', RBP => {
    expect(() => resolveVBICParams({ RBP }, 1)).toThrow(InvalidCircuitError);
    expect(() => resolveVBICParams({ RBP }, 1)).toThrow("Invalid bounded VBIC DC model parameter: 'RBP'");
  });

  for (const polarity of [1, -1]) for (const temperature of [0, 27, 75]) {
    it(`has exactly zero RBP current and all derivatives, polarity=${polarity}, temperature=${temperature}`, () => {
      // Disable other BP branches, but keep bias-dependent qbp via ISP/IKP.
      const device = new VBIC('Q', [0, 1, 2, 3, 4, 5, 6], { RBP: 0, ISP: 1e-16, IKP: 1e-5 }, polarity, 3);
      device.setTemperature(temperature);
      const v = [0.1, 0.1, 0.65, 0.6, 0, -0.1, -0.2].map(x => polarity * x);
      const g = Array.from({ length: 7 }, () => new Float64Array(7));
      const rhs = new Float64Array(7);
      const ctx: StampContext = {
        stampG: (r, c, x) => { g[r][c] += x; }, stampB: (r, x) => { rhs[r] += x; },
        stampC: () => {}, getVoltage: n => v[n], getCurrent: () => 0,
        time: 0, dt: 1, numNodes: 7, sourceScale: 1, useDcSourceValue: false, gmin: 0,
      };
      for (let i = 0; i < 12; i++) {
        g.forEach(row => row.fill(0)); rhs.fill(0); device.stamp(ctx);
      }
      // The BP residual is solely Irbp, so this proves its full Jacobian and current.
      expect([...g[5]]).toEqual(Array(7).fill(0));
      expect(rhs[5]).toBe(0);
      expect(device.noiseOperatingPoint(Float64Array.from(v), 0)[2].conductance).toBe(0);
    });
  }

  it('matches ngspice-47 DC and transient using identical netlist bytes', async () => {
    type Plot = { grid: number[]; signals: Record<string, { re: number; im: number }[]> };
    const reference = JSON.parse(readFileSync('../../benchmarks/vbic-rbp/ngspice-47.json', 'utf8')) as {
      sha256: string; dc: Plot; transient: Plot;
    };
    const deck = readFileSync('../../benchmarks/vbic-rbp/rbp.cir', 'utf8');
    expect(createHash('sha256').update(deck).digest('hex')).toBe(reference.sha256);
    const result = await simulate(deck);
    const tran = result.transient!;
    expect(tran.time[0]).toBeLessThanOrEqual(reference.transient.grid[0]);
    expect(tran.time.at(-1)).toBeGreaterThanOrEqual(reference.transient.grid.at(-1)!);
    for (const node of ['c', 'b']) {
      const expectedDc = reference.dc.signals[`v(${node})`].map(x => x.re);
      const actualDc = result.dcSweep!.voltage(node);
      expect(actualDc).toHaveLength(expectedDc.length);
      const dcError = Math.max(...expectedDc.map((x, i) => Math.abs(actualDc[i] - x)));
      const expectedTran = reference.transient.signals[`v(${node})`].map(x => x.re);
      const values = tran.voltage(node);
      let upper = 0;
      const tranError = Math.max(...reference.transient.grid.map((time, i) => {
        while (tran.time[upper] < time) upper++;
        const lower = Math.max(0, upper - 1);
        const weight = upper === lower ? 0 : (time - tran.time[lower]) / (tran.time[upper] - tran.time[lower]);
        return Math.abs(values[lower] + weight * (values[upper] - values[lower]) - expectedTran[i]);
      }));
      const dcNormalized = dcError / Math.max(...expectedDc.map(Math.abs));
      const tranNormalized = tranError / Math.max(...expectedTran.map(Math.abs));
      console.info(`RBP ${node}: DC max absolute ${dcError} V, peak-normalized ${dcNormalized}; TRAN max absolute ${tranError} V, peak-normalized ${tranNormalized}`);
      expect(dcNormalized).toBeLessThan(0.001);
      expect(tranNormalized).toBeLessThan(0.001);
    }
  });
});
