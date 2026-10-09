import { describe, expect, it } from 'vitest';
import { InvalidCircuitError, ParseError } from '../errors.js';
import { parse } from '../parser/index.js';
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

  it.each([
    '.tf V(out,ref) V1',
    '.tf I(Vsense) V1',
    '.tf V(out)',
  ])('rejects .tf forms outside the bounded slice: %s', netlist => {
    expect(() => parse(netlist)).toThrow(ParseError);
  });

  it('rejects an unknown input source with a typed circuit error', async () => {
    await expect(simulate('R1 out 0 1k\n.tf V(out) Vmissing'))
      .rejects.toBeInstanceOf(InvalidCircuitError);
  });

  it('rejects .step combined with .tf instead of returning empty step results', () => {
    expect(() => parse(`${voltageGainFixture}\n.step param R1 list 1k 2k`))
      .toThrow(ParseError);
  });

  it.each([
    '.pz in 0 out 0 vol pz',
    '.sens V(out)',
    '.disto dec 10 1 1Meg',
  ])('continues to reject unsupported advanced analysis with ParseError: %s', directive => {
    expect(() => parse(directive)).toThrow(ParseError);
  });
});
