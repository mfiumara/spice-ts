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
 * Falls back to any non-ground pin if the preferred pin is ground.
 */
function alignmentPinIndex(comp: IRComponent, nets: string[]): number {
  // Preferred input pin indices per device type
  const preferred: number[] = [];
  switch (comp.type) {
    case 'M': preferred.push(1); break; // gate
    case 'Q': preferred.push(1); break; // base
    case 'E': case 'G': preferred.push(0, 1); break; // ctrlP, ctrlN
  }

  // Try preferred pins first, fall back to any non-ground
  for (const idx of preferred) {
    if (idx < nets.length && nets[idx] !== '0') return idx;
  }
  const fallback = nets.findIndex(n => n !== '0');
  return fallback >= 0 ? fallback : 0;
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

  // Build a map from each non-ground net to the source row that owns it,
  // so non-source components can be placed on the same row as their source.
  const netToSourceRow = new Map<string, number>();
  sources.forEach((s, i) => {
    placed.set(s.id, { col: 0, row: i });
    visited.add(s.id);
    for (const n of componentNets(s)) {
      if (n !== '0' && !netToSourceRow.has(n)) netToSourceRow.set(n, i);
    }
  });

  let frontier = [...sources];
  let col = 1;
  let nextFreeRow = sources.length; // for components that don't match any source row

  while (frontier.length > 0 && visited.size < circuit.components.length) {
    const nextFrontier: typeof frontier = [];
    const frontierNets = new Set<string>();
    for (const comp of frontier) {
      for (const n of componentNets(comp)) {
        if (n !== '0') frontierNets.add(n);
      }
    }

    // Track which rows are taken in this column
    const rowsTaken = new Set<number>();

    // Place components that match the frontier, assigning rows based on
    // which source they connect to (so related components share a row).
    const toPlace: { comp: IRComponent; inputMatch: boolean }[] = [];

    for (const comp of others) {
      if (visited.has(comp.id)) continue;
      const inNets = inputNets(comp);
      const allNets = componentNets(comp);
      const matchesInput = [...inNets].some(n => frontierNets.has(n));
      const sharesAny = allNets.some(n => n !== '0' && frontierNets.has(n));
      if (matchesInput) {
        toPlace.push({ comp, inputMatch: true });
      } else if (sharesAny) {
        toPlace.push({ comp, inputMatch: false });
      }
    }

    // Sort: input-match first (signal flow priority)
    toPlace.sort((a, b) => (b.inputMatch ? 1 : 0) - (a.inputMatch ? 1 : 0));

    for (const { comp } of toPlace) {
      // Find the best row: prefer the row of a source this component connects to
      const allNets = componentNets(comp);
      let bestRow = -1;
      for (const n of allNets) {
        if (n !== '0' && netToSourceRow.has(n)) {
          const srcRow = netToSourceRow.get(n)!;
          if (!rowsTaken.has(srcRow)) {
            bestRow = srcRow;
            break;
          }
        }
      }
      if (bestRow < 0) {
        // No source row available — use next free row
        while (rowsTaken.has(nextFreeRow)) nextFreeRow++;
        bestRow = nextFreeRow;
        nextFreeRow++;
      }

      placed.set(comp.id, { col, row: bestRow });
      visited.add(comp.id);
      rowsTaken.add(bestRow);
      nextFrontier.push(comp);

      // Propagate: this component's nets also belong to its row
      for (const n of allNets) {
        if (n !== '0' && !netToSourceRow.has(n)) {
          netToSourceRow.set(n, bestRow);
        }
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

  const CORRIDOR_OFFSET = GRID * 0.4;
  const corridorMap = new Map<string, number>();

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
        const colKey = `${Math.round(from.x / COL_SPACING)}-${Math.round(to.x / COL_SPACING)}`;
        const offsetIdx = corridorMap.get(colKey) ?? 0;
        corridorMap.set(colKey, offsetIdx + 1);
        const midX = (from.x + to.x) / 2 + (offsetIdx - 0.5) * CORRIDOR_OFFSET;

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
