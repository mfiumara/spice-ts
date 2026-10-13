import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from '../parser/index.js';
import { simulate } from '../simulate.js';
import { resolveOptions } from '../types.js';
import { solveDCSweep } from './dc-sweep.js';
import { Resistor } from '../devices/resistor.js';

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

  it('rejects repeated TEMP targets case-insensitively', () => {
    const compiled = parse('Repeated targets\nV a 0 1\nR a 0 1k\n.end').compile();
    expect(() => solveDCSweep(compiled, {
      type: 'dc', source: 'temp', start: 0, stop: 100, step: 50,
      secondary: { source: 'TeMp', start: 0, stop: 100, step: 50 },
    }, resolveOptions())).toThrow("DC sweep source 'TeMp' is repeated");
  });

  it('preserves resistor instance TEMP/DTEMP and restores circuit temperature', () => {
    const compiled = parse('Resistor temperatures\nV a 0 1\nR1 a 0 1k tc1=0.01 dtemp=10\nR2 a 0 1k tc1=0.01 temp=50\n.end').compile();
    const resistors = compiled.devices.filter(device => device instanceof Resistor);
    resistors.forEach(device => device.setTemperature(30));
    const result = solveDCSweep(compiled, {
      type: 'dc', source: 'tEmP', start: 0, stop: 100, step: 100,
    }, resolveOptions());
    expect(result.current('V')[0]).toBeCloseTo(-1 / 830 - 1 / 1230, 12);
    expect(result.current('V')[1]).toBeCloseTo(-1 / 1830 - 1 / 1230, 12);
    expect(resistors.map(device => device.getCircuitTemperature())).toEqual([30, 30]);
    expect(resistors.map(device => device.getTemperature())).toEqual([40, 50]);
  });

  it('restores all temperatures and waveforms when a temperature hook throws', () => {
    const compiled = parse('Failure restoration\nV a 0 1\nR a 0 1k\nD a 0 dm\n.model dm d\n.end').compile();
    const diode = compiled.devices.find(device => device.name === 'D')!;
    const setTemperature = diode.setTemperature!.bind(diode);
    diode.setTemperature = value => {
      setTemperature(value);
      if (value === 100) throw new Error('temperature update failed');
    };
    const before = compiled.devices.map(device => device.getTemperature?.());
    expect(() => solveDCSweep(compiled, {
      type: 'dc', source: 'V', start: 0, stop: 1, step: 1,
      secondary: { source: 'temp', start: 27, stop: 100, step: 73 },
    }, resolveOptions())).toThrow('temperature update failed');
    expect(compiled.devices.map(device => device.getTemperature?.())).toEqual(before);
  });
});
