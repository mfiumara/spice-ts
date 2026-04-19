// packages/ui/src/schematic/symbols.ts

/** Grid size in pixels. All component dimensions are multiples of this. */
export const GRID = 20;

/** SVG path/element descriptor for rendering. */
export interface SvgElement {
  tag: 'path' | 'circle' | 'line' | 'text' | 'polyline';
  attrs: Record<string, string | number>;
  text?: string;
}

/** Symbol definition with pin offsets relative to (0,0) top-left. */
export interface SymbolDef {
  /** SVG elements to draw */
  elements: SvgElement[];
  /** Pin offsets from the symbol's origin (0,0) — unrotated */
  pins: { dx: number; dy: number }[];
  /** Symbol bounding box */
  width: number;
  height: number;
}

const PIN_R = 2.5;

function resistorSymbol(stretchW?: number): SymbolDef {
  const naturalW = GRID * 2;
  const w = Math.max(naturalW, stretchW ?? naturalW);
  const h = GRID;
  const cy = h / 2;
  const bodyW = naturalW * 0.4 * 2; // same zigzag width as natural
  const leadLeft = (w - bodyW) / 2;
  const peaks = 4;
  const segW = bodyW / peaks;
  const amp = h * 0.38;

  let d = `M0,${cy} L${leadLeft},${cy}`;
  for (let i = 0; i < peaks; i++) {
    const x1 = leadLeft + i * segW + segW * 0.25;
    const x2 = leadLeft + i * segW + segW * 0.75;
    const y1 = i % 2 === 0 ? cy - amp : cy + amp;
    const y2 = i % 2 === 0 ? cy + amp : cy - amp;
    d += ` L${x1},${y1} L${x2},${y2}`;
  }
  d += ` L${leadLeft + bodyW},${cy} L${w},${cy}`;

  return {
    elements: [{ tag: 'path', attrs: { d, fill: 'none' } }],
    pins: [{ dx: 0, dy: cy }, { dx: w, dy: cy }],
    width: w, height: h,
  };
}

/** Vertical resistor — pins on top and bottom, zigzag runs down. Used when
 * a resistor's endpoints sit on different rank rails (e.g. a load resistor
 * from the signal rail to ground or a pull-up from supply to output). */
function verticalResistorSymbol(stretchH?: number): SymbolDef {
  const w = GRID;
  const naturalH = GRID * 2;
  const h = Math.max(naturalH, stretchH ?? naturalH);
  const cx = w / 2;
  const bodyH = naturalH * 0.4 * 2;
  const leadTop = (h - bodyH) / 2;
  const peaks = 4;
  const segH = bodyH / peaks;
  const amp = w * 0.38;

  let d = `M${cx},0 L${cx},${leadTop}`;
  for (let i = 0; i < peaks; i++) {
    const y1 = leadTop + i * segH + segH * 0.25;
    const y2 = leadTop + i * segH + segH * 0.75;
    const x1 = i % 2 === 0 ? cx - amp : cx + amp;
    const x2 = i % 2 === 0 ? cx + amp : cx - amp;
    d += ` L${x1},${y1} L${x2},${y2}`;
  }
  d += ` L${cx},${leadTop + bodyH} L${cx},${h}`;

  return {
    elements: [{ tag: 'path', attrs: { d, fill: 'none' } }],
    pins: [{ dx: cx, dy: 0 }, { dx: cx, dy: h }],
    width: w, height: h,
  };
}

function capacitorSymbol(stretchH?: number): SymbolDef {
  const w = GRID;
  const naturalH = GRID * 2;
  const h = Math.max(naturalH, stretchH ?? naturalH);
  const cx = w / 2;
  const gap = 6;
  const plateW = w * 0.7;
  const cy = h / 2;

  return {
    elements: [
      { tag: 'line', attrs: { x1: cx, y1: 0, x2: cx, y2: cy - gap / 2 } },
      { tag: 'line', attrs: { x1: cx - plateW / 2, y1: cy - gap / 2, x2: cx + plateW / 2, y2: cy - gap / 2 } },
      { tag: 'line', attrs: { x1: cx - plateW / 2, y1: cy + gap / 2, x2: cx + plateW / 2, y2: cy + gap / 2 } },
      { tag: 'line', attrs: { x1: cx, y1: cy + gap / 2, x2: cx, y2: h } },
    ],
    pins: [{ dx: cx, dy: 0 }, { dx: cx, dy: h }],
    width: w, height: h,
  };
}

