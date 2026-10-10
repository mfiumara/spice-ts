import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';
import { parseTitleless as parse } from './index.js';

describe('ngspice option directives', () => {
  it('maps only solver-backed ngspice options to SimulationOptions', () => {
    const circuit = parse(`
.options abstol=2p vntol=3u reltol=4m gmin=5p
+ itl1=11 itl4=12 method=gear trtol=6
V1 in 0 1
R1 in 0 1k
.op
`);

    expect(circuit.simulationOptions).toEqual({
      abstol: 2e-12,
      vntol: 3e-6,
      reltol: 4e-3,
      gmin: 5e-12,
      maxIterations: 11,
      maxTransientIterations: 12,
      integrationMethod: 'gear2',
      trtol: 6,
    });
    expect(circuit.compile().simulationOptions).toEqual(circuit.simulationOptions);
  });

  it('accepts ngspice trap as the trapezoidal integration method', () => {
    expect(parse('.options method=trap\n.op').simulationOptions.integrationMethod)
      .toBe('trapezoidal');
  });

  it('merges repeated cards with the later value winning', () => {
    const circuit = parse('.options reltol=1m\n.options reltol=2m abstol=3p\n.op');
    expect(circuit.simulationOptions).toMatchObject({ reltol: 2e-3, abstol: 3e-12 });
  });

  it('preserves implemented options when serializing a Circuit', () => {
    const circuit = parse('.options reltol=2m itl1=25 method=gear\nV1 in 0 1\n.op');
    const reparsed = parse(circuit.toNetlist());

    expect(reparsed.simulationOptions).toEqual(circuit.simulationOptions);
  });

  it('applies deck options while explicit API options take precedence', async () => {
    const netlist = 'Options precedence test\n.options itl1=0\nV1 in 0 1\nR1 in 0 1k\n.op';

    await expect(simulate(netlist)).rejects.toThrow();
    await expect(simulate(netlist, { maxIterations: 100 })).resolves.toMatchObject({
      dc: expect.anything(),
    });
  });

  it.each([
    '.options unsupported_option=1\n.op',
    '.options method=euler\n.op',
    '.options reltol=not-a-number\n.op',
    '.options reltol=-1m\n.op',
    '.options itl1=1.5\n.op',
  ])('rejects unsupported or invalid option semantics: %s', netlist => {
    expect(() => parse(netlist)).toThrow();
  });
});

describe('Xyce TIMEINT option directives', () => {
  it.each([
    [
      '.options timeint reltol=1e-6 abstol=1e-6',
      { reltol: 1e-6, abstol: 1e-6, vntol: 1e-6 },
    ],
    ['.options timeint reltol=1.0e-4', { reltol: 1e-4 }],
    [
      '.options timeint reltol=1.0e-4 abstol=1e-4 method=7',
      { reltol: 1e-4, abstol: 1e-4, vntol: 1e-4, integrationMethod: 'trapezoidal' },
    ],
  ])('maps solver-backed fields from the primitive corpus card: %s', (card, expected) => {
    expect(parse(`${card}\n.op`).simulationOptions).toEqual(expected);
  });

  it.each([
    ['trap', 'trapezoidal'],
    ['7', 'trapezoidal'],
    ['gear', 'gear2'],
    ['8', 'gear2'],
  ] as const)('maps documented TIMEINT METHOD=%s', (method, expected) => {
    expect(parse(`.options timeint method=${method}\n.op`).simulationOptions.integrationMethod)
      .toBe(expected);
  });

  it.each([
    ['.options timeint reltol=1e-6 abstol=1e-6 newlte=2', 'newlte'],
    ['.options timeint newbpstepping=0 reltol=1.0e-4', 'newbpstepping'],
    ['.options timeint delmax=1u', 'delmax'],
  ])('keeps unsupported primitive-corpus TIMEINT fields explicit: %s', (card, field) => {
    expect(() => parse(`${card}\n.op`))
      .toThrow(`Unsupported .options TIMEINT field: '${field}'`);
  });

  it.each([
    '.options timeint method=9\n.op',
    '.options timeint reltol=-1m\n.op',
    '.options timeint abstol=not-a-number\n.op',
  ])('rejects unsupported or invalid TIMEINT semantics: %s', netlist => {
    expect(() => parse(netlist)).toThrow();
  });
});

describe('ngspice control and output directives', () => {
  it.each([
    '.save v(out)\n.op',
    '.print tran v(out)\n.op',
    '.plot v(out)\n.op',
  ])('explicitly ignores output-only metadata: %s', netlist => {
    expect(() => parse(netlist)).not.toThrow();
  });

  it.each([
    '.temp 27\n.op',
    '.measure tran peak MAX v(out)\n.op',
    '.control\nop\n.endc',
  ])('rejects unsupported semantic/control directives: %s', netlist => {
    expect(() => parse(netlist)).toThrow();
  });
});