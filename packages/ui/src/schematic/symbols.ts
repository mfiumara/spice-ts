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
  // Klein-style 3-peak ANSI zigzag: pure triangle wave (no horizontal
  // segments). 7 segments total — narrower entry/exit half-segments and 5
  // full-amplitude transitions in between, matching klein's 3-5-5-5-5-5-4
  // proportions across a 32-wide body. Leads stretch with stretchW; the
  // zigzag body stays at natural proportions.
  const bodyW = naturalW * 0.8;
  const leadLeft = (w - bodyW) / 2;
  const amp = h * 0.45;
  const enter = (bodyW * 3) / 32;
  const full = (bodyW * 5) / 32;
  const exit = (bodyW * 4) / 32;

  let x = leadLeft + enter;
  let d = `M0,${cy} L${leadLeft},${cy} L${x},${cy - amp}`;
  let above = false;
  for (let i = 0; i < 5; i++) {
    x += full;
    d += ` L${x},${above ? cy - amp : cy + amp}`;
    above = !above;
  }
  x += exit;
  d += ` L${x},${cy} L${w},${cy}`;

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
  // Klein-style triangle-wave zigzag, vertical orientation. Same 3-peak shape
  // as the horizontal resistor, just rotated 90°. Leads grow with stretchH;
  // body stays at natural proportions.
  const bodyH = naturalH * 0.8;
  const leadTop = (h - bodyH) / 2;
  const amp = w * 0.45;
  const enter = (bodyH * 3) / 32;
  const full = (bodyH * 5) / 32;
  const exit = (bodyH * 4) / 32;

  let y = leadTop + enter;
  let d = `M${cx},0 L${cx},${leadTop} L${cx - amp},${y}`;
  let left = false;
  for (let i = 0; i < 5; i++) {
    y += full;
    d += ` L${left ? cx - amp : cx + amp},${y}`;
    left = !left;
  }
  y += exit;
  d += ` L${cx},${y} L${cx},${h}`;

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
  // Klein-style: wide plates (90% of bbox), tight gap (~25% of plate width).
  // Makes the cap read as two long parallel bars close together rather than
  // two stubby segments with a wide gap.
  const gap = 5;
  const plateW = w * 0.9;
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
  // Klein-style proportions matching `capacitorSymbol`.
  const gap = 5;
  const plateH = h * 0.9;
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
      { tag: 'path', attrs: { d: `M${baseX},${cy - h * 0.35} L${tipX},${cy} L${baseX},${cy + h * 0.35} Z`, fill: 'currentColor' } },
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
      { tag: 'path', attrs: { d: `M${cx - w * 0.35},${baseY} L${cx + w * 0.35},${baseY} L${cx},${tipY} Z`, fill: 'currentColor' } },
      { tag: 'line', attrs: { x1: cx - w * 0.35, y1: barY, x2: cx + w * 0.35, y2: barY } },
      { tag: 'line', attrs: { x1: cx, y1: flipped ? baseY : barY, x2: cx, y2: h } },
    ],
    pins: [{ dx: cx, dy: 0 }, { dx: cx, dy: h }],
    width: w, height: h,
  };
}

/** Klein-style MOSFET. Pads exit upward and downward via L-shaped routes to
 * top/bottom edges (instead of straight off the right side). NMOS gets its
 * arrow on the bottom L-pad pointing right (out of body); PMOS gets it on the
 * top L-pad pointing left (into body). Pin geometry is always NMOS-shaped —
 * port 0 (drain) at top, port 2 (source) at bottom — and `layout.ts`'s
 * `flipForP` already swaps the port-to-symbol-pin mapping for PMOS, so the
 * source semantically sits at the top edge in the placed schematic. */
