import { describe, expect, it } from 'vitest';
import {
  parseTitleless as parse,
  parseTitlelessAsync as parseAsync,
} from './index.js';
import { ParseError } from '../errors.js';

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
  { feature: 'independent PWL sources', netlist: 'V1 in 0 PWL(0 0 1n 1 2n 0)\nI1 out 0 PWL(0 0 1n 1m)\n.tran 0.1n 2n' },
  { feature: 'linear dependent sources', netlist: 'V1 in 0 1\nE1 e 0 in 0 2\nG1 g 0 in 0 1m\nF1 f 0 V1 2\nH1 h 0 V1 1k\n.op' },
  { feature: 'D/Q/M cards', netlist: '.model D1 D(IS=1e-14)\n.model N1 NPN(BF=100)\n.model M1 NMOS(VTO=1)\nD1a d 0 D1\nQ1 q b 0 N1\nM1a m g 0 0 M1\n.op' },
  { feature: 'bounded NJF level-1 J card', netlist: '.model JMOD NJF LEVEL=1\nJ1 d g s JMOD\n.op' },
  { feature: '.op', netlist: 'V1 in 0 1\nR1 in 0 1k\n.op' },
  { feature: '.dc', netlist: 'V1 in 0 0\nR1 in 0 1k\n.dc V1 0 1 0.1' },
  { feature: '.tran', netlist: 'V1 in 0 1\nR1 in 0 1k\n.tran 1n 10n' },
  { feature: 'initial conditions', netlist: 'R1 out 0 1k\nC1 out 0 1p\n.ic V(out)=1\n.tran 1n 10n uic' },
  { feature: 'initial guesses', netlist: 'V1 out 0 1\n.nodeset V(out)=0\n.op' },
  { feature: '.ac', netlist: 'V1 in 0 AC 1\nR1 in 0 1k\n.ac dec 10 1 1Meg' },
  { feature: 'LIN/DEC/OCT .noise slice', netlist: 'V1 in 0 AC 1\nR1 in out 1k\nR2 out 0 1k\n.noise V(out) V1 dec 10 1 1Meg' },
  { feature: 'bounded differential resistor-noise output', netlist: 'V1 in 0 AC 1\nR1 in out 1k\nR2 ref 0 1k\n.noise V(out,ref) V1 dec 10 1 1Meg' },
  { feature: 'bounded transfer-function analysis', netlist: 'V1 in 0 1\nR1 in out 1k\nR2 out 0 1k\n.tf V(out) V1' },
  { feature: 'bounded sensitivity analysis', netlist: 'V1 in 0 1\nR1 in out 1k\nR2 out 0 1k\n.sens V(out)' },
  { feature: 'bounded single-tone linear distortion analysis', netlist: 'V1 in 0 DC 0 DISTOF1 1 DISTOF2 0\nR1 in out 1k\nC1 out 0 1n\n.disto dec 10 1k 1Meg' },
  { feature: 'solver-backed .options', netlist: '.options reltol=1e-4 itl1=50 method=trap\n.op' },
  { feature: 'output-only directives', netlist: '.save v(out)\n.print tran v(out)\n.plot v(out)\n.op' },
  { feature: 'bounded lossless transmission line', netlist: 'T1 in 0 out 0 Z0=50 TD=1n\n.tran 1n 10n' },
];

const unsupportedFixtures: Fixture[] = [
  { feature: 'EXP source waveform', netlist: 'V1 in 0 EXP(0 1 1n 1n)\n.tran 0.1n 1n' },
  { feature: 'SFFM source waveform', netlist: 'V1 in 0 SFFM(0 1 1k 1 10)\n.tran 1u 1m' },
  { feature: 'AM source waveform', netlist: 'V1 in 0 AM(1 1 1k 10k)\n.tran 1u 1m' },
  { feature: 'trnoise source waveform', netlist: 'V1 in 0 TRNOISE(1 1n)\n.tran 1n 10n' },
  { feature: 'external source waveform', netlist: 'V1 in 0 EXTERNAL\n.tran 1n 10n' },
  { feature: 'differential pole-zero analysis', netlist: '.pz in ref out 0 vol pz' },
  { feature: 'control blocks', netlist: '.control\nop\n.endc' },
  { feature: 'circuit temperature', netlist: '.temp 27\n.op' },
  { feature: 'measurements', netlist: '.measure tran peak MAX v(out)\n.op' },
  { feature: 'behavioral source', netlist: 'B1 out 0 V=V(in)*2\n.op' },
  { feature: 'switch', netlist: 'S1 out 0 ctrl 0 SMOD\n.op' },
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

  it.each([
    ['bare DISTOF1', 'DISTOF1', "DISTOF1 requires a magnitude"],
    ['bare DISTOF2', 'DISTOF2', "DISTOF2 requires a magnitude"],
    ['DISTOF1 magnitude', 'DISTOF1 nope', "Cannot parse number: 'nope'"],
    ['DISTOF1 phase', 'DISTOF1 1 nope', "Cannot parse number: 'nope'"],
    ['DISTOF2 magnitude', 'DISTOF2 nope', "Cannot parse number: 'nope'"],
    ['DISTOF2 phase', 'DISTOF2 1 nope', "Cannot parse number: 'nope'"],
    ['DISTOF1 trailing token', 'DISTOF1 1 0 nope', "Unsupported DISTOF1 parameters: 'nope'"],
    ['DISTOF2 trailing token', 'DISTOF2 0 0 nope', "Unsupported DISTOF2 parameters: 'nope'"],
  ])('reports an explicitly malformed %s as a structured parser error', (_label, term, message) => {
      const card = `V1 in 0 DC 0 ${term}`;
      let error: unknown;

      try {
        parse(`${card}\nR1 in 0 1k\n.disto dec 10 1k 1.8k`);
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeInstanceOf(ParseError);
      expect(error).toMatchObject({
        line: 1,
        context: card,
      });
      expect((error as Error).message).toContain(message);
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
