// packages/ui/src/schematic/symbol-styles.ts
//
// Themed symbol library — 7 visual styles, pin-perfect on a 10px grid.
// Each style is a complete symbol set rendered as SVG <g> string fragments;
// callers inline the fragment inside their own <svg> wrapper. Pins are at
// fixed positions across all styles so the active style can be swapped at
// runtime without touching layout. This is a pure theming layer — geometric
// pin metadata for layout still lives in symbols.ts (`SymbolDef`).
//
// Pin map (relative to each symbol's bbox, all 60×40 unless noted):
//   2-pin horizontal: left (0, 20), right (60, 20)
//   3-pin (transistors, op-amps, pot, ground, vcc): see per-style notes
// All strokes use `currentColor` so styles theme via CSS color.
//
// Export shape:
//   SYMBOL_STYLES        — record of all styles keyed by SymbolStyleId
//   DEFAULT_STYLE_ID     — 'klein' (active until callers opt into theming)
//   SymbolStyle          — theme metadata + component SVG fragments
//   ComponentName        — union of every component slot a style provides

export type ComponentName =
  | 'resistor'
  | 'capacitor'
  | 'capacitorPolar'
  | 'inductor'
  | 'diode'
  | 'led'
  | 'zener'
  | 'vsource'
  | 'acsource'
  | 'isource'
  | 'ground'
  | 'vcc'
  | 'switch'
  | 'pot'
  | 'npn'
  | 'pnp'
  | 'nmos'
  | 'pmos'
  | 'opamp'
  | 'crystal'
  | 'transformer';

export interface SymbolStyle {
  /** Page background color */
  bg: string;
  /** Primary stroke / foreground color */
  fg: string;
  /** Accent color for highlights / fills */
  accent: string;
  /** Optional secondary accent (only some styles) */
  accent2?: string;
  /** CSS font stack used for any text inside the symbols and labels */
  font: string;
  /** Grid line color (0 alpha to hide) */
  gridColor: string;
  /** Default stroke width — matches the stroke-width baked into each fragment */
  stroke: number;
  /** True if the style emits inner <filter url(#neonGlow)> refs (caller must define the filter) */
  glow?: boolean;
  /** Filter URL applied to the outer wrapper (e.g. napkin jitter) */
  filter?: string;
  /** SVG <g> fragment per component, ready to inline into a parent <svg> */
  components: Record<ComponentName, string>;
}

export type SymbolStyleId = 'klein' | 'playful' | 'ieee' | 'iso' | 'neon' | 'mini' | 'napkin';

// ---------------------------------------------------------------------------
// 1. MORITZ KLEIN — marker on grid paper. Wobbly strokes, slight rotation.
// ---------------------------------------------------------------------------
const klein: SymbolStyle = {
  bg: '#f4ecd8',
  fg: '#1a2540',
  accent: '#c23b22',
  font: "'Caveat', 'Kalam', cursive",
  gridColor: 'rgba(80, 110, 160, 0.25)',
  stroke: 2.2,
  components: {
    resistor: `<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M0 20 L14 20" />
    <path d="M14 20 L17 10 L22 30 L27 10 L32 30 L37 10 L42 30 L46 20" />
    <path d="M46 20 L60 20" />
  </g>`,
    capacitor: `<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
    <path d="M0 20 L27 20" />
    <path d="M27 8 L27 32" />
    <path d="M33 8 L33 32" />
    <path d="M33 20 L60 20" />
  </g>`,
    capacitorPolar: `<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
    <path d="M0 20 L25 20" />
    <path d="M25 8 L25 32" />
    <path d="M33 10 Q27 20 33 30" />
    <path d="M41 20 L60 20" />
    <path d="M10 9 L16 9" stroke-width="2" />
    <path d="M13 6 L13 12" stroke-width="2" />
  </g>`,
    inductor: `<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
    <path d="M0 20 L12 20" />
    <path d="M12 20 Q15 8 21 20 Q24 8 30 20 Q33 8 39 20 Q42 8 48 20" />
    <path d="M48 20 L60 20" />
  </g>`,
    diode: `<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M0 20 L22 20" />
    <path d="M22 10 L22 30 L38 20 Z" fill="currentColor" />
    <path d="M38 10 L38 30" />
    <path d="M38 20 L60 20" />
  </g>`,
    led: `<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M0 20 L22 20" />
    <path d="M22 10 L22 30 L38 20 Z" fill="currentColor" />
    <path d="M38 10 L38 30" />
    <path d="M38 20 L60 20" />
    <path d="M42 6 L48 2 M46 2 L48 2 L48 4" stroke-width="1.8" />
    <path d="M48 10 L54 6 M52 6 L54 6 L54 8" stroke-width="1.8" />
  </g>`,
    zener: `<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M0 20 L22 20" />
    <path d="M22 10 L22 30 L38 20 Z" fill="currentColor" />
    <path d="M34 8 L38 10 L38 30 L42 32" />
    <path d="M38 20 L60 20" />
  </g>`,
    vsource: `<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
    <path d="M0 20 L16 20" />
    <circle cx="30" cy="20" r="14" />
    <path d="M44 20 L60 20" />
    <path d="M26 13 L34 13" stroke-width="2.4" />
    <path d="M30 9 L30 17" stroke-width="2.4" />
    <path d="M26 27 L34 27" stroke-width="2.4" />
  </g>`,
    acsource: `<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
    <path d="M0 20 L16 20" />
    <circle cx="30" cy="20" r="14" />
    <path d="M22 20 Q26 12 30 20 T38 20" />
    <path d="M44 20 L60 20" />
  </g>`,
    isource: `<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M0 20 L16 20" />
    <circle cx="30" cy="20" r="14" />
    <path d="M22 20 L34 20" />
    <path d="M38 20 L32 16 L32 24 Z" fill="currentColor" stroke="currentColor" />
    <path d="M44 20 L60 20" />
  </g>`,
    ground: `<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
    <path d="M30 0 L30 16" />
    <path d="M18 16 L42 16" />
    <path d="M22 22 L38 22" />
    <path d="M26 28 L34 28" />
  </g>`,
    vcc: `<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
    <path d="M30 28 L30 10" />
    <path d="M20 10 L40 10" />
  </g>`,
    switch: `<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
    <path d="M0 20 L18 20" />
    <circle cx="20" cy="20" r="2.2" fill="currentColor" />
    <path d="M20 20 L42 10" />
    <circle cx="42" cy="20" r="2.2" fill="currentColor" />
    <path d="M44 20 L60 20" />
  </g>`,
    pot: `<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M0 20 L14 20" />
    <path d="M14 20 L17 10 L22 30 L27 10 L32 30 L37 10 L42 30 L46 20" />
    <path d="M46 20 L60 20" />
    <path d="M30 0 L30 10" />
    <path d="M26 5 L30 10 L34 5" />
  </g>`,
    npn: `<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M0 30 L18 30" />
    <path d="M18 15 L18 45" />
    <path d="M18 25 L45 8 L45 0" />
    <path d="M18 35 L45 52 L45 60" />
    <path d="M43.5 49.8 L34.6 48.9 L38.9 42.2 Z" fill="currentColor" stroke="currentColor" />
    <circle cx="30" cy="30" r="24" opacity="0.5" />
  </g>`,
    pnp: `<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M0 30 L18 30" />
    <path d="M18 15 L18 45" />
    <path d="M18 25 L45 8 L45 0" />
    <path d="M18 35 L45 52 L45 60" />
    <path d="M18 35 L26.9 35.9 L22.6 42.6 Z" fill="currentColor" stroke="currentColor" />
    <circle cx="30" cy="30" r="24" opacity="0.5" />
  </g>`,
    nmos: `<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M0 30 L16 30" />
    <path d="M16 18 L16 42" />
    <path d="M22 15 L22 45" />
    <path d="M22 20 L45 20 L45 0" />
    <path d="M22 40 L45 40 L45 60" />
    <path d="M38 40 L30 36 L30 44 Z" fill="currentColor" stroke="currentColor" />
  </g>`,
    pmos: `<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M0 30 L16 30" />
    <path d="M16 18 L16 42" />
    <path d="M22 15 L22 45" />
    <path d="M22 20 L45 20 L45 0" />
    <path d="M22 40 L45 40 L45 60" />
    <path d="M30 20 L38 16 L38 24 Z" fill="currentColor" stroke="currentColor" />
  </g>`,
    opamp: `<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M0 10 L12 10" />
    <path d="M0 40 L12 40" />
    <path d="M12 0 L12 50 L52 25 Z" />
    <path d="M52 25 L60 25" />
    <path d="M17 15 L25 15" stroke-width="2.6" />
    <path d="M17 35 L25 35" stroke-width="2.6" />
    <path d="M21 31 L21 39" stroke-width="2.6" />
  </g>`,
    crystal: `<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
    <path d="M0 20 L22 20" />
    <path d="M22 10 L22 30" />
    <rect x="25" y="10" width="10" height="20" />
    <path d="M38 10 L38 30" />
    <path d="M38 20 L60 20" />
  </g>`,
    transformer: `<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
    <path d="M0 5 L18 5 Q22 12 18 20 Q22 28 18 35 L0 35" />
    <path d="M80 5 L62 5 Q58 12 62 20 Q58 28 62 35 L80 35" />
    <path d="M36 5 L36 35 M44 5 L44 35" />
  </g>`,
  },
};

