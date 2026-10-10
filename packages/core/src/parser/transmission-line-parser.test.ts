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

  it('rejects lossy LTRA cards explicitly', () => {
    expect(() => parse('O1 in 0 out 0 LMOD\n.model LMOD LTRA(R=1 L=1n C=1p LEN=1)\n.tran 1n 10n'))
      .toThrow(/lossy transmission line.*LTRA.*unsupported/i);
    expect(() => parse('.model LMOD LTRA(R=1 L=1n C=1p LEN=1)\n.tran 1n 10n'))
      .toThrow(/lossy transmission line model LTRA.*unsupported/i);
  });
});
