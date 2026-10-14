import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from '../parser/index.js';
import { simulate } from '../simulate.js';
import { MNAAssembler } from '../mna/assembler.js';
import { MOS6 } from './mos6.js';
import { HFET1 } from './hfet1.js';

const fixture = (name: string): string => readFileSync(new URL(`../../../../benchmarks/results/issue-1068/${name}.cir`, import.meta.url), 'utf8');
const native = JSON.parse(readFileSync(new URL('../../../../benchmarks/results/issue-1068/remediation-before.json', import.meta.url), 'utf8')) as {
  rows: Array<{ name: string; option: string; source: string; native: number }>;
};

describe('configured junction gmin remediation (#1068)', () => {
  // Native receipts include ngspice-47 stdout and the identical input bytes.
  it.each(native.rows)('$name matches ngspice-47 at gmin=$option', async row => {
    const input = fixture(row.name).replace('.options gmin=1e-9\n', row.option === 'default' ? '' : `.options gmin=${row.option}\n`);
    const current = (await simulate(input)).dc!.current(row.source);
    expect(Math.abs(current - row.native)).toBeLessThan(1e-18 + 1e-6 * Math.abs(row.native));
  });

  it.each([-5, -0.01, 0.01])('updates both MOS6 junction branches during gmin stepping at Vbulk=%s', bulk => {
    const compiled = parse(fixture('mos6')).compile();
    const device = compiled.devices.find((d): d is MOS6 => d instanceof MOS6)!;
    const assembler = new MNAAssembler(compiled.nodeCount, compiled.branchCount);
    const [drain, , source, body] = device.nodes;
    assembler.solution[body] = bulk;
    // Both junctions share this bias, covering reverse and exponential branches.
    assembler.solution[drain] = assembler.solution[source] = 0;
    const conductances: number[] = [];
    for (const gmin of [0, 1e-9, 1e-3, 0]) {
      assembler.deviceGmin = gmin;
      assembler.clear();
      device.stamp(assembler.getStampContext());
      conductances.push(assembler.G.get(body, body));
    }
    expect(conductances[1] - conductances[0]).toBeCloseTo(2e-9, 18);
    expect(conductances[2] - conductances[0]).toBeCloseTo(2e-3, 15);
    expect(conductances[3]).toBe(conductances[0]);
  });

  it('updates both HFET1 reverse gate junctions during gmin stepping', () => {
    const compiled = parse(fixture('hfet1')).compile();
    const device = compiled.devices.find((d): d is HFET1 => d instanceof HFET1)!;
    const assembler = new MNAAssembler(compiled.nodeCount, compiled.branchCount);
    const [, gate] = device.nodes;
    assembler.solution[gate] = -1;
    const conductances: number[] = [];
    for (const gmin of [0, 1e-9, 1e-3, 0]) {
      assembler.deviceGmin = gmin;
      assembler.clear();
      device.stamp(assembler.getStampContext());
      conductances.push(assembler.G.get(gate, gate));
    }
    expect(conductances[1] - conductances[0]).toBeCloseTo(2e-9, 18);
    expect(conductances[2] - conductances[0]).toBeCloseTo(2e-3, 15);
    expect(conductances[3]).toBe(conductances[0]);
  });
});
