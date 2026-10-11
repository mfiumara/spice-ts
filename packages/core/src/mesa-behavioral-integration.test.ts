import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { simulate, simulateStream } from './simulate.js';

const fixtureUrl = new URL(
  '../../../benchmarks/corpus/ngspice/fixtures/tests/mesa/mesosc.cir',
  import.meta.url,
);
const fixtureSha256 = '3cd4609cca7874775b7b2cac8cd0124bd2b8c5512064a0550a29de2da4896bcf';

const driverModel = [
  '.model driver nmf level=2 n=1.44 rd=20 rs=20 vs=1.9e5',
  '+ mu=0.25 d=1e-7 vto=0.15 m=2 lambda=0.15 sigma0=0.02',
  '+ vsigmat=0.5',
].join('\n');

const mesinv = [
  '.subckt mesinv 10 20 3',
  'rdl 10 1 20',
  'bl1 1 2 i=0.00025*tanh(v(1,2)/0.00025/2240)*(1+v(1,2)*0.027)',
  'rsl 2 3 20',
  'zd 3 20 0 driver l=0.7u w=20u',
  'ci 3 0 20f',
  '.ends mesinv',
].join('\n');

function inverterOp(vin: number): string {
  return [
    'mesinv operating point',
    mesinv,
    driverModel,
    'vdd 1 0 dc 1.6',
    `vin 2 0 dc ${vin}`,
    'x1 1 2 3 mesinv',
    '.op',
    '.end',
  ].join('\n');
}

function expectRelative(actual: number, expected: number, relative: number): void {
  expect(Math.abs(actual - expected), `${actual} vs ${expected}`)
    .toBeLessThanOrEqual(Math.abs(expected) * relative);
}

describe('B-source load and NMF level-2 MESFET (issue #340)', () => {
  // ngspice-47 `op` of the fixture's mesinv stage; reproduce with
  // benchmarks/results/issue-340/ngspice-inverter-op.cir.
  it.each([
    [0, 1.598321, -7.36507e-07, 1.070362e-08],
    [0.2, 1.535318, -2.82981e-05, -1.54602e-08],
    [0.3, 1.354463, -1.02234e-04, -2.99303e-07],
    [0.4, 0.8730338, -2.18446e-04, -4.15483e-06],
    [0.6, 0.1206234, -2.57194e-04, -6.60037e-04],
  ])('matches the ngspice-47 inverter operating point at vin=%d', async (vin, v3, iVdd, iVin) => {
    const result = await simulate(inverterOp(vin));
    expectRelative(result.dc!.voltage('3'), v3, 1e-5);
    expectRelative(result.dc!.current('vdd'), iVdd, 1e-5);
    expectRelative(result.dc!.current('vin'), iVin, 1e-5);
  });

  it('accepts top-level B and Z cards with the same semantics as inside a subcircuit', async () => {
    const netlist = [
      'top-level mesinv',
      driverModel,
      'vdd 10 0 dc 1.6',
      'vin 20 0 dc 0.4',
      'rdl 10 1 20',
      'bl1 1 2 i=0.00025*tanh(v(1,2)/0.00025/2240)*(1+v(1,2)*0.027)',
      'rsl 2 3 20',
      'zd 3 20 0 driver l=0.7u w=20u',
      '.op',
      '.end',
    ].join('\n');
    const result = await simulate(netlist);
    expectRelative(result.dc!.voltage('3'), 0.8730338, 1e-5);
  });

  it('simulates the unchanged ngspice mesa-oscillator fixture identically in batch and streaming modes', async () => {
    const input = readFileSync(fixtureUrl);
    expect(createHash('sha256').update(input).digest('hex')).toBe(fixtureSha256);

    const netlist = input.toString('utf8');
    const batch = await simulate(netlist);
    const streamed = [];
    for await (const point of simulateStream(netlist)) {
      if ('time' in point) streamed.push(point);
    }

    const transient = batch.transient!;
    expect(transient.time.length).toBeGreaterThan(100);
    expect(transient.time.at(-1)).toBeCloseTo(5e-9, 15);
    expect(streamed.map(point => point.time)).toEqual(transient.time);
    expect(streamed.map(point => point.voltages.get('8'))).toEqual(transient.voltage('8'));
    // The ring oscillates between the inverter rails instead of settling.
    const v8 = transient.voltage('8');
    expect(Math.max(...v8) - Math.min(...v8)).toBeGreaterThan(0.4);
  }, 180_000);

  it.each([
    ['.ac dec 1 1k 10k', 'vin 2 0 dc 0.4 ac 1'],
    ['.noise v(3) vin dec 1 1k 10k', 'vin 2 0 dc 0.4 ac 1'],
    ['.tf v(3) vin', 'vin 2 0 dc 0.4'],
  ])('rejects %s for NMF devices outside the bounded OP/DC/TRAN contract', async (analysis, source) => {
    const netlist = [
      'nmf small-signal',
      mesinv,
      driverModel,
      'vdd 1 0 dc 1.6',
      source,
      'x1 1 2 3 mesinv',
      analysis,
      '.end',
    ].join('\n');
    await expect(simulate(netlist)).rejects.toMatchObject({
      name: 'InvalidCircuitError',
      message: expect.stringContaining('NMF level-2 MESFET'),
    });
  });
});
