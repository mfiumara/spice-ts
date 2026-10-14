// SPDX-License-Identifier: MIT
// Evidence-only #1079: self-written reduction, not a change to MOS3/MOS9 or BSIM3.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from '../parser/index.js';
import { MNAAssembler } from '../mna/assembler.js';
import { BSIM3v3 } from './bsim3v3.js';
import { MOS3 } from './mos3.js';

const root = new URL('../../../../benchmarks/bsim3-opamp-1079/', import.meta.url);
const minimal = readFileSync(new URL('minimal.cir', root), 'utf8');
interface Phasor { magnitude: number; phase: number }
const receipt = JSON.parse(readFileSync(new URL('ts-op.json', root), 'utf8')) as {
  bsim3Count: number;
  devices: { level: number }[];
  nativeAc: { real: number; imaginary: number }[];
  originalAc: Phasor[];
  frozenAc: Phasor[];
  bias2OnlyAc: Phasor[];
  bias2OnlyError: number;
  originalError: number;
  frozenError: number;
  reduction: Record<string, number>;
};

function reduction() {
  const compiled = parse(minimal).compile();
  const device = compiled.devices.find((d): d is MOS3 => d instanceof MOS3);
  if (!device) throw new Error('missing MOS9 reduction');
  const reference = receipt.reduction;
  const assembler = new MNAAssembler(compiled.nodeCount, compiled.branchCount);
  const [d, g, s] = device.nodes;
  assembler.solution[d] = 5 - reference.vds;
  assembler.solution[g] = 5 - reference.vgs;
  assembler.solution[s] = 5;
  return { device, assembler, reference };
}

describe('#1079 MOS9 saturation-edge diagnosis (no production fix)', () => {
  it('LEVEL=9 remains MOS9 even when VERSION=3.2.2 is supplied', () => {
    const { device } = reduction();
    expect(device.model.level).toBe(9);
    expect(parse(minimal).compile().devices.some(d => d instanceof BSIM3v3)).toBe(false);
  });

  it('LEVEL=49 VERSION=3.2.2 selects BSIM3 instead (routing negative control)', () => {
    const devices = parse(minimal.replace('level=9', 'level=49')).compile().devices;
    expect(devices.some(d => d instanceof BSIM3v3)).toBe(true);
    expect(devices.some(d => d instanceof MOS3)).toBe(false);
  });

  it('the self-written fixed-bias reduction matches ngspice-47 gm/gds/gmb', () => {
    const { device, reference } = reduction();
    const channel = device.evaluateChannel(reference.vgs, reference.vds, reference.vbs);
    expect(Math.abs(channel.gm - reference.gm)).toBeLessThan(1e-18);
    expect(Math.abs(channel.gds - reference.gds)).toBeLessThan(1e-24);
    expect(channel.gmbs).toBe(reference.gmb);
    // With the default zero VTO/GAMMA/ETA/VMAX/NSUB, mos9load.c:711-721
    // reduces to gds = KP * W/L * (Vgs - Vds), just below saturation.
    const beta = device.model.KP * 2;
    expect(Math.abs(channel.gds - beta * (reference.vgs - reference.vds))).toBeLessThan(1e-24);
    expect(device.evaluateChannel(reference.vgs, reference.vgs, 0).gds).toBe(0);
  });

  it('the reduction matches the native gate capacitance stamps at the same bias', () => {
    const { device, assembler, reference } = reduction();
    device.stamp(assembler.getStampContext());
    device.stampDynamic(assembler.getStampContext());
    const [d, g, s] = device.nodes;
    expect(Math.abs(-assembler.C.get(g, d) - reference.cgd)).toBeLessThan(1e-30);
    expect(Math.abs(-assembler.C.get(g, s) - reference.cgs)).toBeLessThan(1e-30);
    expect(Math.abs(assembler.C.get(g, g) - reference.cgs - reference.cgd)).toBeLessThan(1e-30);
  });

  it('keeps the public-deck loss and identifies the same-bias small-signal control', () => {
    expect(receipt.bsim3Count).toBe(0);
    expect(receipt.devices).toHaveLength(8);
    expect(receipt.devices.every(d => d.level === 9)).toBe(true);
    expect(receipt.nativeAc).toHaveLength(61);
    expect(receipt.originalAc).toHaveLength(61);
    expect(receipt.frozenAc).toHaveLength(61);
    expect(receipt.originalError).toBeGreaterThan(0.01);
    expect(receipt.frozenError).toBeLessThan(1e-6);
    expect(receipt.bias2OnlyError).toBeLessThan(1e-6);
    const normalized = (actual: Phasor[]) => Math.max(...actual.map((p, i) => Math.hypot(
      p.magnitude * Math.cos(p.phase * Math.PI / 180) - receipt.nativeAc[i].real,
      p.magnitude * Math.sin(p.phase * Math.PI / 180) - receipt.nativeAc[i].imaginary,
    ))) / Math.max(...receipt.nativeAc.map(p => Math.hypot(p.real, p.imaginary)));
    expect(normalized(receipt.originalAc)).toBe(receipt.originalError);
    expect(normalized(receipt.frozenAc)).toBe(receipt.frozenError);
    expect(normalized(receipt.bias2OnlyAc)).toBe(receipt.bias2OnlyError);
  });
});