// ---------------------------------------------------------------------------
// 2. PLAYFUL — rounded, chunky strokes, friendly proportions
// ---------------------------------------------------------------------------
const playful: SymbolStyle = {
  bg: '#fff8ee',
  fg: '#2a1f3d',
  accent: '#ff6b9d',
  accent2: '#6bcfff',
  font: "'Nunito', 'Quicksand', sans-serif",
  gridColor: 'rgba(160, 120, 200, 0.12)',
  stroke: 3.2,
  components: {
    resistor: `<g fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M0 20 L12 20" />
    <rect x="12" y="12" width="36" height="16" rx="8" fill="#ff6b9d" stroke="currentColor" />
    <path d="M48 20 L60 20" />
  </g>`,
    capacitor: `<g fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round">
    <path d="M0 20 L26 20" />
    <path d="M26 10 L26 30" stroke-width="4" />
    <path d="M34 10 L34 30" stroke-width="4" />
    <path d="M34 20 L60 20" />
  </g>`,
    capacitorPolar: `<g fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round">
    <path d="M0 20 L26 20" />
    <path d="M26 10 L26 30" stroke-width="4" />
    <path d="M30 12 Q36 20 30 28" stroke-width="4" />
    <path d="M38 20 L60 20" />
    <circle cx="20" cy="10" r="3" fill="#ff6b9d" stroke="none" />
    <text x="17" y="13" font-size="7" stroke="none" fill="white" font-weight="900">+</text>
  </g>`,
    inductor: `<g fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round">
    <path d="M0 20 L10 20" />
    <circle cx="17" cy="20" r="6" />
    <circle cx="27" cy="20" r="6" />
    <circle cx="37" cy="20" r="6" />
    <circle cx="47" cy="20" r="6" />
    <path d="M50 20 L60 20" />
  </g>`,
    diode: `<g fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M0 20 L22 20" />
    <path d="M22 10 L22 30 L38 20 Z" fill="#6bcfff" stroke="currentColor" />
    <path d="M38 10 L38 30" stroke-width="4" />
    <path d="M38 20 L60 20" />
  </g>`,
    led: `<g fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M0 20 L22 20" />
    <path d="M22 10 L22 30 L38 20 Z" fill="#ffd93d" stroke="currentColor" />
    <path d="M38 10 L38 30" stroke-width="4" />
    <path d="M38 20 L60 20" />
    <g stroke-width="2.4">
      <path d="M44 8 L50 2" />
      <path d="M48 2 L50 2 L50 4" />
      <path d="M50 12 L56 6" />
      <path d="M54 6 L56 6 L56 8" />
    </g>
  </g>`,
    zener: `<g fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M0 20 L22 20" />
    <path d="M22 10 L22 30 L38 20 Z" fill="#6bcfff" stroke="currentColor" />
    <path d="M34 8 L38 10 L38 30 L42 32" stroke-width="4" />
    <path d="M38 20 L60 20" />
  </g>`,
    vsource: `<g fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round">
    <path d="M0 20 L16 20" />
    <circle cx="30" cy="20" r="14" fill="#ffd93d" stroke="currentColor" />
    <path d="M44 20 L60 20" />
    <path d="M26 13 L34 13 M30 9 L30 17" stroke-width="2.6" />
    <path d="M26 27 L34 27" stroke-width="2.6" />
  </g>`,
    acsource: `<g fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round">
    <path d="M0 20 L16 20" />
    <circle cx="30" cy="20" r="14" fill="#ffd93d" stroke="currentColor" />
    <path d="M22 20 Q26 12 30 20 T38 20" stroke-width="2.6" />
    <path d="M44 20 L60 20" />
  </g>`,
    isource: `<g fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M0 20 L16 20" />
    <circle cx="30" cy="20" r="14" fill="#b8e6ff" stroke="currentColor" />
    <path d="M30 12 L30 28 M24 22 L30 28 L36 22" stroke-width="2.6" />
    <path d="M44 20 L60 20" />
  </g>`,
    ground: `<g fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round">
    <path d="M30 0 L30 14" />
    <rect x="16" y="14" width="28" height="6" rx="3" fill="currentColor" />
    <path d="M22 24 L38 24" />
    <path d="M26 30 L34 30" />
  </g>`,
    vcc: `<g fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round">
    <path d="M30 28 L30 12" />
    <circle cx="30" cy="8" r="5" fill="#ff6b9d" stroke="currentColor" />
  </g>`,
    switch: `<g fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round">
    <path d="M0 20 L16 20" />
    <circle cx="20" cy="20" r="3.5" fill="currentColor" />
    <path d="M20 20 L40 8" />
    <circle cx="42" cy="20" r="3.5" fill="currentColor" />
    <path d="M44 20 L60 20" />
  </g>`,
    pot: `<g fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M0 20 L12 20" />
    <rect x="12" y="12" width="36" height="16" rx="8" fill="#ff6b9d" stroke="currentColor" />
    <path d="M48 20 L60 20" />
    <path d="M30 0 L30 8" />
    <path d="M25 6 L30 12 L35 6" fill="currentColor" />
  </g>`,
    npn: `<g fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="30" cy="30" r="26" fill="#fff0f6" stroke="currentColor" />
    <path d="M0 30 L18 30" />
    <path d="M18 16 L18 44" stroke-width="4" />
    <path d="M18 26 L42 10 L45 0" />
    <path d="M18 34 L42 50 L45 60" />
    <path d="M42 50 L33 48 M42 50 L40 42" fill="currentColor" />
  </g>`,
    pnp: `<g fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="30" cy="30" r="26" fill="#e6f7ff" stroke="currentColor" />
    <path d="M0 30 L18 30" />
    <path d="M18 16 L18 44" stroke-width="4" />
    <path d="M18 26 L42 10 L45 0" />
    <path d="M18 34 L42 50 L45 60" />
    <path d="M24 34 L18 36 L20 28" fill="currentColor" />
  </g>`,
    nmos: `<g fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="30" cy="30" r="26" fill="#fff0f6" stroke="currentColor" />
    <path d="M0 30 L14 30" />
    <path d="M14 18 L14 42" stroke-width="4" />
    <path d="M20 15 L20 25 M20 28 L20 32 M20 35 L20 45" stroke-width="4" />
    <path d="M20 20 L45 20 L45 0" />
    <path d="M20 40 L45 40 L45 60" />
    <path d="M28 30 L34 26 L34 34 Z" fill="currentColor" />
  </g>`,
    pmos: `<g fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="30" cy="30" r="26" fill="#e6f7ff" stroke="currentColor" />
    <path d="M0 30 L12 30" />
    <circle cx="15" cy="30" r="2.5" fill="white" />
    <path d="M18 18 L18 42" stroke-width="4" />
    <path d="M22 15 L22 25 M22 28 L22 32 M22 35 L22 45" stroke-width="4" />
    <path d="M22 20 L45 20 L45 0" />
    <path d="M22 40 L45 40 L45 60" />
    <path d="M34 26 L28 30 L34 34 Z" fill="currentColor" />
  </g>`,
    opamp: `<g fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M0 10 L12 10" />
    <path d="M0 40 L12 40" />
    <path d="M12 0 L12 50 L52 25 Z" fill="#ffd93d" stroke="currentColor" />
    <path d="M52 25 L60 25" />
    <path d="M17 10 L23 10" stroke-width="2.4" />
    <path d="M17 40 L23 40 M20 37 L20 43" stroke-width="2.4" />
  </g>`,
    crystal: `<g fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round">
    <path d="M0 20 L22 20" />
    <path d="M22 10 L22 30" stroke-width="4" />
    <rect x="25" y="10" width="10" height="20" rx="3" fill="#b8e6ff" stroke="currentColor" />
    <path d="M38 10 L38 30" stroke-width="4" />
    <path d="M38 20 L60 20" />
  </g>`,
    transformer: `<g fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round">
    <path d="M0 5 L14 5" />
    <circle cx="18" cy="8" r="4" />
    <circle cx="18" cy="20" r="4" />
    <circle cx="18" cy="32" r="4" />
    <path d="M18 36 L0 35" />
    <path d="M80 5 L66 5" />
    <circle cx="62" cy="8" r="4" />
    <circle cx="62" cy="20" r="4" />
    <circle cx="62" cy="32" r="4" />
    <path d="M62 36 L80 35" />
    <path d="M36 5 L36 35 M44 5 L44 35" stroke-width="2" />
  </g>`,
  },
};

