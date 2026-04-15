import { describe, it, expect } from 'vitest';
import { buildSchematicGraph } from './graph.js';

describe('buildSchematicGraph', () => {
  it('extracts voltage divider', () => {
    const g = buildSchematicGraph(`
      V1 in 0 DC 5
      R1 in out 1k
      R2 out 0 2k
      .op
    `);
    expect(g.components).toHaveLength(3);
    expect(g.components[0]).toEqual({
      type: 'V', name: 'V1', nodes: ['in', '0'], displayValue: 'DC 5',
    });
    expect(g.components[1]).toEqual({
      type: 'R', name: 'R1', nodes: ['in', 'out'], displayValue: '1k',
    });
    expect(g.components[2]).toEqual({
      type: 'R', name: 'R2', nodes: ['out', '0'], displayValue: '2k',
    });
    expect(g.nets).toContain('in');
    expect(g.nets).toContain('out');
    expect(g.nets).not.toContain('0');
  });

  it('extracts RC filter with source waveform', () => {
    const g = buildSchematicGraph(`
      V1 in 0 AC 1
      R1 in out 1k
      C1 out 0 100n
      .ac dec 10 1 10Meg
    `);
    expect(g.components).toHaveLength(3);
    expect(g.components[0].displayValue).toBe('AC 1');
    expect(g.components[2]).toEqual({
      type: 'C', name: 'C1', nodes: ['out', '0'], displayValue: '100n',
    });
  });

  it('extracts MOSFET circuit', () => {
    const g = buildSchematicGraph(`
      VDD vdd 0 DC 5
      VGS in 0 DC 1.5
      .model NMOD NMOS(VTO=1 KP=1e-4)
      M1 out in 0 0 NMOD W=100u L=1u
      RD vdd out 10k
      .op
    `);
    expect(g.components.find(c => c.name === 'M1')).toEqual({
      type: 'M', name: 'M1', nodes: ['in', 'out', '0'],
      displayValue: 'NMOD',
    });
  });

  it('skips dot commands and comments', () => {
    const g = buildSchematicGraph(`
      * This is a comment
      V1 1 0 DC 5
      R1 1 0 1k
      .op
      .step param R1 list 1k 10k
      .model DMOD D(IS=1e-14)
    `);
    expect(g.components).toHaveLength(2);
  });

  it('handles empty netlist', () => {
    const g = buildSchematicGraph('');
    expect(g.components).toHaveLength(0);
    expect(g.nets).toHaveLength(0);
  });
});
