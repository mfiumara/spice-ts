import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SingularMatrixError } from './errors.js';
import { simulate } from './simulate.js';

const resistorLv3Path = resolve(
  import.meta.dirname,
  '../../../benchmarks/corpus/xyce/fixtures/RESISTOR/resistor_lv3.cir',
);

describe('zero-ohm resistors', () => {
  it('matches ngspice-47 node voltages for the exact resistor_lv3.cir bytes', async () => {
    const netlist = readFileSync(resistorLv3Path, 'utf8');
    expect(createHash('sha256').update(netlist).digest('hex')).toBe(
      'ab40c80d1175ad3079155b07bfed914b7085a6d9396f16a577446deb7693eb81',
    );

    const result = await simulate(netlist);
    const sweep = result.dcSweep!;

    expect([...sweep.sweepValues]).toEqual([0, 1, 2, 3, 4, 5]);
    for (const node of ['a', 'b']) {
      [...sweep.voltage(node)].forEach((voltage, index) => {
        expect(voltage).toBeCloseTo(index, 12);
      });
    }
    [...sweep.current('R1')].forEach((current, index) => {
      expect(current).toBeCloseTo(index / 1000, 12);
    });
  });

  it('ties a node to ground and reports the ideal-short current', async () => {
    const result = await simulate(`grounded ideal short
I1 0 shorted DC 2m
Rshort shorted 0 0
.op
.end`);

    expect(result.dc!.voltage('shorted')).toBeCloseTo(0, 12);
    expect(result.dc!.current('Rshort')).toBeCloseTo(0.002, 12);
  });

  it('supports a chain of repeated ideal shorts', async () => {
    const result = await simulate(`connected ideal shorts
V1 a 0 DC 5
Rshort1 a b 0
Rshort2 b c 0
Rload c 0 1k
.op
.end`);

    expect(result.dc!.voltage('a')).toBeCloseTo(5, 12);
    expect(result.dc!.voltage('b')).toBeCloseTo(5, 12);
    expect(result.dc!.voltage('c')).toBeCloseTo(5, 12);
    expect(result.dc!.current('Rshort1')).toBeCloseTo(0.005, 12);
    expect(result.dc!.current('Rshort2')).toBeCloseTo(0.005, 12);
  });

  it('keeps matrix topology fixed when a resistor step reaches zero', async () => {
    const result = await simulate(`resistor step through zero
V1 a 0 DC 1
R1 a b 1k
Rload b 0 1k
.op
.step param R1 list 1k 0
.end`);

    expect(result.steps!.map(step => step.dc!.voltage('b'))).toEqual([
      expect.closeTo(0.5, 12),
      expect.closeTo(1, 12),
    ]);
    expect(result.steps![1].dc!.current('R1')).toBeCloseTo(0.001, 12);
  });

  it('keeps parallel ideal shorts singular when their individual currents are indeterminate', async () => {
    await expect(simulate(`indeterminate parallel ideal shorts
V1 a 0 DC 5
Rshort1 a b 0
Rshort2 a b 0
Rload b 0 1k
.op
.end`)).rejects.toBeInstanceOf(SingularMatrixError);
  });
});
