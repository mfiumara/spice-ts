import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';

// ngspice-47: HERTZ is reserved even with .param hertz=42; it is 0 in OP/DC/TRAN.
describe('hertz expression variable', () => {
  it.each(['', '.param hertz=42'])('refreshes resistor conductance at every AC point (%s)', async param => {
    const result = await simulate(`hertz test
${param}
V1 n 0 AC 1
R1 n 0 {hertz}
.ac dec 1 1 1k
.end`);
    const ac = result.ac!;
    expect(ac.frequencies).toHaveLength(4);
    ac.frequencies.forEach((frequency, i) => {
      expect(ac.current('V1')[i].magnitude).toBeCloseTo(1 / frequency, 9);
    });
  });

  it.each(['{1+HeRtZ}', "'1+hertz'", 'r={1+hertz}'])('preserves expressions and parameters (%s)', async value => {
    const result = await simulate(`hertz test
.param hertz=42 gain=2
V1 n 0 AC 1
R1 n 0 ${value.replace(/1\+/g, 'gain+')}
.ac lin 3 1 3
.end`);
    result.ac!.frequencies.forEach((frequency, i) => {
      expect(result.ac!.current('V1')[i].magnitude).toBeCloseTo(1 / (2 + frequency), 9);
    });
  });

  it('uses zero outside AC, without leaking the last frequency into later analyses', async () => {
    const result = await simulate(`hertz test
.param hertz=42
V1 n 0 DC 1 AC 1
R1 n 0 {1+hertz}
.op
.ac lin 3 1 3
.tran 1u 2u
.end`);
    expect(result.dc!.current('V1')).toBeCloseTo(-1, 9);
    for (const current of result.transient!.current('V1')) expect(current).toBeCloseTo(-1, 9);
  });

  it('refreshes the voltage-dependent AC derivative of a B expression', async () => {
    const result = await simulate(`hertz test
V1 n 0 AC 1
B1 n 0 i={v(n)*hertz}
.ac lin 3 1 3
.end`);
    result.ac!.frequencies.forEach((frequency, i) => {
      expect(result.ac!.current('V1')[i].magnitude).toBeCloseTo(frequency, 9);
    });
  });

  it('uses zero during DC sweeps', async () => {
    const result = await simulate(`hertz DC
.param hertz=42
V1 n 0 1
R1 n 0 {1+hertz}
.dc V1 1 2 1
.end`);
    expect(result.dcSweep!.current('V1')[0]).toBeCloseTo(-1, 9);
    expect(result.dcSweep!.current('V1')[1]).toBeCloseTo(-2, 9);
  });

  it('stamps frequency-dependent voltage-source constraints', async () => {
    const result = await simulate(`hertz voltage derivative
V1 in 0 AC 1
B1 out 0 v={v(in)*hertz}
R1 out 0 1k
.ac lin 3 1 3
.end`);
    result.ac!.frequencies.forEach((frequency, i) => {
      expect(result.ac!.voltage('out')[i].magnitude).toBeCloseTo(frequency, 9);
    });
  });
});
