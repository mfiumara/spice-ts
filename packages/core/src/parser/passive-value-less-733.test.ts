import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';
import { parse } from './index.js';

// ngspice-47 src/spicelib/parser/inp2l.c and inp2c.c: after reading the
// instance name and both nodes, an empty rest of line prints
// "Warning: '<line>' is not a valid inductor|capacitor instance line, ignored!"
// and returns before the instance (or its nodes) is created. A card with a
// model name, a value, or any parameter after the nodes is kept.

const inductorDeck = `value-less L dropped
V1 in 0 DC 1
R1 in 1 1k
L1 1 0
R2 1 0 1k
.op
.end`;

const capacitorDeck = `value-less C dropped
I1 0 1 DC 1m
R1 1 0 1k
C1 1 0
.tran 1u 10u
.end`;

function deviceNames(netlist: string): string[] {
  return parse(netlist).compile().devices.map(device => device.name);
}

describe('#733 value-less L/C cards are dropped with a warning like ngspice-47', () => {
  it('drops an L card with only two nodes and reports it', async () => {
    const circuit = parse(inductorDeck);
    expect(circuit.compile().devices.map(device => device.name)).toEqual(['V1', 'R1', 'R2']);
    expect(circuit.parseWarnings).toEqual([
      "'L1 1 0' is not a valid inductor instance line, ignored! (line 4)",
    ]);

    // ngspice-47 -b on these bytes: V(1) = 5.000000e-01 (no 0 H short to ground).
    const result = await simulate(inductorDeck);
    expect(result.dc!.voltage('1')).toBeCloseTo(0.5, 12);
    expect(result.warnings).toContainEqual({
      type: 'parse',
      message: "'L1 1 0' is not a valid inductor instance line, ignored! (line 4)",
    });
  });

  it('drops a C card with only two nodes and reports it', async () => {
    const circuit = parse(capacitorDeck);
    expect(circuit.compile().devices.map(device => device.name)).toEqual(['I1', 'R1']);
    expect(circuit.parseWarnings).toEqual([
      "'C1 1 0' is not a valid capacitor instance line, ignored! (line 4)",
    ]);

    // ngspice-47 -b: v(1) = 1 V from the first transient point on (pure 1k load).
    const result = await simulate(capacitorDeck);
    const v1 = result.transient!.voltage('1');
    expect(v1.length).toBeGreaterThan(1);
    for (const value of v1) expect(value).toBeCloseTo(1, 9);
  });

  it('drops an L card with a single node', async () => {
    const deck = inductorDeck.replace('L1 1 0', 'L1 1');
    expect(deviceNames(deck)).toEqual(['V1', 'R1', 'R2']);
    const result = await simulate(deck);
    expect(result.dc!.voltage('1')).toBeCloseTo(0.5, 12);
    expect(result.warnings).toContainEqual({
      type: 'parse',
      message: "'L1 1' is not a valid inductor instance line, ignored! (line 4)",
    });
  });

  it('drops a value-less L card inside a subcircuit', async () => {
    const deck = `value-less L in subckt
.subckt s a b
L1 a b
R1 a b 1k
.ends
V1 in 0 DC 1
R1 in 1 1k
X1 1 0 s
.op
.end`;
    // ngspice-47: "Warning: 'l.x1.l1 1 0 ' is not a valid inductor instance line, ignored!", V(1) = 0.5.
    const circuit = parse(deck);
    expect(circuit.compile().devices.map(device => device.name)).not.toContain('X1.L1');
    expect(circuit.parseWarnings).toEqual([
      "'X1.L1 1 0' is not a valid inductor instance line, ignored!",
    ]);
    const result = await simulate(deck);
    expect(result.dc!.voltage('1')).toBeCloseTo(0.5, 12);
  });

  it('keeps value, value-assignment, model and parameter forms ngspice accepts', () => {
    const kept = `kept forms
V1 1 0 DC 1
R1 1 2 1k
L1 2 0 1u
L2 2 0 L=2u
L3 2 0 LMOD
C1 2 0 1p
C2 2 0 C=2p
C3 2 0 CMOD
.model LMOD L(IND=3u)
.model CMOD C(CAP=3p)
.op
.end`;
    const circuit = parse(kept);
    expect(circuit.compile().devices.map(device => device.name)).toEqual([
      'V1', 'R1', 'L1', 'L2', 'L3', 'C1', 'C2', 'C3',
    ]);
    expect(circuit.parseWarnings).toEqual([]);
  });
});
