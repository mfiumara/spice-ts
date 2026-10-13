import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from '../parser/index.js';
import { simulate } from '../simulate.js';
import { resolveOptions } from '../types.js';
import { solveDCSweep } from './dc-sweep.js';

const root = new URL('../../../../benchmarks/dc-temp-956/', import.meta.url);
const reference = JSON.parse(readFileSync(new URL('reference.json', root), 'utf8')) as {
  values: Record<string, number[][]>;
};

describe('ngspice-47 DC TEMP (#956)', () => {
  for (const name of ['nested', 'primary']) {
    it(`matches every ${name} diode sweep point`, async () => {
      const result = await simulate(readFileSync(new URL(`${name}.cir`, root), 'utf8'));
      const sweep = result.dcSweep!;
      const rows = reference.values[name];
      expect([...sweep.sweepValues]).toEqual(rows.map(row => row[0]));
      if (name === 'nested') {
        expect([...sweep.secondarySweepValues!]).toEqual([-40, -40, -40, 60, 60, 60, 160, 160, 160]);
      }
      rows.forEach((row, i) => {
        expect(sweep.voltage('out')[i]).toBeCloseTo(row[1], 5);
        expect(sweep.current('V')[i]).toBeCloseTo(row[2], 8);
      });
    });
  }

  it('restores temperature and source waveform for later analyses', () => {
    const compiled = parse(readFileSync(new URL('nested.cir', root), 'utf8')).compile();
    const before = compiled.devices.map(device => device.getTemperature?.());
    const baseline = solveDCSweep(compiled, { type: 'dc', source: 'V', start: 0.6, stop: 0.6, step: 1 }, resolveOptions());
    solveDCSweep(compiled, compiled.analyses[0] as Parameters<typeof solveDCSweep>[1], resolveOptions());
    expect(compiled.devices.map(device => device.getTemperature?.())).toEqual(before);
    const after = solveDCSweep(compiled, { type: 'dc', source: 'V', start: 0.6, stop: 0.6, step: 1 }, resolveOptions());
    expect(after.voltage('out')[0]).toBeCloseTo(baseline.voltage('out')[0], 12);
  });

  it('rejects repeated TEMP targets case-insensitively', async () => {
    await expect(simulate('V a 0 1\nR a 0 1k\n.dc temp 0 100 50 TeMp 0 100 50\n.end')).rejects.toThrow('repeated');
  });
});