/** Horizontal capacitor variant — used when both endpoints share a rank.
 * `stretchW` extends the side leads so the body spans a wider section of the
 * schematic (e.g. a Sallen-Key feedback cap whose plates sit between the
 * leftmost input-side pin and the rightmost output-side pin). */
function horizontalCapacitorSymbol(stretchW?: number): SymbolDef {
  const naturalW = GRID * 2;
  const w = Math.max(naturalW, stretchW ?? naturalW);
  const h = GRID;
  const cy = h / 2;
  const gap = 6;
  const plateH = h * 0.7;
  const cx = w / 2;

  return {
    elements: [
      { tag: 'line', attrs: { x1: 0, y1: cy, x2: cx - gap / 2, y2: cy } },
      { tag: 'line', attrs: { x1: cx - gap / 2, y1: cy - plateH / 2, x2: cx - gap / 2, y2: cy + plateH / 2 } },
      { tag: 'line', attrs: { x1: cx + gap / 2, y1: cy - plateH / 2, x2: cx + gap / 2, y2: cy + plateH / 2 } },
      { tag: 'line', attrs: { x1: cx + gap / 2, y1: cy, x2: w, y2: cy } },
    ],
    pins: [{ dx: 0, dy: cy }, { dx: w, dy: cy }],
    width: w, height: h,
  };
}

function inductorSymbol(): SymbolDef {
  const w = GRID * 3, h = GRID;
  const cy = h / 2;
  const lead = GRID * 0.5;
  const bodyW = w - lead * 2;
  const arcs = 4;
  const arcW = bodyW / arcs;
  const r = arcW / 2;

  let d = `M0,${cy} L${lead},${cy}`;
  for (let i = 0; i < arcs; i++) {
    const sx = lead + i * arcW;
    d += ` A${r},${r} 0 0,1 ${sx + arcW},${cy}`;
  }
  d += ` L${w},${cy}`;

  return {
    elements: [{ tag: 'path', attrs: { d, fill: 'none' } }],
    pins: [{ dx: 0, dy: cy }, { dx: w, dy: cy }],
    width: w, height: h,
  };
}

function voltageSourceSymbol(isAC: boolean, stretchH?: number): SymbolDef {
  const naturalSize = GRID * 2;
  const w = naturalSize;
  const h = Math.max(naturalSize, stretchH ?? naturalSize);
  const cx = w / 2;
  const cy = h / 2;
  const r = naturalSize * 0.38;

  const elements: SvgElement[] = [
    { tag: 'line', attrs: { x1: cx, y1: 0, x2: cx, y2: cy - r } },
    { tag: 'line', attrs: { x1: cx, y1: cy + r, x2: cx, y2: h } },
    { tag: 'circle', attrs: { cx, cy, r, fill: 'none' } },
  ];

  if (isAC) {
    const sw = r * 0.6;
    elements.push({
      tag: 'path',
      attrs: {
        d: `M${cx - sw},${cy} C${cx - sw * 0.5},${cy - r * 0.4} ${cx + sw * 0.5},${cy + r * 0.4} ${cx + sw},${cy}`,
        fill: 'none',
      },
    });
  } else {
    const s = r * 0.3;
    elements.push(
      { tag: 'line', attrs: { x1: cx - s, y1: cy - r * 0.4, x2: cx + s, y2: cy - r * 0.4 } },
      { tag: 'line', attrs: { x1: cx, y1: cy - r * 0.4 - s, x2: cx, y2: cy - r * 0.4 + s } },
      { tag: 'line', attrs: { x1: cx - s, y1: cy + r * 0.4, x2: cx + s, y2: cy + r * 0.4 } },
    );
  }

  return {
    elements,
    pins: [{ dx: cx, dy: 0 }, { dx: cx, dy: h }],
    width: w, height: h,
  };
}

