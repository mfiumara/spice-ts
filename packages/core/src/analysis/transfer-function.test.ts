import { describe, expect, it } from 'vitest';
import { InvalidCircuitError, ParseError } from '../errors.js';
import { parseTitleless as parse } from '../parser/index.js';
import { TransferFunctionResult } from '../results.js';
import { simulate } from '../simulate.js';

describe('.tf analysis', () => {
  const voltageGainFixture = `
    V1 in 0 DC 1
    R1 in out 1k
    R2 out 0 1k
    .tf V(out) V1
  `;

  const transimpedanceFixture = `
    I1 0 in DC 1
    R1 in out 1k
    R2 out 0 1k
    .tf V(out) I1
  `;

  const nonlinearCurrentFixture = `* nonlinear current-driven diode
I1 0 out DC 1m
D1 out 0 DM
.model DM D(IS=1e-14 N=1)
.tf V(out) I1
.end
`;

  const unloadedVoltageFixture = `* unloaded voltage-source input
V1 in 0 1
E1 drive 0 in 0 3
R1 drive out 1k
R2 out 0 1k
.tf V(out) V1
.end
`;

  it('parses the bounded single-node voltage-output form', () => {
    expect(parse(voltageGainFixture).analyses).toEqual([{
      type: 'tf',
      outputNode: 'out',
      inputSource: 'V1',
    }]);
  });

  it('matches ngspice 47 voltage gain and port resistances', async () => {
    const result = await simulate(voltageGainFixture);

    expect(result.transferFunction).toBeInstanceOf(TransferFunctionResult);
    expect(result.transferFunction).toMatchObject({
      outputNode: 'out',
      inputSource: 'V1',
    });
    expect(result.transferFunction!.transfer).toBeCloseTo(0.5, 12);
    expect(result.transferFunction!.inputResistance).toBeCloseTo(2000, 6);
    expect(result.transferFunction!.outputResistance).toBeCloseTo(500, 6);
  });

  it('matches ngspice 47 transimpedance and port resistances', async () => {
    const result = await simulate(transimpedanceFixture);

    expect(result.transferFunction).toBeDefined();
    expect(result.transferFunction!.transfer).toBeCloseTo(1000, 6);
    expect(result.transferFunction!.inputResistance).toBeCloseTo(2000, 6);
    expect(result.transferFunction!.outputResistance).toBeCloseTo(1000, 6);
  });

  it('linearizes a current-driven diode at the ngspice 47 operating point', async () => {
    const result = await simulate(nonlinearCurrentFixture);

    expect(result.transferFunction).toBeDefined();
    expect(relativeError(result.transferFunction!.transfer, 25.86478)).toBeLessThan(1e-3);
    expect(relativeError(result.transferFunction!.inputResistance, 25.86478)).toBeLessThan(1e-3);
    expect(relativeError(result.transferFunction!.outputResistance, 25.86478)).toBeLessThan(1e-3);
  });

  it('reports ngspice 47 open-circuit resistance for an unloaded voltage input', async () => {
    const result = await simulate(unloadedVoltageFixture);

    expect(result.transferFunction).toBeDefined();
    expect(result.transferFunction!.transfer).toBeCloseTo(1.5, 12);
    expect(result.transferFunction!.inputResistance).toBe(1e20);
    expect(result.transferFunction!.outputResistance).toBeCloseTo(500, 6);
  });

  it.each([
    '.tf V(out,ref) V1',
    '.tf I(Vsense) V1',
    '.tf V(out)',
  ])('rejects .tf forms outside the bounded slice: %s', netlist => {
    expect(() => parse(netlist)).toThrow(ParseError);
  });

  it('rejects an unknown input source with a typed circuit error', async () => {
    await expect(simulate('Unknown input source test\nR1 out 0 1k\n.tf V(out) Vmissing'))
      .rejects.toBeInstanceOf(InvalidCircuitError);
  });

  it('rejects .step combined with .tf instead of returning empty step results', () => {
    expect(() => parse(`${voltageGainFixture}\n.step param R1 list 1k 2k`))
      .toThrow(ParseError);
  });

  it.each([
    '.pz in 0 out 0 vol pz',
    '.disto dec 10 1 1Meg',
  ])('continues to reject unsupported advanced analysis with ParseError: %s', directive => {
    expect(() => parse(directive)).toThrow(ParseError);
  });
});

function relativeError(actual: number, expected: number): number {
  return Math.abs(actual - expected) / Math.abs(expected);
}