// ---------------------------------------------------------------------------
// 3. IEEE TECHNICAL TEXTBOOK — precise, thin, ANSI zigzag resistor
// ---------------------------------------------------------------------------
const ieee: SymbolStyle = {
  bg: '#ffffff',
  fg: '#111111',
  accent: '#0033aa',
  font: "'IBM Plex Mono', 'Courier New', monospace",
  gridColor: 'rgba(0, 0, 0, 0.06)',
  stroke: 1.4,
  components: {
    resistor: `<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="miter">
    <path d="M0 20 L15 20 L18 12 L23 28 L28 12 L33 28 L38 12 L42 28 L45 20 L60 20" />
  </g>`,
    capacitor: `<g fill="none" stroke="currentColor" stroke-width="1.4">
    <path d="M0 20 L27 20" />
    <path d="M27 8 L27 32" />
    <path d="M33 8 L33 32" />
    <path d="M33 20 L60 20" />
  </g>`,
    capacitorPolar: `<g fill="none" stroke="currentColor" stroke-width="1.4">
    <path d="M0 20 L27 20" />
    <path d="M27 8 L27 32" />
    <path d="M33 8 Q37 20 33 32" />
    <path d="M37 20 L60 20" />
    <text x="19" y="9" font-size="7" stroke="none" fill="currentColor" font-family="inherit">+</text>
  </g>`,
    inductor: `<g fill="none" stroke="currentColor" stroke-width="1.4">
    <path d="M0 20 L12 20" />
    <path d="M12 20 A4 4 0 0 1 20 20 A4 4 0 0 1 28 20 A4 4 0 0 1 36 20 A4 4 0 0 1 44 20 A4 4 0 0 1 48 20" />
    <path d="M48 20 L60 20" />
  </g>`,
    diode: `<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="miter">
    <path d="M0 20 L22 20" />
    <path d="M22 10 L22 30 L38 20 Z" fill="currentColor" />
    <path d="M38 10 L38 30" />
    <path d="M38 20 L60 20" />
  </g>`,
    led: `<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="miter">
    <path d="M0 20 L22 20" />
    <path d="M22 10 L22 30 L38 20 Z" fill="currentColor" />
    <path d="M38 10 L38 30" />
    <path d="M38 20 L60 20" />
    <path d="M42 6 L48 2 M46 2 L48 2 L48 4" stroke-width="1.2" />
    <path d="M48 10 L54 6 M52 6 L54 6 L54 8" stroke-width="1.2" />
  </g>`,
    zener: `<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="miter">
    <path d="M0 20 L22 20" />
    <path d="M22 10 L22 30 L38 20 Z" fill="currentColor" />
    <path d="M34 8 L38 10 L38 30 L42 32" />
    <path d="M38 20 L60 20" />
  </g>`,
    vsource: `<g fill="none" stroke="currentColor" stroke-width="1.4">
    <path d="M0 20 L16 20" />
    <circle cx="30" cy="20" r="14" />
    <path d="M44 20 L60 20" />
    <text x="25" y="16" font-size="11" stroke="none" fill="currentColor" font-family="inherit">+</text>
    <text x="25" y="32" font-size="11" stroke="none" fill="currentColor" font-family="inherit">−</text>
  </g>`,
    acsource: `<g fill="none" stroke="currentColor" stroke-width="1.4">
    <path d="M0 20 L16 20" />
    <circle cx="30" cy="20" r="14" />
    <path d="M22 20 Q26 12 30 20 T38 20" />
    <path d="M44 20 L60 20" />
  </g>`,
    isource: `<g fill="none" stroke="currentColor" stroke-width="1.4">
    <path d="M0 20 L16 20" />
    <circle cx="30" cy="20" r="14" />
    <path d="M22 20 L38 20 M34 16 L38 20 L34 24" />
    <path d="M44 20 L60 20" />
  </g>`,
    ground: `<g fill="none" stroke="currentColor" stroke-width="1.4">
    <path d="M30 0 L30 16" />
    <path d="M16 16 L44 16" />
    <path d="M22 22 L38 22" />
    <path d="M26 28 L34 28" />
  </g>`,
    vcc: `<g fill="none" stroke="currentColor" stroke-width="1.4">
    <path d="M30 30 L30 10" />
    <path d="M20 10 L40 10" />
    <text x="22" y="6" font-size="7" stroke="none" fill="currentColor" font-family="inherit">VCC</text>
  </g>`,
    switch: `<g fill="none" stroke="currentColor" stroke-width="1.4">
    <path d="M0 20 L18 20" />
    <circle cx="20" cy="20" r="1.5" fill="currentColor" />
    <path d="M20 20 L42 10" />
    <circle cx="42" cy="20" r="1.5" fill="currentColor" />
    <path d="M44 20 L60 20" />
  </g>`,
    pot: `<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="miter">
    <path d="M0 20 L15 20 L18 12 L23 28 L28 12 L33 28 L38 12 L42 28 L45 20 L60 20" />
    <path d="M30 0 L30 10" />
    <path d="M26 5 L30 10 L34 5" fill="currentColor" />
  </g>`,
    npn: `<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="miter">
    <circle cx="30" cy="30" r="20" />
    <path d="M0 30 L18 30" />
    <path d="M18 16 L18 44" />
    <path d="M18 26 L42 10 L45 0" />
    <path d="M18 34 L42 50 L45 60" />
    <path d="M42 50 L36 48 L39 42 Z" fill="currentColor" />
  </g>`,
    pnp: `<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="miter">
    <circle cx="30" cy="30" r="20" />
    <path d="M0 30 L18 30" />
    <path d="M18 16 L18 44" />
    <path d="M18 26 L42 10 L45 0" />
    <path d="M18 34 L42 50 L45 60" />
    <path d="M24 34 L18 36 L20 28 Z" fill="currentColor" />
  </g>`,
    nmos: `<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="miter">
    <path d="M0 30 L14 30" />
    <path d="M14 18 L14 42" />
    <path d="M18 15 L18 25 M18 28 L18 32 M18 35 L18 45" />
    <path d="M18 20 L45 20 L45 0" />
    <path d="M18 40 L45 40 L45 60" />
    <path d="M26 30 L32 27 L32 33 Z" fill="currentColor" />
  </g>`,
    pmos: `<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="miter">
    <path d="M0 30 L12 30" />
    <circle cx="15" cy="30" r="2" />
    <path d="M18 18 L18 42" />
    <path d="M22 15 L22 25 M22 28 L22 32 M22 35 L22 45" />
    <path d="M22 20 L45 20 L45 0" />
    <path d="M22 40 L45 40 L45 60" />
    <path d="M32 27 L26 30 L32 33 Z" fill="currentColor" />
  </g>`,
    opamp: `<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="miter">
    <path d="M0 10 L12 10" />
    <path d="M0 40 L12 40" />
    <path d="M12 0 L12 50 L52 25 Z" />
    <path d="M52 25 L60 25" />
    <text x="15" y="13" font-size="7" stroke="none" fill="currentColor" font-family="inherit">−</text>
    <text x="15" y="43" font-size="7" stroke="none" fill="currentColor" font-family="inherit">+</text>
  </g>`,
    crystal: `<g fill="none" stroke="currentColor" stroke-width="1.4">
    <path d="M0 20 L22 20" />
    <path d="M22 10 L22 30" />
    <rect x="25" y="12" width="10" height="16" />
    <path d="M38 10 L38 30" />
    <path d="M38 20 L60 20" />
  </g>`,
    transformer: `<g fill="none" stroke="currentColor" stroke-width="1.4">
    <path d="M0 5 L18 5 A4 4 0 0 1 18 13 A4 4 0 0 1 18 21 A4 4 0 0 1 18 29 A4 4 0 0 1 18 35 L0 35" />
    <path d="M80 5 L62 5 A4 4 0 0 0 62 13 A4 4 0 0 0 62 21 A4 4 0 0 0 62 29 A4 4 0 0 0 62 35 L80 35" />
    <path d="M36 5 L36 35 M44 5 L44 35" />
  </g>`,
  },
};

