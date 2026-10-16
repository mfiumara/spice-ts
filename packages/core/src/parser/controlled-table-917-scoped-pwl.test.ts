// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { parse } from './index.js';
import { ParseError } from '../errors.js';
import { UnsupportedCodeModelError } from './xspice-parser.js';

// Required seam for inpcom.c TABLE lowering: its generated A card must
// compile both at the root and inside each X instance, without flattening
// subcircuits in the preprocessor or bypassing scoped model resolution.
const transfer = [
  'Binput internal 0 v=v(in)',
  'Alookup internal mapped transfer',
  '.model transfer pwl (x_array=[-1 0 1] y_array=[-2 0 3] input_domain=.1 fraction=TRUE limit=TRUE)',
  'Goutput out 0 mapped 0 1m',
];

describe('TABLE lowering scoped XSPICE prerequisite (#917)', () => {
  it('accepts a subcircuit-local PWL model at parse time', () => {
    expect(() => parse([
      'MIT scoped model prerequisite',
      '.subckt lookup in out', ...transfer, '.ends lookup', '.end',
    ].join('\n'))).not.toThrow();
  });

  it('still rejects unsupported subcircuit-local code models', () => {
    expect(() => parse([
      'MIT unsupported scoped model', '.subckt lookup in out',
      '.model transfer d_process', '.ends lookup', '.end',
    ].join('\n'))).toThrow(UnsupportedCodeModelError);
  });

  it('still validates literal subcircuit-local code model parameters', () => {
    expect(() => parse([
      'MIT malformed scoped model', '.subckt lookup in out',
      '.model transfer pwl (x_array=1 y_array=[0 1])', '.ends lookup', '.end',
    ].join('\n'))).toThrow(ParseError);
  });

  it('compiles a scoped A card even with its model hoisted to the root', () => {
    const circuit = parse([
      'MIT scoped A-card prerequisite', transfer[2],
      '.subckt lookup in out', transfer[0], transfer[1], transfer[3], '.ends lookup',
      'Vinput in 0 .5', 'Xone in out lookup', 'Rload out 0 1k', '.op', '.end',
    ].join('\n'));
    expect(() => circuit.compile()).not.toThrow();
  });

  it('compiles the generated transfer at the root', () => {
    const circuit = parse([
      'MIT lowered TABLE prerequisite', ...transfer,
      'Vinput in 0 .5', 'Rload out 0 1k', '.op', '.end',
    ].join('\n'));
    expect(() => circuit.compile()).not.toThrow();
  });

  it('compiles the same transfer in independent subcircuit instances', () => {
    const circuit = parse([
      'MIT scoped lowered TABLE prerequisite',
      '.subckt lookup in out', ...transfer, '.ends lookup',
      'Vinput in 0 .5', 'Xone in out lookup', 'Xtwo in out2 lookup',
      'Rload out 0 1k', 'Rload2 out2 0 1k', '.op', '.end',
    ].join('\n'));
    expect(() => circuit.compile()).not.toThrow();
  });
});
