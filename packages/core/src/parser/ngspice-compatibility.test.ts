import { describe, expect, it } from 'vitest';
import { parse, parseAsync } from './index.js';

interface Fixture {
  feature: string;
  netlist: string;
}

const supportedFixtures: Fixture[] = [
  { feature: 'comments and continuation', netlist: '* title\nV1 in 0 DC 1 $ bias\nR1 in out 1k ; load\n.tran 1n // step\n+ 10n ; stop time' },
  { feature: '.model', netlist: '.model DMOD D ( IS = 1e-14 )\nD1 in 0 DMOD\n.op' },
  { feature: '.subckt and X', netlist: '.subckt divider in out\nR1 in out 1k\nR2 out 0 1k\n.ends divider\nX1 in out divider\n.op' },
  { feature: 'R/C/L', netlist: 'R1 in out 1kOhm\nC1 out 0 1uF\nL1 in 0 1mH\n.op' },
  { feature: 'independent DC source', netlist: 'V1 in 0 DC 1\nI1 in 0 DC 1m\n.op' },
  { feature: 'independent PULSE/SIN sources', netlist: 'V1 in 0 PULSE(0 1 0 1n 1n 1u 2u)\nI1 in 0 SIN(0 1m 1k)\n.tran 1n 2u' },
  { feature: 'linear dependent sources', netlist: 'V1 in 0 1\nE1 e 0 in 0 2\nG1 g 0 in 0 1m\nF1 f 0 V1 2\nH1 h 0 V1 1k\n.op' },
  { feature: 'D/Q/M cards', netlist: '.model D1 D(IS=1e-14)\n.model N1 NPN(BF=100)\n.model M1 NMOS(VTO=1)\nD1a d 0 D1\nQ1 q b 0 N1\nM1a m g 0 0 M1\n.op' },
  { feature: '.op', netlist: 'V1 in 0 1\nR1 in 0 1k\n.op' },
  { feature: '.dc', netlist: 'V1 in 0 0\nR1 in 0 1k\n.dc V1 0 1 0.1' },
  { feature: '.tran', netlist: 'V1 in 0 1\nR1 in 0 1k\n.tran 1n 10n' },
  { feature: 'initial conditions', netlist: 'R1 out 0 1k\nC1 out 0 1p\n.ic V(out)=1\n.tran 1n 10n uic' },
  { feature: 'initial guesses', netlist: 'V1 out 0 1\n.nodeset V(out)=0\n.op' },
  { feature: '.ac', netlist: 'V1 in 0 AC 1\nR1 in 0 1k\n.ac dec 10 1 1Meg' },
];

const unsupportedFixtures: Fixture[] = [
  { feature: 'PWL source waveform', netlist: 'V1 in 0 PWL(0 0 1n 1)\n.tran 0.1n 1n' },
  { feature: 'noise analysis', netlist: '.noise V(out) V1 dec 10 1 1Meg' },
  { feature: 'control blocks', netlist: '.control\nop\n.endc' },
  { feature: 'semantic option directives', netlist: '.options reltol=1e-4\n.op' },
  { feature: 'behavioral source', netlist: 'B1 out 0 V=V(in)*2\n.op' },
  { feature: 'JFET', netlist: 'J1 d g s JMOD\n.op' },
  { feature: 'switch', netlist: 'S1 out 0 ctrl 0 SMOD\n.op' },
  { feature: 'transmission line', netlist: 'T1 in 0 out 0 Z0=50 TD=1n\n.tran 1n 10n' },
];

describe('ngspice parser compatibility fixtures', () => {
  for (const fixture of supportedFixtures) {
    it(`accepts supported ${fixture.feature} syntax`, () => {
      expect(() => parse(fixture.netlist)).not.toThrow();
    });
  }

  it('represents required syntax supplied by a continuation line', () => {
    const circuit = parse('.tran 1n $ step\n+ 10n ; stop time');

    expect(circuit.analyses).toEqual([{ type: 'tran', timestep: 1e-9, stopTime: 10e-9 }]);
  });

  it('rejects unsupported resistor parameters continued onto the card', () => {
    expect(() => parse('R1 in out 1k\n+ TC=0')).toThrow('Unsupported resistor parameters');
  });

  it('accepts .include, .lib, and top-level .param through parseAsync', async () => {
    const files: Record<string, string> = {
      'parts.inc': 'R1 in out {r}',
      'models.lib': '.lib TT\n.model DMOD D(IS=1e-14)\n.endl TT',
    };
    const circuit = await parseAsync(
      '.param r=1k\n.include parts.inc\n.lib models.lib TT\nD1 out 0 DMOD\nV1 in 0 1\n.op',
      async path => files[path],
    );
    expect(circuit.compile().devices).toHaveLength(3);
  });

  for (const fixture of unsupportedFixtures) {
    it(`rejects unsupported ${fixture.feature} syntax`, () => {
      expect(() => parse(fixture.netlist)).toThrow();
    });
  }
});