// ---------------------------------------------------------------------------
// 4. ISOMETRIC 3D — dimetric view with drop shadows
// ---------------------------------------------------------------------------
const iso: SymbolStyle = {
  bg: '#eef1f6',
  fg: '#223',
  accent: '#4f6bff',
  font: "'Inter', system-ui, sans-serif",
  gridColor: 'rgba(80,90,140,0.08)',
  stroke: 1.6,
  components: {
    resistor: `<g stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
    <path d="M0 20 L16 20" fill="none" />
    <path d="M16 14 L44 14 L48 20 L48 26 L20 26 L16 20 Z" fill="#c9a063" />
    <path d="M16 14 L20 20 L48 20" fill="none" />
    <path d="M20 26 L20 20" fill="none" />
    <path d="M24 14 L24 20 L24 26 M30 14 L30 20 L30 26 M36 14 L36 20 L36 26" fill="none" stroke="#8b6434" />
    <path d="M48 20 L60 20" fill="none" />
  </g>`,
    capacitor: `<g stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
    <path d="M0 20 L24 20" fill="none" />
    <path d="M24 8 L28 12 L28 32 L24 28 Z" fill="#d0d6e0" />
    <path d="M24 8 L24 28" fill="none" />
    <path d="M34 8 L38 12 L38 32 L34 28 Z" fill="#d0d6e0" />
    <path d="M34 8 L34 28" fill="none" />
    <path d="M34 20 L60 20" fill="none" />
  </g>`,
    capacitorPolar: `<g stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
    <path d="M0 20 L20 20" fill="none" />
    <ellipse cx="30" cy="20" rx="10" ry="14" fill="#1a1a2e" />
    <ellipse cx="30" cy="20" rx="10" ry="14" fill="none" stroke="#4f6bff" />
    <path d="M40 20 L60 20" fill="none" />
    <text x="24" y="10" font-size="7" stroke="none" fill="#4f6bff" font-family="inherit">+</text>
  </g>`,
    inductor: `<g stroke="currentColor" stroke-width="1.6" fill="none">
    <path d="M0 20 L12 20" />
    <ellipse cx="18" cy="20" rx="4" ry="8" fill="#b8a88a" stroke="currentColor" />
    <ellipse cx="26" cy="20" rx="4" ry="8" fill="#b8a88a" stroke="currentColor" />
    <ellipse cx="34" cy="20" rx="4" ry="8" fill="#b8a88a" stroke="currentColor" />
    <ellipse cx="42" cy="20" rx="4" ry="8" fill="#b8a88a" stroke="currentColor" />
    <path d="M48 20 L60 20" />
  </g>`,
    diode: `<g stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
    <path d="M0 20 L20 20" fill="none" />
    <path d="M20 10 L20 30 L36 20 Z" fill="#333" />
    <path d="M36 10 L40 14 L40 30 L36 26 Z" fill="#888" />
    <path d="M36 10 L36 26" fill="none" />
    <path d="M40 20 L60 20" fill="none" />
  </g>`,
    led: `<g stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
    <path d="M0 20 L20 20" fill="none" />
    <path d="M20 10 L20 30 L36 20 Z" fill="#d93030" />
    <path d="M36 10 L40 14 L40 30 L36 26 Z" fill="#666" />
    <path d="M36 10 L36 26" fill="none" />
    <path d="M40 20 L60 20" fill="none" />
    <path d="M42 6 L50 0 M48 0 L50 0 L50 2" fill="none" stroke="#d93030" />
    <path d="M48 10 L56 4 M54 4 L56 4 L56 6" fill="none" stroke="#d93030" />
  </g>`,
    zener: `<g stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
    <path d="M0 20 L20 20" fill="none" />
    <path d="M20 10 L20 30 L36 20 Z" fill="#333" />
    <path d="M32 8 L36 10 L36 30 L40 32" fill="none" />
    <path d="M36 20 L60 20" fill="none" />
  </g>`,
    vsource: `<g stroke="currentColor" stroke-width="1.6">
    <path d="M0 20 L16 20" fill="none" />
    <ellipse cx="30" cy="22" rx="14" ry="4" fill="#888" />
    <path d="M16 20 L16 18 A14 4 0 0 0 44 18 L44 20" fill="#bbb" />
    <ellipse cx="30" cy="18" rx="14" ry="4" fill="#ddd" />
    <path d="M44 20 L60 20" fill="none" />
    <text x="25" y="15" font-size="9" stroke="none" fill="#223" font-family="inherit">+</text>
  </g>`,
    acsource: `<g stroke="currentColor" stroke-width="1.6">
    <path d="M0 20 L16 20" fill="none" />
    <ellipse cx="30" cy="22" rx="14" ry="4" fill="#888" />
    <path d="M16 20 L16 18 A14 4 0 0 0 44 18 L44 20" fill="#d7c8a8" />
    <ellipse cx="30" cy="18" rx="14" ry="4" fill="#f0e4c8" />
    <path d="M22 18 Q26 14 30 18 T38 18" fill="none" />
    <path d="M44 20 L60 20" fill="none" />
  </g>`,
    isource: `<g stroke="currentColor" stroke-width="1.6">
    <path d="M0 20 L16 20" fill="none" />
    <ellipse cx="30" cy="22" rx="14" ry="4" fill="#5566aa" />
    <path d="M16 20 L16 18 A14 4 0 0 0 44 18 L44 20" fill="#7788cc" />
    <ellipse cx="30" cy="18" rx="14" ry="4" fill="#aabbee" />
    <path d="M30 12 L30 24 M26 20 L30 24 L34 20" fill="none" stroke="#223" />
    <path d="M44 20 L60 20" fill="none" />
  </g>`,
    ground: `<g stroke="currentColor" stroke-width="1.6" fill="none">
    <path d="M30 0 L30 14" />
    <path d="M14 14 L30 10 L46 14 L30 18 Z" fill="#c0c5d0" />
    <path d="M20 20 L30 17 L40 20 L30 23 Z" fill="#c0c5d0" />
    <path d="M24 26 L30 24 L36 26 L30 28 Z" fill="#c0c5d0" />
  </g>`,
    vcc: `<g stroke="currentColor" stroke-width="1.6" fill="none">
    <path d="M30 28 L30 10" />
    <path d="M18 10 L30 6 L42 10 L30 14 Z" fill="#ff6b4a" />
  </g>`,
    switch: `<g stroke="currentColor" stroke-width="1.6">
    <path d="M0 20 L16 20" fill="none" />
    <circle cx="20" cy="20" r="3" fill="#fff" />
    <path d="M20 20 L40 8" fill="none" stroke-width="2.4" />
    <circle cx="42" cy="20" r="3" fill="#fff" />
    <path d="M44 20 L60 20" fill="none" />
  </g>`,
    pot: `<g stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
    <path d="M0 20 L16 20" fill="none" />
    <path d="M16 14 L44 14 L48 20 L48 26 L20 26 L16 20 Z" fill="#c9a063" />
    <path d="M16 14 L20 20 L48 20" fill="none" />
    <path d="M20 26 L20 20" fill="none" />
    <path d="M48 20 L60 20" fill="none" />
    <path d="M30 0 L30 10" fill="none" />
    <path d="M26 6 L30 12 L34 6 Z" fill="currentColor" />
  </g>`,
    npn: `<g stroke="currentColor" stroke-width="1.6">
    <circle cx="30" cy="30" r="22" fill="#c8cee0" />
    <circle cx="30" cy="30" r="22" fill="none" stroke="currentColor" />
    <path d="M0 30 L18 30" fill="none" />
    <path d="M18 16 L18 44" stroke-width="3" fill="none" />
    <path d="M18 26 L42 10 L45 0" fill="none" />
    <path d="M18 34 L42 50 L45 60" fill="none" />
    <path d="M42 50 L35 48 L38 42 Z" fill="currentColor" />
  </g>`,
    pnp: `<g stroke="currentColor" stroke-width="1.6">
    <circle cx="30" cy="30" r="22" fill="#d0d8e8" />
    <circle cx="30" cy="30" r="22" fill="none" stroke="currentColor" />
    <path d="M0 30 L18 30" fill="none" />
    <path d="M18 16 L18 44" stroke-width="3" fill="none" />
    <path d="M18 26 L42 10 L45 0" fill="none" />
    <path d="M18 34 L42 50 L45 60" fill="none" />
    <path d="M24 34 L18 36 L20 28 Z" fill="currentColor" />
  </g>`,
    nmos: `<g stroke="currentColor" stroke-width="1.6">
    <path d="M0 30 L14 30" fill="none" />
    <path d="M14 18 L14 42" stroke-width="2.4" fill="none" />
    <path d="M18 15 L18 25 M18 28 L18 32 M18 35 L18 45" stroke-width="2.4" fill="none" />
    <path d="M18 20 L45 20 L45 0" fill="none" />
    <path d="M18 40 L45 40 L45 60" fill="none" />
    <path d="M26 30 L32 26 L32 34 Z" fill="currentColor" />
  </g>`,
    pmos: `<g stroke="currentColor" stroke-width="1.6">
    <path d="M0 30 L12 30" fill="none" />
    <circle cx="15" cy="30" r="2.4" fill="#fff" />
    <path d="M18 18 L18 42" stroke-width="2.4" fill="none" />
    <path d="M22 15 L22 25 M22 28 L22 32 M22 35 L22 45" stroke-width="2.4" fill="none" />
    <path d="M22 20 L45 20 L45 0" fill="none" />
    <path d="M22 40 L45 40 L45 60" fill="none" />
    <path d="M32 26 L26 30 L32 34 Z" fill="currentColor" />
  </g>`,
    opamp: `<g stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
    <path d="M0 10 L12 10" fill="none" />
    <path d="M0 40 L12 40" fill="none" />
    <path d="M12 0 L12 50 L52 25 Z" fill="#c8d0e8" />
    <path d="M52 25 L60 25" fill="none" />
    <text x="16" y="13" font-size="8" stroke="none" fill="#223" font-family="inherit">−</text>
    <text x="16" y="43" font-size="8" stroke="none" fill="#223" font-family="inherit">+</text>
  </g>`,
    crystal: `<g stroke="currentColor" stroke-width="1.6">
    <path d="M0 20 L22 20" fill="none" />
    <path d="M22 10 L22 30" fill="none" />
    <path d="M25 10 L35 10 L37 12 L37 32 L35 30 L25 30 Z" fill="#dcd0b0" />
    <path d="M25 10 L27 12 L27 32 L25 30" fill="#bca888" />
    <path d="M38 10 L38 30" fill="none" />
    <path d="M38 20 L60 20" fill="none" />
  </g>`,
    transformer: `<g stroke="currentColor" stroke-width="1.6" fill="none">
    <path d="M0 5 L14 5" />
    <ellipse cx="20" cy="10" rx="4" ry="6" fill="#b8a88a" stroke="currentColor" />
    <ellipse cx="20" cy="20" rx="4" ry="6" fill="#b8a88a" stroke="currentColor" />
    <ellipse cx="20" cy="30" rx="4" ry="6" fill="#b8a88a" stroke="currentColor" />
    <path d="M20 36 L0 35" />
    <path d="M80 5 L60 5" />
    <ellipse cx="60" cy="10" rx="4" ry="6" fill="#b8a88a" stroke="currentColor" />
    <ellipse cx="60" cy="20" rx="4" ry="6" fill="#b8a88a" stroke="currentColor" />
    <ellipse cx="60" cy="30" rx="4" ry="6" fill="#b8a88a" stroke="currentColor" />
    <path d="M60 36 L80 35" />
    <path d="M36 5 L36 35 M44 5 L44 35" />
  </g>`,
  },
};

