import { describe, expect, it } from 'vitest';
import { ParseError } from '../errors.js';
import { simulate } from '../simulate.js';
import { parse, parseAsync, UnsupportedModelTypeError } from './index.js';

// Issue #509: a `.model` card whose type spice-ts does not implement used to be
// stored and then ignored, so `.model p1 vdmos ...` + `m1 d g s p1` simulated
// with no model at all (9e75 A where ngspice-47 reports 14.44 A). Like #414 for
// unresolved model names, an unsupported model type is now a typed error.
// VDMOS itself is implemented since #506; PJF stands in as the unsupported type.

function parseFailure(netlist: string): unknown {
  try {
    parse(netlist);
  } catch (error) {
    return error;
  }
  throw new Error('expected parse() to throw');
}

const PJF_DECK = `P-channel JFET output
j1 d g s p1
.model p1 pjf vto=-1.2 beta=1e-4
vd d 0 -5
vg g 0 -5
vs s 0 0
.op
.end
`;

describe('unsupported .model types (#509)', () => {
  it('rejects a PJF .model with a typed UNSUPPORTED_MODEL_TYPE error', () => {
    const error = parseFailure(PJF_DECK);
    expect(error).toBeInstanceOf(UnsupportedModelTypeError);
    expect(error).toBeInstanceOf(ParseError);
    expect(error).toMatchObject({
      name: 'UnsupportedModelTypeError',
      code: 'UNSUPPORTED_MODEL_TYPE',
      modelName: 'p1',
      modelType: 'PJF',
      line: 3,
      context: '.model p1 pjf vto=-1.2 beta=1e-4',
    });
    expect((error as Error).message).toContain(".model 'p1' has unsupported type 'PJF'");
  });

  it('reports the unsupported PJF model through simulate() instead of a numeric result', async () => {
    await expect(simulate(PJF_DECK)).rejects.toMatchObject({
      code: 'UNSUPPORTED_MODEL_TYPE',
      modelName: 'p1',
      modelType: 'PJF',
      line: 3,
    });
  });

  it('rejects an unsupported model type declared after .control and inside .subckt bodies', () => {
    const error = parseFailure(`inverter
vdd 1 0 5
.subckt inv out in vdd vss
jp1 out in vdd p1
.model  P1  pjf vto=-1
.ends
xinv 3 2 1 0 inv
Vin 2 0 DC 0
.dc Vin 0 5 0.05
.end
`);
    expect(error).toBeInstanceOf(UnsupportedModelTypeError);
    expect(error).toMatchObject({ modelName: 'P1', modelType: 'PJF', line: 5 });
  });

  it('rejects an unsupported model type pulled in by parseAsync() includes', async () => {
    await expect(parseAsync(`include
.include models.lib
V1 a 0 1
R1 a 0 1k
.op
.end
`, async () => '.model swmod sw vt=1 vh=0.1 ron=1 roff=1meg\n')).rejects.toMatchObject({
      code: 'UNSUPPORTED_MODEL_TYPE',
      modelName: 'swmod',
      modelType: 'SW',
    });
  });

  it.each([
    'SW', 'CSW', 'R', 'PJF', 'PHFET', 'PMF', 'URC', 'TRANSLINE',
    'NCH', 'PCH', 'DI', 'HIGH_SW', 'LOW_SW', 'NIGBT', 'BOGUS',
  ])('rejects .model type %s that no spice-ts device implements', type => {
    const error = parseFailure(`unsupported ${type}
.model m1 ${type.toLowerCase()} (a=1)
V1 a 0 1
R1 a 0 1k
.op
.end
`);
    expect(error).toBeInstanceOf(UnsupportedModelTypeError);
    expect(error).toMatchObject({
      code: 'UNSUPPORTED_MODEL_TYPE',
      modelName: 'm1',
      modelType: type,
      line: 2,
    });
  });

  it('rejects a .model card without a type with a ParseError', () => {
    const error = parseFailure(`missing type
.model lonely
V1 a 0 1
R1 a 0 1k
.op
.end
`);
    expect(error).toBeInstanceOf(ParseError);
    expect((error as Error).message).toContain(".model 'lonely' is missing its model type");
  });

  it.each([
    ['D', 'IS=1e-14 N=1.05', { IS: 1e-14, N: 1.05 }],
    ['NPN', 'BF=100 IS=1e-16', { BF: 100, IS: 1e-16 }],
    ['PNP', 'BF=50', { BF: 50 }],
    ['NJF', 'VTO=-2 BETA=1e-4', { VTO: -2, BETA: 1e-4 }],
    ['NMOS', 'LEVEL=1 VTO=0.7 KP=2e-5', { LEVEL: 1, VTO: 0.7, KP: 2e-5 }],
    ['PMOS', 'LEVEL=1 VTO=-0.7', { LEVEL: 1, VTO: -0.7 }],
    ['NHFET', 'VTO=-1', { VTO: -1 }],
    ['NMF', 'VTO=-2', { VTO: -2 }],
    ['C', 'CAP=1n', { CAP: 1e-9 }],
    ['L', 'IND=1u', { IND: 1e-6 }],
    ['LTRA', 'R=0.2 L=9.13e-9 G=0 C=3.65e-12 LEN=1', { R: 0.2, L: 9.13e-9, G: 0, C: 3.65e-12, LEN: 1 }],
  ])('still parses supported .model type %s unchanged', (type, params, expected) => {
    const circuit = parse(`supported ${type}
.model keep ${type.toLowerCase()}(${params})
V1 a 0 1
R1 a 0 1k
.op
.end
`);
    const model = circuit.compile().models.get('keep');
    expect(model).toMatchObject({ name: 'keep', type });
    expect(model?.params).toMatchObject(expected);
  });
});
