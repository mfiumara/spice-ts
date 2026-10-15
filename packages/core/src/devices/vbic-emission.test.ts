import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';
import { resolveVBICParams } from './vbic.js';

type Plot = { names: string[]; data: (number | [number, number])[][] };
const directory = resolve(process.cwd(), '../../benchmarks/vbic-emission');
const deck = readFileSync(resolve(directory, 'emission.cir'), 'utf8');
const reference = JSON.parse(readFileSync(resolve(directory, 'ngspice-47.json'), 'utf8')) as Record<string, Record<string, Plot>>;

// ngspice-47 -b -r <raw> <deck>, identical bytes including the temperature card.
// Corpus rule: max absolute error / reference peak, with uniform quantity floors.
describe('VBIC emission coefficients (#1156)', () => {
  for (const temperature of [0, 27, 75]) {
    it(`matches ngspice-47 OP/DC/AC at ${temperature} C`, async () => {
      const result = await simulate(deck.replace('.temp 27', `.temp ${temperature}`));
      const errors: number[] = [];
      for (const [kind, plot] of Object.entries(reference[temperature])) {
        for (let column = 1; column < plot.names.length; column++) {
          const name = plot.names[column];
          const node = name.slice(2, -1);
          const current = name.startsWith('i(');
          const expected = plot.data.map(row => row[column]);
          const peak = Math.max(current ? 1e-10 : 1e-4, ...expected.map(value =>
            typeof value === 'number' ? Math.abs(value) : Math.hypot(...value)));
          const actual = kind === 'AC Analysis'
            ? (current ? result.ac!.current(node) : result.ac!.voltage(node)).map(v => [
              v.magnitude * Math.cos(v.phase * Math.PI / 180),
              v.magnitude * Math.sin(v.phase * Math.PI / 180),
            ] as [number, number])
            : kind === 'DC transfer characteristic'
              ? Array.from(current ? result.dcSweep!.current(node) : result.dcSweep!.voltage(node))
              : [current ? result.dc!.current(node) : result.dc!.voltage(node)];
          expect(actual).toHaveLength(expected.length);
          expected.forEach((value, index) => {
            const observed = actual[index];
            const error = typeof value === 'number' && typeof observed === 'number'
              ? Math.abs(observed - value)
              : Math.hypot((observed as number[])[0] - (value as number[])[0], (observed as number[])[1] - (value as number[])[1]);
            errors.push(error / peak);
            expect(error / peak, `${kind} ${name} point ${index}`).toBeLessThan(0.01);
          });
        }
      }
      console.info(`VBIC ${temperature} C max peak-normalized error: ${Math.max(...errors)}`);
    });
  }

  for (const name of ['NF', 'NR', 'NEI', 'NEN', 'NCI', 'NCN', 'NFP', 'NCIP', 'NCNP']) {
    it(`makes non-default ${name} observable`, async () => {
      const unit = name === 'NEN' || name === 'NCN' || name === 'NCNP' ? 2 : 1;
      const [actual, defaults] = await Promise.all([
        simulate(deck), simulate(deck.replace(new RegExp(`${name}=[\\d.]+`), `${name}=${unit}`)),
      ]);
      const currents = ['vcc', 'vb', 'vcp', 'vbp', 'vsp'];
      expect(Math.max(...currents.map(source =>
        Math.abs(actual.dc!.current(source) - defaults.dc!.current(source)))))
        .toBeGreaterThan(1e-13);
    });

    it(`rejects non-positive ${name}`, () => {
      for (const value of [0, -1, Infinity, NaN]) {
        expect(() => resolveVBICParams({ [name]: value }, 1)).toThrow(`Invalid bounded VBIC DC model parameter: '${name}'`);
      }
    });
  }
});