function currentSourceSymbol(stretchH?: number): SymbolDef {
  const naturalSize = GRID * 2;
  const w = naturalSize;
  const h = Math.max(naturalSize, stretchH ?? naturalSize);
  const cx = w / 2;
  const cy = h / 2;
  const r = naturalSize * 0.38;

  return {
    elements: [
      { tag: 'line', attrs: { x1: cx, y1: 0, x2: cx, y2: cy - r } },
      { tag: 'line', attrs: { x1: cx, y1: cy + r, x2: cx, y2: h } },
      { tag: 'circle', attrs: { cx, cy, r, fill: 'none' } },
      { tag: 'line', attrs: { x1: cx, y1: cy + r * 0.5, x2: cx, y2: cy - r * 0.5 } },
      { tag: 'polyline', attrs: { points: `${cx - 4},${cy - r * 0.2} ${cx},${cy - r * 0.5} ${cx + 4},${cy - r * 0.2}`, fill: 'none' } },
    ],
    pins: [{ dx: cx, dy: 0 }, { dx: cx, dy: h }],
    width: w, height: h,
  };
}

function diodeSymbol(flipped = false): SymbolDef {
  const w = GRID * 1.5, h = GRID;
  const cy = h / 2;
  const triW = h * 0.6;
  const cx = w / 2;
  // Non-flipped: anode left, triangle points right. Flipped: anode right,
  // triangle points left. Keeps pin positions identical so layout logic
  // (which remaps IR ports via flip2Term) does not need to know.
  const tipX = flipped ? cx - triW / 2 : cx + triW / 2;
  const baseX = flipped ? cx + triW / 2 : cx - triW / 2;
  const barX = tipX;

  return {
    elements: [
      { tag: 'line', attrs: { x1: 0, y1: cy, x2: flipped ? barX : baseX, y2: cy } },
      { tag: 'path', attrs: { d: `M${baseX},${cy - h * 0.35} L${tipX},${cy} L${baseX},${cy + h * 0.35} Z`, fill: 'none' } },
      { tag: 'line', attrs: { x1: barX, y1: cy - h * 0.35, x2: barX, y2: cy + h * 0.35 } },
      { tag: 'line', attrs: { x1: flipped ? baseX : barX, y1: cy, x2: w, y2: cy } },
    ],
    pins: [{ dx: 0, dy: cy }, { dx: w, dy: cy }],
    width: w, height: h,
  };
}

/** Vertical diode — pins on top (pin 0) and bottom (pin 1). Used when the
 * diode connects rails at different ranks (e.g. a freewheel diode hanging
 * from the switching node to ground in a buck converter). `flipped` points
 * the triangle upward (tip at top) when the IR port-0 (anode) gets remapped
 * to the bottom pin position via rank-driven flip — keeps current-flow arrow
 * running from anode to cathode visually. */
function verticalDiodeSymbol(stretchH?: number, flipped = false): SymbolDef {
  const w = GRID;
  const naturalH = GRID * 1.5;
  const h = Math.max(naturalH, stretchH ?? naturalH);
  const cx = w / 2;
  const bodyCenterY = h / 2;
  const triTop = bodyCenterY - w * 0.35;
  const triBot = bodyCenterY + w * 0.35;
  // Non-flipped: tip at triBot (triangle points down), cathode bar at triBot.
  // Flipped: tip at triTop (triangle points up), cathode bar at triTop.
  const tipY = flipped ? triTop : triBot;
  const baseY = flipped ? triBot : triTop;
  const barY = tipY;

  return {
    elements: [
      { tag: 'line', attrs: { x1: cx, y1: 0, x2: cx, y2: flipped ? barY : baseY } },
      { tag: 'path', attrs: { d: `M${cx - w * 0.35},${baseY} L${cx + w * 0.35},${baseY} L${cx},${tipY} Z`, fill: 'none' } },
      { tag: 'line', attrs: { x1: cx - w * 0.35, y1: barY, x2: cx + w * 0.35, y2: barY } },
      { tag: 'line', attrs: { x1: cx, y1: flipped ? baseY : barY, x2: cx, y2: h } },
    ],
    pins: [{ dx: cx, dy: 0 }, { dx: cx, dy: h }],
    width: w, height: h,
  };
}