// ---------------------------------------------------------------------------
// 5. NEON / SYNTH — glowing strokes on dark
// ---------------------------------------------------------------------------
// Note: callers must define <filter id="neonGlow"> in their SVG <defs>; the
// fragments reference it via filter="url(#neonGlow)". `glow: true` flags this.
const neon: SymbolStyle = {
  bg: '#0a0a1f',
  fg: '#ff3df7',
  accent: '#00f0ff',
  accent2: '#fff200',
  font: "'Orbitron', 'Space Grotesk', sans-serif",
  gridColor: 'rgba(255, 61, 247, 0.08)',
  stroke: 1.8,
  glow: true,
  components: {
    resistor: `<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" filter="url(#neonGlow)">
    <path d="M0 20 L15 20 L18 12 L23 28 L28 12 L33 28 L38 12 L42 28 L45 20 L60 20" />
  </g>`,
    capacitor: `<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" filter="url(#neonGlow)">
    <path d="M0 20 L27 20" />
    <path d="M27 8 L27 32" />
    <path d="M33 8 L33 32" />
    <path d="M33 20 L60 20" />
  </g>`,
    capacitorPolar: `<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" filter="url(#neonGlow)">
    <path d="M0 20 L27 20" />
    <path d="M27 8 L27 32" />
    <path d="M33 8 Q37 20 33 32" />
    <path d="M37 20 L60 20" />
  </g>`,
    inductor: `<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" filter="url(#neonGlow)">
    <path d="M0 20 L12 20" />
    <path d="M12 20 A4 4 0 0 1 20 20 A4 4 0 0 1 28 20 A4 4 0 0 1 36 20 A4 4 0 0 1 44 20 A4 4 0 0 1 48 20" />
    <path d="M48 20 L60 20" />
  </g>`,
    diode: `<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" filter="url(#neonGlow)">
    <path d="M0 20 L22 20" />
    <path d="M22 10 L22 30 L38 20 Z" fill="currentColor" fill-opacity="0.4" />
    <path d="M38 10 L38 30" />
    <path d="M38 20 L60 20" />
  </g>`,
    led: `<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" filter="url(#neonGlow)">
    <path d="M0 20 L22 20" />
    <path d="M22 10 L22 30 L38 20 Z" fill="currentColor" fill-opacity="0.5" />
    <path d="M38 10 L38 30" />
    <path d="M38 20 L60 20" />
    <path d="M42 6 L48 2 M46 2 L48 2 L48 4" />
    <path d="M48 10 L54 6 M52 6 L54 6 L54 8" />
  </g>`,
    zener: `<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" filter="url(#neonGlow)">
    <path d="M0 20 L22 20" />
    <path d="M22 10 L22 30 L38 20 Z" fill="currentColor" fill-opacity="0.4" />
    <path d="M34 8 L38 10 L38 30 L42 32" />
    <path d="M38 20 L60 20" />
  </g>`,
    vsource: `<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" filter="url(#neonGlow)">
    <path d="M0 20 L16 20" />
    <circle cx="30" cy="20" r="14" />
    <path d="M44 20 L60 20" />
    <text x="25" y="16" font-size="11" stroke="none" fill="currentColor" font-family="inherit">+</text>
    <text x="25" y="32" font-size="11" stroke="none" fill="currentColor" font-family="inherit">−</text>
  </g>`,
    acsource: `<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" filter="url(#neonGlow)">
    <path d="M0 20 L16 20" />
    <circle cx="30" cy="20" r="14" />
    <path d="M22 20 Q26 12 30 20 T38 20" />
    <path d="M44 20 L60 20" />
  </g>`,
    isource: `<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" filter="url(#neonGlow)">
    <path d="M0 20 L16 20" />
    <circle cx="30" cy="20" r="14" />
    <path d="M22 20 L38 20 M34 16 L38 20 L34 24" />
    <path d="M44 20 L60 20" />
  </g>`,
    ground: `<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" filter="url(#neonGlow)">
    <path d="M30 0 L30 16" />
    <path d="M16 16 L44 16" />
    <path d="M22 22 L38 22" />
    <path d="M26 28 L34 28" />
  </g>`,
    vcc: `<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" filter="url(#neonGlow)">
    <path d="M30 30 L30 10" />
    <path d="M20 10 L40 10" />
  </g>`,
    switch: `<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" filter="url(#neonGlow)">
    <path d="M0 20 L18 20" />
    <circle cx="20" cy="20" r="2" fill="currentColor" />
    <path d="M20 20 L42 10" />
    <circle cx="42" cy="20" r="2" fill="currentColor" />
    <path d="M44 20 L60 20" />
  </g>`,
    pot: `<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" filter="url(#neonGlow)">
    <path d="M0 20 L15 20 L18 12 L23 28 L28 12 L33 28 L38 12 L42 28 L45 20 L60 20" />
    <path d="M30 0 L30 10" />
    <path d="M26 5 L30 10 L34 5" />
  </g>`,
    npn: `<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" filter="url(#neonGlow)">
    <circle cx="30" cy="30" r="22" />
    <path d="M0 30 L18 30" />
    <path d="M18 16 L18 44" stroke-width="2.6" />
    <path d="M18 26 L42 10 L45 0" />
    <path d="M18 34 L42 50 L45 60" />
    <path d="M42 50 L35 48 L38 42 Z" fill="currentColor" />
  </g>`,
    pnp: `<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" filter="url(#neonGlow)">
    <circle cx="30" cy="30" r="22" />
    <path d="M0 30 L18 30" />
    <path d="M18 16 L18 44" stroke-width="2.6" />
    <path d="M18 26 L42 10 L45 0" />
    <path d="M18 34 L42 50 L45 60" />
    <path d="M24 34 L18 36 L20 28 Z" fill="currentColor" />
  </g>`,
    nmos: `<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" filter="url(#neonGlow)">
    <path d="M0 30 L14 30" />
    <path d="M14 18 L14 42" stroke-width="2.6" />
    <path d="M18 15 L18 25 M18 28 L18 32 M18 35 L18 45" stroke-width="2.6" />
    <path d="M18 20 L45 20 L45 0" />
    <path d="M18 40 L45 40 L45 60" />
    <path d="M26 30 L32 27 L32 33 Z" fill="currentColor" />
  </g>`,
    pmos: `<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" filter="url(#neonGlow)">
    <path d="M0 30 L12 30" />
    <circle cx="15" cy="30" r="2" />
    <path d="M18 18 L18 42" stroke-width="2.6" />
    <path d="M22 15 L22 25 M22 28 L22 32 M22 35 L22 45" stroke-width="2.6" />
    <path d="M22 20 L45 20 L45 0" />
    <path d="M22 40 L45 40 L45 60" />
    <path d="M32 27 L26 30 L32 33 Z" fill="currentColor" />
  </g>`,
    opamp: `<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" filter="url(#neonGlow)">
    <path d="M0 10 L12 10" />
    <path d="M0 40 L12 40" />
    <path d="M12 0 L12 50 L52 25 Z" />
    <path d="M52 25 L60 25" />
    <text x="16" y="13" font-size="8" stroke="none" fill="currentColor" font-family="inherit">−</text>
    <text x="16" y="43" font-size="8" stroke="none" fill="currentColor" font-family="inherit">+</text>
  </g>`,
    crystal: `<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" filter="url(#neonGlow)">
    <path d="M0 20 L22 20" />
    <path d="M22 10 L22 30" />
    <rect x="25" y="12" width="10" height="16" />
    <path d="M38 10 L38 30" />
    <path d="M38 20 L60 20" />
  </g>`,
    transformer: `<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" filter="url(#neonGlow)">
    <path d="M0 5 L18 5 A4 4 0 0 1 18 13 A4 4 0 0 1 18 21 A4 4 0 0 1 18 29 A4 4 0 0 1 18 35 L0 35" />
    <path d="M80 5 L62 5 A4 4 0 0 0 62 13 A4 4 0 0 0 62 21 A4 4 0 0 0 62 29 A4 4 0 0 0 62 35 L80 35" />
    <path d="M36 5 L36 35 M44 5 L44 35" />
  </g>`,
  },
};

