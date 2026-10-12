import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';
import { parse } from '../parser/index.js';
import { ParseError } from '../errors.js';

// Issue #690: ngspice-47 isrcload.c/isrcacld.c multiply an independent current
// source by its `m` instance parameter (ISRCmValue, default 1) in the DC,
// transient and AC loads. cktdisto.c reads ISRCdF1mag/ISRCdF2mag without m, so
// DISTOF terms are not scaled. ngspice reads `m=2`, `m 2` and `M = 2`; the last
// one wins. vsrc has no `m`: ngspice-47 stops with "unknown parameter (m)".

function interpolate(times: number[], values: number[], at: number): number {
  const index = times.findIndex(time => time >= at);
  if (index <= 0) return values[Math.max(index, 0)];
  const fraction = (at - times[index - 1]) / (times[index] - times[index - 1]);
  return values[index - 1] + fraction * (values[index] - values[index - 1]);
}

async function opVoltage(lines: string[], node: string): Promise<number> {
  const result = await simulate(lines.join('\n'));
  return result.dc!.voltage(node);
}

const ISSUE_DECK = ['mtest', 'V1 1 0 DC 3', 'R1 1 3 1k', 'R2 3 0 2k', 'I2 0 3 DC 1m m=2', '.op', '.end'];

describe('current source m= multiplier (#690)', () => {
  it('scales the DC value by m on the issue deck', async () => {
    // ngspice-47 -b: v(3) = 3.333333e+00 (m=1 would give 2.666667).
    expect(await opVoltage(ISSUE_DECK, '3')).toBeCloseTo(3.333333, 6);
  });

  it.each([
    // ngspice-47 -b on the issue deck with only the I2 card changed.
    ['I2 0 3 DC 1m m 2', 3.333333],
    ['I2 0 3 1m M = 2', 3.333333],
    ['I2 0 3 m=2 DC 1m', 3.333333],
    ['I2 0 3 DC 1m m=2 m=3', 4],
    ['I2 0 3 DC 1m m=0', 2],
    ['I2 0 3 DC 1m m=-1', 1.333333],
    ['I2 0 3 DC 1m m={2*1.5}', 4],
  ])('reads %s like ngspice-47', async (card, expected) => {
    const deck = ISSUE_DECK.map(line => (line.startsWith('I2 ') ? card : line));
    expect(await opVoltage(deck, '3')).toBeCloseTo(expected, 6);
  });

  it('scales a source inside a subcircuit', async () => {
    // ngspice-47 -b: v(n) = 4.000000e+00.
    const deck = ['subtest', '.subckt isrc a', 'I1 0 a DC 1m m=4', '.ends', 'X1 n isrc', 'R1 n 0 1k', '.op', '.end'];
    expect(await opVoltage(deck, 'n')).toBeCloseTo(4, 9);
  });

  it('keeps m while .dc sweeps the source value', async () => {
    // ngspice-47 -b `dc I1 0 2m 1m`: v(1) = 0, 2, 4.
    const result = await simulate(['swtest', 'R1 1 0 1k', 'I1 0 1 DC 0 m=2', '.dc I1 0 2m 1m', '.end'].join('\n'));
    const v1 = result.dcSweep!.voltage('1');
    expect(v1[0]).toBeCloseTo(0, 9);
    expect(v1[1]).toBeCloseTo(2, 9);
    expect(v1[2]).toBeCloseTo(4, 9);
  });

  it('scales a transient PULSE source', async () => {
    // ngspice-47 -b, `tran 10n 3u` + meas find v(1) at=...:
    // v05 = 1.17948e+00, v1us = 1.89581e+00, v2us(2.5u) = 1.60352e+00.
    const result = await simulate([
      'trantest',
      'R1 1 0 1k',
      'C1 1 0 1n',
      'I1 0 1 PULSE(0 1m 0 1n 1n 1u 2u) m=3',
      '.tran 10n 3u',
      '.end',
    ].join('\n'));
    const transient = result.transient!;
    const v1 = transient.voltage('1');
    const ngspice: Array<[number, number]> = [[0.5e-6, 1.17948], [1e-6, 1.89581], [2.5e-6, 1.60352]];
    for (const [time, expected] of ngspice) {
      expect(Math.abs(interpolate(transient.time, v1, time) - expected) / expected).toBeLessThan(2e-3);
    }
  });

  it('scales the AC magnitude', async () => {
    // ngspice-47 -b `ac lin 3 100 1k`, print vm(1) vp(1):
    // 100 Hz 2.116833e+00 -3.73833e-02; 550 Hz 6.949213e-01 -7.65519e-01;
    // 1 kHz 3.929418e-01 -8.89366e-01.
    const result = await simulate([
      'actest',
      'R1 1 0 1k',
      'C1 1 0 1u',
      'I1 0 1 DC 0 AC 1m 30 m=2.5',
      '.ac lin 3 100 1k',
      '.end',
    ].join('\n'));
    const v1 = result.ac!.voltage('1');
    const ngspice = [[2.116833, -3.73833e-2], [6.949213e-1, -7.65519e-1], [3.929418e-1, -8.89366e-1]];
    ngspice.forEach(([magnitude, phaseRad], index) => {
      expect(v1[index].magnitude).toBeCloseTo(magnitude, 6);
      expect(v1[index].phase * Math.PI / 180).toBeCloseTo(phaseRad, 5);
    });
  });

  it('reads @i2[m] and lets alter change m like ngspice-47', async () => {
    // ngspice-47 -b: @i2[m] = 2, v(3) = 3.333333; after `alter I2 m=3`:
    // @i2[m] = 3, v(3) = 4.
    const deck = ISSUE_DECK.filter(line => line !== '.op' && line !== '.end');
    const circuit = parse([...deck, '.op', '.end'].join('\n'));
    expect(circuit.parameterVector('I2', 'm')).toEqual([2]);
    expect(circuit.alterInstance('I2', 'm', [3])).toBeUndefined();
    expect(circuit.parameterVector('I2', 'm')).toEqual([3]);
    // ngspice-47 isrcload.c ISRCcurrent = m * value: @i2[current] = 2e-3, then 3e-3.
    const result = await simulate([
      ...deck, '.control', 'op', 'let c1 = @i2[current]', 'echo c1 $&c1',
      'alter I2 m=3', 'op', 'let c2 = @i2[current]', 'echo c2 $&c2', '.endc', '.end',
    ].join('\n'));
    const [first, second] = result.control!.runs.map(run => run.result.dc!);
    expect(first.voltage('3')).toBeCloseTo(3.333333, 6);
    expect(second.voltage('3')).toBeCloseTo(4, 9);
    const echoed = (name: string) => Number(result.control!.output.find(line => line.startsWith(`${name} `))!.split(' ')[1]);
    expect(echoed('c1')).toBeCloseTo(2e-3, 12);
    expect(echoed('c2')).toBeCloseTo(3e-3, 12);
  });

  it('keeps m when the circuit is written back with toNetlist()', async () => {
    const netlist = parse(ISSUE_DECK.join('\n')).toNetlist();
    expect(netlist).toMatch(/^I2 0 3 .*m=2$/m);
    const source = parse(ISSUE_DECK.join('\n')).toIR().components.find(component => component.name === 'I2');
    expect(source?.params.m).toBe(2);
    expect(await opVoltage(['roundtrip', ...netlist.split('\n').filter(line => line.trim() !== '')], '3'))
      .toBeCloseTo(3.333333, 6);
  });

  it('rejects m on a voltage source like ngspice-47 (unknown parameter)', () => {
    expect(() => parse(['vmtest', 'V1 1 0 DC 1 m=2', 'R1 1 0 1k', '.op', '.end'].join('\n')))
      .toThrow(ParseError);
    expect(() => parse(['vmtest', 'V1 1 0 DC 1 m=2', 'R1 1 0 1k', '.op', '.end'].join('\n')))
      .toThrow(/Unsupported voltage source parameter 'm'/);
  });

  it('rejects m on a voltage source inside a subcircuit', async () => {
    const deck = ['vsub', '.subckt vs a', 'V1 a 0 DC 1 m=2', '.ends', 'X1 n vs', 'R1 n 0 1k', '.op', '.end'];
    await expect(simulate(deck.join('\n'))).rejects.toThrow(/Unsupported voltage source parameter 'm'/);
  });

  it('rejects a bare m without a value', () => {
    expect(() => parse(['mtest', 'I1 0 1 DC 1m m', 'R1 1 0 1k', '.op', '.end'].join('\n')))
      .toThrow(/requires a value/);
  });
});
