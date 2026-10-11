import { describe, expect, it } from 'vitest';
import { parse, simulate } from './index.js';

const nested = `Global supplies through nested instances
.global supply
V1 supply 0 10
.subckt leaf out
R1 supply out 1k
R2 out 0 1k
.ends
.subckt wrapper out
Xinner out leaf
.ends
Xone a wrapper
Xtwo b wrapper
.op
.end`;

const collision = `Global name takes precedence over formal port
.global supply
V1 supply 0 10
V2 local 0 2
.subckt divider supply out
R1 supply out 1k
R2 out 0 1k
.ends
X1 local out divider
.op
.end`;

describe('.global nodes', () => {
  it('shares supplies through nested instances without creating local copies', async () => {
    const circuit = parse(nested);
    expect(circuit.compile().nodeNames).toEqual(['a', 'b', 'supply']);
    const result = await simulate(nested);
    expect(result.dc!.voltage('a')).toBeCloseTo(5, 8);
    expect(result.dc!.voltage('b')).toBeCloseTo(5, 8);
  });

  it('gives global nodes precedence over colliding formal ports', async () => {
    const result = await simulate(collision);
    expect(result.dc!.voltage('out')).toBeCloseTo(5, 8);
    expect(result.dc!.voltage('local')).toBeCloseTo(2, 8);
  });

  it('does not allocate an actual port node that a global overrides', async () => {
    const deck = collision.replace('V2 local 0 2\n', '');
    const circuit = parse(deck);
    expect(circuit.compile().nodeNames).toEqual(['out', 'supply']);
    expect((await simulate(deck)).dc!.voltage('out')).toBeCloseTo(5, 8);
  });

  it('accumulates declarations, ignores duplicates and does not allocate unused globals', () => {
    const circuit = parse('Globals\n.global supply unused 0\n.global supply\nV1 supply 0 1\n.op');
    expect(circuit.globalNodes).toEqual(['supply', 'unused']);
    expect(circuit.compile().nodeNames).toEqual(['supply']);
    expect(parse(circuit.toNetlist()).globalNodes).toEqual(['supply', 'unused']);
  });

  it('ignores declarations inside unused subcircuits, as ngspice does', async () => {
    const deck = nested.replace('.global supply', '');
    const withDeclaration = deck.replace('.op', '.subckt unused p\n.global supply\n.ends\n.op');
    expect((await simulate(withDeclaration)).dc!.voltage('a')).toBe(0);
  });

  it('collects declarations from reachable nested subcircuits before mapping any nodes', async () => {
    const deck = nested.replace('.global supply\n', '').replace('.subckt leaf out', '.subckt leaf out\n.global supply');
    expect((await simulate(deck)).dc!.voltage('a')).toBeCloseTo(5, 8);
  });

  it('resolves mixed-case global references at top level and inside subcircuits', async () => {
    const deck = nested.replace('.global supply', '.GLOBAL SUPPLY').replace('R1 supply', 'R1 Supply');
    const circuit = parse(deck);
    expect(circuit.compile().nodeNames).toHaveLength(3);
    expect((await simulate(deck)).dc!.voltage('a')).toBeCloseTo(5, 8);
  });

  it('does not make undeclared internal nodes global', async () => {
    const deck = `Local nodes remain local
.global unused
.subckt divider in out
R1 in mid 1k
R2 mid out 1k
.ends
V1 in 0 10
X1 in a divider
X2 in b divider
R1 a 0 2k
R2 b 0 6k
.op`;
    const result = await simulate(deck);
    expect(result.dc!.voltage('a')).toBeCloseTo(5, 8);
    expect(result.dc!.voltage('b')).toBeCloseTo(7.5, 8);
  });
});
