import { describe, expect, it } from 'vitest';
import { simulate } from './simulate.js';

// #826: a .subckt defined inside another .subckt body is scoped to the
// enclosing subcircuit (ngspice-47 subckt.c), not an undefined name.

describe('nested .subckt definitions (#826)', () => {
  it('resolves a definition nested in the enclosing body (ngspice-47 -b values)', async () => {
    const netlist = [
      'nested subckt definition',
      'V1 1 0 2',
      'X1 1 0 outer',
      '.subckt outer a b',
      'X1 a b inner R=2k',
      '.subckt inner p n params: R=1',
      'R1 p n {R}',
      '.ends inner',
      '.ends outer',
      '.op',
      '.end',
    ].join('\n');
    const result = await simulate(netlist);
    // ngspice-47 -b: v(1)=2, i(v1)=-1.000000000000000e-03
    expect(result.dc!.voltage('1')).toBeCloseTo(2, 12);
    expect(result.dc!.current('V1')).toBeCloseTo(-1e-3, 15);
  });

  it('does not expand a nested definition body as devices of the enclosing subcircuit', async () => {
    // Without scoping, inner's R1 would also be instantiated in outer.
    const netlist = [
      'nested body is a definition only',
      'V1 1 0 1',
      'X1 1 0 outer',
      '.subckt outer a b',
      'R0 a b 1k',
      '.subckt inner p n',
      'R1 p n 1',
      '.ends inner',
      '.ends outer',
      '.op',
      '.end',
    ].join('\n');
    const result = await simulate(netlist);
    expect(result.dc!.current('V1')).toBeCloseTo(-1e-3, 15);
  });

  it('prefers the nested definition over a top-level one of the same name', async () => {
    const netlist = [
      'nested definition shadows global',
      'V1 1 0 1',
      'X1 1 0 outer',
      'X2 1 0 inner',
      '.subckt inner p n',
      'R1 p n 1k',
      '.ends inner',
      '.subckt outer a b',
      'X1 a b inner',
      '.subckt inner p n',
      'R1 p n 2k',
      '.ends inner',
      '.ends outer',
      '.op',
      '.end',
    ].join('\n');
    const result = await simulate(netlist);
    // 1k (top-level inner) in parallel with 2k (outer's own inner).
    expect(result.dc!.current('V1')).toBeCloseTo(-(1e-3 + 0.5e-3), 15);
  });

  it('keeps a nested definition invisible outside its enclosing subcircuit', async () => {
    const netlist = [
      'nested definition is local',
      'V1 1 0 1',
      'X2 1 0 inner',
      '.subckt outer a b',
      '.subckt inner p n',
      'R1 p n 1k',
      '.ends inner',
      'R0 a b 1k',
      '.ends outer',
      '.op',
      '.end',
    ].join('\n');
    await expect(simulate(netlist)).rejects.toThrow(/Undefined subcircuit 'inner'/);
  });

  it('lets a doubly nested definition see definitions of every enclosing level', async () => {
    const netlist = [
      'two-level nesting',
      'V1 1 0 1',
      'X1 1 0 top',
      '.subckt top a b',
      '.subckt leaf p n',
      'R1 p n 4k',
      '.ends leaf',
      '.subckt mid p n',
      'X1 p n leaf',
      'X2 p n leaf',
      '.ends mid',
      'X1 a b mid',
      '.ends top',
      '.op',
      '.end',
    ].join('\n');
    const result = await simulate(netlist);
    expect(result.dc!.current('V1')).toBeCloseTo(-0.5e-3, 15);
  });
});