// ---------------------------------------------------------------------------
// 6. MINIMALIST — ultra thin monoline
// ---------------------------------------------------------------------------
const mini: SymbolStyle = {
  bg: '#fafafa',
  fg: '#222',
  accent: '#555',
  font: "'Inter', system-ui, sans-serif",
  gridColor: 'rgba(0,0,0,0.04)',
  stroke: 0.9,
  components: {
    resistor: `<g fill="none" stroke="currentColor" stroke-width="0.9" stroke-linecap="round">
    <path d="M0 20 L18 20" />
    <rect x="18" y="16" width="24" height="8" rx="1" />
    <path d="M42 20 L60 20" />
  </g>`,
    capacitor: `<g fill="none" stroke="currentColor" stroke-width="0.9" stroke-linecap="round">
    <path d="M0 20 L28 20" />
    <path d="M28 10 L28 30" />
    <path d="M32 10 L32 30" />
    <path d="M32 20 L60 20" />
  </g>`,
    capacitorPolar: `<g fill="none" stroke="currentColor" stroke-width="0.9" stroke-linecap="round">
    <path d="M0 20 L28 20" />
    <path d="M28 10 L28 30" />
    <path d="M32 10 Q36 20 32 30" />
    <path d="M36 20 L60 20" />
  </g>`,
    inductor: `<g fill="none" stroke="currentColor" stroke-width="0.9" stroke-linecap="round">
    <path d="M0 20 L12 20" />
    <path d="M12 20 A4 4 0 0 1 20 20 A4 4 0 0 1 28 20 A4 4 0 0 1 36 20 A4 4 0 0 1 44 20 A4 4 0 0 1 48 20" />
    <path d="M48 20 L60 20" />
  </g>`,
    diode: `<g fill="none" stroke="currentColor" stroke-width="0.9" stroke-linecap="round" stroke-linejoin="round">
    <path d="M0 20 L22 20" />
    <path d="M22 12 L22 28 L36 20 Z" fill="currentColor" />
    <path d="M36 12 L36 28" />
    <path d="M36 20 L60 20" />
  </g>`,
    led: `<g fill="none" stroke="currentColor" stroke-width="0.9" stroke-linecap="round" stroke-linejoin="round">
    <path d="M0 20 L22 20" />
    <path d="M22 12 L22 28 L36 20 Z" fill="currentColor" />
    <path d="M36 12 L36 28" />
    <path d="M36 20 L60 20" />
    <path d="M40 8 L46 3 M44 3 L46 3 L46 5" />
    <path d="M46 12 L52 7 M50 7 L52 7 L52 9" />
  </g>`,
    zener: `<g fill="none" stroke="currentColor" stroke-width="0.9" stroke-linecap="round" stroke-linejoin="round">
    <path d="M0 20 L22 20" />
    <path d="M22 12 L22 28 L36 20 Z" fill="currentColor" />
    <path d="M32 10 L36 12 L36 28 L40 30" />
    <path d="M36 20 L60 20" />
  </g>`,
    vsource: `<g fill="none" stroke="currentColor" stroke-width="0.9" stroke-linecap="round">
    <path d="M0 20 L16 20" />
    <circle cx="30" cy="20" r="12" />
    <path d="M44 20 L60 20" />
    <path d="M26 16 L34 16 M30 12 L30 20" />
    <path d="M26 26 L34 26" />
  </g>`,
    acsource: `<g fill="none" stroke="currentColor" stroke-width="0.9" stroke-linecap="round">
    <path d="M0 20 L18 20" />
    <circle cx="30" cy="20" r="12" />
    <path d="M24 20 Q27 14 30 20 T36 20" />
    <path d="M42 20 L60 20" />
  </g>`,
    isource: `<g fill="none" stroke="currentColor" stroke-width="0.9" stroke-linecap="round">
    <path d="M0 20 L18 20" />
    <circle cx="30" cy="20" r="12" />
    <path d="M24 20 L36 20 M33 17 L36 20 L33 23" />
    <path d="M42 20 L60 20" />
  </g>`,
    ground: `<g fill="none" stroke="currentColor" stroke-width="0.9" stroke-linecap="round">
    <path d="M30 0 L30 18" />
    <path d="M20 18 L40 18" />
    <path d="M24 23 L36 23" />
    <path d="M27 28 L33 28" />
  </g>`,
    vcc: `<g fill="none" stroke="currentColor" stroke-width="0.9" stroke-linecap="round">
    <path d="M30 30 L30 8" />
    <path d="M26 12 L30 8 L34 12" />
  </g>`,
    switch: `<g fill="none" stroke="currentColor" stroke-width="0.9" stroke-linecap="round">
    <path d="M0 20 L18 20" />
    <circle cx="20" cy="20" r="1.2" fill="currentColor" />
    <path d="M20 20 L42 10" />
    <circle cx="42" cy="20" r="1.2" fill="currentColor" />
    <path d="M44 20 L60 20" />
  </g>`,
    pot: `<g fill="none" stroke="currentColor" stroke-width="0.9" stroke-linecap="round">
    <path d="M0 20 L18 20" />
    <rect x="18" y="16" width="24" height="8" rx="1" />
    <path d="M42 20 L60 20" />
    <path d="M30 2 L30 10" />
    <path d="M27 7 L30 10 L33 7" />
  </g>`,
    npn: `<g fill="none" stroke="currentColor" stroke-width="0.9" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="30" cy="30" r="18" />
    <path d="M0 30 L20 30" />
    <path d="M20 18 L20 42" />
    <path d="M20 26 L42 10 L45 0" />
    <path d="M20 34 L42 50 L45 60" />
    <path d="M42 50 L36 48 L39 43 Z" fill="currentColor" />
  </g>`,
    pnp: `<g fill="none" stroke="currentColor" stroke-width="0.9" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="30" cy="30" r="18" />
    <path d="M0 30 L20 30" />
    <path d="M20 18 L20 42" />
    <path d="M20 26 L42 10 L45 0" />
    <path d="M20 34 L42 50 L45 60" />
    <path d="M26 34 L20 36 L22 29 Z" fill="currentColor" />
  </g>`,
    nmos: `<g fill="none" stroke="currentColor" stroke-width="0.9" stroke-linecap="round" stroke-linejoin="round">
    <path d="M0 30 L14 30" />
    <path d="M14 18 L14 42" />
    <path d="M18 15 L18 25 M18 28 L18 32 M18 35 L18 45" />
    <path d="M18 20 L45 20 L45 0" />
    <path d="M18 40 L45 40 L45 60" />
    <path d="M26 30 L32 27 L32 33 Z" fill="currentColor" />
  </g>`,
    pmos: `<g fill="none" stroke="currentColor" stroke-width="0.9" stroke-linecap="round" stroke-linejoin="round">
    <path d="M0 30 L12 30" />
    <circle cx="15" cy="30" r="1.8" />
    <path d="M18 18 L18 42" />
    <path d="M22 15 L22 25 M22 28 L22 32 M22 35 L22 45" />
    <path d="M22 20 L45 20 L45 0" />
    <path d="M22 40 L45 40 L45 60" />
    <path d="M32 27 L26 30 L32 33 Z" fill="currentColor" />
  </g>`,
    opamp: `<g fill="none" stroke="currentColor" stroke-width="0.9" stroke-linecap="round" stroke-linejoin="round">
    <path d="M0 10 L14 10" />
    <path d="M0 40 L14 40" />
    <path d="M14 2 L14 48 L50 25 Z" />
    <path d="M50 25 L60 25" />
    <path d="M17 10 L21 10" />
    <path d="M17 40 L21 40 M19 38 L19 42" />
  </g>`,
    crystal: `<g fill="none" stroke="currentColor" stroke-width="0.9" stroke-linecap="round">
    <path d="M0 20 L22 20" />
    <path d="M22 12 L22 28" />
    <rect x="25" y="14" width="10" height="12" />
    <path d="M38 12 L38 28" />
    <path d="M38 20 L60 20" />
  </g>`,
    transformer: `<g fill="none" stroke="currentColor" stroke-width="0.9" stroke-linecap="round">
    <path d="M0 5 L18 5 A4 4 0 0 1 18 13 A4 4 0 0 1 18 21 A4 4 0 0 1 18 29 A4 4 0 0 1 18 35 L0 35" />
    <path d="M80 5 L62 5 A4 4 0 0 0 62 13 A4 4 0 0 0 62 21 A4 4 0 0 0 62 29 A4 4 0 0 0 62 35 L80 35" />
    <path d="M36 5 L36 35 M44 5 L44 35" />
  </g>`,
  },
};

