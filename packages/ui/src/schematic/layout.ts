import type { CircuitIR, IRComponent, SchematicLayout, PlacedComponent, Wire, Junction, Pin } from './types.js';
import { getSymbol, GRID } from './symbols.js';

const RANK_SPACING = GRID * 4;   // vertical distance between node ranks
const SLOT_SPACING = GRID * 5;   // horizontal distance between component slots
const MARGIN = GRID * 2;

/* ------------------------------------------------------------------ */
/*  Step 1: Build node graph                                          */
/* ------------------------------------------------------------------ */

interface NodeInfo {
  net: string;
  rank: number;
  components: IRComponent[]; // components that touch this node
}

/** Get the two primary nodes a component connects (ignoring ground duplicates). */
function componentEndpoints(comp: IRComponent): [string, string] {
  const nets = comp.ports.map(p => p.net);
  // For 2-terminal: straightforward
  if (nets.length === 2) return [nets[0], nets[1]];
  // For MOSFET: primary path is drain→source
  if (comp.type === 'M') return [nets[0], nets[2]]; // drain, source
  // For BJT: primary path is collector→emitter
  if (comp.type === 'Q') return [nets[0], nets[2]]; // collector, emitter
  // For E/G (opamp): output path is outP→outN (ports 2,3)
  if (comp.type === 'E' || comp.type === 'G') return [nets[2], nets[3]];
  // For diode: anode→cathode
  if (comp.type === 'D') return [nets[0], nets[1]];
  // Fallback: first and last
  return [nets[0], nets[nets.length - 1]];
}

/* ------------------------------------------------------------------ */
/*  Step 2: Rank nodes by voltage potential                           */
/* ------------------------------------------------------------------ */

/**
 * Assign vertical ranks to nodes using directed longest-path from ground.
 *
 * Uses component-type-aware directed edges (drain→source for MOSFET,
 * anode→cathode for diode, pos→neg for sources) to build a DAG, then
 * computes the longest path from ground to each node. This gives proper
 * intermediate ranks (e.g., sw between in and 0 in a buck converter).
 *
 * Ground = rank 0 (bottom of schematic, highest Y).
 * Higher rank = higher potential = top of schematic (lowest Y).
 */
