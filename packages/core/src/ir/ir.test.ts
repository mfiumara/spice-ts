import { describe, it, expect } from 'vitest';
import type { CircuitIR, IRComponent, IRPort, ComponentType } from './types.js';

describe('IR types', () => {
  it('should construct a valid circuit', () => {
    const circuit: CircuitIR = {
      components: [
        {
          type: 'R' as ComponentType,
          id: 'R1',
          name: 'R1',
          ports: [
            { name: 'p', net: '1' },
            { name: 'n', net: '0' },
          ],
          params: { resistance: 1000 },
          displayValue: '1k',
        },
        {
          type: 'V' as ComponentType,
          id: 'V1',
          name: 'V1',
          ports: [
            { name: 'p', net: '1' },
            { name: 'n', net: '0' },
          ],
          params: { waveform: 'dc', dc: 5 },
          displayValue: 'DC 5',
        },
      ],
      nets: ['1'],
    };

    expect(circuit.components).toHaveLength(2);
    expect(circuit.nets).toEqual(['1']);
    expect(circuit.components[0].ports[0].name).toBe('p');
  });

  it('should construct MOSFET with named ports', () => {
    const mosfet: IRComponent = {
      type: 'M',
      id: 'M1',
      name: 'M1',
      ports: [
        { name: 'drain', net: 'vdd' },
        { name: 'gate', net: 'in' },
        { name: 'source', net: '0' },
      ],
      params: { modelName: 'NMOD', channelType: 'n', W: 10e-6, L: 1e-6 },
    };

    expect(mosfet.ports.find(p => p.name === 'gate')?.net).toBe('in');
    expect(mosfet.params.channelType).toBe('n');
  });
});
