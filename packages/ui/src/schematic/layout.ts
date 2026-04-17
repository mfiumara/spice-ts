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
 * Assign vertical ranks to nodes by longest path from ground in a mixed graph.
 *
 * 1. BFS distance from ground through the undirected component graph.
 * 2. Orient each undirected edge from the node closer to ground toward the one
 *    farther away (lexicographic tiebreak for equal distance), so every edge
 *    contributes rank separation.
 * 3. Override with known polarity (V/I: + above −, MOSFET: drain above source,
 *    BJT: collector above emitter, E/G: outP above outN) — reversing the
 *    oriented edge if necessary.
 * 4. Longest path from ground in the resulting DAG via Bellman–Ford relaxation.
 *
 * Ground = rank 0 (bottom of schematic, highest Y).
 * Higher rank = higher potential = top of schematic (lowest Y).
 */
function rankNodes(circuit: CircuitIR): Map<string, number> {
  const GND = '0';

  const allNets = new Set<string>();
  for (const comp of circuit.components) {
    for (const p of comp.ports) allNets.add(p.net);
  }
  allNets.add(GND);

  // Gather edges. Every component contributes an undirected edge between its
  // two primary endpoints; components with known polarity also contribute a
  // directed high→low constraint.
  const undirectedPairs: Array<[string, string]> = [];
  const directedHighLow: Array<[string, string]> = [];

  for (const comp of circuit.components) {
    const [a, b] = componentEndpoints(comp);
    if (a !== b) undirectedPairs.push([a, b]);

    let high: string | null = null, low: string | null = null;
    switch (comp.type) {
      case 'V': case 'I':
        high = comp.ports[0].net; low = comp.ports[1].net; break;
      case 'M':
        high = comp.ports[0].net; low = comp.ports[2].net; break;
      case 'Q':
        high = comp.ports[0].net; low = comp.ports[2].net; break;
      case 'E': case 'G':
        high = comp.ports[2].net; low = comp.ports[3].net; break;
      // D, R, L, C, F, H, X: undirected only
    }
    if (high !== null && low !== null && high !== low) {
      directedHighLow.push([high, low]);
    }
  }

  // Undirected adjacency for BFS.
  const undirected = new Map<string, Set<string>>();
  for (const n of allNets) undirected.set(n, new Set());
  for (const [a, b] of undirectedPairs) {
    undirected.get(a)!.add(b);
    undirected.get(b)!.add(a);
  }

  // Step 1: BFS distance from ground through undirected graph.
  const dist = new Map<string, number>();
  for (const n of allNets) dist.set(n, Infinity);
  dist.set(GND, 0);
  const bfs: string[] = [GND];
  while (bfs.length > 0) {
    const node = bfs.shift()!;
    const d = dist.get(node)!;
    for (const neighbor of undirected.get(node)!) {
      if (dist.get(neighbor)! > d + 1) {
        dist.set(neighbor, d + 1);
        bfs.push(neighbor);
      }
    }
  }
  // Isolated nets (no path to ground) get a small positive distance so
  // longest-path relaxation still places them above ground.
  for (const n of allNets) {
    if (dist.get(n) === Infinity) dist.set(n, 1);
  }

  // Step 2: Build DAG by orienting each undirected edge from lower to higher
  // BFS distance. Equal distances use lexicographic tiebreak.
  const dagFrom = new Map<string, Set<string>>();
  for (const n of allNets) dagFrom.set(n, new Set());
  for (const [a, b] of undirectedPairs) {
    const da = dist.get(a)!, db = dist.get(b)!;
    let lo: string, hi: string;
    if (da < db) { lo = a; hi = b; }
    else if (db < da) { lo = b; hi = a; }
    else { [lo, hi] = a < b ? [a, b] : [b, a]; }
    dagFrom.get(lo)!.add(hi);
  }

  // Step 3: Apply directed polarity. For each high→low pair, ensure the edge
  // runs low→high in the DAG (reverse the existing edge if needed).
  for (const [high, low] of directedHighLow) {
    dagFrom.get(high)?.delete(low);
    dagFrom.get(low)?.add(high);
  }

  // Step 4: Longest path from ground via Bellman–Ford-style relaxation.
  const rank = new Map<string, number>();
  for (const n of allNets) rank.set(n, 0);

  const maxIter = allNets.size * 2 + 1;
  for (let i = 0; i < maxIter; i++) {
    let changed = false;
    for (const [from, tos] of dagFrom) {
      const fromRank = rank.get(from)!;
      for (const to of tos) {
        if (fromRank + 1 > rank.get(to)!) {
          rank.set(to, fromRank + 1);
          changed = true;
        }
      }
    }
    if (!changed) break;
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

  // Route each net: connect all pins with orthogonal segments.
  // Each net has a dedicated horizontal bus at its rank Y; when several nets
  // share a rank, they are fanned out around the base Y so their buses don't
  // render on the same pixel row.
  const CORRIDOR_OFFSET = GRID * 0.4;

  const netsByRank = new Map<number, string[]>();
  for (const net of netPins.keys()) {
    if (net === '0') continue;
    const r = nodeRanks.get(net) ?? 0;
    if (!netsByRank.has(r)) netsByRank.set(r, []);
    netsByRank.get(r)!.push(net);
  }
  const netBusY = new Map<string, number>();
  for (const [r, nets] of netsByRank) {
    const baseY = MARGIN + (maxRank - r) * RANK_SPACING;
    nets.sort();
    nets.forEach((net, i) => {
      const offset = (i - (nets.length - 1) / 2) * CORRIDOR_OFFSET;
      netBusY.set(net, baseY + offset);
    });
  }

  for (const [net, pins] of netPins) {
    if (net === '0' || pins.length < 2) continue;
    const segments: { x1: number; y1: number; x2: number; y2: number }[] = [];

    const busY = netBusY.get(net)!;

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
