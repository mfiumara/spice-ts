import type { CircuitIR, IRComponent, SchematicLayout, PlacedComponent, Wire, Junction, Pin } from './types.js';
import { getSymbol, GRID } from './symbols.js';

const COL_SPACING = GRID * 5;
const ROW_SPACING = GRID * 4;
const MARGIN = GRID * 2;

/** Extract net names from an IR component's ports. */
function componentNets(comp: IRComponent): string[] {
  return comp.ports.map(p => p.net);
}

/**
 * Get the pin index to use for vertical rail alignment.
 * Multi-terminal devices align by their input pin (gate, base, +in).
 * Two-terminal devices align by the first non-ground pin.
 */
function alignmentPinIndex(comp: IRComponent, nets: string[]): number {
  switch (comp.type) {
    case 'M': return 1; // gate (IR port order: drain=0, gate=1, source=2)
    case 'Q': return 1; // base (IR port order: collector=0, base=1, emitter=2)
    case 'E': case 'G': return 0; // ctrlP / +in (IR port order: ctrlP=0, ctrlN=1, outP=2, outN=3)
    default: {
      const idx = nets.findIndex(n => n !== '0');
      return idx >= 0 ? idx : 0;
    }
  }
}

/**
 * Get the "input" nets for a component — the nets most meaningful for
 * signal-flow column placement.
 */
function inputNets(comp: IRComponent): Set<string> {
  const nets = new Set<string>();
  switch (comp.type) {
    case 'M':
      if (comp.ports[1]?.net !== '0') nets.add(comp.ports[1].net);
      break;
    case 'Q':
      if (comp.ports[1]?.net !== '0') nets.add(comp.ports[1].net);
      break;
    case 'E': case 'G':
      if (comp.ports[0]?.net !== '0') nets.add(comp.ports[0].net);
      if (comp.ports[1]?.net !== '0') nets.add(comp.ports[1].net);
      break;
    default:
      for (const p of comp.ports) {
        if (p.net !== '0') nets.add(p.net);
      }
  }
  if (nets.size === 0) {
    for (const p of comp.ports) {
      if (p.net !== '0') nets.add(p.net);
    }
  }
  return nets;
}

/**
 * Auto-layout a circuit IR using left-to-right signal flow.
 *
 * 1. Sources (V, I) placed in column 0
 * 2. BFS through nets to place remaining components in subsequent columns
 * 3. Wire routing: orthogonal L-shaped segments connecting pins on the same net
 */
export function layoutSchematic(circuit: CircuitIR): SchematicLayout {
  if (circuit.components.length === 0) {
    return { components: [], wires: [], junctions: [], bounds: { width: 0, height: 0 } };
  }

  const sources = circuit.components.filter(c => c.type === 'V' || c.type === 'I');
  const others = circuit.components.filter(c => c.type !== 'V' && c.type !== 'I');

  // Assign grid positions via BFS from sources
  const placed = new Map<string, { col: number; row: number }>();
  const visited = new Set<string>();

  sources.forEach((s, i) => {
    placed.set(s.id, { col: 0, row: i });
    visited.add(s.id);
  });

  let frontier = [...sources];
  let col = 1;
  while (frontier.length > 0 && visited.size < circuit.components.length) {
    const nextFrontier: typeof frontier = [];
    const frontierNets = new Set<string>();
    for (const comp of frontier) {
      for (const n of componentNets(comp)) {
        if (n !== '0') frontierNets.add(n);
      }
    }

    let row = 0;

    // Pass 1: place components whose input nets match frontier (signal flow priority)
    for (const comp of others) {
      if (visited.has(comp.id)) continue;
      const inNets = inputNets(comp);
      const matchesInput = [...inNets].some(n => frontierNets.has(n));
      if (matchesInput) {
        placed.set(comp.id, { col, row });
        visited.add(comp.id);
        nextFrontier.push(comp);
        row++;
      }
    }

    // Pass 2: place remaining components that share any net
    for (const comp of others) {
      if (visited.has(comp.id)) continue;
      const nets = componentNets(comp);
      const sharesNet = nets.some(n => n !== '0' && frontierNets.has(n));
      if (sharesNet) {
        placed.set(comp.id, { col, row });
        visited.add(comp.id);
        nextFrontier.push(comp);
        row++;
      }
    }

    frontier = nextFrontier;
    col++;
  }

  // Place any remaining unvisited components
  for (const comp of circuit.components) {
    if (!visited.has(comp.id)) {
      placed.set(comp.id, { col, row: 0 });
      col++;
    }
  }

  // Convert to pixel positions.
  // Vertically offset each component so its first non-ground signal pin
  // aligns on a shared horizontal rail per row. This ensures wires between
  // components in the same row are straight horizontal lines.
  const SIGNAL_RAIL_Y = MARGIN + GRID * 2; // baseline for row 0 signal pins
  const placedComponents: PlacedComponent[] = [];

  for (const comp of circuit.components) {
    const pos = placed.get(comp.id)!;
    const nets = componentNets(comp);
    const symbol = getSymbol(comp.type, comp.displayValue ?? '');

    const x = MARGIN + pos.col * COL_SPACING;

    // Find the first non-ground pin's dy offset — that pin should sit on the rail
    const alignIdx = alignmentPinIndex(comp, nets);
    const signalPinDy = alignIdx < symbol.pins.length
      ? symbol.pins[alignIdx].dy
      : symbol.pins[0].dy;
    const railY = SIGNAL_RAIL_Y + pos.row * ROW_SPACING;
    const y = railY - signalPinDy;

    const pins: Pin[] = symbol.pins.map((p, i) => ({
      net: i < nets.length ? nets[i] : '0',
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
    const sym = getSymbol(pc.component.type, pc.component.displayValue ?? '');
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