// ---------------------------------------------------------------------------
// 7. NAPKIN — ballpoint pen sketch, slightly ragged lines
// ---------------------------------------------------------------------------
// Note: callers must define <filter id="napkinJitter"> in their SVG <defs>;
// the fragments reference it via filter="url(#napkinJitter)".
const napkin: SymbolStyle = {
  bg: '#f8f4ed',
  fg: '#1e2450',
  accent: '#1e2450',
  font: "'Shadows Into Light', 'Caveat', cursive",
  gridColor: 'rgba(100,100,120,0.0)',
  stroke: 1.4,
  filter: 'url(#napkinJitter)',
  components: {
    resistor: `<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" filter="url(#napkinJitter)">
    <path d="M0 20 Q7 19 14 20 L17 11 L22 29 L27 11 L32 29 L37 11 L42 29 L46 20 Q53 21 60 20" />
  </g>`,
    capacitor: `<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" filter="url(#napkinJitter)">
    <path d="M0 20 Q13 19 27 20" />
    <path d="M27 8 Q27 20 27 32" />
    <path d="M33 8 Q33 20 33 32" />
    <path d="M33 20 Q46 21 60 20" />
  </g>`,
    capacitorPolar: `<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" filter="url(#napkinJitter)">
    <path d="M0 20 Q13 19 27 20" />
    <path d="M27 8 L27 32" />
    <path d="M33 8 Q37 20 33 32" />
    <path d="M37 20 Q48 21 60 20" />
    <text x="19" y="8" font-size="9" stroke="none" fill="currentColor" font-family="inherit">+</text>
  </g>`,
    inductor: `<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" filter="url(#napkinJitter)">
    <path d="M0 20 L12 20" />
    <path d="M12 20 Q15 10 21 20 Q24 10 30 20 Q33 10 39 20 Q42 10 48 20" />
    <path d="M48 20 L60 20" />
  </g>`,
    diode: `<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" filter="url(#napkinJitter)">
    <path d="M0 20 L22 20" />
    <path d="M22 10 L22 30 L38 20 Z" fill="currentColor" fill-opacity="0.7" />
    <path d="M38 10 L38 30" />
    <path d="M38 20 L60 20" />
  </g>`,
    led: `<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" filter="url(#napkinJitter)">
    <path d="M0 20 L22 20" />
    <path d="M22 10 L22 30 L38 20 Z" fill="currentColor" fill-opacity="0.7" />
    <path d="M38 10 L38 30" />
    <path d="M38 20 L60 20" />
    <path d="M42 6 L48 2 M46 2 L48 2 L48 4" />
    <path d="M48 10 L54 6 M52 6 L54 6 L54 8" />
  </g>`,
    zener: `<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" filter="url(#napkinJitter)">
    <path d="M0 20 L22 20" />
    <path d="M22 10 L22 30 L38 20 Z" fill="currentColor" fill-opacity="0.7" />
    <path d="M34 8 L38 10 L38 30 L42 32" />
    <path d="M38 20 L60 20" />
  </g>`,
    vsource: `<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" filter="url(#napkinJitter)">
    <path d="M0 20 L16 20" />
    <circle cx="30" cy="20" r="14" />
    <path d="M44 20 L60 20" />
    <text x="23" y="15" font-size="12" stroke="none" fill="currentColor" font-family="inherit">+</text>
    <text x="23" y="32" font-size="12" stroke="none" fill="currentColor" font-family="inherit">−</text>
  </g>`,
    acsource: `<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" filter="url(#napkinJitter)">
    <path d="M0 20 L16 20" />
    <circle cx="30" cy="20" r="14" />
    <path d="M22 20 Q26 12 30 20 T38 20" />
    <path d="M44 20 L60 20" />
  </g>`,
    isource: `<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" filter="url(#napkinJitter)">
    <path d="M0 20 L16 20" />
    <circle cx="30" cy="20" r="14" />
    <path d="M24 14 L30 26 L36 14 L30 14 Z" fill="currentColor" fill-opacity="0.5" />
    <path d="M44 20 L60 20" />
  </g>`,
    ground: `<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" filter="url(#napkinJitter)">
    <path d="M30 0 L30 16" />
    <path d="M17 16 L43 16" />
    <path d="M22 22 L38 22" />
    <path d="M26 28 L34 28" />
  </g>`,
    vcc: `<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" filter="url(#napkinJitter)">
    <path d="M30 28 L30 10" />
    <path d="M20 10 L40 10" />
  </g>`,
    switch: `<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" filter="url(#napkinJitter)">
    <path d="M0 20 L18 20" />
    <circle cx="20" cy="20" r="2" fill="currentColor" />
    <path d="M20 20 L42 10" />
    <circle cx="42" cy="20" r="2" fill="currentColor" />
    <path d="M44 20 L60 20" />
  </g>`,
    pot: `<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" filter="url(#napkinJitter)">
    <path d="M0 20 Q7 19 14 20 L17 11 L22 29 L27 11 L32 29 L37 11 L42 29 L46 20 Q53 21 60 20" />
    <path d="M30 0 L30 10" />
    <path d="M26 5 L30 10 L34 5" />
  </g>`,
    npn: `<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" filter="url(#napkinJitter)">
    <circle cx="30" cy="30" r="20" />
    <path d="M0 30 L18 30" />
    <path d="M18 16 L18 44" />
    <path d="M18 26 L42 10 L45 0" />
    <path d="M18 34 L42 50 L45 60" />
    <path d="M42 50 L35 48 L38 42 Z" fill="currentColor" />
  </g>`,
    pnp: `<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" filter="url(#napkinJitter)">
    <circle cx="30" cy="30" r="20" />
    <path d="M0 30 L18 30" />
    <path d="M18 16 L18 44" />
    <path d="M18 26 L42 10 L45 0" />
    <path d="M18 34 L42 50 L45 60" />
    <path d="M24 34 L18 36 L20 28 Z" fill="currentColor" />
  </g>`,
    nmos: `<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" filter="url(#napkinJitter)">
    <path d="M0 30 L14 30" />
    <path d="M14 18 L14 42" />
    <path d="M18 15 L18 25 M18 28 L18 32 M18 35 L18 45" />
    <path d="M18 20 L45 20 L45 0" />
    <path d="M18 40 L45 40 L45 60" />
    <path d="M26 30 L32 27 L32 33 Z" fill="currentColor" />
  </g>`,
    pmos: `<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" filter="url(#napkinJitter)">
    <path d="M0 30 L12 30" />
    <circle cx="15" cy="30" r="2" />
    <path d="M18 18 L18 42" />
    <path d="M22 15 L22 25 M22 28 L22 32 M22 35 L22 45" />
    <path d="M22 20 L45 20 L45 0" />
    <path d="M22 40 L45 40 L45 60" />
    <path d="M32 27 L26 30 L32 33 Z" fill="currentColor" />
  </g>`,
    opamp: `<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" filter="url(#napkinJitter)">
    <path d="M0 10 L12 10" />
    <path d="M0 40 L12 40" />
    <path d="M12 0 L12 50 L52 25 Z" />
    <path d="M52 25 L60 25" />
    <text x="16" y="13" font-size="9" stroke="none" fill="currentColor" font-family="inherit">−</text>
    <text x="16" y="43" font-size="9" stroke="none" fill="currentColor" font-family="inherit">+</text>
  </g>`,
    crystal: `<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" filter="url(#napkinJitter)">
    <path d="M0 20 L22 20" />
    <path d="M22 10 L22 30" />
    <rect x="25" y="12" width="10" height="16" />
    <path d="M38 10 L38 30" />
    <path d="M38 20 L60 20" />
  </g>`,
    transformer: `<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" filter="url(#napkinJitter)">
    <path d="M0 5 L18 5 Q22 12 18 20 Q22 28 18 35 L0 35" />
    <path d="M80 5 L62 5 Q58 12 62 20 Q58 28 62 35 L80 35" />
    <path d="M36 5 L36 35 M44 5 L44 35" />
  </g>`,
  },
};

export const SYMBOL_STYLES: Record<SymbolStyleId, SymbolStyle> = {
  klein,
  playful,
  ieee,
  iso,
  neon,
  mini,
  napkin,
};

/** Active default style — swap when wiring theme selection into the renderer. */
export const DEFAULT_STYLE_ID: SymbolStyleId = 'klein';