function rankNodes(circuit: CircuitIR): Map<string, number> {
  const GND = '0';

  // Collect all unique nets
  const allNets = new Set<string>();
  for (const comp of circuit.components) {
    for (const p of comp.ports) allNets.add(p.net);
  }

  // Build directed adjacency: highNet → lowNet edges (current flow direction)
  // Also keep undirected for fallback connectivity
  const directedDown = new Map<string, Set<string>>(); // high → low
  const directedUp = new Map<string, Set<string>>();   // low → high
  const undirected = new Map<string, Set<string>>();
  for (const n of allNets) {
    directedDown.set(n, new Set());
    directedUp.set(n, new Set());
    undirected.set(n, new Set());
  }

  for (const comp of circuit.components) {
    const [a, b] = componentEndpoints(comp);
    undirected.get(a)!.add(b);
    undirected.get(b)!.add(a);

    // Only add directed edges for components with known polarity.
    // Passive components (R, L, C) are undirected — we don't know voltage direction.
    let high: string | null = null, low: string | null = null;
    switch (comp.type) {
      case 'V': case 'I':
        high = comp.ports[0].net; // positive terminal
        low = comp.ports[1].net;  // negative terminal
        break;
      case 'M':
        high = comp.ports[0].net; // drain
        low = comp.ports[2].net;  // source
        break;
      case 'Q':
        high = comp.ports[0].net; // collector
        low = comp.ports[2].net;  // emitter
        break;
      // D (diode): polarity depends on circuit context (forward vs freewheeling).
      // Treat as undirected — let other directed edges determine rank ordering.
      case 'E': case 'G':
        high = comp.ports[2].net; // outP
        low = comp.ports[3].net;  // outN
        break;
      // R, L, C, F, H, X: no directed edge — undirected only
    }

    if (high !== null && low !== null) {
      directedDown.get(high)!.add(low);
      directedUp.get(low)!.add(high);
    }
  }

  // Longest path from ground upward using directed edges
  // Use iterative relaxation (Bellman-Ford style for longest path in DAG)
  const rank = new Map<string, number>();
  for (const n of allNets) rank.set(n, -1);
  rank.set(GND, 0);

  // Relaxation: repeatedly update ranks via directed-up edges
  let changed = true;
  let iterations = 0;
  while (changed && iterations < allNets.size + 1) {
    changed = false;
    for (const [node, currentRank] of rank) {
      if (currentRank < 0) continue;
      // Follow edges upward: neighbors that are at higher potential
      for (const higher of directedUp.get(node) ?? []) {
        const newRank = currentRank + 1;
        if (newRank > (rank.get(higher) ?? -1)) {
          rank.set(higher, newRank);
          changed = true;
        }
      }
    }
    iterations++;
  }

  // Fallback: unranked nodes connected via undirected edges (R, L, C)
  // get the SAME rank as their ranked neighbor — they're at similar potential.
  const queue = [...allNets].filter(n => (rank.get(n) ?? -1) >= 0);
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentRank = rank.get(current)!;
    for (const neighbor of undirected.get(current) ?? []) {
      if ((rank.get(neighbor) ?? -1) < 0) {
        rank.set(neighbor, currentRank); // same rank, not +1
        queue.push(neighbor);
      }
    }
  }

  // Final fallback: truly disconnected nodes
  for (const n of allNets) {
    if ((rank.get(n) ?? -1) < 0) rank.set(n, 1);
  }

  return rank;
}

/* ------------------------------------------------------------------ */
/*  Step 3: Place components between their ranked nodes               */
/* ------------------------------------------------------------------ */

interface Placement {
  comp: IRComponent;
  col: number;   // horizontal slot
  topRank: number;    // higher-potential node rank
  bottomRank: number; // lower-potential node rank
}

function placeComponents(circuit: CircuitIR, nodeRanks: Map<string, number>): Placement[] {
  const placements: Placement[] = [];

  // Group components by which pair of ranks they span
  const spanGroups = new Map<string, IRComponent[]>();

  for (const comp of circuit.components) {
    const [netA, netB] = componentEndpoints(comp);
    const rankA = nodeRanks.get(netA) ?? 0;
    const rankB = nodeRanks.get(netB) ?? 0;
    const topRank = Math.max(rankA, rankB);
    const bottomRank = Math.min(rankA, rankB);
    const key = `${topRank}-${bottomRank}`;

    if (!spanGroups.has(key)) spanGroups.set(key, []);
    spanGroups.get(key)!.push(comp);
  }

  // Assign columns within each span group
  for (const [key, comps] of spanGroups) {
    const [topRank, bottomRank] = key.split('-').map(Number);
    comps.forEach((comp, i) => {
      placements.push({ comp, col: i, topRank, bottomRank });
    });
  }

  return placements;
}

/* ------------------------------------------------------------------ */
/*  Step 4: Convert to pixel positions + route wires                  */
/* ------------------------------------------------------------------ */

