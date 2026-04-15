import type { SchematicGraph, SchematicLayout, PlacedComponent, Wire, Junction, Pin } from './types.js';
import { getSymbol, GRID } from './symbols.js';

const COL_SPACING = GRID * 5;
const ROW_SPACING = GRID * 4;
const MARGIN = GRID * 2;

/**
 * Auto-layout a schematic graph using left-to-right signal flow.
 *
 * 1. Sources (V, I) placed in column 0
 * 2. BFS through nets to place remaining components in subsequent columns
 * 3. Wire routing: orthogonal L-shaped segments connecting pins on the same net
 */
export function layoutSchematic(graph: SchematicGraph): SchematicLayout {
  if (graph.components.length === 0) {
    return { components: [], wires: [], junctions: [], bounds: { width: 0, height: 0 } };
  }

  const sources = graph.components.filter(c => c.type === 'V' || c.type === 'I');
  const others = graph.components.filter(c => c.type !== 'V' && c.type !== 'I');

  // Assign grid positions via BFS from sources
  const placed = new Map<string, { col: number; row: number }>();
  const visited = new Set<string>();

  sources.forEach((s, i) => {
    placed.set(s.name, { col: 0, row: i });
    visited.add(s.name);
  });

  let frontier = [...sources];
  let col = 1;
  while (frontier.length > 0 && visited.size < graph.components.length) {
    const nextFrontier: typeof frontier = [];
    const frontierNets = new Set<string>();
    for (const comp of frontier) {
      for (const n of comp.nodes) {
        if (n !== '0') frontierNets.add(n);
      }
    }
    let row = 0;
    for (const comp of others) {
      if (visited.has(comp.name)) continue;
      const sharesNet = comp.nodes.some(n => n !== '0' && frontierNets.has(n));
      if (sharesNet) {
        placed.set(comp.name, { col, row });
        visited.add(comp.name);
        nextFrontier.push(comp);
        row++;
      }
    }
    frontier = nextFrontier;
    col++;
  }

  // Place any remaining unvisited components
  for (const comp of graph.components) {
    if (!visited.has(comp.name)) {
      placed.set(comp.name, { col, row: 0 });
      col++;
    }
  }

  // Convert to pixel positions.
  // Vertically offset each component so its first non-ground signal pin
  // aligns on a shared horizontal rail per row. This ensures wires between
  // components in the same row are straight horizontal lines.
  const SIGNAL_RAIL_Y = MARGIN + GRID * 2; // baseline for row 0 signal pins
  const placedComponents: PlacedComponent[] = [];

  for (const comp of graph.components) {
    const pos = placed.get(comp.name)!;
    const symbol = getSymbol(comp.type, comp.displayValue);

    const x = MARGIN + pos.col * COL_SPACING;

    // Find the first non-ground pin's dy offset — that pin should sit on the rail
    const signalPinIdx = comp.nodes.findIndex(n => n !== '0');
    const signalPinDy = signalPinIdx >= 0 && signalPinIdx < symbol.pins.length
      ? symbol.pins[signalPinIdx].dy
      : symbol.pins[0].dy;
    const railY = SIGNAL_RAIL_Y + pos.row * ROW_SPACING;
    const y = railY - signalPinDy;

    const pins: Pin[] = symbol.pins.map((p, i) => ({
      net: i < comp.nodes.length ? comp.nodes[i] : '0',
      x: x + p.dx,
      y: y + p.dy,
    }));

    placedComponents.push({
      component: comp,
      x, y, rotation: 0,
      pins,
    });
  }

  // Wire routing
  const wires: Wire[] = [];
  const netPins = new Map<string, { x: number; y: number }[]>();

  for (const pc of placedComponents) {
    for (const pin of pc.pins) {
      if (!netPins.has(pin.net)) netPins.set(pin.net, []);
      netPins.get(pin.net)!.push({ x: pin.x, y: pin.y });
    }
  }

  for (const [net, pins] of netPins) {
    if (net === '0' || pins.length < 2) continue;
    const segments: { x1: number; y1: number; x2: number; y2: number }[] = [];

    const sorted = [...pins].sort((a, b) => a.x - b.x || a.y - b.y);
    for (let i = 0; i < sorted.length - 1; i++) {
      const from = sorted[i];
      const to = sorted[i + 1];
      if (from.y === to.y) {
        segments.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y });
      } else {
        const midX = (from.x + to.x) / 2;
        segments.push({ x1: from.x, y1: from.y, x2: midX, y2: from.y });
        segments.push({ x1: midX, y1: from.y, x2: midX, y2: to.y });
        segments.push({ x1: midX, y1: to.y, x2: to.x, y2: to.y });
      }
    }

    wires.push({ net, segments });
  }

  // Junctions
  const junctions: Junction[] = [];
  const pointCount = new Map<string, number>();
  for (const wire of wires) {
    for (const seg of wire.segments) {
      const k1 = `${seg.x1},${seg.y1}`;
      const k2 = `${seg.x2},${seg.y2}`;
      pointCount.set(k1, (pointCount.get(k1) ?? 0) + 1);
      pointCount.set(k2, (pointCount.get(k2) ?? 0) + 1);
    }
  }
  for (const [key, count] of pointCount) {
    if (count >= 3) {
      const [x, y] = key.split(',').map(Number);
      junctions.push({ x, y });
    }
  }

  // Bounds
  let maxX = 0, maxY = 0;
  for (const pc of placedComponents) {
    const sym = getSymbol(pc.component.type, pc.component.displayValue);
    maxX = Math.max(maxX, pc.x + sym.width);
    maxY = Math.max(maxY, pc.y + sym.height);
  }

  return {
    components: placedComponents,
    wires,
    junctions,
    bounds: { width: maxX + MARGIN, height: maxY + MARGIN },
  };
}
