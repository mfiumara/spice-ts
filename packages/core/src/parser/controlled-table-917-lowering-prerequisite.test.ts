// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { parse } from './index.js';

const transfer = [
  'Binput internal 0 v=v(in)',
  'Alookup internal mapped transfer',
  '.model transfer pwl (x_array=[-1 0 1] y_array=[-2 0 3] input_domain=.1 fraction=TRUE limit=TRUE)',
  'Goutput out 0 mapped 0 1m',
];

// Isolate the required B -> A pwl -> G seam before implementing TABLE syntax.
describe('TABLE lowering prerequisites on fresh main (#917)', () => {
  it('compiles the mandated transfer at the root', () => {
    const circuit = parse([
      'MIT root transfer', ...transfer,
      'Vinput in 0 .5', 'Rload out 0 1k', '.op', '.end',
    ].join('\n'));
    expect(() => circuit.compile()).not.toThrow();
  });

  it('compiles the mandated transfer inside an X instance with a root model', () => {
    const circuit = parse([
      'MIT scoped A transfer', transfer[2],
      '.subckt lookup in out', transfer[0], transfer[1], transfer[3], '.ends lookup',
      'Vinput in 0 .5', 'Xone in out lookup', 'Rload out 0 1k', '.op', '.end',
    ].join('\n'));
    expect(() => circuit.compile()).not.toThrow();
  });

  it('compiles independent X instances with their local PWL model', () => {
    const circuit = parse([
      'MIT scoped local model transfer',
      '.subckt lookup in out', ...transfer, '.ends lookup',
      'Vinput in 0 .5', 'Xone in out lookup', 'Xtwo in out2 lookup',
      'Rload out 0 1k', 'Rload2 out2 0 1k', '.op', '.end',
    ].join('\n'));
    expect(() => circuit.compile()).not.toThrow();
  });
});
