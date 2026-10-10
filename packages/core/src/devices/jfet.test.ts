import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';
import { JFET } from './jfet.js';
import { parse } from '../parser/index.js';

const fixtureRoot = resolve(
  import.meta.dirname,
  '../../../../benchmarks/corpus/xyce/fixtures/NJFET_DC',
);

function fixture(name: string): string {
  return readFileSync(resolve(fixtureRoot, name), 'utf8');
}

const model = '.model MOD NJF LEVEL=1 BETA=2.69e-5 VTO=-3.795 PB=1.07 LAMBDA=0.0181 B=0.605 IS=1.393e-10 RD=0 RS=0 CGS=0 CGD=0 FC=0.5 AF=1 KF=0.05';

async function operatingPoint(vds: number, vgs: number) {
  return simulate(`JFET operating point\nVd d 0 ${vds}\nVg g 0 ${vgs}\nJ1 d g 0 MOD\n${model}\n.op\n.end`);
}

describe('NJF level-1', () => {
  it('matches ngspice-47 in the linear region', async () => {
    const result = await operatingPoint(1, -1);
    expect(result.dc!.current('Vd')).toBeCloseTo(-1.11743e-4, 9);
    expect(result.dc!.current('Vg')).toBeCloseTo(2.815964e-10, 14);
  });

  it('matches ngspice-47 in saturation', async () => {
    const result = await operatingPoint(5, -1);
    expect(result.dc!.current('Vd')).toBeCloseTo(-1.90647e-4, 9);
    expect(result.dc!.current('Vg')).toBeCloseTo(2.855967e-10, 14);
  });

  it('compiles the unchanged level-1 Xyce fixture', () => {
    const compiled = parse(fixture('njfet.cir')).compile();
    expect(compiled.devices.some(device => device instanceof JFET)).toBe(true);
  });

  it('matches the level-1 fixture endpoint including RD, RS, and B', async () => {
    const netlist = fixture('njfet.cir')
      .replace(/^\.Step.*$/mi, '')
      .replace(/^\.DC VDS.*$/mi, '.DC Vds 15 15 1')
      .replace(/^Vgs 2 0 0$/mi, 'Vgs 2 0 -1.875');
    const result = await simulate(netlist);

    // ngspice-47: equivalent two-source .dc sweep, Vgs=-1.875 V, Vds=15 V.
    expect(result.dcSweep!.current('Vidmon')[0]).toBeCloseTo(9.349505351985685e-5, 10);
  });

  it('rejects level 2 explicitly', () => {
    expect(() => parse(fixture('njfet-2109.cir')).compile())
      .toThrow(/Unsupported NJF model level: 2/);
  });

  it('rejects unsupported model parameters explicitly', () => {
    expect(() => parse('title\nJ1 d g s MOD\n.model MOD NJF LEVEL=1 DELTA=0.1\n.op').compile())
      .toThrow(/Unsupported NJF level-1 model parameter: 'DELTA'/);
  });

  it('rejects unsupported J-card instance parameters explicitly', () => {
    expect(() => parse('title\nJ1 d g s MOD AREA=2\n.model MOD NJF LEVEL=1\n.op'))
      .toThrow(/Unsupported JFET instance parameter: 'AREA=2'/);
  });
});
