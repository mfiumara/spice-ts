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

  // --- Rank-preservation via DC-loop analysis ---------------------------
  // A resistor or inductor has no DC voltage drop when no DC current flows
  // through it — i.e., when it's terminated by a capacitor or an opamp input
  // rather than by a path back to the same supply. Detect this by checking
  // whether the endpoints stay connected in the graph of DC-conductive
  // components after the R/L is removed. If they do, current can flow and the
  // component differentiates ranks; if they don't, the component is a
  // "signal-chain" hop whose endpoints are at the same DC potential and
  // should share a rank.
  const DC_TYPES = new Set(['V', 'I', 'R', 'L', 'M', 'Q', 'E', 'G', 'F', 'H']);
  const dcEdges: Array<{ id: string; a: string; b: string }> = [];
  for (const comp of circuit.components) {
    if (!DC_TYPES.has(comp.type)) continue;
    const [a, b] = componentEndpoints(comp);
    if (a !== b) dcEdges.push({ id: comp.id, a, b });
  }

  const dcConnectedSkipping = (skip: string, from: string, to: string): boolean => {
    if (from === to) return true;
    const visited = new Set<string>([from]);
    const queue = [from];
    while (queue.length > 0) {
      const node = queue.shift()!;
      for (const e of dcEdges) {
        if (e.id === skip) continue;
        const other = e.a === node ? e.b : e.b === node ? e.a : null;
        if (other === null || visited.has(other)) continue;
        if (other === to) return true;
        visited.add(other);
        queue.push(other);
      }
    }
    return false;
  };

  const rankPreserving = new Set<string>();
  for (const comp of circuit.components) {
    if (comp.type !== 'R' && comp.type !== 'L') continue;
    const [a, b] = componentEndpoints(comp);
    if (a === b) continue;
    if (!dcConnectedSkipping(comp.id, a, b)) rankPreserving.add(comp.id);
  }

  // --- Union-find: merge nets joined by rank-preserving R/L ------------
  const parent = new Map<string, string>();
  for (const n of allNets) parent.set(n, n);
  const find = (n: string): string => {
    let r = n;
    while (parent.get(r)! !== r) r = parent.get(r)!;
    let cur = n;
    while (parent.get(cur)! !== r) {
      const next = parent.get(cur)!;
      parent.set(cur, r);
      cur = next;
    }
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a), rb = find(b);
    if (ra === rb) return;
    // Prefer ground as the set root so GND stays at rank 0.
    if (ra === GND) parent.set(rb, ra);
    else if (rb === GND) parent.set(ra, rb);
    else parent.set(ra, rb);
  };
  for (const comp of circuit.components) {
    if (!rankPreserving.has(comp.id)) continue;
    const [a, b] = componentEndpoints(comp);
    if (a !== b) union(a, b);
  }

  // --- Edge collection at set level -----------------------------------
  // Non-source components contribute an undirected edge (between set
  // representatives) used for BFS distance. Rank-preserving R/L are already
  // collapsed via union-find, so their edges are self-loops and dropped.
  // Source components (V/I/E/G/F/H) contribute only a directed polarity
  // constraint; their terminals define the voltage hierarchy rather than a
  // hop in the signal chain.
  const SOURCE_TYPES = new Set(['V', 'I', 'E', 'G', 'F', 'H']);
  const undirectedPairs: Array<[string, string]> = [];
  const directedHighLow: Array<[string, string]> = [];

  for (const comp of circuit.components) {
    const [a, b] = componentEndpoints(comp);
    const sa = find(a), sb = find(b);
    if (sa !== sb && !SOURCE_TYPES.has(comp.type)) undirectedPairs.push([sa, sb]);

    let high: string | null = null, low: string | null = null;
    switch (comp.type) {
      case 'V': case 'I':
        high = comp.ports[0].net; low = comp.ports[1].net; break;
      case 'M': {
        const isP = comp.params?.channelType === 'p';
        high = isP ? comp.ports[2].net : comp.ports[0].net;
        low  = isP ? comp.ports[0].net : comp.ports[2].net;
        break;
      }
      case 'Q': {
        const isPnp = comp.params?.type === 'pnp';
        high = isPnp ? comp.ports[2].net : comp.ports[0].net;
        low  = isPnp ? comp.ports[0].net : comp.ports[2].net;
        break;
      }
      case 'E': case 'G':
        high = comp.ports[2].net; low = comp.ports[3].net; break;
      // D, C, X: undirected only
    }
    if (high !== null && low !== null) {
      const sh = find(high), sl = find(low);
      if (sh !== sl) directedHighLow.push([sh, sl]);
    }
  }

  const reps = new Set<string>();
  for (const n of allNets) reps.add(find(n));

  // --- Step 1: BFS distance from ground's set through undirected edges --
  const gndRep = find(GND);
  const undirected = new Map<string, Set<string>>();
  for (const r of reps) undirected.set(r, new Set());
  for (const [a, b] of undirectedPairs) {
    undirected.get(a)!.add(b);
    undirected.get(b)!.add(a);
  }

  const dist = new Map<string, number>();
  for (const r of reps) dist.set(r, Infinity);
  dist.set(gndRep, 0);
  const bfs: string[] = [gndRep];
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
  for (const r of reps) {
    if (dist.get(r) === Infinity) dist.set(r, 1);
  }

  // --- Step 2: Build DAG at set level ----------------------------------
  // Orient each undirected edge from the lower-distance endpoint to the
  // higher-distance one. Drop edges whose endpoints share a BFS distance —
  // those carry no rank-ordering information and would otherwise introduce a
  // spurious rank step (e.g., a feedback capacitor between two nodes that
  // are both on the same signal rail).
  const dagFrom = new Map<string, Set<string>>();
  for (const r of reps) dagFrom.set(r, new Set());
  for (const [a, b] of undirectedPairs) {
    const da = dist.get(a)!, db = dist.get(b)!;
    if (da === db) continue;
    const [lo, hi] = da < db ? [a, b] : [b, a];
    dagFrom.get(lo)!.add(hi);
  }

  // --- Step 3: Apply directed polarity overrides -----------------------
  for (const [high, low] of directedHighLow) {
    dagFrom.get(high)?.delete(low);
    dagFrom.get(low)?.add(high);
  }

  // --- Step 4: Longest path from ground's set --------------------------
  const rankByRep = new Map<string, number>();
  for (const r of reps) rankByRep.set(r, 0);

  const maxIter = reps.size * 2 + 1;
  for (let i = 0; i < maxIter; i++) {
    let changed = false;
    for (const [from, tos] of dagFrom) {
      const fromRank = rankByRep.get(from)!;
      for (const to of tos) {
        if (fromRank + 1 > rankByRep.get(to)!) {
          rankByRep.set(to, fromRank + 1);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  // --- Step 5: Project set ranks back onto every net -------------------
  const rank = new Map<string, number>();
  for (const n of allNets) rank.set(n, rankByRep.get(find(n))!);
  return rank;
}

/* ------------------------------------------------------------------ */
/*  Step 3: Place components between their ranked nodes               */
/* ------------------------------------------------------------------ */

interface Placement {
  comp: IRComponent;
  col: number;   // BFS distance from the nearest source component
  topRank: number;    // higher-potential node rank
  bottomRank: number; // lower-potential node rank
}

/** Assign each component a column by BFS from voltage/current sources through
 * shared non-ground nets. The result reflects signal flow: V1 at col 0, a
 * series R between V1's + and the output at col 1, the output capacitor at
 * col 2, and so on. Components that share the same intermediate net (e.g. MP
 * and MN both touching `out` in a CMOS inverter) land in the same column. */
function assignColumns(circuit: CircuitIR): Map<string, number> {
  const col = new Map<string, number>();
  const netToComps = new Map<string, string[]>();
  for (const c of circuit.components) {
    for (const p of c.ports) {
      if (p.net === '0') continue;
      if (!netToComps.has(p.net)) netToComps.set(p.net, []);
      netToComps.get(p.net)!.push(c.id);
    }
  }
  const compById = new Map(circuit.components.map(c => [c.id, c]));

  const queue: string[] = [];
  for (const c of circuit.components) {
    if (c.type === 'V' || c.type === 'I') {
      col.set(c.id, 0);
      queue.push(c.id);
    }
  }
  // Degenerate circuit with no sources — anchor BFS on the first component.
  if (queue.length === 0 && circuit.components.length > 0) {
    col.set(circuit.components[0].id, 0);
    queue.push(circuit.components[0].id);
  }

  while (queue.length > 0) {
    const cid = queue.shift()!;
    const c = compById.get(cid)!;
    const next = col.get(cid)! + 1;
    const seen = new Set<string>();
    for (const p of c.ports) {
      if (p.net === '0') continue;
      for (const nid of netToComps.get(p.net) ?? []) {
        if (nid === cid || seen.has(nid)) continue;
        seen.add(nid);
        if (!col.has(nid)) {
          col.set(nid, next);
          queue.push(nid);
        }
      }
    }
  }

  // Any unreached components (isolated) get placed after the rest.
  let fallback = Math.max(0, ...col.values()) + 1;
  for (const c of circuit.components) {
    if (!col.has(c.id)) col.set(c.id, fallback++);
  }
  return col;
}

function placeComponents(circuit: CircuitIR, nodeRanks: Map<string, number>): Placement[] {
  const columns = assignColumns(circuit);
  const placements: Placement[] = [];
  for (const comp of circuit.components) {
    const [netA, netB] = componentEndpoints(comp);
    const rankA = nodeRanks.get(netA) ?? 0;
    const rankB = nodeRanks.get(netB) ?? 0;
    placements.push({
      comp,
      col: columns.get(comp.id) ?? 0,
      topRank: Math.max(rankA, rankB),
      bottomRank: Math.min(rankA, rankB),
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

  // Within each BFS column, pack components into sub-columns. Two placements
  // can share a sub-column (stack vertically) only when their symbol Y ranges
  // are separated by at least STACK_GAP pixels — otherwise their bodies or
  // ground stubs would overlap. Each sub-column consumes one SLOT_SPACING of
  // horizontal space.
  const STACK_GAP = GRID / 2;
  const symbolFor = (pl: Placement) => {
    const horizontal = pl.comp.type === 'C' && pl.topRank === pl.bottomRank;
    return { horizontal, sym: getSymbol(pl.comp.type, pl.comp.displayValue ?? '', horizontal) };
  };
  const centerYFor = (pl: Placement) => {
    const topY = MARGIN + (maxRank - pl.topRank) * RANK_SPACING;
    const bottomY = MARGIN + (maxRank - pl.bottomRank) * RANK_SPACING;
    return (topY + bottomY) / 2;
  };

  const byCol = new Map<number, Placement[]>();
  for (const pl of placements) {
    if (!byCol.has(pl.col)) byCol.set(pl.col, []);
    byCol.get(pl.col)!.push(pl);
  }

  const xForComp = new Map<string, number>();
  let nextAbsX = MARGIN;
  const cols = [...byCol.keys()].sort((a, b) => a - b);

  for (const col of cols) {
    const pls = byCol.get(col)!;
    // Sort top-to-bottom (highest rank first = lowest Y)
    pls.sort((a, b) => {
      if (a.topRank !== b.topRank) return b.topRank - a.topRank;
      return b.bottomRank - a.bottomRank;
    });

    // Greedy column packing: place each component in the first sub-column
    // that still has vertical room below the last component.
    const subCols: { bottomY: number }[] = [];
    const subColForComp = new Map<string, number>();
    for (const pl of pls) {
      const { sym } = symbolFor(pl);
      const cy = centerYFor(pl);
      const topY = cy - sym.height / 2;
      const bottomY = cy + sym.height / 2;
      let sc = -1;
      for (let i = 0; i < subCols.length; i++) {
        if (topY >= subCols[i].bottomY + STACK_GAP) { sc = i; break; }
      }
      if (sc === -1) { sc = subCols.length; subCols.push({ bottomY }); }
      else subCols[sc].bottomY = bottomY;
      subColForComp.set(pl.comp.id, sc);
    }

    for (const pl of pls) {
      const sc = subColForComp.get(pl.comp.id)!;
      xForComp.set(pl.comp.id, nextAbsX + sc * SLOT_SPACING);
    }
    nextAbsX += subCols.length * SLOT_SPACING;
  }

  // --- Pixel positions ---
  const placedComponents: PlacedComponent[] = [];

  for (const pl of placements) {
    const { comp, topRank, bottomRank } = pl;

    const { horizontal, sym: symbol } = symbolFor(pl);
    const nets = comp.ports.map(p => p.net);

    const centerY = centerYFor(pl);
    const x = xForComp.get(comp.id)!;
    const y = centerY - symbol.height / 2;

    // Map IR port i to a symbol pin position. For PMOS / PNP, swap the
    // drain/collector and source/emitter positions so the "source-side" pin
    // (which sits at higher potential) renders above the drain/collector.
    // For undirected 2-terminal symbols (R, L, C, D) whose IR port ordering
    // happens to put the lower-rank net first, swap pins 0 and 1 so the
    // higher-rank net always renders at the top/left of the symbol body.
    const flipForP =
      (comp.type === 'M' && comp.params?.channelType === 'p') ||
      (comp.type === 'Q' && comp.params?.type === 'pnp');
    const flip2Term =
      symbol.pins.length === 2 &&
      (nodeRanks.get(nets[0]) ?? 0) < (nodeRanks.get(nets[1]) ?? 0);
    const symIdx = (i: number): number => {
      if (flipForP && (i === 0 || i === 2)) return i === 0 ? 2 : 0;
      if (flip2Term && (i === 0 || i === 1)) return 1 - i;
      return i;
    };
    const pins: Pin[] = nets.slice(0, symbol.pins.length).map((net, i) => {
      const sp = symbol.pins[symIdx(i)];
      return { net, x: x + sp.dx, y: y + sp.dy };
    });

    placedComponents.push({
      component: comp,
      x, y, rotation: 0, horizontal,
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
    const sym = getSymbol(pc.component.type, pc.component.displayValue ?? '', pc.horizontal);
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