export function layoutSchematic(circuit: CircuitIR): SchematicLayout {
  if (circuit.components.length === 0) {
    return { components: [], wires: [], junctions: [], bounds: { width: 0, height: 0 } };
  }

  // --- Node ranking ---
  const nodeRanks = rankNodes(circuit);
  const maxRank = Math.max(...nodeRanks.values());

  // --- Component placement ---
  const placements = placeComponents(circuit, nodeRanks);

  // Compute the global column count per span group to avoid overlap
  // We need to assign absolute X positions so components don't collide
  // Strategy: lay out all components left-to-right, grouped by their span
  const spanCols = new Map<string, number>(); // span key → starting absolute column
  let nextAbsCol = 0;

  // Sort span groups: prioritize spans that include higher ranks (appear more to the left)
  const spanKeys = [...new Set(placements.map(p => `${p.topRank}-${p.bottomRank}`))];
  spanKeys.sort((a, b) => {
    const [aTop] = a.split('-').map(Number);
    const [bTop] = b.split('-').map(Number);
    return bTop - aTop; // higher rank first
  });

  for (const key of spanKeys) {
    const count = placements.filter(p => `${p.topRank}-${p.bottomRank}` === key).length;
    spanCols.set(key, nextAbsCol);
    nextAbsCol += count;
  }

  // --- Pixel positions ---
  const placedComponents: PlacedComponent[] = [];

  for (const pl of placements) {
    const { comp, col, topRank, bottomRank } = pl;
    const spanKey = `${topRank}-${bottomRank}`;
    const absCol = (spanCols.get(spanKey) ?? 0) + col;

    const symbol = getSymbol(comp.type, comp.displayValue ?? '');
    const nets = comp.ports.map(p => p.net);

    // Y position: center the component between its top and bottom rank rails
    // Ranks are inverted for display: highest rank = top of screen (lowest Y)
    const topY = MARGIN + (maxRank - topRank) * RANK_SPACING;
    const bottomY = MARGIN + (maxRank - bottomRank) * RANK_SPACING;
    const centerY = (topY + bottomY) / 2;

    // X position based on absolute column
    const x = MARGIN + absCol * SLOT_SPACING;
    const y = centerY - symbol.height / 2;

    // Map pins: symbol pins get assigned to component port nets
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

  // --- Wire routing ---
  // Collect all pins per net
  const wires: Wire[] = [];
  const netPins = new Map<string, { x: number; y: number }[]>();

  for (const pc of placedComponents) {
    for (const pin of pc.pins) {
      if (!netPins.has(pin.net)) netPins.set(pin.net, []);
      netPins.get(pin.net)!.push({ x: pin.x, y: pin.y });
    }
  }

  // Route each net: connect all pins with orthogonal segments
  // Use a shared horizontal bus at the net's rank Y, then vertical drops to each pin
  const CORRIDOR_OFFSET = GRID * 0.4;

  for (const [net, pins] of netPins) {
    if (net === '0' || pins.length < 2) continue;
    const segments: { x1: number; y1: number; x2: number; y2: number }[] = [];

    // Compute the bus Y for this net (at its rank level)
    const netRank = nodeRanks.get(net) ?? 0;
    const busY = MARGIN + (maxRank - netRank) * RANK_SPACING;

    const sorted = [...pins].sort((a, b) => a.x - b.x || a.y - b.y);

    // Check if all pins are already at bus Y
    const allOnBus = sorted.every(p => Math.abs(p.y - busY) < 1);

    if (allOnBus) {
      // Simple: horizontal wire through all pins
      for (let i = 0; i < sorted.length - 1; i++) {
        segments.push({ x1: sorted[i].x, y1: busY, x2: sorted[i + 1].x, y2: busY });
      }
    } else {
      // Connect each pin to the bus with a vertical drop, then horizontal bus
      const xs: number[] = [];
      for (const pin of sorted) {
        if (Math.abs(pin.y - busY) > 1) {
          // Vertical segment from pin to bus
          segments.push({ x1: pin.x, y1: pin.y, x2: pin.x, y2: busY });
        }
        xs.push(pin.x);
      }
      // Horizontal bus connecting all drop points
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      if (maxX > minX) {
        segments.push({ x1: minX, y1: busY, x2: maxX, y2: busY });
      }
    }

    wires.push({ net, segments });
  }

  // --- Junctions ---
  const junctions: Junction[] = [];
  const pointCount = new Map<string, number>();
  // Count segment endpoints + T-intersections
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

  // --- Bounds ---
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
