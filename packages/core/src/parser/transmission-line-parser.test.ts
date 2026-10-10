import { describe, expect, it } from 'vitest';
import { parseTitleless as parse } from './index.js';
import { TransmissionLine } from '../devices/transmission-line.js';

describe('lossless transmission-line parser', () => {
  it('parses the bounded Z0/TD T-card form', () => {
    const compiled = parse('T1 in 0 out 0 Z0=50 TD=5n\n.tran 50p 20n').compile();
    const line = compiled.devices[0];

    expect(line).toBeInstanceOf(TransmissionLine);
    expect(line).toMatchObject({ name: 'T1', impedance: 50, delay: 5e-9 });
    expect(compiled.branchNames).toEqual(['T1:1', 'T1:2']);
  });

  it.each([
    ['frequency-dependent length', 'T1 in 0 out 0 Z0=50 F=10meg NL=.25'],
    ['initial conditions', 'T1 in 0 out 0 Z0=50 TD=5n IC=0,0,0,0'],
    ['unknown parameters', 'T1 in 0 out 0 Z0=50 TD=5n REL=1'],
    ['missing delay', 'T1 in 0 out 0 Z0=50'],
    ['non-positive impedance', 'T1 in 0 out 0 Z0=0 TD=5n'],
  ])('rejects unsupported %s explicitly', (_label, card) => {
    expect(() => parse(`${card}\n.tran 50p 20n`)).toThrow(/unsupported lossless transmission line|positive Z0 and TD/i);
  });

  it('parses the benchmark-bounded common-reference O/LTRA form', () => {
    const compiled = parse([
      'O1 in 0 out 0 LMOD',
      '.model LMOD LTRA(R=1 L=1n G=0 C=1p LEN=1 STEPLIMIT REL=1 COMPACTREL=1e-3 COMPACTABS=1e-14)',
      '.tran 1n 10n',
    ].join('\n')).compile();

    expect(compiled.devices.map(device => device.name)).toEqual(expect.arrayContaining([
      'O1.C0', 'O1.R1', 'O1.L1', 'O1.C8',
    ]));
  });

  it.each([
    ['different reference nodes', 'O1 in ref out 0 LMOD', '.model LMOD LTRA(R=1 L=1n C=1p LEN=1)'],
    ['nonzero shunt conductance', 'O1 in 0 out 0 LMOD', '.model LMOD LTRA(R=1 L=1n G=1u C=1p LEN=1)'],
    ['unknown model parameter', 'O1 in 0 out 0 LMOD', '.model LMOD LTRA(R=1 L=1n C=1p LEN=1 FOO=2)'],
    ['instance parameter', 'O1 in 0 out 0 LMOD IC=0', '.model LMOD LTRA(R=1 L=1n C=1p LEN=1)'],
  ])('rejects unsupported lossy %s explicitly', (_label, card, model) => {
    expect(() => parse(`${card}\n${model}\n.tran 1n 10n`).compile())
      .toThrow(/unsupported LTRA|common reference|parameter/i);
  });
});