function mosfetSymbol(): SymbolDef {
  const w = GRID * 2.5, h = GRID * 2.5;
  const cy = h / 2;
  const gx = w * 0.28;   // gate vertical line x
  const bx = w * 0.44;   // body (channel) line x — gap = gate oxide
  const gy0 = h * 0.28;  // drain y
  const gy1 = h * 0.72;  // source y

  return {
    elements: [
      { tag: 'line', attrs: { x1: 0, y1: cy, x2: gx, y2: cy } },               // gate lead
      { tag: 'line', attrs: { x1: gx, y1: gy0, x2: gx, y2: gy1 } },             // gate vline
      { tag: 'line', attrs: { x1: bx, y1: gy0, x2: bx, y2: gy1 } },             // body line
      { tag: 'line', attrs: { x1: bx, y1: gy0, x2: w, y2: gy0 } },               // drain tap
      { tag: 'line', attrs: { x1: bx, y1: gy1, x2: w, y2: gy1 } },               // source tap
      // arrow at source pointing toward body (NMOS style)
      { tag: 'polyline', attrs: { points: `${bx + 6},${gy1 - 4} ${bx},${gy1} ${bx + 6},${gy1 + 4}`, fill: 'none' } },
    ],
    pins: [
      { dx: w, dy: gy0 },   // drain (right upper)  — matches IR port 0
      { dx: 0, dy: cy },    // gate  (left centre)   — matches IR port 1
      { dx: w, dy: gy1 },   // source (right lower)  — matches IR port 2
    ],
    width: w, height: h,
  };
}

function bjtSymbol(): SymbolDef {
  const w = GRID * 2, h = GRID * 2;
  const bodyX = w * 0.45;
  const cy = h / 2;

  return {
    elements: [
      { tag: 'line', attrs: { x1: 0, y1: cy, x2: bodyX, y2: cy } },
      { tag: 'line', attrs: { x1: bodyX, y1: h * 0.25, x2: bodyX, y2: h * 0.75 } },
      { tag: 'line', attrs: { x1: bodyX, y1: h * 0.35, x2: w, y2: 0 } },
      { tag: 'line', attrs: { x1: bodyX, y1: h * 0.65, x2: w, y2: h } },
      { tag: 'polyline', attrs: { points: `${w - 8},${h - 2} ${w},${h} ${w - 2},${h - 8}`, fill: 'none' } },
    ],
    pins: [
      { dx: w, dy: 0 },
      { dx: 0, dy: cy },
      { dx: w, dy: h },
    ],
    width: w, height: h,
  };
}

