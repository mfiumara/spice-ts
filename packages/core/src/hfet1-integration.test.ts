import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { simulate, simulateStream } from './simulate.js';

const fixtureUrl = new URL(
  '../../../benchmarks/corpus/ngspice/fixtures/tests/hfet/inverter.cir',
  import.meta.url,
);
const fixtureSha256 = '3fa93266e9036443173bf9416eb67e8ff4c2c24aeefc6ef687f355d8548239e1';

describe('NHFET level-5 inverter', () => {
  it('simulates the unchanged ngspice fixture in batch and streaming modes', async () => {
    const input = readFileSync(fixtureUrl);
    expect(createHash('sha256').update(input).digest('hex')).toBe(fixtureSha256);

    const netlist = input.toString('utf8');
    const batch = await simulate(netlist);
    const streamed = [];
    for await (const point of simulateStream(netlist)) {
      if ('time' in point) streamed.push(point);
    }

    expect(batch.transient).toBeDefined();
    expect(batch.transient!.time.length).toBeGreaterThan(10);
    expect(streamed.map(point => point.time)).toEqual(batch.transient!.time);
    expect(streamed.map(point => point.voltages.get('3')))
      .toEqual(batch.transient!.voltage('3'));
  });
});

const hfetSubcircuit = [
  '.subckt hcell d g s',
  'z1 d g s a l=1u w=10u',
  '.ends',
].join('\n');

describe('NHFET level-5 bounded analysis contract', () => {
  it('rejects .noise because ngspice HFETA has no noise model (RD/RS stay noiseless there)', async () => {
    const netlist = [
      'hfet noise',
      'vd d 0 1',
      'vg g 0 dc 0.5 ac 1',
      'rl d o 1k',
      hfetSubcircuit,
      'x1 o g 0 hcell',
      '.model a nhfet level=5 vt0=0.3 rd=60 rs=60 js1s=1e-12 js1d=1e-12',
      '.noise v(o) vg dec 1 1k 10k',
      '.end',
    ].join('\n');

    await expect(simulate(netlist)).rejects.toMatchObject({
      name: 'InvalidCircuitError',
      message: ".noise does not support HFET noise for 'x1.z1'",
    });
  });

  it('rejects .step TEMP because the bounded HFET model is fixed at 27 C', async () => {
    const netlist = [
      'hfet temp step',
      'vd d 0 1',
      'vg g 0 -0.5',
      hfetSubcircuit,
      'x1 d g 0 hcell',
      '.model a nhfet level=5 vt0=0.3 js1s=1e-12 js1d=1e-12',
      '.step temp list 27 100',
      '.op',
      '.end',
    ].join('\n');

    await expect(simulate(netlist)).rejects.toMatchObject({
      name: 'InvalidCircuitError',
      message: "Unsupported bounded HFET step: 'TEMP'",
    });
  });
});
