import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseTitleless as parse } from '../parser/index.js';
import { simulate } from '../simulate.js';
import { resolveLtraModel } from './ltra-model.js';

const classicFixture = readFileSync(new URL(
  '../../../../benchmarks/corpus/classic/fixtures/spice3f5/ltra_1.cir',
  import.meta.url,
));

const lineStep = `V1 source 0 PULSE(0 1 1n 100p 100p 100n 200n)
RS source input 50
O1 input 0 output 0 LMOD
RL output 0 50
.model LMOD LTRA(R=2 L=250n G=0 C=100p LEN=1 STEPLIMIT)
.tran 20p 12n 0 20p
`;

/** The classic 24-inch RLC line between a 10 ohm source and a 200 ohm || 1 pF load. */
const rlcLine = `VS 1 0 PULSE(0 4 1n 1n 1n 20n 40n)
RS 1 2 10
o2 2 0 3 0 lline
RL 3 0 200
CL 3 0 1p
.model lline ltra rel=1 r=0.2 g=0 l=9.13e-9 c=3.65e-12 len=24 steplimit compactrel=1.0e-3 compactabs=1.0e-14
.tran 0.1ns 60ns
`;

/** A lossless 16 cm LC line (the ltra_2 lless helpers' L and C) with slow edges. */
const lcLine = `VS 1 0 PULSE(0 5 1n 3n 3n 5n 30n)
RS 1 2 50
o1 2 0 3 0 lline
CL 3 0 0.1p
RL 3 0 1k
.model lline ltra nocontrol rel=10 r=0 g=0 l=8.972e-9 c=0.468e-12 len=16 steplimit quadinterp
.tran 0.2n 30n 0 0.1n
`;

/**
 * ngspice-47 references for the identical netlists above (`ngspice -b -r`,
 * linear interpolation of the raw transient at each time). The removed
 * 8-section ladder approximation missed them by up to 0.25 V (RLC) and
 * 0.07 V (LC).
 */
const RLC_REFERENCE: Array<[string, number, number]> = [
  ['2', 3e-9, 3.34251], ['2', 8e-9, 3.37122], ['2', 12e-9, 3.98509], ['2', 20e-9, 3.75076],
  ['2', 32e-9, -0.152739], ['2', 40e-9, -0.106731], ['2', 50e-9, 3.43898],
  ['3', 5e-9, 0], ['3', 8e-9, 5.08042], ['3', 12e-9, 5.07706], ['3', 16e-9, 3.23034],
  ['3', 20e-9, 3.23259], ['3', 26e-9, 3.90410], ['3', 32e-9, -1.17435], ['3', 40e-9, 0.428002],
  ['3', 50e-9, 4.91591],
];

const LC_REFERENCE: Array<[string, number, number]> = [
  ['2', 1.5e-9, 0.612242], ['2', 5e-9, 4.60677], ['2', 7e-9, 4.83477], ['2', 14e-9, -0.195454],
  ['3', 1.5e-9, 0], ['3', 5e-9, 5.68770], ['3', 7e-9, 4.47974], ['3', 14e-9, -0.269146],
  ['3', 20e-9, 0.0223430],
];

function sampleAt(time: Float64Array | number[], values: Float64Array | number[], t: number): number {
  let index = 1;
  while (index < time.length - 1 && time[index] < t) index++;
  const fraction = (t - time[index - 1]) / (time[index] - time[index - 1]);
  return values[index - 1] + fraction * (values[index] - values[index - 1]);
}

describe('ngspice LTRA lossy transmission line', () => {
  it('executes the unchanged classic 24-inch lossy-line fixture', async () => {
    expect(createHash('sha256').update(classicFixture).digest('hex'))
      .toBe('53e333e9629c3e3c4e839c4b72c9a512a220dec4baf0536e36626f290d240cd6');

    const result = await simulate(classicFixture.toString('utf8'));

    expect(result.transient?.time.length).toBeGreaterThan(1);
    expect(result.transient?.time.at(-1)).toBeCloseTo(60e-9, 15);
  }, 30_000);

  it('holds the far end at rest until the 5 ns flight time, then delivers an attenuated step', async () => {
    const result = await simulate(parse(lineStep));
    const transient = result.transient!;
    const output = transient.voltage('output');
    const beforeDelay = output.filter((_value, index) => transient.time[index] < 5.5e-9);

    // The convolution model has no precursor: nothing arrives before 1 ns + TD.
    expect(Math.max(...beforeDelay.map(Math.abs))).toBeLessThan(1e-12);
    expect(output.at(-1)).toBeGreaterThan(0.4);
    expect(output.at(-1)).toBeLessThan(0.55);
    expect(Math.max(...output)).toBeLessThan(0.7);
  });

  it.each([
    ['RLC', rlcLine, RLC_REFERENCE],
    ['LC', lcLine, LC_REFERENCE],
  ] as const)('matches ngspice-47 on a resistively terminated %s line within 5 mV', async (_case, netlist, reference) => {
    const transient = (await simulate(parse(netlist))).transient!;
    for (const [node, time, expected] of reference) {
      const actual = sampleAt(transient.time, transient.voltage(node), time);
      expect(Math.abs(actual - expected), `v(${node}) at ${time}`).toBeLessThan(5e-3);
    }
  });

  it('solves the DC operating point through the series line resistance R*LEN', async () => {
    const result = await simulate(parse(`V1 in 0 DC 1
O1 in 0 out 0 LMOD
RL out 0 100
.model LMOD LTRA(R=2 L=250n G=0 C=100p LEN=10)
.op
`));
    // R*LEN = 20 ohm in series with the 100 ohm load.
    expect(result.dc!.voltage('out')).toBeCloseTo(100 / 120, 12);
  });

  it('never steps past the line delay (STEPLIMIT, ngspice LTRAtrunc)', async () => {
    const model = resolveLtraModel({ name: 'LMOD', type: 'LTRA', params: { R: 2, L: 25e-9, C: 10e-12, LEN: 0.4, G: 0 } });
    const result = await simulate(parse(`V1 in 0 PULSE(0 1 1n 1n 1n 5n 20n)
RS in a 50
O1 a 0 b 0 LMOD
RL b 0 50
.model LMOD LTRA(R=2 L=25n G=0 C=10p LEN=0.4)
.tran 1n 20n
`));
    const time = result.transient!.time;
    const bound = Math.min(model.delay, model.maxSafeStep);
    expect(model.delay).toBeCloseTo(0.2e-9, 15);
    for (let index = 1; index < time.length; index++) {
      expect(time[index] - time[index - 1]).toBeLessThanOrEqual(bound * (1 + 1e-9));
    }
  });

  it('rejects small-signal analyses it cannot represent', async () => {
    await expect(async () => simulate(parse(`V1 in 0 AC 1
O1 in 0 out 0 LMOD
RL out 0 50
.model LMOD LTRA(R=2 L=250n G=0 C=100p LEN=1)
.ac dec 10 1meg 1g
`))).rejects.toThrow(/LTRA lossy lines support only .*'\.ac' is unsupported/);
  });
});
