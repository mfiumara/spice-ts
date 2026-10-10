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