function mosfetSymbol(displayValue?: string): SymbolDef {
  const isPMOS = (displayValue ?? '').toUpperCase().startsWith('P');
  const w = GRID * 2.5, h = GRID * 2.5;
  const cy = h / 2;
  // Klein proportions (60×60 reference) scaled to the layout's 50×50 bbox.
  const gx = (w * 16) / 60;       // gate vertical line x
  const bx = (w * 22) / 60;       // channel (body) line x
  const padX = (w * 45) / 60;     // L-pad turn x
  const gateTopY = (h * 18) / 60; // gate vline span
  const gateBotY = (h * 42) / 60;
  const chTopY = (h * 15) / 60;   // channel vline span (longer than gate)
  const chBotY = (h * 45) / 60;
  const topPadY = (h * 20) / 60;  // y where top L-pad branches off channel
  const botPadY = (h * 40) / 60;

  // Arrow on the source pad. The layout swaps drain/source positions for
  // PMOS, so we just draw the arrow at whichever L-pad ends up holding the
  // source after the flip:
  //   NMOS: arrow on bottom L-pad, points right (out of body).
  //   PMOS: arrow on top L-pad, points left (into body).
  const arrowY = isPMOS ? topPadY : botPadY;
  const arrowTipX = isPMOS ? w * 0.50 : w * 0.63;
  const arrowBaseX = isPMOS ? w * 0.63 : w * 0.50;
  const arrowHalfBase = 3.5;
  const arrow = `M${arrowTipX} ${arrowY} L${arrowBaseX} ${arrowY - arrowHalfBase} L${arrowBaseX} ${arrowY + arrowHalfBase} Z`;

  return {
    elements: [
      { tag: 'line', attrs: { x1: 0, y1: cy, x2: gx, y2: cy } },
      { tag: 'line', attrs: { x1: gx, y1: gateTopY, x2: gx, y2: gateBotY } },
      { tag: 'line', attrs: { x1: bx, y1: chTopY, x2: bx, y2: chBotY } },
      { tag: 'path', attrs: { d: `M${bx} ${topPadY} L${padX} ${topPadY} L${padX} 0`, fill: 'none' } },
      { tag: 'path', attrs: { d: `M${bx} ${botPadY} L${padX} ${botPadY} L${padX} ${h}`, fill: 'none' } },
      { tag: 'path', attrs: { d: arrow, fill: 'currentColor' } },
    ],
    pins: [
      { dx: padX, dy: 0 },  // port 0 (drain for NMOS / source for PMOS after flip)
      { dx: 0,    dy: cy }, // port 1 (gate)
      { dx: padX, dy: h },  // port 2 (source for NMOS / drain for PMOS after flip)
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
  // Triangle proportions match klein's elongated 40×50 body (tip extends 0.8×
  // base height, vs the squatter 0.67× we had before). Reducing h from 3·GRID
  // to 2.5·GRID also tightens the input lead spread.
  const h = GRID * 2.5;
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

  // Klein-style +/- markers, drawn as line strokes (no unicode glyphs). Klein
  // spreads the input leads near the triangle corners (y=20% / y=80%) and
  // tucks the +/- markers ~10% of bbox-height inboard from the leads — so the
  // marker reads as a label on its input rather than crowding the centerline.
  const inMinusY = h * 0.2;
  const inPlusY = h * 0.8;
  const markX = bodyLeft + GRID * 0.4;
  const markBar = GRID * 0.18;
  const minusY = h * 0.3;
  const plusY = h * 0.7;

  return {
    elements: [
      { tag: 'path', attrs: { d: `M${bodyLeft},0 L${tipX},${cy} L${bodyLeft},${h} Z`, fill: 'none' } },
      { tag: 'line', attrs: { x1: leadOffset, y1: inMinusY, x2: bodyLeft, y2: inMinusY } },
      { tag: 'line', attrs: { x1: 0,          y1: inPlusY,  x2: bodyLeft, y2: inPlusY } },
      { tag: 'line', attrs: { x1: markX - markBar, y1: minusY, x2: markX + markBar, y2: minusY } },
      { tag: 'line', attrs: { x1: markX - markBar, y1: plusY,  x2: markX + markBar, y2: plusY } },
      { tag: 'line', attrs: { x1: markX,           y1: plusY - markBar, x2: markX, y2: plusY + markBar } },
      { tag: 'line', attrs: { x1: tipX, y1: cy, x2: totalW, y2: cy } },
    ],
    pins: [
      { dx: 0,          dy: inPlusY },   // ctrlP (+in) — bottom, extended left
      { dx: leadOffset, dy: inMinusY },  // ctrlN (-in) — top
      { dx: totalW,     dy: cy },        // outP — right
    ],
    width: totalW, height: h,
  };
}

function groundSymbol(): SymbolDef {
  // Klein-flavored: three graduated bars at 4px vertical spacing, widths
  // shrinking 18 → 12 → 6 (a 3:2:1 progression — klein's signature). Stays
  // within a 20×12 bbox so the layout's vertical reservation for ground stubs
  // doesn't shift. No stem — the layout already adds a downward stub for
  // side-pin ground connections.
  const w = GRID, h = 12;
  const cx = w / 2;

  return {
    elements: [
      { tag: 'line', attrs: { x1: cx - 9, y1: 0, x2: cx + 9, y2: 0 } },
      { tag: 'line', attrs: { x1: cx - 6, y1: 4, x2: cx + 6, y2: 4 } },
      { tag: 'line', attrs: { x1: cx - 3, y1: 8, x2: cx + 3, y2: 8 } },
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
    case 'M': return mosfetSymbol(displayValue);
    case 'E': case 'G': return opampSymbol();
    case 'F': case 'H': return dependentSourceSymbol();
    default: return resistorSymbol();
  }
}

export { groundSymbol };
