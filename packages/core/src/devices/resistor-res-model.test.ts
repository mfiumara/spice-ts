import { describe, expect, it } from 'vitest';
import { Circuit } from '../circuit.js';
import { ModelTypeMismatchError } from '../errors.js';
import { parse } from '../parser/index.js';
import { UnsupportedResistorParameterError } from '../parser/resistor-parser.js';
import { simulate } from '../simulate.js';

function relativeError(actual: number, expected: number): number {
  return Math.abs(actual / expected - 1);
}

// Issue #823: PSpice vendor libraries declare resistor models as
// `.model <name> RES(R=... TC1=... TC2=...)`. ngspice-47 inpdomod.c maps type
// `res` to the same Resistor device as `r` (INPtypelook("Resistor")), so the
// card takes the res.c RESmPTable parameters: model `R` is the default
// resistance used only when the instance gives none (not a PSpice multiplier),
// and TC1/TC2 are the model temperature coefficients.
describe('PSpice .model RES resistor type (#823)', () => {
  // ngspice-47 -b, default mode and `set ngbehavior=ltps` (identical output):
  //   v(2) = 8.510638e-01, v(3) = 6.802721e-01, i(v1) = -9.19091e-03
  const DECK = `PSpice RES model type
v1 1 0 dc 1
r1 1 2 rmod 10
r2 2 0 rmod2 100
r3 1 3 rmod3
r4 3 0 1k
.model rmod RES(R=2 TC1=0.01 TC2=1e-4)
.model rmod2 res r=1
.model rmod3 RES(R=470)
.options temp=77
.op
.end
`;

  it('matches ngspice-47 on R default value and TC1/TC2 temperature coefficients', async () => {
    const result = await simulate(DECK);
    expect(relativeError(result.dc!.voltage('2'), 8.510638e-1)).toBeLessThan(1e-6);
    expect(relativeError(result.dc!.voltage('3'), 6.802721e-1)).toBeLessThan(1e-6);
    expect(relativeError(result.dc!.current('v1'), -9.19091e-3)).toBeLessThan(1e-5);
  });

  it('stores the model as a resistor model (type R)', () => {
    expect(parse(DECK).compile().models.get('rmod')).toMatchObject({ type: 'R', params: { R: 2, TC1: 0.01, TC2: 1e-4 } });
  });

  it('accepts a RES model declared inside a .subckt body', async () => {
    const result = await simulate(`RES in subckt
.subckt div a b
r1 a b rsub
.model rsub RES(R=1k)
.ends
v1 1 0 dc 1
x1 1 2 div
r2 2 0 1k
.op
.end
`);
    expect(result.dc!.voltage('2')).toBeCloseTo(0.5, 12);
  });

  it('accepts RES through the Circuit API model registry', async () => {
    const circuit = new Circuit();
    circuit.addModel({ name: 'rapi', type: 'res', params: { R: 1e3 } });
    circuit.addVoltageSource('V1', '1', '0', { type: 'dc', value: 1 });
    circuit.addResistor('R1', '1', '2', undefined, undefined, 'rapi');
    circuit.addResistor('R2', '2', '0', 1e3);
    circuit.addAnalysis('op');
    const result = await simulate(circuit);
    expect(result.dc!.voltage('2')).toBeCloseTo(0.5, 12);
  });

  it('rejects RES model parameters spice-ts does not simulate, like .model R', () => {
    expect(() => parse(`t
v1 1 0 1
r1 1 0 rbad 1k
.model rbad RES(R=1 T_REL_LOCAL=50)
.op
.end
`)).toThrow(UnsupportedResistorParameterError);
  });

  it('rejects a RES model on a non-resistor instance (ngspice-47: error on line 4)', async () => {
    await expect(simulate(`t
v1 1 0 1
r1 1 2 1k
c1 2 0 1p rmod
.model rmod RES(R=1)
.op
.end
`)).rejects.toBeInstanceOf(ModelTypeMismatchError);
  });
});
