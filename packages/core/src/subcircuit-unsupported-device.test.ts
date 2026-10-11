import { describe, expect, it } from 'vitest';
import { ParseError } from './errors.js';
import { simulate, simulateStream } from './simulate.js';

// ngspice/mesa-oscillator (B + Z NMF cards) is now supported; see
// mesa-behavioral-integration.test.ts. Keep the guard that an unsupported
// card inside a subcircuit is rejected explicitly instead of being dropped
// and later reported as a singular matrix.
const netlist = [
  'unsupported XSPICE card in a subcircuit',
  '.subckt digital in out',
  'a1 in out buf',
  'r1 in out 1k',
  '.ends',
  // No `.model buf d_buffer` card: since #509 an unsupported model type is
  // rejected on its own (see parser/unsupported-model-type.test.ts), and this
  // guard is about the unsupported A card inside the subcircuit body.
  'v1 1 0 dc 1',
  'x1 1 2 digital',
  'r2 2 0 1k',
  '.op',
  '.end',
].join('\n');

describe('unsupported devices inside subcircuits', () => {
  it('rejects the first unsupported card instead of reaching a singular solve', async () => {
    let error: unknown;
    try {
      await simulate(netlist);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(ParseError);
    expect((error as Error).message).toContain("Unsupported device card: 'A'");
    expect((error as Error).message).not.toContain('Singular matrix');
  });

  it('reports the same unsupported boundary through streaming', async () => {
    let error: unknown;
    try {
      for await (const _point of simulateStream(netlist)) {
        // The unsupported card is rejected while compiling, before points exist.
      }
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(ParseError);
    expect((error as Error).message).toContain("Unsupported device card: 'A'");
    expect((error as Error).message).not.toContain('Singular matrix');
  });
});
