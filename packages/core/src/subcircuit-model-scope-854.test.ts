import { describe, expect, it } from 'vitest';
import { simulate } from './simulate.js';

// #854: a .model card inside a .subckt body is local to that subcircuit, as in
// ngspice-47 subckt.c (modtranslate renames it per instance, x1:name). Model
// lookup is lexical: the device's own body, then the bodies its definition is
// nested in (innermost first), then the top level. A top-level subcircuit
// called from another one does not see the caller's local models.
//
// Expected currents: ngspice-47 `ngspice -b` on the identical netlist with
// `set numdgt=12` / `op` / `print all`.

const REL = 1e-5;

function expectCurrent(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThan(Math.abs(expected) * REL);
}

describe('subcircuit-local .model scoping (#854)', () => {
  it('keeps same-named local models of sibling subcircuits apart', async () => {
    const netlist = [
      'scope test',
      '.subckt A 1 2',
      'D1 1 2 DX',
      '.model DX D (IS=1e-14)',
      '.ends',
      '.subckt B 1 2',
      'D1 1 2 DX',
      '.model DX D (IS=1e-10 RS=10)',
      '.ends',
      'V1 a 0 0.6',
      'X1 a 0 A',
      'V2 b 0 0.6',
      'X2 b 0 B',
      '.op',
      '.end',
    ].join('\n');
    const result = await simulate(netlist);
    expectCurrent(result.dc!.current('V1'), -1.18719629559e-04);
    expectCurrent(result.dc!.current('V2'), -1.19042126362e-02);
  });

  it('resolves local, enclosing and global models like ngspice-47', async () => {
    const netlist = [
      'local shadows global, nested innermost-first, lexical scope',
      '.model DX D (IS=1e-12)',
      '* uses global DX',
      '.subckt G 1 2',
      'D1 1 2 DX',
      '.ends',
      '* local shadows global',
      '.subckt L 1 2',
      'D1 1 2 DX',
      '.model DX D (IS=1e-10 RS=10)',
      '.ends',
      '* outer and nested inner each define DX; each device uses its own',
      '.subckt OUT 1 2',
      '.subckt IN 1 2',
      'D1 1 2 DX',
      '.model DX D (IS=1e-14)',
      '.ends',
      'D1 1 2 DX',
      'X1 1 2 IN',
      '.model DX D (IS=1e-9 RS=100)',
      '.ends',
      '* nested definition without a local model sees the enclosing one',
      '.subckt OUT2 1 2',
      '.subckt IN2 1 2',
      'D1 1 2 DX',
      '.ends',
      'X1 1 2 IN2',
      '.model DX D (IS=1e-9 RS=100)',
      '.ends',
      '* a top-level subckt called from OUT3 does not see OUT3 models',
      '.subckt OUT3 1 2',
      'X1 1 2 G',
      '.model DX D (IS=1e-9 RS=100)',
      '.ends',
      'V1 a 0 0.6',
      'X1 a 0 G',
      'V2 b 0 0.6',
      'X2 b 0 L',
      'V3 c 0 0.6',
      'X3 c 0 OUT',
      'V4 d 0 0.6',
      'X4 d 0 OUT2',
      'V5 e 0 0.6',
      'X5 e 0 OUT3',
      'D9 f 0 DX',
      'V6 f 0 0.6',
      '.op',
      '.end',
    ].join('\n');
    const result = await simulate(netlist);
    const dc = result.dc!;
    expectCurrent(dc.current('V1'), -1.18719628965e-02);
    expectCurrent(dc.current('V2'), -1.19042169305e-02);
    expectCurrent(dc.current('V3'), -2.33903559872e-03);
    expectCurrent(dc.current('V4'), -2.22031596916e-03);
    expectCurrent(dc.current('V5'), -1.18719628965e-02);
    expectCurrent(dc.current('V6'), -1.18719628965e-02);
  });

  it('does not let a top-level device use a subcircuit-local model', async () => {
    // ngspice-47: "can't find model 'dz'" / "could not find a valid modelname".
    const netlist = [
      'top-level device referencing subckt-local model',
      '.subckt L 1 2',
      'D1 1 2 DZ',
      '.model DZ D (IS=1e-10 RS=10)',
      '.ends',
      'V2 b 0 0.6',
      'X2 b 0 L',
      'V1 a 0 0.6',
      'D9 a 0 DZ',
      '.op',
      '.end',
    ].join('\n');
    await expect(simulate(netlist)).rejects.toThrow(/DZ/i);
  });

  it('does not let a called top-level subcircuit use the caller\'s local model', async () => {
    // ngspice-47: "can't find model 'dy'" / "could not find a valid modelname".
    const netlist = [
      'dynamic scope probe',
      '.subckt G2 1 2',
      'D1 1 2 DY',
      '.ends',
      '.subckt OUT4 1 2',
      'X1 1 2 G2',
      '.model DY D (IS=1e-9 RS=100)',
      '.ends',
      'V5 e 0 0.6',
      'X5 e 0 OUT4',
      '.op',
      '.end',
    ].join('\n');
    await expect(simulate(netlist)).rejects.toThrow(/DY/i);
  });

  it('leaves subcircuit-local models out of the serialized top level', () => {
    // Round-tripping must not turn a local model into a global one.
    return import('./parser/index.js').then(async ({ parse }) => {
      const circuit = parse([
        'serialize',
        '.subckt L 1 2',
        'D1 1 2 DZ',
        '.model DZ D (IS=1e-10 RS=10)',
        '.ends',
        'V2 b 0 0.6',
        'X2 b 0 L',
        '.op',
        '.end',
      ].join('\n'));
      circuit.compile();
      const lines = circuit.toNetlist().split('\n');
      expect(lines.filter(line => /^\.model/i.test(line))).toHaveLength(1);
      expect(lines.some(line => /:DZ/i.test(line))).toBe(false);
    });
  });
});
