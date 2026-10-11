import { describe, expect, it } from 'vitest';
import { InvalidCircuitError, ParseError } from '../errors.js';
import { simulate } from '../simulate.js';

/**
 * RF port sources and `.sp` (#499). Reference values are ngspice-47 raw-file
 * vectors for the identical netlists (benchmarks/rf-port-sp/*.cir).
 */

type Complex = { real: number; imaginary: number };

function expectComplex(actual: Complex, [real, imaginary]: [number, number], scale: number): void {
  const tolerance = 1e-9 * scale;
  expect(Math.abs(actual.real - real)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actual.imaginary - imaginary)).toBeLessThanOrEqual(tolerance);
}

const TWO_PORT = `port sp test
V1 in 0 dc 0 ac 1 portnum 1 z0 100
Rpt in x 100
C1 x 0 1e-9
R2 x out 10
V2 out 0 dc 0 ac 0 portnum 2 z0 50
.sp lin 3 1e8 1e9 1
.end
`;

describe('RF port voltage sources', () => {
  it('puts z0 in series with the source in the operating point (ngspice v1#res node)', async () => {
    const result = await simulate(`port op
V1 in 0 dc 1 ac 1 portnum 1 z0 50
R1 in 0 50
.op
.end
`);
    expect(result.dc!.voltage('in')).toBeCloseTo(0.5, 12);
    expect(result.dc!.voltage('V1.res')).toBeCloseTo(1, 12);
    expect(result.dc!.current('V1')).toBeCloseTo(-0.01, 12);
  });

  it('drives sqrt(4*pwr*z0)*cos(2*pi*freq*t) in transient when pwr/freq are given', async () => {
    const result = await simulate(`port tran
V1 in 0 portnum 1 z0 50 pwr 0.001 freq 1e6
R1 in 0 50
.tran 1e-7 1e-6
.end
`);
    const { time } = result.transient!;
    const vin = result.transient!.voltage('in');
    // ngspice-47: v(in) = 0.2236067977499790 at t = 0.
    expect(vin[0]).toBeCloseTo(0.223606797749979, 12);
    time.forEach((t, index) => {
      expect(vin[index]).toBeCloseTo(0.5 * Math.sqrt(0.2) * Math.cos(2 * Math.PI * 1e6 * t), 9);
    });
  });

  it('rejects a port with a duplicate or missing port number like ngspice vsrctemp.c', async () => {
    await expect(simulate(`dup
V1 a 0 ac 1 portnum 1
V2 b 0 portnum 1
R1 a b 50
.op
`)).rejects.toThrow(InvalidCircuitError);
    await expect(simulate(`gap
V1 a 0 ac 1 portnum 1
V2 b 0 portnum 3
R1 a b 50
.op
`)).rejects.toThrow(/port numbers/);
  });

  it('rejects pwr/freq combined with a transient waveform instead of guessing precedence', async () => {
    await expect(simulate(`mix
V1 a 0 SIN(0 1 1k) portnum 1 pwr 0.001
R1 a 0 50
.op
`)).rejects.toThrow(ParseError);
  });
});

describe('.sp S-parameter analysis', () => {
  it('matches ngspice-47 S, Y, Z, Cy and two-port noise vectors', async () => {
    const result = await simulate(TWO_PORT);
    const sp = result.sParameters!;
    expect(sp.frequencies).toEqual([1e8, 5.5e8, 1e9]);
    expect(sp.ports).toEqual(['V1', 'V2']);

    expectComplex(sp.vector('S_1_1')[0], [0.0002740856192527154, -0.007948295703682301], 1);
    expectComplex(sp.vector('S_2_1')[0], [0.0006460259999976791, -0.01873431263649885], 1);
    expectComplex(sp.vector('S_1_2')[2], [6.467865092367763e-06, -0.001875636688485455], 1);
    expectComplex(sp.vector('S_2_2')[2], [-0.6666514217624446, -0.004420918071567819], 1);
    expectComplex(sp.vector('Y_1_2')[0], [-0.0002703472056092442, 0.001544219627382783], 1e-2);
    expectComplex(sp.vector('Z_2_2')[2], [10, -0.1591549430918954], 10);
    expectComplex(sp.vector('Cy_1_1')[0], [1.653125319953458e-22, 0], 1e-22);
    expectComplex(sp.vector('Cy_1_2')[0], [-4.481293158542328e-24, 0], 1e-22);
    expectComplex(sp.vector('Cy_2_2')[2], [1.657144890302314e-21, 0], 1e-21);
    expectComplex(sp.vector('NF')[0], [31.98996886770953, 0], 10);
    expectComplex(sp.vector('SOpt')[0], [0.0006956583015496352, 0.007947181852933949], 1);
    expectComplex(sp.vector('NFmin')[2], [51.98425228395816, 0], 10);
    expectComplex(sp.vector('Rn')[2], [3947951.760435746, 0], 1e6);
  });

  it('computes the full noise correlation matrix for three ports', async () => {
    const result = await simulate(`three port sp noise
V1 in 0 dc 0 ac 1 portnum 1 z0 100
Rpt in x 100
C1 x 0 1e-9
R2 x out 10
V2 out 0 dc 0 ac 0 portnum 2 z0 50
V3 x 0 portnum 3 z0 200
.sp lin 3 1e8 1e9 1
.end
`);
    const sp = result.sParameters!;
    expectComplex(sp.vector('S_3_1')[1], [1.578856862166006e-05, -0.002046051611690854], 1);
    expectComplex(sp.vector('Z_3_3')[1], [0, -0.289372623803446], 1);
    expectComplex(sp.vector('Cy_3_3')[1], [1.823367274423209e-21, 0], 1e-21);
    expectComplex(sp.vector('Cy_1_3')[1], [-1.657606613112007e-22, 0], 1e-21);
    expect(sp.vectors.has('NF')).toBe(false);
  });

  it('steps DEC sweeps by 10^(1/N) like ngspice span.c and omits noise vectors when donoise is 0', async () => {
    const result = await simulate(`lc dec sp
V1 in 0 dc 0 ac 1 portnum 1 z0 50
C1 in 0 318.3n
L1 in out 1.592m
C2 out 0 318.3n
V2 out 0 dc 0 ac 0 portnum 2 z0 50
.sp dec 2 1 1e4 0
.end
`);
    const sp = result.sParameters!;
    expect(sp.frequencies).toHaveLength(9);
    expect(sp.frequencies[8]).toBeCloseTo(1e4, 6);
    expectComplex(sp.vector('S_2_1')[6], [0.9799939163423277, -0.1990247714694791], 1);
    expectComplex(sp.vector('S_1_1')[6], [0.0002053212970864794, 0.001010997880086191], 1);
    expect(sp.vectors.has('Cy_1_1')).toBe(false);
  });

  it('requires at least two RF ports like ngspice', async () => {
    await expect(simulate(`one port
V1 a 0 ac 1 portnum 1
R1 a 0 50
.sp lin 2 1 2
`)).rejects.toThrow(InvalidCircuitError);
  });

  it('rejects donoise for devices whose S-parameter noise is not implemented', async () => {
    await expect(simulate(`diode noise
V1 a 0 ac 1 portnum 1
D1 a b DMOD
V2 b 0 portnum 2
.model DMOD D
.sp lin 2 1e6 1e7 1
`)).rejects.toThrow(/D1/);
  });
});
