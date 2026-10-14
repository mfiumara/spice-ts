import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { solveDCOperatingPoint } from '../analysis/dc.js';
import { UnsupportedTemperatureError } from '../errors.js';
import { parse } from '../parser/index.js';
import { simulate } from '../simulate.js';
import { resolveOptions } from '../types.js';
import { MOS2 } from './mos2.js';

interface TemperatureReference {
  id: string;
  deck: string;
  op: number[];
  tran: number[][];
}
const { references } = JSON.parse(readFileSync(new URL(
  '../../../../benchmarks/results/issue-995/reference.json', import.meta.url,
), 'utf8')) as { references: TemperatureReference[] };

function interpolate(time: ArrayLike<number>, values: ArrayLike<number>, at: number): number {
  let index = 1;
  while (index < time.length - 1 && time[index] < at) index++;
  const fraction = (at - time[index - 1]) / (time[index] - time[index - 1]);
  return values[index - 1] + fraction * (values[index] - values[index - 1]);
}

describe('MOS2 .options TEMP ngspice-47 parity (#995)', () => {
  for (const level of [3, 6]) {
    it(`does not admit unvalidated MOS level ${level}`, async () => {
      await expect(simulate(references[0].deck.replace('LEVEL=2', `LEVEL=${level}`)
        .replace('TEMP=27', 'TEMP=125'))).rejects.toBeInstanceOf(UnsupportedTemperatureError);
    });
  }
  for (const reference of references) {
    it(`${reference.id} device temperature law independently of the circuit guard`, () => {
      const temperature = Number(/TEMP=(\d+)/.exec(reference.deck)![1]);
      const compiled = parse(reference.deck.replace(/TEMP=\d+/, 'TEMP=27')).compile();
      for (const device of compiled.devices) {
        if (device instanceof MOS2) device.setTemperature(temperature);
      }
      const { result: op } = solveDCOperatingPoint(compiled, resolveOptions(compiled.simulationOptions));
      [op.voltage('d'), op.voltage('s'), op.current('VD')].forEach((value, index) => {
        expect(Math.abs(value - reference.op[index]), `device law OP signal ${index}`)
          .toBeLessThan(1e-12 + 1e-7 * Math.abs(reference.op[index]));
      });
    });
    it(`${reference.id} OP and short transient with model TNOM=50`, async () => {
      const result = await simulate(reference.deck);
      const op = result.dc!;
      [op.voltage('d'), op.voltage('s'), op.current('VD')].forEach((value, index) => {
        expect(Math.abs(value - reference.op[index]), `OP signal ${index}`)
          .toBeLessThan(1e-12 + 1e-7 * Math.abs(reference.op[index]));
      });
      const tran = result.transient!;
      const signals = [tran.voltage('d'), tran.voltage('s'), tran.current('VD')];
      for (const [time, ...values] of reference.tran) {
        signals.forEach((signal, index) => {
          // Same smooth sinusoid and 0.1 ns max step. Allow interpolation and
          // different accepted adaptive grids, not a per-deck tolerance.
          expect(Math.abs(interpolate(tran.time, signal, time) - values[index]), `TRAN ${time} signal ${index}`)
            .toBeLessThan(1e-12 + 1e-4 * Math.abs(values[index]));
        });
      }
    });
  }
});
