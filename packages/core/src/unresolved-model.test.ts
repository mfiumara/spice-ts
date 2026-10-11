import { describe, expect, it } from 'vitest';
import { InvalidCircuitError } from './errors.js';
import { parse } from './parser/index.js';
import { simulate } from './simulate.js';

// Issue #414: ngspice refuses an instance whose model cannot be resolved
// ("Unable to find definition of model"). spice-ts used to silently build a
// default device (an NMOS with VTO=1 for M cards).
describe('unresolved .model references', () => {
  it('rejects a MOSFET whose model is undefined with InvalidCircuitError', () => {
    const circuit = parse(`unresolved mosfet
.model nmod nmos level=1 vto=0.7
M1 d g 0 0 PMOD W=1u L=1u
VD d 0 5
VG g 0 5
.op
.end`);
    expect(() => circuit.compile()).toThrow(InvalidCircuitError);
    expect(() => circuit.compile()).toThrow("MOSFET 'M1' references unknown model 'PMOD'");
  });

  it('reports the unresolved MOSFET model through simulate()', async () => {
    await expect(simulate(`unresolved mosfet
M1 d g 0 0 missing W=1u L=1u
VD d 0 5
VG g 0 5
.op
.end`)).rejects.toBeInstanceOf(InvalidCircuitError);
  });

  it('rejects a diode whose model is undefined with InvalidCircuitError', () => {
    const circuit = parse(`unresolved diode
V1 a 0 1
R1 a b 1k
D1 b 0 DMISSING
.op
.end`);
    expect(() => circuit.compile()).toThrow(InvalidCircuitError);
    expect(() => circuit.compile()).toThrow("Diode 'D1' references unknown model 'DMISSING'");
  });

  it.each([
    ['BJT', `Q1 c b 0 QMISSING\nVC c 0 1\nVB b 0 0.7`, "BJT 'Q1' references unknown model 'QMISSING'"],
    ['JFET', `J1 d g 0 JMISSING\nVD d 0 1\nVG g 0 0`, "JFET 'J1' references unknown model 'JMISSING'"],
  ])('raises InvalidCircuitError for an unresolved %s model', (_kind, body, message) => {
    const circuit = parse(`unresolved\n${body}\n.op\n.end`);
    expect(() => circuit.compile()).toThrow(InvalidCircuitError);
    expect(() => circuit.compile()).toThrow(message);
  });

  it('resolves a MOSFET model whose case differs from the .model card', async () => {
    const result = await simulate(`t
.model pmos pmos level=1 vto=-0.7
Mp4 6 2 1 1 PMOS W=8e-6 L=600e-9
R4  6 0 5.8k
vdd 1 0 5
vin 2 0 5
.op
.end`);
    // ngspice-47: v(6) = 2.9058e-08 (PMOS off). A default NMOS would conduct.
    expect(Math.abs(result.dc!.voltage('6'))).toBeLessThan(1e-6);
  });

  it('resolves subcircuit names case-insensitively', async () => {
    const result = await simulate(`subckt case
.subckt Divider in out
R1 in out 1k
R2 out 0 1k
.ends divider
V1 a 0 2
X1 a b DIVIDER
.op
.end`);
    expect(result.dc!.voltage('b')).toBeCloseTo(1, 9);
  });
});
