import { describe, expect, it } from 'vitest';
import { parse } from '../parser/index.js';
import { mapProtocolErrorV1, simulateProtocolV1 } from './adapter.js';
import type { CircuitComponentV1, SpiceTsCircuitDocumentV1 } from './types.js';

// Issue #690 through protocol v1: Circuit.toIR() emits params.m for I sources,
// so the native CircuitIR adapter must apply it (ngspice-47 isrcload.c scales by
// ISRCmValue) and must reject m on V sources like the SPICE parser does
// (ngspice-47 vsrc: "unknown parameter (m)").

const ISSUE_DECK = ['mtest', 'V1 1 0 DC 3', 'R1 1 3 1k', 'R2 3 0 2k', 'I2 0 3 DC 1m m=2', '.op', '.end'].join('\n');

function opDocument(components: CircuitComponentV1[], subcircuits: SpiceTsCircuitDocumentV1['subcircuits'] = []): SpiceTsCircuitDocumentV1 {
  const nets = [...new Set(components.flatMap(component => component.ports.map(port => port.net)))];
  return {
    format: 'spice-ts', schemaVersion: '1.0', circuit: { components, nets },
    analyses: [{ type: 'op' }], models: [], subcircuits,
  };
}

async function opVoltage(document: SpiceTsCircuitDocumentV1, node: string): Promise<number | undefined> {
  const result = await simulateProtocolV1({ apiVersion: '1', input: { format: 'spice-ts', document } });
  const op = result.analyses[0];
  if (op?.type !== 'op') throw new Error('expected op result');
  return op.voltagesV[node];
}

async function protocolError(document: SpiceTsCircuitDocumentV1): Promise<ReturnType<typeof mapProtocolErrorV1>> {
  try {
    await simulateProtocolV1({ apiVersion: '1', input: { format: 'spice-ts', document } });
  } catch (error) {
    return mapProtocolErrorV1(error);
  }
  throw new Error('expected simulateProtocolV1 to reject');
}

const resistor = (name: string, p: string, n: string, resistance: number): CircuitComponentV1 => ({
  type: 'R', id: name, name, ports: [{ name: 'p', net: p }, { name: 'n', net: n }], params: { resistance },
});

describe('protocol v1 current source m= multiplier (#690)', () => {
  it('round-trips the issue deck through toIR and applies m (ngspice-47 v(3)=3.333333)', async () => {
    const circuit = parse(ISSUE_DECK);
    const document: SpiceTsCircuitDocumentV1 = {
      format: 'spice-ts', schemaVersion: '1.0', circuit: circuit.toIR(),
      analyses: [{ type: 'op' }], models: [], subcircuits: [],
    };
    expect(document.circuit.components.find(component => component.name === 'I2')?.params.m).toBe(2);

    expect(await opVoltage(document, '3')).toBeCloseTo(3.333333, 6);
  });

  it('applies m to current sources inside protocol subcircuit bodies', async () => {
    // ngspice-47: .subckt cs n / I1 0 n DC 1m m=4 / .ends + R 1k from n to 0 -> v(n)=4.
    const document = opDocument(
      [
        { type: 'X', id: 'X1', name: 'X1', ports: [{ name: 'n', net: 'n' }], params: {}, subcircuit: 'cs' },
        resistor('R1', 'n', '0', 1000),
      ],
      [{
        name: 'cs', ports: ['n'],
        components: [{
          type: 'I', id: 'I1', name: 'I1', ports: [{ name: 'p', net: '0' }, { name: 'n', net: 'n' }],
          params: { waveform: 'dc', dc: 1e-3, m: 4 },
        }],
      }],
    );

    expect(await opVoltage(document, 'n')).toBeCloseTo(4, 6);
  });

  it('rejects a non-numeric I-source m as INVALID_CIRCUIT', async () => {
    const document = opDocument([
      { type: 'I', id: 'I1', name: 'I1', ports: [{ name: 'p', net: '0' }, { name: 'n', net: 'n' }], params: { waveform: 'dc', dc: 1e-3, m: 'two' } },
      resistor('R1', 'n', '0', 1000),
    ]);

    expect(await protocolError(document)).toMatchObject({ code: 'INVALID_CIRCUIT' });
  });

  it('rejects m on a V source as INVALID_CIRCUIT like the SPICE parser', async () => {
    const document = opDocument([
      { type: 'V', id: 'V1', name: 'V1', ports: [{ name: 'p', net: 'a' }, { name: 'n', net: '0' }], params: { waveform: 'dc', dc: 1, m: 2 } },
      resistor('R1', 'a', '0', 1000),
    ]);

    const error = await protocolError(document);
    expect(error).toMatchObject({ code: 'INVALID_CIRCUIT' });
    expect(error.message).toMatch(/\bm\b/);
  });
});
