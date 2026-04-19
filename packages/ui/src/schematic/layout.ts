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
  // Independent sources and devices whose DC-bias path is part of the static
  // voltage/current graph. Dependent sources (E/G/F/H) are excluded so an
  // opamp's output→ground dc edge doesn't create a spurious parallel path
  // for every resistor touching the feedback rail. D is included because a
  // forward-biased diode conducts DC current like a resistor.
  const DC_TYPES = new Set(['V', 'I', 'R', 'L', 'M', 'Q', 'D']);
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

  // Nets that a diode touches. Used to recognise signal-path resistors that
  // feed or follow a diode (e.g. the source resistor in a half-wave
  // rectifier) — those R's should stay on the same rail as the diode.
  const diodeNets = new Set<string>();
  for (const comp of circuit.components) {
    if (comp.type === 'D') {
      for (const p of comp.ports) diodeNets.add(p.net);
    }
  }

  const rankPreserving = new Set<string>();
  for (const comp of circuit.components) {
    if (comp.type !== 'R' && comp.type !== 'L' && comp.type !== 'D') continue;
    const [a, b] = componentEndpoints(comp);
    if (a === b) continue;
    // Ideal inductor — zero DC drop regardless of loop topology.
    if (comp.type === 'L') {
      rankPreserving.add(comp.id);
      continue;
    }
    // Signal-path diode (neither endpoint ground): drawn in-line on the rail
    // with its ~0.7 V drop visually suppressed. A diode with a ground
    // endpoint (Zener, freewheel) must differentiate so it can hang off the
    // rail toward ground.
    if (comp.type === 'D') {
      if (a !== GND && b !== GND) rankPreserving.add(comp.id);
      continue;
    }
    // R preserves when current cannot flow through it (no parallel DC path)
    // or when it sits next to a diode in a non-ground chain — the rectifier
    // pattern V → Rs → D → R_load should draw Rs and D horizontally even
    // though Rs has a parallel DC path through the load.
    const bothNonGround = a !== GND && b !== GND;
    const adjacentToDiode = bothNonGround && (diodeNets.has(a) || diodeNets.has(b));
    // Exception: a load resistor (one endpoint on ground, other on a cap
    // output plate) should always differentiate even without a DC parallel
    // path. The cap blocks DC in steady-state analysis, but the R is still
    // visually a vertical pull-down.
    const nonGndEnd = a === GND ? b : (b === GND ? a : null);
    const isCapLoad = nonGndEnd !== null && circuit.components.some(c =>
      c.type === 'C' && c.id !== comp.id && c.ports.some(p => p.net === nonGndEnd)
    );
    if (isCapLoad) {
      // Explicitly differentiating — skip rank-preserving.
    } else if (!dcConnectedSkipping(comp.id, a, b) || adjacentToDiode) {
      rankPreserving.add(comp.id);
    }
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
  // Rank-preserving R/L are already collapsed via union-find, so their edges
  // are self-loops and dropped. Every other component contributes an
  // undirected edge between set representatives; sources (V/I/E/G/F/H) also
  // contribute a directed polarity constraint.
  //
  // The undirected edges feed two things:
  //   - BFS distance from ground (used for orienting edges away from ground).
  //   - The DAG itself (longest-path relaxation).
  // Source components participate in BFS so the side they drive (e.g. the
  // opamp output) picks up a finite distance from ground, but they are not
  // added as DAG edges: their polarity constraint handles ordering. A
  // differentiating R/L whose endpoints happen to share a BFS distance must
  // still contribute a rank step (e.g. RD in a common-source amp where both
  // vdd and out are dist 1 via VDD and M1's drain), so it stays in the DAG
  // with a lexicographic tiebreak.
  const SOURCE_TYPES = new Set(['V', 'I', 'E', 'G', 'F', 'H']);
  interface UEdge { a: string; b: string; keepAtSameDist: boolean }
  const bfsEdges: Array<[string, string]> = [];
  const dagCandidates: UEdge[] = [];
  const directedHighLow: Array<[string, string]> = [];

  // Series output capacitors (e.g. C1 in an inverting buck-boost spanning n1
  // and neg, where each side has its own R/D shunt to ground) must rank-
  // separate their endpoints so the cap draws vertically. Feedback caps over
  // an opamp loop lack such ground shunts and stay same-rank (horizontal arc).
  const hasGndShunt = (net: string, exceptId: string): boolean =>
    circuit.components.some(c =>
      c.id !== exceptId &&
      (c.type === 'R' || c.type === 'D') &&
      c.ports.some(p => p.net === net) &&
      c.ports.some(p => p.net === GND)
    );
  const seriesOutputCaps = new Set<string>();
  for (const comp of circuit.components) {
    if (comp.type !== 'C' || comp.ports.length !== 2) continue;
    const a = comp.ports[0].net, b = comp.ports[1].net;
    if (a === GND || b === GND || a === b) continue;
    if (hasGndShunt(a, comp.id) && hasGndShunt(b, comp.id)) {
      seriesOutputCaps.add(comp.id);
    }
  }

  for (const comp of circuit.components) {
    const [a, b] = componentEndpoints(comp);
    const sa = find(a), sb = find(b);
    if (sa !== sb) {
      bfsEdges.push([sa, sb]);
      if (!SOURCE_TYPES.has(comp.type)) {
        // Differentiating R/L is the only type that must insist on a rank
        // step even when BFS distance is equal.
        const isRL = comp.type === 'R' || comp.type === 'L';
        const isSeriesCap = seriesOutputCaps.has(comp.id);
        const keepAtSameDist = (isRL && !rankPreserving.has(comp.id)) || isSeriesCap;
        dagCandidates.push({ a: sa, b: sb, keepAtSameDist });
      }
    }

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
      case 'C': {
        if (!seriesOutputCaps.has(comp.id)) break;
        // Whichever side has more non-gnd-shunt DC neighbors is upstream.
        const [na, nb] = [comp.ports[0].net, comp.ports[1].net];
        const upstreamCount = (net: string) => circuit.components.filter(c =>
          c.id !== comp.id && DC_TYPES.has(c.type) &&
          c.ports.some(p => p.net === net) &&
          !c.ports.some(p => p.net === GND)
        ).length;
        const ca = upstreamCount(na), cb = upstreamCount(nb);
        if (ca !== cb) {
          high = ca > cb ? na : nb;
          low  = ca > cb ? nb : na;
        }
        break;
      }
      // D, X: undirected only
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
  for (const [a, b] of bfsEdges) {
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
  // higher-distance one. Drop same-distance edges unless the component
  // insists on a rank step (see `keepAtSameDist` above) — that keeps feedback
  // caps and similar soft links from introducing a spurious extra rank. When
  // a same-distance edge IS kept, orient it so the V-source-driven endpoint
  // ends up at the higher rank (e.g. vdd above out across RD in a
  // common-source amp, in above out across R1 in a voltage divider).
  const vPlusReps = new Set<string>();
  for (const comp of circuit.components) {
    if (comp.type === 'V' || comp.type === 'I') vPlusReps.add(find(comp.ports[0].net));
  }
  const dagFrom = new Map<string, Set<string>>();
  for (const r of reps) dagFrom.set(r, new Set());
  for (const { a, b, keepAtSameDist } of dagCandidates) {
    const da = dist.get(a)!, db = dist.get(b)!;
    if (da < db) dagFrom.get(a)!.add(b);
    else if (db < da) dagFrom.get(b)!.add(a);
    else if (keepAtSameDist) {
      let lo: string, hi: string;
      if (vPlusReps.has(a) && !vPlusReps.has(b)) { hi = a; lo = b; }
      else if (vPlusReps.has(b) && !vPlusReps.has(a)) { hi = b; lo = a; }
      else { [lo, hi] = a < b ? [a, b] : [b, a]; }
      dagFrom.get(lo)!.add(hi);
    }
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

  // Refinement: a component whose net's FIRST carrier sits earlier in the
  // BFS should be pulled back to that carrier's column. This keeps shunts
  // (e.g. a freewheel diode from sw→gnd) in the SAME column as the source
  // that drives their live net, leaving the next column free for the chain
  // that continues onward (e.g. the inductor out of sw). Without this, a
  // buck converter ends up with D1 placed to the RIGHT of L1 and the sw bus
  // visually runs through L1's body.
  const netMinCol = new Map<string, number>();
  for (const [net, comps] of netToComps) {
    if (comps.length === 0) continue;
    netMinCol.set(net, Math.min(...comps.map(id => col.get(id) ?? 0)));
  }
  for (const c of circuit.components) {
    let m = 0;
    for (const p of c.ports) {
      if (p.net === '0') continue;
      const nc = netMinCol.get(p.net);
      if (nc !== undefined) m = Math.max(m, nc);
    }
    col.set(c.id, m);
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
  // V/I/C have a natural central body (circle, plates) that tolerates lead
  // extension when stretched. Resistors are stretched only when one endpoint
  // is ground — the stretch keeps the ground pin on the ground rail so a
  // row of pull-down R's and decoupling C's share a single ground line.
  // A pull-up R between two live rails (e.g. RD in a common-source amp)
  // keeps natural size to avoid the elongated zigzag look.
  const STRETCH_TYPES = new Set(['V', 'I', 'C']);
  const symbolFor = (pl: Placement) => {
    const sameRank = pl.topRank === pl.bottomRank;
    const horizontal =
      (pl.comp.type === 'C' && sameRank) ||
      (pl.comp.type === 'R' && sameRank) ||
      (pl.comp.type === 'D' && sameRank);
    const hasGroundEndpoint = pl.comp.ports.some(p => p.net === '0');
    const stretchEligible = STRETCH_TYPES.has(pl.comp.type) ||
      ((pl.comp.type === 'R' || pl.comp.type === 'D') && hasGroundEndpoint);
    const stretchH = !horizontal && stretchEligible && pl.topRank > pl.bottomRank
      ? (pl.topRank - pl.bottomRank) * RANK_SPACING
      : undefined;
    return { horizontal, stretchH, sym: getSymbol(pl.comp.type, pl.comp.displayValue ?? '', horizontal, stretchH) };
  };
  // Feedback components span a loop that closes back through an opamp or over
  // a signal rail — a capacitor between two non-ground same-rank nets, or a
  // resistor whose endpoints sit on the same rail AND coincide with an
  // opamp's input/output pair. Feedback components render as an arc ABOVE the
  // signal chain with short drop-wires joining each pin to the rail.
  const opampLoops = new Set<string>();
  for (const comp of circuit.components) {
    if (comp.type !== 'E' && comp.type !== 'G') continue;
    const ctrlP = comp.ports[0]?.net, ctrlN = comp.ports[1]?.net, outP = comp.ports[2]?.net;
    for (const input of [ctrlP, ctrlN]) {
      if (input && outP && input !== outP) {
        opampLoops.add(`${input}|${outP}`);
        opampLoops.add(`${outP}|${input}`);
      }
    }
  }
  const isFeedback = (pl: Placement): boolean => {
    if (pl.comp.type !== 'C' && pl.comp.type !== 'R') return false;
    if (pl.topRank !== pl.bottomRank) return false;
    const a = pl.comp.ports[0].net;
    const b = pl.comp.ports[1].net;
    if (a === '0' || b === '0') return false;
    if (pl.comp.type === 'C') return true;
    return opampLoops.has(`${a}|${b}`);
  };
  const centerYFor = (pl: Placement) => {
    const topY = MARGIN + (maxRank - pl.topRank) * RANK_SPACING;
    const bottomY = MARGIN + (maxRank - pl.bottomRank) * RANK_SPACING;
    const base = (topY + bottomY) / 2;
    return isFeedback(pl) ? base - RANK_SPACING : base;
  };

  const byCol = new Map<number, Placement[]>();
  for (const pl of placements) {
    // Feedback caps are positioned in a second pass once the main chain is
    // laid out — they span the x-range between their endpoints' other pins.
    if (isFeedback(pl)) continue;
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
    if (isFeedback(pl)) continue;
    const { comp } = pl;
    const { horizontal, stretchH, sym: symbol } = symbolFor(pl);
    const nets = comp.ports.map(p => p.net);

    const centerY = centerYFor(pl);
    const x = xForComp.get(comp.id)!;
    const y = centerY - symbol.height / 2;

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

    // Diodes are directional: when flip2Term remaps the anode to pin 1 (so it
    // renders at the cathode's visual position), the triangle must also flip
    // so the arrow still points from anode to cathode.
    const flipped = comp.type === 'D' && flip2Term;
    placedComponents.push({ component: comp, x, y, rotation: 0, horizontal, stretchH, flipped, pins });
  }

  // --- Pin alignment: pull vertical 2-terminal R's onto their peer's column
  // When a vertical R shares a net with a transistor in the same BFS column,
  // shift the R horizontally so its pin sits directly above/below the
  // transistor pin. Without this, a pull-up/pull-down resistor renders with
  // a jog in the connecting wire rather than a straight vertical line.
  for (const pc of placedComponents) {
    if (pc.component.type !== 'R' || pc.horizontal) continue;
    if (pc.pins.length !== 2) continue;
    for (const pin of pc.pins) {
      if (pin.net === '0') continue;
      const peer = placedComponents.find(other =>
        other !== pc &&
        (other.component.type === 'M' || other.component.type === 'Q') &&
        Math.abs(other.x - pc.x) < SLOT_SPACING / 2 &&
        other.pins.some(p => p.net === pin.net)
      );
      if (!peer) continue;
      const peerPin = peer.pins.find(p => p.net === pin.net)!;
      const dx = peerPin.x - pin.x;
      if (dx === 0) break;
      pc.x += dx;
      for (const p of pc.pins) p.x += dx;
      break;
    }
  }

  // --- Pass 2: feedback components ----------------------------------------
  // Now that the main chain is positioned, stretch each feedback cap or
  // resistor so its two pins span the feedback region: left pin sits over
  // the leftmost other pin on net A, right pin over the rightmost other pin
  // on net B.
  for (const pl of placements) {
    if (!isFeedback(pl)) continue;
    const { comp } = pl;
    const netA = comp.ports[0].net;
    const netB = comp.ports[1].net;
    const rankA = nodeRanks.get(netA) ?? 0;
    const rankB = nodeRanks.get(netB) ?? 0;
    // Orient so the lower-rank net is on the left side of the cap (matches
    // the 2-terminal symbol-pin flip logic used elsewhere).
    const leftNet  = rankA <= rankB ? netA : netB;
    const rightNet = rankA <= rankB ? netB : netA;
    const flipPorts = leftNet !== netA;

    const collectX = (net: string) =>
      placedComponents.flatMap(pc => pc.pins.filter(p => p.net === net).map(p => p.x));
    const leftXs  = collectX(leftNet);
    const rightXs = collectX(rightNet);
    const leftX   = leftXs.length  ? Math.min(...leftXs)  : MARGIN;
    const rightX  = rightXs.length ? Math.max(...rightXs) : leftX + GRID * 2;
    const width   = Math.max(GRID * 2, rightX - leftX);

    const symbol = getSymbol(comp.type, comp.displayValue ?? '', true, undefined, width);
    const centerY = centerYFor(pl);
    const y = centerY - symbol.height / 2;
    const x = leftX;

    const pins: Pin[] = [
      { net: flipPorts ? rightNet : leftNet,  x: x + symbol.pins[0].dx, y: y + symbol.pins[0].dy },
      { net: flipPorts ? leftNet  : rightNet, x: x + symbol.pins[1].dx, y: y + symbol.pins[1].dy },
    ];

    placedComponents.push({
      component: comp,
      x, y, rotation: 0, horizontal: true, stretchW: width,
      pins,
    });
  }

  // If any elevated feedback caps pushed a component above the top margin,
  // shift everyone down so the top of the schematic still honors MARGIN.
  let minY = Infinity;
  for (const pc of placedComponents) minY = Math.min(minY, pc.y);
  const yShift = minY < MARGIN ? MARGIN - minY : 0;
  if (yShift > 0) {
    for (const pc of placedComponents) {
      pc.y += yShift;
      for (const p of pc.pins) p.y += yShift;
    }
  }

  // --- Shrink V/I sources whose top pin is crossed by a through-bus ---
  // In circuits with multiple V sources sharing a column (e.g. Vin and Vg in a
  // buck/boost converter), a stretched V-source puts its top pin right on the
  // rail, and an unrelated rail bus passing between other components ends up
  // routing THROUGH that pin. Detecting the conflict and shrinking the V
  // source to natural size (bottom pin stays on the ground rail, top pin
  // drops to between-rank height) moves the top pin out of the bus path.
  {
    const roughXRange = new Map<string, [number, number]>();
    for (const pc of placedComponents) {
      for (const p of pc.pins) {
        const r = roughXRange.get(p.net);
        if (!r) roughXRange.set(p.net, [p.x, p.x]);
        else { r[0] = Math.min(r[0], p.x); r[1] = Math.max(r[1], p.x); }
      }
    }
    for (const pc of placedComponents) {
      if (pc.component.type !== 'V' && pc.component.type !== 'I') continue;
      if (pc.pins.length !== 2 || !pc.stretchH) continue;
      const topPin = pc.pins[0].y < pc.pins[1].y ? pc.pins[0] : pc.pins[1];
      let conflict = false;
      for (const [net, [xMin, xMax]] of roughXRange) {
        if (net === topPin.net || net === '0') continue;
        if (topPin.x <= xMin || topPin.x >= xMax) continue;
        // The other net has pins at topPin.y (on the same rail)?
        const hits = placedComponents.some(pc2 =>
          pc2 !== pc && pc2.pins.some(p => p.net === net && Math.abs(p.y - topPin.y) < 1)
        );
        if (hits) { conflict = true; break; }
      }
      if (!conflict) continue;
      // Target the modal Y of the top net's OTHER pins so the gate-side wire
      // runs straight into the driven pin (e.g. Vg's + lines up with the
      // MOSFET gate). If no other pin is available, fall back to natural
      // shrink (top pin below the blocking bus).
      const bottomPin = pc.pins[0].y > pc.pins[1].y ? pc.pins[0] : pc.pins[1];
      const topNet = topPin.net, bottomNet = bottomPin.net;
      const otherYs = placedComponents.flatMap(pc2 =>
        pc2 === pc ? [] : pc2.pins.filter(p => p.net === topNet).map(p => p.y)
      );
      let targetY: number;
      if (otherYs.length > 0) {
        const counts = new Map<number, number>();
        for (const y of otherYs) counts.set(y, (counts.get(y) ?? 0) + 1);
        let bestY = otherYs[0], bestC = 0;
        for (const [y, c] of counts) if (c > bestC) { bestC = c; bestY = y; }
        targetY = bestY;
      } else {
        const naturalH = getSymbol(pc.component.type, pc.component.displayValue ?? '', false).height;
        targetY = bottomPin.y - naturalH;
      }
      const newH = bottomPin.y - targetY;
      const sym = getSymbol(pc.component.type, pc.component.displayValue ?? '', false, newH);
      pc.y = targetY;
      pc.stretchH = newH > sym.height - 1 && newH > GRID * 2 ? newH : undefined;
      pc.pins = [
        { net: topNet,    x: pc.x + sym.pins[0].dx, y: targetY + sym.pins[0].dy },
        { net: bottomNet, x: pc.x + sym.pins[1].dx, y: targetY + sym.pins[1].dy },
      ];
    }
  }

  // --- Reorder V/I sources whose stretched body blocks a peer's bus ---
  // After the stretch pass, one V/I source's body may span across another's
  // horizontal bus Y. If the blocker sits to the RIGHT of the victim, their
  // bus runs visually through the blocker's body (Vin→M1.in crossing Vg in a
  // buck converter). Swap the two sources so the blocker is on the outside.
  // Skip when both sources would block each other — swapping can't help.
  {
    const sources = placedComponents.filter(pc =>
      (pc.component.type === 'V' || pc.component.type === 'I') && pc.pins.length === 2
    );
    for (let i = 0; i < sources.length; i++) {
      for (let j = i + 1; j < sources.length; j++) {
        const [left, right] = sources[i].x < sources[j].x
          ? [sources[i], sources[j]]
          : [sources[j], sources[i]];
        if (right.x - left.x > SLOT_SPACING * 1.5) continue;
        const leftTop = left.pins[0].y < left.pins[1].y ? left.pins[0] : left.pins[1];
        const rightTop = right.pins[0].y < right.pins[1].y ? right.pins[0] : right.pins[1];
        const peers = placedComponents
          .filter(pc => pc !== left)
          .flatMap(pc => pc.pins.filter(p => p.net === leftTop.net).map(p => p.x));
        if (peers.length === 0) continue;
        const busXMin = Math.min(leftTop.x, ...peers);
        const busXMax = Math.max(leftTop.x, ...peers);
        const rBodyMin = Math.min(right.pins[0].y, right.pins[1].y);
        const rBodyMax = Math.max(right.pins[0].y, right.pins[1].y);
        const rBodyX = right.pins[0].x;
        const lBodyMin = Math.min(left.pins[0].y, left.pins[1].y);
        const lBodyMax = Math.max(left.pins[0].y, left.pins[1].y);
        if (leftTop.y < rBodyMin || leftTop.y > rBodyMax) continue;
        if (rBodyX <= busXMin || rBodyX >= busXMax) continue;
        // If swapping would just move the crossing (left also blocks right's
        // bus Y), leave them alone.
        if (rightTop.y >= lBodyMin && rightTop.y <= lBodyMax) continue;
        const dx = right.x - left.x;
        left.x += dx;
        for (const p of left.pins) p.x += dx;
        right.x -= dx;
        for (const p of right.pins) p.x -= dx;
      }
    }
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

  // Group nets by rank, and within each rank group further partition by
  // transitive x-range overlap. Only nets whose horizontal buses would
  // actually collide need a corridor offset; disjoint nets can share the
  // base rail Y, which keeps the rail perfectly horizontal through their
  // pins.
  const xRangeByNet = new Map<string, [number, number]>();
  for (const [net, pins] of netPins) {
    if (net === '0' || pins.length < 2) continue;
    const xs = pins.map(p => p.x);
    xRangeByNet.set(net, [Math.min(...xs), Math.max(...xs)]);
  }

  const netsByRank = new Map<number, string[]>();
  for (const net of netPins.keys()) {
    if (net === '0') continue;
    const r = nodeRanks.get(net) ?? 0;
    if (!netsByRank.has(r)) netsByRank.set(r, []);
    netsByRank.get(r)!.push(net);
  }

  const netBusY = new Map<string, number>();
  for (const [r, nets] of netsByRank) {
    const baseY = MARGIN + (maxRank - r) * RANK_SPACING + yShift;
    // Partition into x-overlap groups. Sort by minX first so scan is linear.
    const sorted = [...nets].sort((a, b) => {
      const ra = xRangeByNet.get(a), rb = xRangeByNet.get(b);
      if (!ra || !rb) return a.localeCompare(b);
      return ra[0] - rb[0];
    });
    const groups: string[][] = [];
    for (const net of sorted) {
      const range = xRangeByNet.get(net);
      const current = groups[groups.length - 1];
      if (current && range) {
        const overlaps = current.some(other => {
          const o = xRangeByNet.get(other);
          return o && !(range[1] < o[0] || o[1] < range[0]);
        });
        if (overlaps) { current.push(net); continue; }
      }
      groups.push([net]);
    }

    // Nets with disjoint x-ranges may share the same bus Y without visually
    // overlapping; separately, two nets that sit on the same rail because an
    // L or same-rank R/D bridges them (e.g. sw and out across a buck-inductor)
    // may also share a Y — their combined bus reads as a single rail, which
    // is what the reader expects.
    const sameRailSet = new Map<string, string>();
    const findRail = (n: string): string => {
      let r = n;
      while (sameRailSet.get(r) !== r) r = sameRailSet.get(r)!;
      return r;
    };
    for (const net of netPins.keys()) sameRailSet.set(net, net);
    for (const comp of circuit.components) {
      if (comp.type !== 'R' && comp.type !== 'L' && comp.type !== 'D') continue;
      if (comp.ports.length !== 2) continue;
      const a = comp.ports[0].net, b = comp.ports[1].net;
      if (a === '0' || b === '0' || a === b) continue;
      if (nodeRanks.get(a) === nodeRanks.get(b)) {
        const ra = findRail(a), rb = findRail(b);
        if (ra !== rb) sameRailSet.set(ra, rb);
      }
    }
    const yUsersX = new Map<number, Array<{ xMin: number; xMax: number; net: string }>>();
    for (const g of groups) {
      if (g.length === 1) { netBusY.set(g[0], baseY); continue; }
      // Wider nets go closest to baseY — they cover more components, so a
      // small corridor offset is enough to clear the rail while keeping the
      // bus from sinking deep into a transistor body sitting above the rail.
      g.sort((a, b) => {
        const ra = xRangeByNet.get(a)!, rb = xRangeByNet.get(b)!;
        const wa = ra[1] - ra[0], wb = rb[1] - rb[0];
        if (wa !== wb) return wb - wa;
        return a.localeCompare(b);
      });
      // For each net, pick the Y closest to its natural pin Y (preferring the
      // modal pin Y, then baseY, then stepwise corridor offsets above the
      // rail). Skip Ys that would plant the bus inside another component's
      // body or overlap another net's bus in the x-range.
      for (const net of g) {
        const range = xRangeByNet.get(net)!;
        const [xMin, xMax] = range;
        const forbidden: Array<{ y1: number; y2: number; pinYs: number[] }> = [];
        for (const pc of placedComponents) {
          const sym = getSymbol(pc.component.type, pc.component.displayValue ?? '', pc.horizontal, pc.stretchH, pc.stretchW);
          const bX1 = pc.x, bX2 = pc.x + sym.width;
          let bY1 = pc.y, bY2 = pc.y + sym.height;
          if (xMax <= bX1 || xMin >= bX2) continue;
          // A stretched V/I source is mostly a long thin lead with a natural-
          // sized body (the circle) at the vertical centre. Shrink the
          // forbidden region to that central circle so a through-bus can
          // legitimately cross the lead without being pushed off the rail.
          if ((pc.component.type === 'V' || pc.component.type === 'I') && pc.stretchH) {
            const center = (bY1 + bY2) / 2;
            const half = GRID * 0.9;
            bY1 = center - half;
            bY2 = center + half;
          }
          forbidden.push({ y1: bY1, y2: bY2, pinYs: pc.pins.map(p => p.y) });
        }
        // Prefer the modal pin Y when it's a safe candidate — that lets the
        // bus run straight through the pins instead of dropping off the rail.
        const pinYs = netPins.get(net)!.map(p => Math.round(p.y));
        const yCounts = new Map<number, number>();
        for (const y of pinYs) yCounts.set(y, (yCounts.get(y) ?? 0) + 1);
        let modalY = baseY, modalCount = 0;
        for (const [y, c] of yCounts) {
          if (c > modalCount) { modalCount = c; modalY = y; }
        }
        const candidates: number[] = [];
        const seen = new Set<number>();
        const add = (y: number) => { if (!seen.has(y)) { seen.add(y); candidates.push(y); } };
        add(modalY);
        add(baseY);
        for (let k = 1; k < 30; k++) add(baseY - k * CORRIDOR_OFFSET);
        for (const y of candidates) {
          // A horizontal component's pin row (e.g. an inductor's leads at y=cy)
          // coincides with the bus when the bus is at pinY — that's not a body
          // crossing, it's the bus passing through the pin on its way to
          // another pin on the same net, so don't mark it as forbidden.
          const inBody = forbidden.some(({ y1, y2, pinYs }) =>
            y > y1 && y < y2 && !pinYs.some(py => Math.abs(py - y) < 1)
          );
          if (inBody) continue;
          const occupants = yUsersX.get(y) ?? [];
          const netRail = findRail(net);
          const overlaps = occupants.some(({ xMin: ox1, xMax: ox2, net: other }) => {
            if (findRail(other) === netRail) return false;
            return !(xMax < ox1 || ox2 < xMin);
          });
          if (overlaps) continue;
          netBusY.set(net, y);
          if (!yUsersX.has(y)) yUsersX.set(y, []);
          yUsersX.get(y)!.push({ xMin, xMax, net });
          break;
        }
        if (!netBusY.has(net)) netBusY.set(net, baseY);
      }
    }
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
    const sym = getSymbol(pc.component.type, pc.component.displayValue ?? '', pc.horizontal, pc.stretchH, pc.stretchW);
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