function opampSymbol(): SymbolDef {
  const bodyW = GRID * 2.5;
  const h = GRID * 3;
  // The +in lead is extended further left than the -in lead. In the common
  // non-inverting topology (e.g. Sallen-Key voltage follower), the +in pin
  // connects to the external signal chain on the left while the -in pin
  // closes a local feedback loop to the output on the right. Putting +in
  // further left keeps each input's bus on its own side of the body so the
  // drop-wires do not cross each other's horizontal bus.
  const leadOffset = GRID;
  const bodyLeft = leadOffset + GRID * 0.5;
  const tipX = leadOffset + bodyW;
  const totalW = tipX + GRID * 0.5;
  const cy = h / 2;

  return {
    elements: [
      { tag: 'path', attrs: { d: `M${bodyLeft},0 L${tipX},${cy} L${bodyLeft},${h} Z`, fill: 'none' } },
      { tag: 'line', attrs: { x1: leadOffset, y1: h * 0.3, x2: bodyLeft, y2: h * 0.3 } },
      { tag: 'line', attrs: { x1: 0,          y1: h * 0.7, x2: bodyLeft, y2: h * 0.7 } },
      { tag: 'text', attrs: { x: bodyLeft + GRID * 0.15, y: h * 0.35, 'font-size': 10 }, text: '\u2013' },
      { tag: 'text', attrs: { x: bodyLeft + GRID * 0.15, y: h * 0.75, 'font-size': 10 }, text: '+' },
      { tag: 'line', attrs: { x1: tipX, y1: cy, x2: totalW, y2: cy } },
    ],
    pins: [
      { dx: 0,          dy: h * 0.7 },   // ctrlP (+in) — bottom, extended left
      { dx: leadOffset, dy: h * 0.3 },   // ctrlN (-in) — top
      { dx: totalW,     dy: cy },        // outP — right
    ],
    width: totalW, height: h,
  };
}

function groundSymbol(): SymbolDef {
  const w = GRID, h = GRID * 0.5;
  const cx = w / 2;
  const barGap = h / 3;

  return {
    elements: [
      { tag: 'line', attrs: { x1: cx - w * 0.4, y1: 0, x2: cx + w * 0.4, y2: 0 } },
      { tag: 'line', attrs: { x1: cx - w * 0.25, y1: barGap, x2: cx + w * 0.25, y2: barGap } },
      { tag: 'line', attrs: { x1: cx - w * 0.1, y1: barGap * 2, x2: cx + w * 0.1, y2: barGap * 2 } },
    ],
    pins: [{ dx: cx, dy: 0 }],
    width: w, height: h,
  };
}

function dependentSourceSymbol(): SymbolDef {
  const size = GRID * 2;
  const cx = size / 2, cy = size / 2;

  return {
    elements: [
      { tag: 'line', attrs: { x1: cx, y1: 0, x2: cx, y2: cy - size * 0.35 } },
      { tag: 'line', attrs: { x1: cx, y1: cy + size * 0.35, x2: cx, y2: size } },
      { tag: 'path', attrs: {
        d: `M${cx},${cy - size * 0.35} L${cx + size * 0.35},${cy} L${cx},${cy + size * 0.35} L${cx - size * 0.35},${cy} Z`,
        fill: 'none',
      }},
    ],
    pins: [{ dx: cx, dy: 0 }, { dx: cx, dy: size }],
    width: size, height: size,
  };
}

/** Look up the symbol definition for a device type. `stretchH` extends the
 * leads of vertical two-terminal symbols (V, I, C) so their pins sit flush on
 * the rank rails instead of needing a vertical drop-wire at each end. */
export function getSymbol(
  type: string,
  displayValue?: string,
  horizontal = false,
  stretchH?: number,
  stretchW?: number,
  flipped = false,
): SymbolDef {
  switch (type) {
    case 'R': return horizontal ? resistorSymbol(stretchW) : verticalResistorSymbol(stretchH);
    case 'C': return horizontal ? horizontalCapacitorSymbol(stretchW) : capacitorSymbol(stretchH);
    case 'L': return inductorSymbol();
    case 'V': return voltageSourceSymbol(
      (displayValue ?? '').toUpperCase().startsWith('AC') ||
      (displayValue ?? '').toUpperCase().startsWith('SIN'),
      stretchH,
    );
    case 'I': return currentSourceSymbol(stretchH);
    case 'D': return horizontal ? diodeSymbol(flipped) : verticalDiodeSymbol(stretchH, flipped);
    case 'Q': return bjtSymbol();
    case 'M': return mosfetSymbol();
    case 'E': case 'G': return opampSymbol();
    case 'F': case 'H': return dependentSourceSymbol();
    default: return resistorSymbol();
  }
}

export { groundSymbol };
