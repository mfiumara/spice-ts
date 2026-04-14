import { describe, it, expect } from 'vitest';
import { layoutSchematic } from './layout.js';
import { buildSchematicGraph } from './graph.js';

describe('layoutSchematic', () => {
  it('lays out voltage divider left-to-right', () => {
    const graph = buildSchematicGraph(`
      V1 in 0 DC 5
      R1 in out 1k
      R2 out 0 2k
    `);
    const layout = layoutSchematic(graph);

    expect(layout.components).toHaveLength(3);
    expect(layout.bounds.width).toBeGreaterThan(0);
    expect(layout.bounds.height).toBeGreaterThan(0);

    const v1 = layout.components.find(c => c.component.name === 'V1')!;
    const r1 = layout.components.find(c => c.component.name === 'R1')!;
    const r2 = layout.components.find(c => c.component.name === 'R2')!;
    expect(v1.x).toBeLessThan(r1.x);
    expect(r1.x).toBeLessThanOrEqual(r2.x);
  });

  it('produces wires connecting components on the same net', () => {
    const graph = buildSchematicGraph(`
      V1 in 0 DC 5
      R1 in 0 1k
    `);
    const layout = layoutSchematic(graph);

    expect(layout.wires.length).toBeGreaterThan(0);
    const inWire = layout.wires.find(w => w.net === 'in');
    expect(inWire).toBeDefined();
  });

  it('places ground symbols at bottom', () => {
    const graph = buildSchematicGraph(`
      V1 1 0 DC 5
      R1 1 0 1k
    `);
    const layout = layoutSchematic(graph);

    const v1 = layout.components.find(c => c.component.name === 'V1')!;
    const gndPin = v1.pins.find(p => p.net === '0');
    const sigPin = v1.pins.find(p => p.net === '1');
    if (gndPin && sigPin) {
      expect(gndPin.y).toBeGreaterThanOrEqual(sigPin.y);
    }
  });

  it('handles empty graph', () => {
    const layout = layoutSchematic({ components: [], nets: [] });
    expect(layout.components).toHaveLength(0);
    expect(layout.wires).toHaveLength(0);
    expect(layout.bounds.width).toBe(0);
    expect(layout.bounds.height).toBe(0);
  });
});
