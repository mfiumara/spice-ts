# @spice-ts/ui Waveform Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a framework-agnostic waveform viewer package with Canvas rendering core and React bindings, supporting transient plots, AC Bode plots, streaming, and multi-result overlays.

**Architecture:** Two-layer design — a pure TypeScript Canvas core (`@spice-ts/ui`) handles all rendering, scales, and interaction. A thin React adapter (`@spice-ts/ui/react`) provides composable components that wrap the core. Subpath exports separate the two: `@spice-ts/ui` for vanilla, `@spice-ts/ui/react` for React.

**Tech Stack:** TypeScript, Canvas 2D, d3-scale, d3-array, React 18+, Vitest, tsup

---

## File Structure

```
packages/ui/
├── src/
│   ├── core/
│   │   ├── types.ts              Shared types (ThemeConfig, CursorState, SignalData, etc.)
│   │   ├── theme.ts              Dark/light presets, mergeTheme()
│   │   ├── theme.test.ts
│   │   ├── format.ts             SI-prefix formatting (1kHz, 2.5ms, 4.7V)
│   │   ├── format.test.ts
│   │   ├── scales.ts             d3-scale wrappers, tick computation
│   │   ├── scales.test.ts
│   │   ├── data.ts               Normalize TransientResult/ACResult into render arrays
│   │   ├── data.test.ts
│   │   ├── buffer.ts             Growable Float64Array for streaming
│   │   ├── buffer.test.ts
│   │   ├── renderer.ts           TransientRenderer — Canvas waveform/grid/axis/cursor
│   │   ├── renderer.test.ts
│   │   ├── bode-renderer.ts      BodeRenderer — dual-pane magnitude/phase Canvas
│   │   ├── bode-renderer.test.ts
│   │   ├── interaction.ts        Zoom (wheel), pan (drag), cursor (hover) handlers
│   │   ├── interaction.test.ts
│   │   ├── streaming.ts          StreamingController — async iterator → buffer → rAF
│   │   ├── streaming.test.ts
│   │   └── index.ts              Core public exports
│   ├── react/
│   │   ├── TransientPlot.tsx      Composable transient canvas component
│   │   ├── TransientPlot.test.tsx
│   │   ├── BodePlot.tsx           Composable Bode plot component
│   │   ├── BodePlot.test.tsx
│   │   ├── Legend.tsx             Click-to-toggle signal legend
│   │   ├── Legend.test.tsx
│   │   ├── CursorTooltip.tsx      DOM overlay for cursor value readout
│   │   ├── WaveformViewer.tsx     Pre-composed convenience component
│   │   ├── WaveformViewer.test.tsx
│   │   ├── use-renderer.ts       Shared hook: canvas ref + ResizeObserver + renderer lifecycle
│   │   └── index.ts              React public exports
│   ├── index.ts                   Root re-export of core
│   └── test-setup.ts             Canvas mock for jsdom
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── vitest.config.ts
```

---

### Task 1: Package scaffolding

**Files:**
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/tsup.config.ts`
- Create: `packages/ui/vitest.config.ts`
- Create: `packages/ui/src/test-setup.ts`
- Create: `packages/ui/src/index.ts`
- Create: `packages/ui/src/core/index.ts`
- Create: `packages/ui/src/react/index.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@spice-ts/ui",
  "version": "0.1.0",
  "description": "Waveform viewer for spice-ts simulation results",
  "license": "MIT",
  "author": "Mattia Fiumara",
  "repository": {
    "type": "git",
    "url": "https://github.com/mfiumara/spice-ts.git",
    "directory": "packages/ui"
  },
  "engines": {
    "node": ">=20"
  },
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    },
    "./react": {
      "types": "./dist/react.d.ts",
      "import": "./dist/react.js",
      "require": "./dist/react.cjs"
    }
  },
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "d3-array": "^3.2.4",
    "d3-scale": "^4.0.2"
  },
  "peerDependencies": {
    "@spice-ts/core": "workspace:*",
    "react": ">=18.0.0",
    "react-dom": ">=18.0.0"
  },
  "peerDependenciesMeta": {
    "react": { "optional": true },
    "react-dom": { "optional": true }
  },
  "devDependencies": {
    "@spice-ts/core": "workspace:*",
    "@testing-library/react": "^16.0.0",
    "@types/d3-array": "^3.2.1",
    "@types/d3-scale": "^4.0.8",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitest/coverage-v8": "^4.1.4",
    "jsdom": "^25.0.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "tsup": "^8.0.0",
    "typescript": "^5.4.0",
    "vite": "^8.0.8",
    "vitest": "^4.1.4"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create tsup.config.ts**

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    react: 'src/react/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: {
    compilerOptions: {
      composite: false,
    },
  },
  clean: true,
  sourcemap: true,
  external: ['@spice-ts/core', 'react', 'react-dom'],
});
```

- [ ] **Step 4: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    reporters: ['default', ['junit', { outputFile: 'test-results.xml' }]],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/test-setup.ts'],
    },
  },
});
```

- [ ] **Step 5: Create test-setup.ts with Canvas mock**

```typescript
// src/test-setup.ts
import { vi } from 'vitest';

function createMockContext(): CanvasRenderingContext2D {
  return {
    canvas: document.createElement('canvas'),
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn().mockReturnValue({ width: 40 }),
    rect: vi.fn(),
    arc: vi.fn(),
    clip: vi.fn(),
    setLineDash: vi.fn(),
    getLineDash: vi.fn().mockReturnValue([]),
    lineWidth: 1,
    strokeStyle: '',
    fillStyle: '',
    font: '',
    textAlign: 'left' as CanvasTextAlign,
    textBaseline: 'top' as CanvasTextBaseline,
    globalAlpha: 1,
    lineCap: 'butt' as CanvasLineCap,
    lineJoin: 'miter' as CanvasLineJoin,
    lineDashOffset: 0,
  } as unknown as CanvasRenderingContext2D;
}

const originalGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function (contextId: string, ...args: unknown[]) {
  if (contextId === '2d') {
    return createMockContext();
  }
  return originalGetContext.call(this, contextId, ...args);
} as typeof HTMLCanvasElement.prototype.getContext;
```

- [ ] **Step 6: Create placeholder entry files**

`src/index.ts`:
```typescript
export * from './core/index.js';
```

`src/core/index.ts`:
```typescript
// Core exports — populated as modules are built
export {};
```

`src/react/index.ts`:
```typescript
// React exports — populated as components are built
export {};
```

- [ ] **Step 7: Install dependencies and verify build**

Run: `cd packages/ui && pnpm install`

Run: `pnpm build`
Expected: Clean build with `dist/index.js`, `dist/index.cjs`, `dist/react.js`, `dist/react.cjs` and `.d.ts` files.

Run: `pnpm lint`
Expected: No type errors.

- [ ] **Step 8: Commit**

```bash
git add packages/ui/
git commit -m "feat(ui): scaffold @spice-ts/ui package with dual subpath exports"
```

---

### Task 2: Core types and theme system

**Files:**
- Create: `packages/ui/src/core/types.ts`
- Create: `packages/ui/src/core/theme.ts`
- Create: `packages/ui/src/core/theme.test.ts`
- Modify: `packages/ui/src/core/index.ts`

- [ ] **Step 1: Create types.ts**

```typescript
// src/core/types.ts

/** Configuration for visual theme colors and fonts. */
export interface ThemeConfig {
  /** Plot area background color. */
  background: string;
  /** Container/toolbar surface color. */
  surface: string;
  /** Border and divider color. */
  border: string;
  /** Grid line color. */
  grid: string;
  /** Primary text color (labels, values). */
  text: string;
  /** Secondary text color (axis labels, muted). */
  textMuted: string;
  /** Cursor crosshair line color. */
  cursor: string;
  /** Tooltip background color. */
  tooltipBg: string;
  /** Tooltip border color. */
  tooltipBorder: string;
  /** Font family string. */
  font: string;
  /** Base font size in pixels. */
  fontSize: number;
}

/** A single value at the cursor position for one signal. */
export interface CursorValue {
  /** Signal identifier (e.g. "out" or "R1=1k:out"). */
  signalId: string;
  /** Display label. */
  label: string;
  /** Numeric value at cursor position. */
  value: number;
  /** Unit string ('V', 'A', 'dB', '°'). */
  unit: string;
  /** Color of this signal's trace. */
  color: string;
}

/** Cursor state — position and signal values at that position. */
export interface CursorState {
  /** Data-space x value (time in seconds, or frequency in Hz). */
  x: number;
  /** Pixel-space x position relative to canvas. */
  pixelX: number;
  /** Values for each visible signal at this x position. */
  values: CursorValue[];
}

/** Describes one signal for rendering. */
export interface SignalConfig {
  /** Signal name (matches node/branch name in simulation result). */
  name: string;
  /** Display color. If omitted, assigned from palette. */
  color?: string;
  /** Whether signal is currently visible. Default true. */
  visible?: boolean;
}

/** A labeled transient dataset for multi-result overlay. */
export interface TransientDataset {
  /** Transient result data. */
  time: number[];
  /** Map of signal name → voltage/current array. */
  signals: Map<string, number[]>;
  /** Label for this dataset (e.g. "R1 = 1k"). */
  label: string;
}

/** A labeled AC dataset for multi-result overlay. */
export interface ACDataset {
  /** Frequency array in Hz. */
  frequencies: number[];
  /** Map of signal name → magnitude array in dB. */
  magnitudes: Map<string, number[]>;
  /** Map of signal name → phase array in degrees. */
  phases: Map<string, number[]>;
  /** Label for this dataset. */
  label: string;
}

/** Margins around the plot area in pixels. */
export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Events emitted by renderers. */
export interface RendererEvents {
  cursorMove: (state: CursorState | null) => void;
}

/** Default color palette (8 colorblind-friendly colors). */
export const DEFAULT_PALETTE = [
  '#4ade80', // green
  '#60a5fa', // blue
  '#f97316', // orange
  '#a78bfa', // purple
  '#f472b6', // pink
  '#facc15', // yellow
  '#2dd4bf', // teal
  '#fb923c', // amber
] as const;
```

- [ ] **Step 2: Write theme tests**

```typescript
// src/core/theme.test.ts
import { describe, it, expect } from 'vitest';
import { DARK_THEME, LIGHT_THEME, mergeTheme, resolveTheme } from './theme.js';

describe('theme', () => {
  it('DARK_THEME has all required fields', () => {
    expect(DARK_THEME.background).toBeDefined();
    expect(DARK_THEME.surface).toBeDefined();
    expect(DARK_THEME.border).toBeDefined();
    expect(DARK_THEME.grid).toBeDefined();
    expect(DARK_THEME.text).toBeDefined();
    expect(DARK_THEME.textMuted).toBeDefined();
    expect(DARK_THEME.cursor).toBeDefined();
    expect(DARK_THEME.tooltipBg).toBeDefined();
    expect(DARK_THEME.tooltipBorder).toBeDefined();
    expect(DARK_THEME.font).toBeDefined();
    expect(DARK_THEME.fontSize).toBeGreaterThan(0);
  });

  it('LIGHT_THEME has all required fields', () => {
    expect(LIGHT_THEME.background).toBeDefined();
    expect(LIGHT_THEME.text).toBeDefined();
    expect(LIGHT_THEME.fontSize).toBeGreaterThan(0);
  });

  it('mergeTheme overrides specific fields', () => {
    const merged = mergeTheme(DARK_THEME, { fontSize: 16, background: '#000' });
    expect(merged.fontSize).toBe(16);
    expect(merged.background).toBe('#000');
    expect(merged.text).toBe(DARK_THEME.text);
  });

  it('mergeTheme returns base unchanged when overrides is empty', () => {
    const merged = mergeTheme(DARK_THEME, {});
    expect(merged).toEqual(DARK_THEME);
  });

  it('resolveTheme returns DARK_THEME for "dark"', () => {
    expect(resolveTheme('dark')).toEqual(DARK_THEME);
  });

  it('resolveTheme returns LIGHT_THEME for "light"', () => {
    expect(resolveTheme('light')).toEqual(LIGHT_THEME);
  });

  it('resolveTheme returns custom ThemeConfig as-is', () => {
    const custom: ThemeConfig = { ...DARK_THEME, fontSize: 20 };
    expect(resolveTheme(custom)).toBe(custom);
  });

  it('resolveTheme defaults to DARK_THEME for undefined', () => {
    expect(resolveTheme(undefined)).toEqual(DARK_THEME);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/ui && pnpm test`
Expected: FAIL — `./theme.js` module not found.

- [ ] **Step 4: Implement theme.ts**

```typescript
// src/core/theme.ts
import type { ThemeConfig } from './types.js';

export const DARK_THEME: ThemeConfig = {
  background: 'hsl(224, 50%, 6%)',
  surface: 'hsl(224, 71%, 4%)',
  border: 'hsl(215, 20%, 17%)',
  grid: 'hsl(215, 20%, 12%)',
  text: 'hsl(210, 40%, 98%)',
  textMuted: 'hsl(215, 20%, 45%)',
  cursor: 'hsl(215, 20%, 40%)',
  tooltipBg: 'hsl(224, 40%, 10%)',
  tooltipBorder: 'hsl(215, 20%, 22%)',
  font: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  fontSize: 11,
};

export const LIGHT_THEME: ThemeConfig = {
  background: 'hsl(210, 40%, 98%)',
  surface: 'hsl(0, 0%, 100%)',
  border: 'hsl(214, 32%, 91%)',
  grid: 'hsl(214, 32%, 91%)',
  text: 'hsl(222, 47%, 11%)',
  textMuted: 'hsl(215, 16%, 47%)',
  cursor: 'hsl(215, 16%, 47%)',
  tooltipBg: 'hsl(0, 0%, 100%)',
  tooltipBorder: 'hsl(214, 32%, 91%)',
  font: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  fontSize: 11,
};

/** Merge partial overrides into a base theme. */
export function mergeTheme(base: ThemeConfig, overrides: Partial<ThemeConfig>): ThemeConfig {
  return { ...base, ...overrides };
}

/** Resolve a theme prop to a full ThemeConfig. */
export function resolveTheme(theme: 'dark' | 'light' | ThemeConfig | undefined): ThemeConfig {
  if (theme === undefined || theme === 'dark') return DARK_THEME;
  if (theme === 'light') return LIGHT_THEME;
  return theme;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/ui && pnpm test`
Expected: All theme tests PASS.

- [ ] **Step 6: Update core/index.ts exports**

```typescript
// src/core/index.ts
export type {
  ThemeConfig,
  CursorState,
  CursorValue,
  SignalConfig,
  TransientDataset,
  ACDataset,
  Margins,
  RendererEvents,
} from './types.js';
export { DEFAULT_PALETTE } from './types.js';
export { DARK_THEME, LIGHT_THEME, mergeTheme, resolveTheme } from './theme.js';
```

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/core/types.ts packages/ui/src/core/theme.ts packages/ui/src/core/theme.test.ts packages/ui/src/core/index.ts
git commit -m "feat(ui): add core types and theme system with dark/light presets"
```

---

### Task 3: SI-prefix formatting

**Files:**
- Create: `packages/ui/src/core/format.ts`
- Create: `packages/ui/src/core/format.test.ts`
- Modify: `packages/ui/src/core/index.ts`

- [ ] **Step 1: Write format tests**

```typescript
// src/core/format.test.ts
import { describe, it, expect } from 'vitest';
import { formatSI, formatTime, formatFrequency, formatVoltage, formatCurrent, formatPhase, formatDB } from './format.js';

describe('formatSI', () => {
  it('formats values with SI prefixes', () => {
    expect(formatSI(1e-12)).toBe('1p');
    expect(formatSI(1e-9)).toBe('1n');
    expect(formatSI(1e-6)).toBe('1µ');
    expect(formatSI(1e-3)).toBe('1m');
    expect(formatSI(1)).toBe('1');
    expect(formatSI(1e3)).toBe('1k');
    expect(formatSI(1e6)).toBe('1M');
    expect(formatSI(1e9)).toBe('1G');
  });

  it('formats fractional values', () => {
    expect(formatSI(2.5e-3)).toBe('2.5m');
    expect(formatSI(47e3)).toBe('47k');
    expect(formatSI(3.3e-6)).toBe('3.3µ');
  });

  it('formats zero', () => {
    expect(formatSI(0)).toBe('0');
  });

  it('formats negative values', () => {
    expect(formatSI(-5e-3)).toBe('-5m');
  });

  it('limits decimal places', () => {
    expect(formatSI(1.23456e3)).toBe('1.235k');
  });
});

describe('formatTime', () => {
  it('appends s suffix', () => {
    expect(formatTime(1e-3)).toBe('1ms');
    expect(formatTime(2.5e-6)).toBe('2.5µs');
    expect(formatTime(1)).toBe('1s');
  });
});

describe('formatFrequency', () => {
  it('appends Hz suffix', () => {
    expect(formatFrequency(1e3)).toBe('1kHz');
    expect(formatFrequency(1e6)).toBe('1MHz');
    expect(formatFrequency(100)).toBe('100Hz');
  });
});

describe('formatVoltage', () => {
  it('appends V suffix', () => {
    expect(formatVoltage(5)).toBe('5V');
    expect(formatVoltage(3.3e-3)).toBe('3.3mV');
  });
});

describe('formatCurrent', () => {
  it('appends A suffix', () => {
    expect(formatCurrent(1e-3)).toBe('1mA');
    expect(formatCurrent(5e-6)).toBe('5µA');
  });
});

describe('formatDB', () => {
  it('formats with dB suffix', () => {
    expect(formatDB(0)).toBe('0dB');
    expect(formatDB(-3)).toBe('-3dB');
    expect(formatDB(-20.5)).toBe('-20.5dB');
  });
});

describe('formatPhase', () => {
  it('formats with degree suffix', () => {
    expect(formatPhase(0)).toBe('0°');
    expect(formatPhase(-90)).toBe('-90°');
    expect(formatPhase(-45.5)).toBe('-45.5°');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/ui && pnpm test`
Expected: FAIL — `./format.js` module not found.

- [ ] **Step 3: Implement format.ts**

```typescript
// src/core/format.ts

const SI_PREFIXES: [number, string][] = [
  [1e-15, 'f'],
  [1e-12, 'p'],
  [1e-9, 'n'],
  [1e-6, 'µ'],
  [1e-3, 'm'],
  [1, ''],
  [1e3, 'k'],
  [1e6, 'M'],
  [1e9, 'G'],
  [1e12, 'T'],
];

/**
 * Format a number with SI prefix. Returns string like "2.5k", "100m", "3.3µ".
 * Uses up to 4 significant digits.
 */
export function formatSI(value: number): string {
  if (value === 0) return '0';

  const abs = Math.abs(value);
  let bestPrefix = '';
  let bestScale = 1;

  for (const [scale, prefix] of SI_PREFIXES) {
    if (abs >= scale * 0.9999) {
      bestScale = scale;
      bestPrefix = prefix;
    }
  }

  const scaled = value / bestScale;
  // Use toPrecision(4) then strip trailing zeros
  const formatted = parseFloat(scaled.toPrecision(4)).toString();
  return `${formatted}${bestPrefix}`;
}

/** Format a time value with SI prefix + "s" suffix. */
export function formatTime(seconds: number): string {
  return `${formatSI(seconds)}s`;
}

/** Format a frequency value with SI prefix + "Hz" suffix. */
export function formatFrequency(hz: number): string {
  return `${formatSI(hz)}Hz`;
}

/** Format a voltage value with SI prefix + "V" suffix. */
export function formatVoltage(volts: number): string {
  return `${formatSI(volts)}V`;
}

/** Format a current value with SI prefix + "A" suffix. */
export function formatCurrent(amps: number): string {
  return `${formatSI(amps)}A`;
}

/** Format a dB value. No SI prefix — just round to 1 decimal if needed. */
export function formatDB(db: number): string {
  const rounded = Math.round(db * 10) / 10;
  const str = rounded === Math.floor(rounded) ? rounded.toString() : rounded.toString();
  return `${str}dB`;
}

/** Format a phase value in degrees. */
export function formatPhase(degrees: number): string {
  const rounded = Math.round(degrees * 10) / 10;
  const str = rounded === Math.floor(rounded) ? rounded.toString() : rounded.toString();
  return `${str}°`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/ui && pnpm test`
Expected: All format tests PASS.

- [ ] **Step 5: Add exports to core/index.ts**

Add to `src/core/index.ts`:
```typescript
export { formatSI, formatTime, formatFrequency, formatVoltage, formatCurrent, formatDB, formatPhase } from './format.js';
```

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/core/format.ts packages/ui/src/core/format.test.ts packages/ui/src/core/index.ts
git commit -m "feat(ui): add SI-prefix formatting utilities"
```

---

### Task 4: Scale utilities

**Files:**
- Create: `packages/ui/src/core/scales.ts`
- Create: `packages/ui/src/core/scales.test.ts`
- Modify: `packages/ui/src/core/index.ts`

- [ ] **Step 1: Write scale tests**

```typescript
// src/core/scales.test.ts
import { describe, it, expect } from 'vitest';
import { createLinearScale, createLogScale, computeYExtent, bisectData } from './scales.js';

describe('createLinearScale', () => {
  it('maps domain to range', () => {
    const scale = createLinearScale([0, 10], [0, 500]);
    expect(scale(0)).toBe(0);
    expect(scale(10)).toBe(500);
    expect(scale(5)).toBe(250);
  });

  it('handles inverted range (for y-axis: top=0, bottom=height)', () => {
    const scale = createLinearScale([0, 5], [300, 0]);
    expect(scale(0)).toBe(300);
    expect(scale(5)).toBe(0);
    expect(scale(2.5)).toBe(150);
  });
});

describe('createLogScale', () => {
  it('maps domain to range on log scale', () => {
    const scale = createLogScale([1, 1e6], [0, 600]);
    expect(scale(1)).toBeCloseTo(0, 0);
    expect(scale(1e6)).toBeCloseTo(600, 0);
    expect(scale(1e3)).toBeCloseTo(300, 0);
  });
});

describe('computeYExtent', () => {
  it('computes min/max with 10% padding', () => {
    const [min, max] = computeYExtent([[0, 1, 2, 3, 4, 5]]);
    expect(min).toBeCloseTo(-0.5, 2);
    expect(max).toBeCloseTo(5.5, 2);
  });

  it('handles multiple signal arrays', () => {
    const [min, max] = computeYExtent([[0, 1, 2], [-1, 0, 3]]);
    expect(min).toBeLessThan(-1);
    expect(max).toBeGreaterThan(3);
  });

  it('handles constant signal (adds ±1 padding)', () => {
    const [min, max] = computeYExtent([[5, 5, 5]]);
    expect(min).toBe(4);
    expect(max).toBe(6);
  });
});

describe('bisectData', () => {
  it('finds the nearest index for a given x value', () => {
    const xValues = [0, 1, 2, 3, 4, 5];
    expect(bisectData(xValues, 2.3)).toBe(2);
    expect(bisectData(xValues, 2.7)).toBe(3);
    expect(bisectData(xValues, 0)).toBe(0);
    expect(bisectData(xValues, 5)).toBe(5);
  });

  it('clamps to array bounds', () => {
    const xValues = [1, 2, 3];
    expect(bisectData(xValues, -10)).toBe(0);
    expect(bisectData(xValues, 100)).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/ui && pnpm test -- src/core/scales.test.ts`
Expected: FAIL — `./scales.js` module not found.

- [ ] **Step 3: Implement scales.ts**

```typescript
// src/core/scales.ts
import { scaleLinear, scaleLog, type ScaleLinear, type ScaleLogarithmic } from 'd3-scale';
import { bisector } from 'd3-array';

export type LinearScale = ScaleLinear<number, number>;
export type LogScale = ScaleLogarithmic<number, number>;

/** Create a linear scale mapping [domainMin, domainMax] to [rangeMin, rangeMax]. */
export function createLinearScale(domain: [number, number], range: [number, number]): LinearScale {
  return scaleLinear().domain(domain).range(range);
}

/** Create a log10 scale mapping [domainMin, domainMax] to [rangeMin, rangeMax]. */
export function createLogScale(domain: [number, number], range: [number, number]): LogScale {
  return scaleLog().base(10).domain(domain).range(range);
}

/**
 * Compute y-axis extent from signal arrays with 10% padding.
 * If the data is constant, adds ±1 padding.
 */
export function computeYExtent(signalArrays: number[][]): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const arr of signalArrays) {
    for (const v of arr) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (!isFinite(min) || !isFinite(max)) return [-1, 1];
  if (min === max) return [min - 1, max + 1];
  const padding = (max - min) * 0.1;
  return [min - padding, max + padding];
}

const xBisector = bisector<number, number>((d) => d).center;

/**
 * Find the index in a sorted array whose value is nearest to `target`.
 * Returns the index clamped to [0, length - 1].
 */
export function bisectData(sortedX: number[], target: number): number {
  if (sortedX.length === 0) return 0;
  const idx = xBisector(sortedX, target);
  return Math.max(0, Math.min(idx, sortedX.length - 1));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/ui && pnpm test -- src/core/scales.test.ts`
Expected: All scale tests PASS.

- [ ] **Step 5: Add exports to core/index.ts**

Add to `src/core/index.ts`:
```typescript
export { createLinearScale, createLogScale, computeYExtent, bisectData } from './scales.js';
export type { LinearScale, LogScale } from './scales.js';
```

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/core/scales.ts packages/ui/src/core/scales.test.ts packages/ui/src/core/index.ts
git commit -m "feat(ui): add scale utilities wrapping d3-scale"
```

---

### Task 5: Data normalization

**Files:**
- Create: `packages/ui/src/core/data.ts`
- Create: `packages/ui/src/core/data.test.ts`
- Modify: `packages/ui/src/core/index.ts`

- [ ] **Step 1: Write data normalization tests**

These tests will import types from `@spice-ts/core` and create mock result objects to verify normalization. Since `TransientResult` and `ACResult` are classes with methods, we construct minimal mock instances.

```typescript
// src/core/data.test.ts
import { describe, it, expect } from 'vitest';
import { normalizeTransientData, normalizeACData } from './data.js';
import type { TransientDataset, ACDataset } from './types.js';

// Helper: create a mock TransientResult-like object
function mockTransientResult(time: number[], voltages: Record<string, number[]>) {
  const voltageMap = new Map(Object.entries(voltages));
  return {
    time,
    voltage(node: string) {
      const v = voltageMap.get(node);
      if (!v) throw new Error(`Unknown node: ${node}`);
      return v;
    },
    current(_source: string) { return []; },
  };
}

// Helper: create a mock ACResult-like object
function mockACResult(
  frequencies: number[],
  voltages: Record<string, { magnitude: number; phase: number }[]>,
) {
  const voltageMap = new Map(Object.entries(voltages));
  return {
    frequencies,
    voltage(node: string) {
      const v = voltageMap.get(node);
      if (!v) throw new Error(`Unknown node: ${node}`);
      return v;
    },
    current(_source: string) { return []; },
  };
}

describe('normalizeTransientData', () => {
  it('normalizes a single TransientResult', () => {
    const result = mockTransientResult([0, 1, 2], { out: [0, 2.5, 5] });
    const datasets = normalizeTransientData(result, ['out']);
    expect(datasets).toHaveLength(1);
    expect(datasets[0].label).toBe('');
    expect(datasets[0].time).toEqual([0, 1, 2]);
    expect(datasets[0].signals.get('out')).toEqual([0, 2.5, 5]);
  });

  it('normalizes an array of TransientDatasets (pass-through)', () => {
    const ds: TransientDataset[] = [
      { time: [0, 1], signals: new Map([['out', [0, 5]]]), label: 'R=1k' },
      { time: [0, 1], signals: new Map([['out', [0, 3]]]), label: 'R=10k' },
    ];
    const datasets = normalizeTransientData(ds, ['out']);
    expect(datasets).toHaveLength(2);
    expect(datasets[0].label).toBe('R=1k');
    expect(datasets[1].label).toBe('R=10k');
  });

  it('extracts only requested signals', () => {
    const result = mockTransientResult([0, 1], { out: [0, 5], mid: [0, 2.5] });
    const datasets = normalizeTransientData(result, ['out']);
    expect(datasets[0].signals.has('out')).toBe(true);
    expect(datasets[0].signals.has('mid')).toBe(false);
  });
});

describe('normalizeACData', () => {
  it('normalizes a single ACResult into magnitude/phase arrays', () => {
    const result = mockACResult([100, 1000, 10000], {
      out: [
        { magnitude: 1, phase: 0 },
        { magnitude: 0.707, phase: -45 },
        { magnitude: 0.1, phase: -84 },
      ],
    });
    const datasets = normalizeACData(result, ['out']);
    expect(datasets).toHaveLength(1);
    expect(datasets[0].frequencies).toEqual([100, 1000, 10000]);
    const mags = datasets[0].magnitudes.get('out')!;
    // Magnitude converted to dB: 20*log10(mag)
    expect(mags[0]).toBeCloseTo(0, 1); // 20*log10(1) = 0 dB
    expect(mags[1]).toBeCloseTo(-3.01, 1); // 20*log10(0.707) ≈ -3 dB
    expect(datasets[0].phases.get('out')).toEqual([0, -45, -84]);
  });

  it('normalizes an array of ACDatasets (pass-through)', () => {
    const ds: ACDataset[] = [
      {
        frequencies: [100, 1000],
        magnitudes: new Map([['out', [0, -3]]]),
        phases: new Map([['out', [0, -45]]]),
        label: 'C=1n',
      },
    ];
    const datasets = normalizeACData(ds, ['out']);
    expect(datasets).toHaveLength(1);
    expect(datasets[0].label).toBe('C=1n');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/ui && pnpm test -- src/core/data.test.ts`
Expected: FAIL — `./data.js` module not found.

- [ ] **Step 3: Implement data.ts**

```typescript
// src/core/data.ts
import type { TransientDataset, ACDataset } from './types.js';

/**
 * Duck-type interface for objects shaped like TransientResult.
 * Avoids hard dependency on @spice-ts/core class at runtime.
 */
interface TransientResultLike {
  time: number[];
  voltage(node: string): number[];
  current(source: string): number[];
}

/**
 * Duck-type interface for objects shaped like ACResult.
 */
interface ACResultLike {
  frequencies: number[];
  voltage(node: string): { magnitude: number; phase: number }[];
  current(source: string): { magnitude: number; phase: number }[];
}

function isTransientResultLike(data: unknown): data is TransientResultLike {
  return (
    typeof data === 'object' &&
    data !== null &&
    'time' in data &&
    Array.isArray((data as TransientResultLike).time) &&
    'voltage' in data &&
    typeof (data as TransientResultLike).voltage === 'function'
  );
}

function isACResultLike(data: unknown): data is ACResultLike {
  return (
    typeof data === 'object' &&
    data !== null &&
    'frequencies' in data &&
    Array.isArray((data as ACResultLike).frequencies) &&
    'voltage' in data &&
    typeof (data as ACResultLike).voltage === 'function'
  );
}

/**
 * Normalize transient input data into an array of TransientDataset.
 * Accepts either a TransientResult-like object or a pre-normalized dataset array.
 */
export function normalizeTransientData(
  data: unknown,
  signals: string[],
): TransientDataset[] {
  if (Array.isArray(data)) {
    return data as TransientDataset[];
  }

  if (!isTransientResultLike(data)) {
    throw new Error('Invalid transient data: expected TransientResult or TransientDataset[]');
  }

  const signalMap = new Map<string, number[]>();
  for (const name of signals) {
    try {
      signalMap.set(name, data.voltage(name));
    } catch {
      try {
        signalMap.set(name, data.current(name));
      } catch {
        // Signal not found — skip
      }
    }
  }

  return [{ time: data.time, signals: signalMap, label: '' }];
}

/**
 * Normalize AC input data into an array of ACDataset.
 * Converts linear magnitude to dB (20 * log10).
 */
export function normalizeACData(
  data: unknown,
  signals: string[],
): ACDataset[] {
  if (Array.isArray(data)) {
    return data as ACDataset[];
  }

  if (!isACResultLike(data)) {
    throw new Error('Invalid AC data: expected ACResult or ACDataset[]');
  }

  const magnitudes = new Map<string, number[]>();
  const phases = new Map<string, number[]>();

  for (const name of signals) {
    try {
      const phasors = data.voltage(name);
      magnitudes.set(name, phasors.map((p) => 20 * Math.log10(Math.max(p.magnitude, 1e-30))));
      phases.set(name, phasors.map((p) => p.phase));
    } catch {
      try {
        const phasors = data.current(name);
        magnitudes.set(name, phasors.map((p) => 20 * Math.log10(Math.max(p.magnitude, 1e-30))));
        phases.set(name, phasors.map((p) => p.phase));
      } catch {
        // Signal not found — skip
      }
    }
  }

  return [{ frequencies: data.frequencies, magnitudes, phases, label: '' }];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/ui && pnpm test -- src/core/data.test.ts`
Expected: All data normalization tests PASS.

- [ ] **Step 5: Add exports to core/index.ts**

Add to `src/core/index.ts`:
```typescript
export { normalizeTransientData, normalizeACData } from './data.js';
```

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/core/data.ts packages/ui/src/core/data.test.ts packages/ui/src/core/index.ts
git commit -m "feat(ui): add data normalization for TransientResult and ACResult"
```

---

### Task 6: Growable buffer for streaming

**Files:**
- Create: `packages/ui/src/core/buffer.ts`
- Create: `packages/ui/src/core/buffer.test.ts`
- Modify: `packages/ui/src/core/index.ts`

- [ ] **Step 1: Write buffer tests**

```typescript
// src/core/buffer.test.ts
import { describe, it, expect } from 'vitest';
import { GrowableBuffer } from './buffer.js';

describe('GrowableBuffer', () => {
  it('starts empty with given initial capacity', () => {
    const buf = new GrowableBuffer(16);
    expect(buf.length).toBe(0);
    expect(buf.capacity).toBe(16);
  });

  it('appends values and grows length', () => {
    const buf = new GrowableBuffer(4);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    expect(buf.length).toBe(3);
    expect(buf.get(0)).toBe(1);
    expect(buf.get(1)).toBe(2);
    expect(buf.get(2)).toBe(3);
  });

  it('doubles capacity when full', () => {
    const buf = new GrowableBuffer(2);
    buf.push(1);
    buf.push(2);
    expect(buf.capacity).toBe(2);
    buf.push(3); // triggers grow
    expect(buf.capacity).toBe(4);
    expect(buf.length).toBe(3);
    expect(buf.get(2)).toBe(3);
  });

  it('toArray returns a copy of the data', () => {
    const buf = new GrowableBuffer(4);
    buf.push(10);
    buf.push(20);
    const arr = buf.toArray();
    expect(arr).toEqual([10, 20]);
    expect(arr).toBeInstanceOf(Float64Array);
    // Mutating the copy should not affect the buffer
    arr[0] = 999;
    expect(buf.get(0)).toBe(10);
  });

  it('clear resets length but keeps capacity', () => {
    const buf = new GrowableBuffer(4);
    buf.push(1);
    buf.push(2);
    buf.clear();
    expect(buf.length).toBe(0);
    expect(buf.capacity).toBe(4);
  });

  it('slice returns a sub-view as regular number array', () => {
    const buf = new GrowableBuffer(8);
    for (let i = 0; i < 5; i++) buf.push(i * 10);
    expect(buf.slice(1, 4)).toEqual([10, 20, 30]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/ui && pnpm test -- src/core/buffer.test.ts`
Expected: FAIL — `./buffer.js` module not found.

- [ ] **Step 3: Implement buffer.ts**

```typescript
// src/core/buffer.ts

/**
 * A growable Float64Array buffer for accumulating streaming data.
 * Doubles capacity when full. Avoids repeated array copies.
 */
export class GrowableBuffer {
  private data: Float64Array;
  private _length = 0;

  constructor(initialCapacity = 1024) {
    this.data = new Float64Array(initialCapacity);
  }

  get length(): number {
    return this._length;
  }

  get capacity(): number {
    return this.data.length;
  }

  /** Append a value to the end. Grows capacity if needed. */
  push(value: number): void {
    if (this._length >= this.data.length) {
      const newData = new Float64Array(this.data.length * 2);
      newData.set(this.data);
      this.data = newData;
    }
    this.data[this._length++] = value;
  }

  /** Get value at index. */
  get(index: number): number {
    return this.data[index];
  }

  /** Return a copy of the used portion as a Float64Array. */
  toArray(): Float64Array {
    return this.data.slice(0, this._length);
  }

  /** Return a slice as a regular number array. */
  slice(start: number, end: number): number[] {
    return Array.from(this.data.subarray(start, end));
  }

  /** Reset length to 0 without deallocating. */
  clear(): void {
    this._length = 0;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/ui && pnpm test -- src/core/buffer.test.ts`
Expected: All buffer tests PASS.

- [ ] **Step 5: Add exports to core/index.ts**

Add to `src/core/index.ts`:
```typescript
export { GrowableBuffer } from './buffer.js';
```

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/core/buffer.ts packages/ui/src/core/buffer.test.ts packages/ui/src/core/index.ts
git commit -m "feat(ui): add GrowableBuffer for streaming data accumulation"
```

---

### Task 7: Transient renderer

**Files:**
- Create: `packages/ui/src/core/renderer.ts`
- Create: `packages/ui/src/core/renderer.test.ts`
- Modify: `packages/ui/src/core/index.ts`

- [ ] **Step 1: Write renderer tests**

Test the public API, not individual draw calls. Focus on initialization, data setting, cursor computation, and cleanup.

```typescript
// src/core/renderer.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransientRenderer } from './renderer.js';
import { DARK_THEME } from './theme.js';
import type { TransientDataset } from './types.js';

function createTestCanvas(width = 800, height = 400): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  // getBoundingClientRect is not available in jsdom
  canvas.getBoundingClientRect = () => ({
    x: 0, y: 0, width, height, top: 0, left: 0, right: width, bottom: height, toJSON() {},
  });
  return canvas;
}

function createTestData(): TransientDataset[] {
  const time = [0, 1e-3, 2e-3, 3e-3, 4e-3, 5e-3];
  const signals = new Map<string, number[]>();
  signals.set('out', [0, 1, 2, 3, 4, 5]);
  signals.set('in', [5, 5, 5, 5, 5, 5]);
  return [{ time, signals, label: '' }];
}

describe('TransientRenderer', () => {
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    canvas = createTestCanvas();
  });

  it('constructs without error', () => {
    const renderer = new TransientRenderer(canvas, { theme: DARK_THEME });
    expect(renderer).toBeDefined();
    renderer.destroy();
  });

  it('setData and render without error', () => {
    const renderer = new TransientRenderer(canvas, { theme: DARK_THEME });
    renderer.setData(createTestData(), ['out', 'in']);
    renderer.render();
    renderer.destroy();
  });

  it('emits cursorMove events', () => {
    const renderer = new TransientRenderer(canvas, { theme: DARK_THEME });
    renderer.setData(createTestData(), ['out']);

    const callback = vi.fn();
    renderer.on('cursorMove', callback);

    // Simulate a cursor update at pixel position
    renderer.setCursorPixelX(200);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        x: expect.any(Number),
        pixelX: 200,
        values: expect.any(Array),
      }),
    );

    renderer.destroy();
  });

  it('setCursorPixelX(null) clears cursor', () => {
    const renderer = new TransientRenderer(canvas, { theme: DARK_THEME });
    renderer.setData(createTestData(), ['out']);

    const callback = vi.fn();
    renderer.on('cursorMove', callback);

    renderer.setCursorPixelX(null);
    expect(callback).toHaveBeenCalledWith(null);

    renderer.destroy();
  });

  it('fitToData resets zoom to show all data', () => {
    const renderer = new TransientRenderer(canvas, { theme: DARK_THEME });
    renderer.setData(createTestData(), ['out']);
    // zoom in
    renderer.zoomAt(400, 2);
    renderer.fitToData();
    renderer.render();
    renderer.destroy();
  });

  it('setSignalVisibility hides/shows signals', () => {
    const renderer = new TransientRenderer(canvas, { theme: DARK_THEME });
    renderer.setData(createTestData(), ['out', 'in']);
    renderer.setSignalVisibility('out', false);
    renderer.render(); // should not throw even with hidden signal
    renderer.destroy();
  });

  it('destroy cleans up', () => {
    const renderer = new TransientRenderer(canvas, { theme: DARK_THEME });
    renderer.destroy();
    // Calling render after destroy should not throw
    renderer.render();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/ui && pnpm test -- src/core/renderer.test.ts`
Expected: FAIL — `./renderer.js` module not found.

- [ ] **Step 3: Implement renderer.ts**

```typescript
// src/core/renderer.ts
import { createLinearScale, computeYExtent, bisectData, type LinearScale } from './scales.js';
import { formatTime, formatVoltage } from './format.js';
import type { ThemeConfig, TransientDataset, CursorState, CursorValue, Margins, RendererEvents } from './types.js';
import { DEFAULT_PALETTE } from './types.js';

export interface TransientRendererOptions {
  theme: ThemeConfig;
  margin?: Partial<Margins>;
}

interface SignalState {
  name: string;
  color: string;
  visible: boolean;
  datasetIndex: number;
}

export class TransientRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private theme: ThemeConfig;
  private margin: Margins;
  private dpr: number;

  private datasets: TransientDataset[] = [];
  private signalStates: SignalState[] = [];
  private xScale: LinearScale = createLinearScale([0, 1], [0, 1]);
  private yScale: LinearScale = createLinearScale([0, 1], [0, 1]);
  private xDomain: [number, number] = [0, 1];
  private yDomain: [number, number] = [0, 1];
  private cursorState: CursorState | null = null;
  private destroyed = false;

  private listeners: Partial<{ [K in keyof RendererEvents]: RendererEvents[K][] }> = {};

  constructor(canvas: HTMLCanvasElement, options: TransientRendererOptions) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.theme = options.theme;
    this.dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    this.margin = {
      top: options.margin?.top ?? 10,
      right: options.margin?.right ?? 16,
      bottom: options.margin?.bottom ?? 32,
      left: options.margin?.left ?? 56,
    };
  }

  /** Set or replace the data displayed. */
  setData(datasets: TransientDataset[], signals: string[]): void {
    this.datasets = datasets;
    this.signalStates = [];

    let colorIdx = 0;
    for (let di = 0; di < datasets.length; di++) {
      for (const name of signals) {
        if (datasets[di].signals.has(name)) {
          this.signalStates.push({
            name,
            color: DEFAULT_PALETTE[colorIdx % DEFAULT_PALETTE.length],
            visible: true,
            datasetIndex: di,
          });
          colorIdx++;
        }
      }
    }

    this.computeDefaultDomains();
    this.updateScales();
  }

  /** Update theme. */
  setTheme(theme: ThemeConfig): void {
    this.theme = theme;
  }

  /** Override color for a signal. */
  setSignalColor(name: string, color: string): void {
    for (const s of this.signalStates) {
      if (s.name === name) s.color = color;
    }
  }

  /** Toggle signal visibility. */
  setSignalVisibility(name: string, visible: boolean): void {
    for (const s of this.signalStates) {
      if (s.name === name) s.visible = visible;
    }
  }

  /** Get current signal states (for legend rendering). */
  getSignalStates(): ReadonlyArray<Readonly<SignalState>> {
    return this.signalStates;
  }

  /** Set cursor at a pixel x position, or null to clear. */
  setCursorPixelX(pixelX: number | null): void {
    if (pixelX === null) {
      this.cursorState = null;
      this.emit('cursorMove', null);
      return;
    }

    const dataX = this.xScale.invert(pixelX - this.margin.left);
    const values: CursorValue[] = [];

    for (const s of this.signalStates) {
      if (!s.visible) continue;
      const ds = this.datasets[s.datasetIndex];
      const idx = bisectData(ds.time as number[], dataX);
      const signalArr = ds.signals.get(s.name);
      if (!signalArr) continue;

      const label = ds.label ? `${ds.label}: ${s.name}` : s.name;
      values.push({
        signalId: ds.label ? `${ds.label}:${s.name}` : s.name,
        label,
        value: signalArr[idx],
        unit: 'V',
        color: s.color,
      });
    }

    this.cursorState = { x: dataX, pixelX, values };
    this.emit('cursorMove', this.cursorState);
  }

  /** Zoom at a pixel x position by a factor (>1 zooms in, <1 zooms out). */
  zoomAt(pixelX: number, factor: number): void {
    const centerX = this.xScale.invert(pixelX - this.margin.left);
    const [x0, x1] = this.xDomain;
    const halfSpan = (x1 - x0) / 2 / factor;
    this.xDomain = [centerX - halfSpan, centerX + halfSpan];
    this.updateScales();
  }

  /** Zoom Y axis by factor. */
  zoomY(factor: number): void {
    const [y0, y1] = this.yDomain;
    const center = (y0 + y1) / 2;
    const halfSpan = (y1 - y0) / 2 / factor;
    this.yDomain = [center - halfSpan, center + halfSpan];
    this.updateScales();
  }

  /** Pan by pixel deltas. */
  pan(dx: number, dy: number): void {
    const plotWidth = this.getPlotWidth();
    const plotHeight = this.getPlotHeight();
    const [x0, x1] = this.xDomain;
    const [y0, y1] = this.yDomain;
    const xShift = (dx / plotWidth) * (x1 - x0);
    const yShift = (dy / plotHeight) * (y1 - y0);
    this.xDomain = [x0 - xShift, x1 - xShift];
    this.yDomain = [y0 + yShift, y1 + yShift];
    this.updateScales();
  }

  /** Reset zoom to show all data. */
  fitToData(): void {
    this.computeDefaultDomains();
    this.updateScales();
  }

  /** Register an event listener. */
  on<K extends keyof RendererEvents>(event: K, callback: RendererEvents[K]): void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    (this.listeners[event] as RendererEvents[K][]).push(callback);
  }

  /** Remove an event listener. */
  off<K extends keyof RendererEvents>(event: K, callback: RendererEvents[K]): void {
    const arr = this.listeners[event];
    if (!arr) return;
    const idx = (arr as RendererEvents[K][]).indexOf(callback);
    if (idx >= 0) arr.splice(idx, 1);
  }

  /** Render the full plot to the canvas. */
  render(): void {
    if (this.destroyed || !this.ctx) return;
    const ctx = this.ctx;
    const width = this.canvas.width / this.dpr;
    const height = this.canvas.height / this.dpr;

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    // Background
    ctx.fillStyle = this.theme.background;
    ctx.fillRect(this.margin.left, this.margin.top, this.getPlotWidth(), this.getPlotHeight());

    this.drawGrid(ctx, width, height);
    this.drawWaveforms(ctx);
    this.drawXAxis(ctx, height);
    this.drawYAxis(ctx);
    if (this.cursorState) {
      this.drawCursor(ctx);
    }

    ctx.restore();
  }

  /** Clean up resources. */
  destroy(): void {
    this.destroyed = true;
    this.listeners = {};
  }

  // --- Private helpers ---

  private emit<K extends keyof RendererEvents>(event: K, ...args: Parameters<RendererEvents[K]>): void {
    const arr = this.listeners[event];
    if (!arr) return;
    for (const cb of arr) {
      (cb as (...a: unknown[]) => void)(...args);
    }
  }

  private getPlotWidth(): number {
    return this.canvas.width / this.dpr - this.margin.left - this.margin.right;
  }

  private getPlotHeight(): number {
    return this.canvas.height / this.dpr - this.margin.top - this.margin.bottom;
  }

  private computeDefaultDomains(): void {
    if (this.datasets.length === 0) return;
    // X domain: min/max time across all datasets
    let xMin = Infinity;
    let xMax = -Infinity;
    for (const ds of this.datasets) {
      if (ds.time.length > 0) {
        xMin = Math.min(xMin, ds.time[0]);
        xMax = Math.max(xMax, ds.time[ds.time.length - 1]);
      }
    }
    if (isFinite(xMin) && isFinite(xMax)) {
      this.xDomain = [xMin, xMax];
    }

    // Y domain: extent of all visible signals
    const arrays: number[][] = [];
    for (const s of this.signalStates) {
      if (!s.visible) continue;
      const arr = this.datasets[s.datasetIndex].signals.get(s.name);
      if (arr) arrays.push(arr);
    }
    if (arrays.length > 0) {
      this.yDomain = computeYExtent(arrays);
    }
  }

  private updateScales(): void {
    const plotWidth = this.getPlotWidth();
    const plotHeight = this.getPlotHeight();
    this.xScale = createLinearScale(this.xDomain, [0, plotWidth]);
    this.yScale = createLinearScale(this.yDomain, [plotHeight, 0]); // inverted: y=0 at bottom
  }

  private drawGrid(ctx: CanvasRenderingContext2D, _width: number, _height: number): void {
    const plotWidth = this.getPlotWidth();
    const plotHeight = this.getPlotHeight();
    const { left, top } = this.margin;

    ctx.strokeStyle = this.theme.grid;
    ctx.lineWidth = 0.5;

    // Vertical grid lines
    const xTicks = this.xScale.ticks(6);
    for (const tick of xTicks) {
      const x = left + this.xScale(tick);
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + plotHeight);
      ctx.stroke();
    }

    // Horizontal grid lines
    const yTicks = this.yScale.ticks(5);
    for (const tick of yTicks) {
      const y = top + this.yScale(tick);
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + plotWidth, y);
      ctx.stroke();
    }
  }

  private drawWaveforms(ctx: CanvasRenderingContext2D): void {
    const { left, top } = this.margin;
    const plotWidth = this.getPlotWidth();
    const plotHeight = this.getPlotHeight();

    // Clip to plot area
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, plotWidth, plotHeight);
    ctx.clip();

    for (const s of this.signalStates) {
      if (!s.visible) continue;
      const ds = this.datasets[s.datasetIndex];
      const yArr = ds.signals.get(s.name);
      if (!yArr) continue;

      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      let started = false;
      for (let i = 0; i < ds.time.length; i++) {
        const x = left + this.xScale(ds.time[i]);
        const y = top + this.yScale(yArr[i]);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawXAxis(ctx: CanvasRenderingContext2D, height: number): void {
    const { left } = this.margin;
    const plotHeight = this.getPlotHeight();
    const y = this.margin.top + plotHeight;

    ctx.fillStyle = this.theme.textMuted;
    ctx.font = `${this.theme.fontSize}px ${this.theme.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const ticks = this.xScale.ticks(6);
    for (const tick of ticks) {
      const x = left + this.xScale(tick);
      ctx.fillText(formatTime(tick), x, y + 6);
    }
  }

  private drawYAxis(ctx: CanvasRenderingContext2D): void {
    const { left, top } = this.margin;

    ctx.fillStyle = this.theme.textMuted;
    ctx.font = `${this.theme.fontSize}px ${this.theme.font}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const ticks = this.yScale.ticks(5);
    for (const tick of ticks) {
      const y = top + this.yScale(tick);
      ctx.fillText(formatVoltage(tick), left - 6, y);
    }
  }

  private drawCursor(ctx: CanvasRenderingContext2D): void {
    if (!this.cursorState) return;
    const { left, top } = this.margin;
    const plotHeight = this.getPlotHeight();
    const x = this.cursorState.pixelX;

    // Dashed vertical line
    ctx.strokeStyle = this.theme.cursor;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, top + plotHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    // Dots at intersection with each visible signal
    for (const v of this.cursorState.values) {
      const dataX = this.cursorState.x;
      // Find the y value for this signal
      for (const s of this.signalStates) {
        const matchId = this.datasets[s.datasetIndex].label
          ? `${this.datasets[s.datasetIndex].label}:${s.name}`
          : s.name;
        if (matchId !== v.signalId || !s.visible) continue;

        const ds = this.datasets[s.datasetIndex];
        const idx = bisectData(ds.time as number[], dataX);
        const yArr = ds.signals.get(s.name);
        if (!yArr) continue;

        const py = top + this.yScale(yArr[idx]);
        ctx.fillStyle = v.color;
        ctx.strokeStyle = this.theme.background;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, py, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        break;
      }
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/ui && pnpm test -- src/core/renderer.test.ts`
Expected: All renderer tests PASS.

- [ ] **Step 5: Add exports to core/index.ts**

Add to `src/core/index.ts`:
```typescript
export { TransientRenderer, type TransientRendererOptions } from './renderer.js';
```

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/core/renderer.ts packages/ui/src/core/renderer.test.ts packages/ui/src/core/index.ts
git commit -m "feat(ui): add TransientRenderer with Canvas waveform rendering"
```

---

### Task 8: Bode renderer

**Files:**
- Create: `packages/ui/src/core/bode-renderer.ts`
- Create: `packages/ui/src/core/bode-renderer.test.ts`
- Modify: `packages/ui/src/core/index.ts`

- [ ] **Step 1: Write Bode renderer tests**

```typescript
// src/core/bode-renderer.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BodeRenderer } from './bode-renderer.js';
import { DARK_THEME } from './theme.js';
import type { ACDataset } from './types.js';

function createTestCanvas(width = 800, height = 300): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getBoundingClientRect = () => ({
    x: 0, y: 0, width, height, top: 0, left: 0, right: width, bottom: height, toJSON() {},
  });
  return canvas;
}

function createTestACData(): ACDataset[] {
  const frequencies = [100, 1000, 10000, 100000, 1000000];
  const magnitudes = new Map([['out', [0, -1, -3, -10, -20]]]);
  const phases = new Map([['out', [0, -10, -45, -75, -85]]]);
  return [{ frequencies, magnitudes, phases, label: '' }];
}

describe('BodeRenderer', () => {
  let magCanvas: HTMLCanvasElement;
  let phaseCanvas: HTMLCanvasElement;

  beforeEach(() => {
    magCanvas = createTestCanvas();
    phaseCanvas = createTestCanvas(800, 200);
  });

  it('constructs without error', () => {
    const renderer = new BodeRenderer(magCanvas, phaseCanvas, { theme: DARK_THEME });
    expect(renderer).toBeDefined();
    renderer.destroy();
  });

  it('setData and render without error', () => {
    const renderer = new BodeRenderer(magCanvas, phaseCanvas, { theme: DARK_THEME });
    renderer.setData(createTestACData(), ['out']);
    renderer.render();
    renderer.destroy();
  });

  it('collapsing magnitude pane still renders phase', () => {
    const renderer = new BodeRenderer(magCanvas, phaseCanvas, { theme: DARK_THEME });
    renderer.setData(createTestACData(), ['out']);
    renderer.setPaneVisible('magnitude', false);
    renderer.render(); // should not throw
    renderer.destroy();
  });

  it('collapsing phase pane still renders magnitude', () => {
    const renderer = new BodeRenderer(magCanvas, phaseCanvas, { theme: DARK_THEME });
    renderer.setData(createTestACData(), ['out']);
    renderer.setPaneVisible('phase', false);
    renderer.render();
    renderer.destroy();
  });

  it('emits cursorMove events', () => {
    const renderer = new BodeRenderer(magCanvas, phaseCanvas, { theme: DARK_THEME });
    renderer.setData(createTestACData(), ['out']);

    const callback = vi.fn();
    renderer.on('cursorMove', callback);

    renderer.setCursorPixelX(200);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        x: expect.any(Number),
        values: expect.any(Array),
      }),
    );

    renderer.destroy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/ui && pnpm test -- src/core/bode-renderer.test.ts`
Expected: FAIL — `./bode-renderer.js` module not found.

- [ ] **Step 3: Implement bode-renderer.ts**

```typescript
// src/core/bode-renderer.ts
import { createLogScale, createLinearScale, computeYExtent, bisectData, type LogScale, type LinearScale } from './scales.js';
import { formatFrequency, formatDB, formatPhase } from './format.js';
import type { ThemeConfig, ACDataset, CursorState, CursorValue, Margins, RendererEvents } from './types.js';
import { DEFAULT_PALETTE } from './types.js';

export interface BodeRendererOptions {
  theme: ThemeConfig;
  margin?: Partial<Margins>;
  defaultPanes?: 'both' | 'magnitude' | 'phase';
}

interface SignalState {
  name: string;
  color: string;
  visible: boolean;
  datasetIndex: number;
}

export class BodeRenderer {
  private magCanvas: HTMLCanvasElement;
  private phaseCanvas: HTMLCanvasElement;
  private magCtx: CanvasRenderingContext2D | null;
  private phaseCtx: CanvasRenderingContext2D | null;
  private theme: ThemeConfig;
  private margin: Margins;
  private dpr: number;

  private datasets: ACDataset[] = [];
  private signalStates: SignalState[] = [];
  private xScale: LogScale = createLogScale([1, 10], [0, 1]);
  private magYScale: LinearScale = createLinearScale([0, 1], [0, 1]);
  private phaseYScale: LinearScale = createLinearScale([0, 1], [0, 1]);
  private xDomain: [number, number] = [1, 10];
  private magYDomain: [number, number] = [-60, 10];
  private phaseYDomain: [number, number] = [-180, 0];

  private magnitudeVisible = true;
  private phaseVisible = true;
  private cursorState: CursorState | null = null;
  private destroyed = false;
  private listeners: Partial<{ [K in keyof RendererEvents]: RendererEvents[K][] }> = {};

  constructor(magCanvas: HTMLCanvasElement, phaseCanvas: HTMLCanvasElement, options: BodeRendererOptions) {
    this.magCanvas = magCanvas;
    this.phaseCanvas = phaseCanvas;
    this.magCtx = magCanvas.getContext('2d');
    this.phaseCtx = phaseCanvas.getContext('2d');
    this.theme = options.theme;
    this.dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    this.margin = {
      top: options.margin?.top ?? 20,
      right: options.margin?.right ?? 16,
      bottom: options.margin?.bottom ?? 32,
      left: options.margin?.left ?? 56,
    };

    if (options.defaultPanes === 'magnitude') this.phaseVisible = false;
    if (options.defaultPanes === 'phase') this.magnitudeVisible = false;
  }

  setData(datasets: ACDataset[], signals: string[]): void {
    this.datasets = datasets;
    this.signalStates = [];

    let colorIdx = 0;
    for (let di = 0; di < datasets.length; di++) {
      for (const name of signals) {
        if (datasets[di].magnitudes.has(name)) {
          this.signalStates.push({
            name,
            color: DEFAULT_PALETTE[colorIdx % DEFAULT_PALETTE.length],
            visible: true,
            datasetIndex: di,
          });
          colorIdx++;
        }
      }
    }

    this.computeDefaultDomains();
    this.updateScales();
  }

  setTheme(theme: ThemeConfig): void {
    this.theme = theme;
  }

  setSignalColor(name: string, color: string): void {
    for (const s of this.signalStates) {
      if (s.name === name) s.color = color;
    }
  }

  setSignalVisibility(name: string, visible: boolean): void {
    for (const s of this.signalStates) {
      if (s.name === name) s.visible = visible;
    }
  }

  getSignalStates(): ReadonlyArray<Readonly<SignalState>> {
    return this.signalStates;
  }

  setPaneVisible(pane: 'magnitude' | 'phase', visible: boolean): void {
    if (pane === 'magnitude') this.magnitudeVisible = visible;
    if (pane === 'phase') this.phaseVisible = visible;
  }

  isPaneVisible(pane: 'magnitude' | 'phase'): boolean {
    return pane === 'magnitude' ? this.magnitudeVisible : this.phaseVisible;
  }

  setCursorPixelX(pixelX: number | null): void {
    if (pixelX === null) {
      this.cursorState = null;
      this.emit('cursorMove', null);
      return;
    }

    const dataX = this.xScale.invert(pixelX - this.margin.left);
    const values: CursorValue[] = [];

    for (const s of this.signalStates) {
      if (!s.visible) continue;
      const ds = this.datasets[s.datasetIndex];
      const idx = bisectData(ds.frequencies as number[], dataX);
      const magArr = ds.magnitudes.get(s.name);
      const phaseArr = ds.phases.get(s.name);
      const label = ds.label ? `${ds.label}: ${s.name}` : s.name;
      const signalId = ds.label ? `${ds.label}:${s.name}` : s.name;

      if (magArr && this.magnitudeVisible) {
        values.push({ signalId: `${signalId}:mag`, label: `${label} (mag)`, value: magArr[idx], unit: 'dB', color: s.color });
      }
      if (phaseArr && this.phaseVisible) {
        values.push({ signalId: `${signalId}:phase`, label: `${label} (phase)`, value: phaseArr[idx], unit: '°', color: s.color });
      }
    }

    this.cursorState = { x: dataX, pixelX, values };
    this.emit('cursorMove', this.cursorState);
  }

  zoomAt(pixelX: number, factor: number): void {
    const centerX = this.xScale.invert(pixelX - this.margin.left);
    const logCenter = Math.log10(centerX);
    const [lx0, lx1] = [Math.log10(this.xDomain[0]), Math.log10(this.xDomain[1])];
    const halfSpan = (lx1 - lx0) / 2 / factor;
    this.xDomain = [Math.pow(10, logCenter - halfSpan), Math.pow(10, logCenter + halfSpan)];
    this.updateScales();
  }

  pan(dx: number, _dy: number): void {
    const plotWidth = this.getPlotWidth(this.magCanvas);
    const [lx0, lx1] = [Math.log10(this.xDomain[0]), Math.log10(this.xDomain[1])];
    const logShift = (dx / plotWidth) * (lx1 - lx0);
    this.xDomain = [Math.pow(10, lx0 - logShift), Math.pow(10, lx1 - logShift)];
    this.updateScales();
  }

  fitToData(): void {
    this.computeDefaultDomains();
    this.updateScales();
  }

  on<K extends keyof RendererEvents>(event: K, callback: RendererEvents[K]): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    (this.listeners[event] as RendererEvents[K][]).push(callback);
  }

  off<K extends keyof RendererEvents>(event: K, callback: RendererEvents[K]): void {
    const arr = this.listeners[event];
    if (!arr) return;
    const idx = (arr as RendererEvents[K][]).indexOf(callback);
    if (idx >= 0) arr.splice(idx, 1);
  }

  render(): void {
    if (this.destroyed) return;
    if (this.magnitudeVisible && this.magCtx) {
      this.renderPane(this.magCtx, this.magCanvas, 'magnitude');
    } else if (this.magCtx) {
      this.clearCanvas(this.magCtx, this.magCanvas);
    }
    if (this.phaseVisible && this.phaseCtx) {
      this.renderPane(this.phaseCtx, this.phaseCanvas, 'phase');
    } else if (this.phaseCtx) {
      this.clearCanvas(this.phaseCtx, this.phaseCanvas);
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.listeners = {};
  }

  // --- Private ---

  private emit<K extends keyof RendererEvents>(event: K, ...args: Parameters<RendererEvents[K]>): void {
    const arr = this.listeners[event];
    if (!arr) return;
    for (const cb of arr) (cb as (...a: unknown[]) => void)(...args);
  }

  private getPlotWidth(canvas: HTMLCanvasElement): number {
    return canvas.width / this.dpr - this.margin.left - this.margin.right;
  }

  private getPlotHeight(canvas: HTMLCanvasElement): number {
    return canvas.height / this.dpr - this.margin.top - this.margin.bottom;
  }

  private clearCanvas(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  private renderPane(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, pane: 'magnitude' | 'phase'): void {
    const width = canvas.width / this.dpr;
    const height = canvas.height / this.dpr;
    const plotWidth = this.getPlotWidth(canvas);
    const plotHeight = this.getPlotHeight(canvas);
    const yScale = pane === 'magnitude' ? this.magYScale : this.phaseYScale;
    const formatY = pane === 'magnitude' ? formatDB : formatPhase;
    const getArr = (ds: ACDataset, name: string) =>
      pane === 'magnitude' ? ds.magnitudes.get(name) : ds.phases.get(name);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    // Background
    ctx.fillStyle = this.theme.background;
    ctx.fillRect(this.margin.left, this.margin.top, plotWidth, plotHeight);

    // Pane label
    ctx.fillStyle = this.theme.textMuted;
    ctx.font = `500 ${this.theme.fontSize - 1}px ${this.theme.font}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(pane === 'magnitude' ? 'MAGNITUDE (dB)' : 'PHASE (°)', this.margin.left + 4, 4);

    // Grid
    ctx.strokeStyle = this.theme.grid;
    ctx.lineWidth = 0.5;
    const xTicks = this.xScale.ticks(6);
    for (const tick of xTicks) {
      const x = this.margin.left + this.xScale(tick);
      ctx.beginPath();
      ctx.moveTo(x, this.margin.top);
      ctx.lineTo(x, this.margin.top + plotHeight);
      ctx.stroke();
    }
    const yTicks = yScale.ticks(4);
    for (const tick of yTicks) {
      const y = this.margin.top + yScale(tick);
      ctx.beginPath();
      ctx.moveTo(this.margin.left, y);
      ctx.lineTo(this.margin.left + plotWidth, y);
      ctx.stroke();
    }

    // -3dB reference line on magnitude pane
    if (pane === 'magnitude') {
      const y3db = this.margin.top + this.magYScale(-3);
      ctx.strokeStyle = 'hsl(0, 60%, 40%)';
      ctx.lineWidth = 0.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(this.margin.left, y3db);
      ctx.lineTo(this.margin.left + plotWidth, y3db);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Waveforms (clipped)
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.margin.left, this.margin.top, plotWidth, plotHeight);
    ctx.clip();

    for (const s of this.signalStates) {
      if (!s.visible) continue;
      const ds = this.datasets[s.datasetIndex];
      const yArr = getArr(ds, s.name);
      if (!yArr) continue;

      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < ds.frequencies.length; i++) {
        const x = this.margin.left + this.xScale(ds.frequencies[i]);
        const y = this.margin.top + yScale(yArr[i]);
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();

    // Axes
    ctx.fillStyle = this.theme.textMuted;
    ctx.font = `${this.theme.fontSize}px ${this.theme.font}`;

    // Y axis labels
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const tick of yTicks) {
      const y = this.margin.top + yScale(tick);
      ctx.fillText(formatY(tick), this.margin.left - 6, y);
    }

    // X axis labels (only on phase pane, or whichever is the bottom pane)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const tick of xTicks) {
      const x = this.margin.left + this.xScale(tick);
      ctx.fillText(formatFrequency(tick), x, this.margin.top + plotHeight + 6);
    }

    // Cursor
    if (this.cursorState) {
      const cx = this.cursorState.pixelX;
      ctx.strokeStyle = this.theme.cursor;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(cx, this.margin.top);
      ctx.lineTo(cx, this.margin.top + plotHeight);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  }

  private computeDefaultDomains(): void {
    if (this.datasets.length === 0) return;

    // X domain: min/max frequency
    let fMin = Infinity;
    let fMax = -Infinity;
    for (const ds of this.datasets) {
      if (ds.frequencies.length > 0) {
        fMin = Math.min(fMin, ds.frequencies[0]);
        fMax = Math.max(fMax, ds.frequencies[ds.frequencies.length - 1]);
      }
    }
    if (isFinite(fMin) && isFinite(fMax) && fMin > 0) {
      this.xDomain = [fMin, fMax];
    }

    // Magnitude Y domain
    const magArrays: number[][] = [];
    const phaseArrays: number[][] = [];
    for (const s of this.signalStates) {
      const ds = this.datasets[s.datasetIndex];
      const mag = ds.magnitudes.get(s.name);
      const phase = ds.phases.get(s.name);
      if (mag) magArrays.push(mag);
      if (phase) phaseArrays.push(phase);
    }
    if (magArrays.length > 0) this.magYDomain = computeYExtent(magArrays);
    if (phaseArrays.length > 0) this.phaseYDomain = computeYExtent(phaseArrays);
  }

  private updateScales(): void {
    const magPlotWidth = this.getPlotWidth(this.magCanvas);
    const magPlotHeight = this.getPlotHeight(this.magCanvas);
    const phasePlotHeight = this.getPlotHeight(this.phaseCanvas);

    this.xScale = createLogScale(this.xDomain, [0, magPlotWidth]);
    this.magYScale = createLinearScale(this.magYDomain, [magPlotHeight, 0]);
    this.phaseYScale = createLinearScale(this.phaseYDomain, [phasePlotHeight, 0]);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/ui && pnpm test -- src/core/bode-renderer.test.ts`
Expected: All Bode renderer tests PASS.

- [ ] **Step 5: Add exports to core/index.ts**

Add to `src/core/index.ts`:
```typescript
export { BodeRenderer, type BodeRendererOptions } from './bode-renderer.js';
```

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/core/bode-renderer.ts packages/ui/src/core/bode-renderer.test.ts packages/ui/src/core/index.ts
git commit -m "feat(ui): add BodeRenderer with dual-pane magnitude/phase Canvas rendering"
```

---

### Task 9: Interaction handler

**Files:**
- Create: `packages/ui/src/core/interaction.ts`
- Create: `packages/ui/src/core/interaction.test.ts`
- Modify: `packages/ui/src/core/index.ts`

- [ ] **Step 1: Write interaction tests**

```typescript
// src/core/interaction.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InteractionHandler } from './interaction.js';

function createTestCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 400;
  canvas.getBoundingClientRect = () => ({
    x: 0, y: 0, width: 800, height: 400, top: 0, left: 0, right: 800, bottom: 400, toJSON() {},
  });
  return canvas;
}

describe('InteractionHandler', () => {
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    canvas = createTestCanvas();
  });

  it('fires onCursorMove on pointermove', () => {
    const onCursor = vi.fn();
    const handler = new InteractionHandler(canvas, {
      onCursorMove: onCursor,
      onZoom: vi.fn(),
      onPan: vi.fn(),
      onDoubleClick: vi.fn(),
    });

    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 200, clientY: 150 }));
    expect(onCursor).toHaveBeenCalledWith(200);

    handler.destroy();
  });

  it('fires onCursorMove(null) on pointerleave', () => {
    const onCursor = vi.fn();
    const handler = new InteractionHandler(canvas, {
      onCursorMove: onCursor,
      onZoom: vi.fn(),
      onPan: vi.fn(),
      onDoubleClick: vi.fn(),
    });

    canvas.dispatchEvent(new PointerEvent('pointerleave'));
    expect(onCursor).toHaveBeenCalledWith(null);

    handler.destroy();
  });

  it('fires onZoom on wheel event', () => {
    const onZoom = vi.fn();
    const handler = new InteractionHandler(canvas, {
      onCursorMove: vi.fn(),
      onZoom,
      onPan: vi.fn(),
      onDoubleClick: vi.fn(),
    });

    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: 400 }));
    expect(onZoom).toHaveBeenCalledWith(400, expect.any(Number), false);

    handler.destroy();
  });

  it('fires onZoom with shiftKey for vertical zoom', () => {
    const onZoom = vi.fn();
    const handler = new InteractionHandler(canvas, {
      onCursorMove: vi.fn(),
      onZoom,
      onPan: vi.fn(),
      onDoubleClick: vi.fn(),
    });

    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: 400, shiftKey: true }));
    expect(onZoom).toHaveBeenCalledWith(400, expect.any(Number), true);

    handler.destroy();
  });

  it('fires onPan during drag', () => {
    const onPan = vi.fn();
    const handler = new InteractionHandler(canvas, {
      onCursorMove: vi.fn(),
      onZoom: vi.fn(),
      onPan,
      onDoubleClick: vi.fn(),
    });

    canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 300, clientY: 200 }));
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 310, clientY: 205, buttons: 1 }));
    expect(onPan).toHaveBeenCalledWith(10, 5);

    handler.destroy();
  });

  it('fires onDoubleClick on dblclick', () => {
    const onDoubleClick = vi.fn();
    const handler = new InteractionHandler(canvas, {
      onCursorMove: vi.fn(),
      onZoom: vi.fn(),
      onPan: vi.fn(),
      onDoubleClick,
    });

    canvas.dispatchEvent(new MouseEvent('dblclick'));
    expect(onDoubleClick).toHaveBeenCalled();

    handler.destroy();
  });

  it('destroy removes event listeners', () => {
    const onCursor = vi.fn();
    const handler = new InteractionHandler(canvas, {
      onCursorMove: onCursor,
      onZoom: vi.fn(),
      onPan: vi.fn(),
      onDoubleClick: vi.fn(),
    });

    handler.destroy();
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 100 }));
    expect(onCursor).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/ui && pnpm test -- src/core/interaction.test.ts`
Expected: FAIL — `./interaction.js` module not found.

- [ ] **Step 3: Implement interaction.ts**

```typescript
// src/core/interaction.ts

export interface InteractionCallbacks {
  /** Called with pixel X on hover, or null on leave. */
  onCursorMove: (pixelX: number | null) => void;
  /** Called on scroll-wheel zoom. factor >1 = zoom in. shiftKey = vertical zoom. */
  onZoom: (pixelX: number, factor: number, shiftKey: boolean) => void;
  /** Called during drag with pixel deltas. */
  onPan: (dx: number, dy: number) => void;
  /** Called on double-click (fit to data). */
  onDoubleClick: () => void;
}

/**
 * Attaches pointer/wheel event listeners to a canvas for zoom, pan, and cursor interaction.
 * Framework-agnostic — works with any HTMLCanvasElement.
 */
export class InteractionHandler {
  private canvas: HTMLCanvasElement;
  private callbacks: InteractionCallbacks;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private destroyed = false;

  private boundPointerMove: (e: PointerEvent) => void;
  private boundPointerDown: (e: PointerEvent) => void;
  private boundPointerUp: (e: PointerEvent) => void;
  private boundPointerLeave: (e: PointerEvent) => void;
  private boundWheel: (e: WheelEvent) => void;
  private boundDblClick: (e: MouseEvent) => void;

  constructor(canvas: HTMLCanvasElement, callbacks: InteractionCallbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks;

    this.boundPointerMove = this.handlePointerMove.bind(this);
    this.boundPointerDown = this.handlePointerDown.bind(this);
    this.boundPointerUp = this.handlePointerUp.bind(this);
    this.boundPointerLeave = this.handlePointerLeave.bind(this);
    this.boundWheel = this.handleWheel.bind(this);
    this.boundDblClick = this.handleDblClick.bind(this);

    canvas.addEventListener('pointermove', this.boundPointerMove);
    canvas.addEventListener('pointerdown', this.boundPointerDown);
    canvas.addEventListener('pointerup', this.boundPointerUp);
    canvas.addEventListener('pointerleave', this.boundPointerLeave);
    canvas.addEventListener('wheel', this.boundWheel, { passive: false });
    canvas.addEventListener('dblclick', this.boundDblClick);
  }

  destroy(): void {
    this.destroyed = true;
    this.canvas.removeEventListener('pointermove', this.boundPointerMove);
    this.canvas.removeEventListener('pointerdown', this.boundPointerDown);
    this.canvas.removeEventListener('pointerup', this.boundPointerUp);
    this.canvas.removeEventListener('pointerleave', this.boundPointerLeave);
    this.canvas.removeEventListener('wheel', this.boundWheel);
    this.canvas.removeEventListener('dblclick', this.boundDblClick);
  }

  private handlePointerMove(e: PointerEvent): void {
    if (this.destroyed) return;

    if (this.dragging && (e.buttons & 1)) {
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.callbacks.onPan(dx, dy);
    } else {
      this.callbacks.onCursorMove(e.clientX);
    }
  }

  private handlePointerDown(e: PointerEvent): void {
    if (this.destroyed) return;
    this.dragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.canvas.setPointerCapture?.(e.pointerId);
  }

  private handlePointerUp(e: PointerEvent): void {
    this.dragging = false;
    this.canvas.releasePointerCapture?.(e.pointerId);
  }

  private handlePointerLeave(_e: PointerEvent): void {
    if (this.destroyed) return;
    this.dragging = false;
    this.callbacks.onCursorMove(null);
  }

  private handleWheel(e: WheelEvent): void {
    if (this.destroyed) return;
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
    this.callbacks.onZoom(e.clientX, zoomFactor, e.shiftKey);
  }

  private handleDblClick(_e: MouseEvent): void {
    if (this.destroyed) return;
    this.callbacks.onDoubleClick();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/ui && pnpm test -- src/core/interaction.test.ts`
Expected: All interaction tests PASS.

- [ ] **Step 5: Add exports to core/index.ts**

Add to `src/core/index.ts`:
```typescript
export { InteractionHandler, type InteractionCallbacks } from './interaction.js';
```

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/core/interaction.ts packages/ui/src/core/interaction.test.ts packages/ui/src/core/index.ts
git commit -m "feat(ui): add InteractionHandler for zoom/pan/cursor events"
```

---

### Task 10: Streaming controller

**Files:**
- Create: `packages/ui/src/core/streaming.ts`
- Create: `packages/ui/src/core/streaming.test.ts`
- Modify: `packages/ui/src/core/index.ts`

- [ ] **Step 1: Write streaming tests**

```typescript
// src/core/streaming.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StreamingController } from './streaming.js';
import type { TransientDataset } from './types.js';

// Helper: create an async generator that yields TransientStep-like objects
async function* mockStream(steps: { time: number; voltages: Map<string, number> }[]) {
  for (const step of steps) {
    yield step;
  }
}

describe('StreamingController', () => {
  it('collects streaming data into datasets', async () => {
    const onData = vi.fn();
    const controller = new StreamingController(['out'], onData);

    const steps = [
      { time: 0, voltages: new Map([['out', 0]]), currents: new Map() },
      { time: 1e-3, voltages: new Map([['out', 2.5]]), currents: new Map() },
      { time: 2e-3, voltages: new Map([['out', 5]]), currents: new Map() },
    ];

    await controller.consume(mockStream(steps));

    // onData should have been called at least once
    expect(onData).toHaveBeenCalled();

    const dataset = controller.getDataset();
    expect(dataset.time.length).toBe(3);
    expect(dataset.signals.get('out')!.length).toBe(3);
    expect(dataset.signals.get('out')![2]).toBe(5);
  });

  it('stop() halts consumption', async () => {
    const onData = vi.fn();
    const controller = new StreamingController(['out'], onData);

    async function* infiniteStream() {
      let t = 0;
      while (true) {
        yield { time: t, voltages: new Map([['out', t]]), currents: new Map() };
        t += 1e-3;
      }
    }

    const promise = controller.consume(infiniteStream());
    // Stop after a tick
    await new Promise((r) => setTimeout(r, 10));
    controller.stop();
    await promise;

    expect(controller.getDataset().time.length).toBeGreaterThan(0);
  });

  it('clear() resets buffers', async () => {
    const controller = new StreamingController(['out'], vi.fn());
    const steps = [
      { time: 0, voltages: new Map([['out', 1]]), currents: new Map() },
    ];
    await controller.consume(mockStream(steps));
    expect(controller.getDataset().time.length).toBe(1);

    controller.clear();
    expect(controller.getDataset().time.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/ui && pnpm test -- src/core/streaming.test.ts`
Expected: FAIL — `./streaming.js` module not found.

- [ ] **Step 3: Implement streaming.ts**

```typescript
// src/core/streaming.ts
import { GrowableBuffer } from './buffer.js';
import type { TransientDataset } from './types.js';

interface StreamingStep {
  time: number;
  voltages: Map<string, number>;
  currents: Map<string, number>;
}

/**
 * Consumes an async stream of simulation steps and accumulates data
 * into growable buffers. Calls onData after each step so the renderer
 * can schedule a repaint.
 */
export class StreamingController {
  private timeBuffer = new GrowableBuffer();
  private signalBuffers = new Map<string, GrowableBuffer>();
  private signals: string[];
  private onData: () => void;
  private running = false;

  constructor(signals: string[], onData: () => void) {
    this.signals = signals;
    this.onData = onData;
    for (const name of signals) {
      this.signalBuffers.set(name, new GrowableBuffer());
    }
  }

  /** Consume an async iterator of streaming steps. Resolves when done or stopped. */
  async consume(stream: AsyncIterable<StreamingStep>): Promise<void> {
    this.running = true;
    for await (const step of stream) {
      if (!this.running) break;

      this.timeBuffer.push(step.time);
      for (const name of this.signals) {
        const buf = this.signalBuffers.get(name)!;
        const value = step.voltages.get(name) ?? step.currents.get(name) ?? 0;
        buf.push(value);
      }
      this.onData();
    }
    this.running = false;
  }

  /** Stop consuming the stream. */
  stop(): void {
    this.running = false;
  }

  /** Whether the stream is actively being consumed. */
  isRunning(): boolean {
    return this.running;
  }

  /** Get the accumulated data as a TransientDataset. */
  getDataset(): TransientDataset {
    const time = Array.from(this.timeBuffer.toArray());
    const signals = new Map<string, number[]>();
    for (const [name, buf] of this.signalBuffers) {
      signals.set(name, Array.from(buf.toArray()));
    }
    return { time, signals, label: '' };
  }

  /** Clear all accumulated data. */
  clear(): void {
    this.timeBuffer.clear();
    for (const buf of this.signalBuffers.values()) {
      buf.clear();
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/ui && pnpm test -- src/core/streaming.test.ts`
Expected: All streaming tests PASS.

- [ ] **Step 5: Add exports to core/index.ts**

Add to `src/core/index.ts`:
```typescript
export { StreamingController } from './streaming.js';
```

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/core/streaming.ts packages/ui/src/core/streaming.test.ts packages/ui/src/core/index.ts
git commit -m "feat(ui): add StreamingController for live data accumulation"
```

---

### Task 11: Core exports and build verification

**Files:**
- Modify: `packages/ui/src/core/index.ts` (verify all exports)
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Verify core/index.ts has all exports**

Final `src/core/index.ts` should contain:

```typescript
// Types
export type {
  ThemeConfig,
  CursorState,
  CursorValue,
  SignalConfig,
  TransientDataset,
  ACDataset,
  Margins,
  RendererEvents,
} from './types.js';
export { DEFAULT_PALETTE } from './types.js';

// Theme
export { DARK_THEME, LIGHT_THEME, mergeTheme, resolveTheme } from './theme.js';

// Formatting
export { formatSI, formatTime, formatFrequency, formatVoltage, formatCurrent, formatDB, formatPhase } from './format.js';

// Scales
export { createLinearScale, createLogScale, computeYExtent, bisectData } from './scales.js';
export type { LinearScale, LogScale } from './scales.js';

// Data normalization
export { normalizeTransientData, normalizeACData } from './data.js';

// Buffer
export { GrowableBuffer } from './buffer.js';

// Renderers
export { TransientRenderer, type TransientRendererOptions } from './renderer.js';
export { BodeRenderer, type BodeRendererOptions } from './bode-renderer.js';

// Interaction
export { InteractionHandler, type InteractionCallbacks } from './interaction.js';

// Streaming
export { StreamingController } from './streaming.js';
```

- [ ] **Step 2: Run full test suite**

Run: `cd packages/ui && pnpm test`
Expected: All tests PASS.

- [ ] **Step 3: Run build**

Run: `cd packages/ui && pnpm build`
Expected: Clean build. Verify output files exist:
- `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts`
- `dist/react.js`, `dist/react.cjs`, `dist/react.d.ts`

- [ ] **Step 4: Run lint**

Run: `cd packages/ui && pnpm lint`
Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/core/index.ts packages/ui/src/index.ts
git commit -m "feat(ui): wire up core exports and verify build"
```

---

### Task 12: React components — TransientPlot and BodePlot

**Files:**
- Create: `packages/ui/src/react/use-renderer.ts`
- Create: `packages/ui/src/react/TransientPlot.tsx`
- Create: `packages/ui/src/react/TransientPlot.test.tsx`
- Create: `packages/ui/src/react/BodePlot.tsx`
- Create: `packages/ui/src/react/BodePlot.test.tsx`

- [ ] **Step 1: Write shared hook use-renderer.ts**

This hook manages the canvas ref, DPI scaling, ResizeObserver, and renderer lifecycle.

```typescript
// src/react/use-renderer.ts
import { useRef, useEffect, useCallback } from 'react';

/**
 * Shared hook for managing a canvas element with DPI scaling and resize observation.
 * Returns a ref callback to attach to the canvas, and the current canvas element.
 */
export function useCanvas(onResize?: (canvas: HTMLCanvasElement) => void) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  const refCallback = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      // Cleanup old observer
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }

      canvasRef.current = canvas;

      if (canvas) {
        const updateSize = () => {
          const dpr = window.devicePixelRatio || 1;
          const rect = canvas.getBoundingClientRect();
          canvas.width = rect.width * dpr;
          canvas.height = rect.height * dpr;
          onResize?.(canvas);
        };

        updateSize();
        observerRef.current = new ResizeObserver(updateSize);
        observerRef.current.observe(canvas);
      }
    },
    [onResize],
  );

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
    };
  }, []);

  return { refCallback, canvasRef };
}
```

- [ ] **Step 2: Write TransientPlot tests**

```tsx
// src/react/TransientPlot.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TransientPlot } from './TransientPlot.js';

// Mock TransientResult-like object
function mockTransientResult() {
  const voltageMap = new Map([['out', [0, 2.5, 5]]]);
  return {
    time: [0, 1e-3, 2e-3],
    voltage(node: string) {
      const v = voltageMap.get(node);
      if (!v) throw new Error(`Unknown: ${node}`);
      return v;
    },
    current() { return []; },
  };
}

describe('TransientPlot', () => {
  it('renders a canvas element', () => {
    const { container } = render(
      <TransientPlot data={mockTransientResult()} signals={['out']} />,
    );
    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
  });

  it('renders with dark theme by default', () => {
    const { container } = render(
      <TransientPlot data={mockTransientResult()} signals={['out']} />,
    );
    expect(container.firstChild).toBeDefined();
  });

  it('renders with custom dimensions', () => {
    const { container } = render(
      <TransientPlot data={mockTransientResult()} signals={['out']} width={600} height={400} />,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.width).toBe('600px');
    expect(wrapper.style.height).toBe('400px');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/ui && pnpm test -- src/react/TransientPlot.test.tsx`
Expected: FAIL — `./TransientPlot.js` module not found.

- [ ] **Step 4: Implement TransientPlot.tsx**

```tsx
// src/react/TransientPlot.tsx
import { useRef, useEffect, useCallback, type CSSProperties } from 'react';
import { TransientRenderer } from '../core/renderer.js';
import { resolveTheme } from '../core/theme.js';
import { normalizeTransientData } from '../core/data.js';
import { InteractionHandler } from '../core/interaction.js';
import type { ThemeConfig, CursorState, TransientDataset } from '../core/types.js';
import { useCanvas } from './use-renderer.js';

export interface TransientPlotProps {
  /** TransientResult from @spice-ts/core, or array of TransientDataset for overlay. */
  data: unknown;
  /** Signal names to display. */
  signals: string[];
  /** Signal color overrides. */
  colors?: Record<string, string>;
  /** Theme preset or custom config. */
  theme?: 'dark' | 'light' | ThemeConfig;
  /** CSS width. Default '100%'. */
  width?: number | string;
  /** CSS height. Default 300. */
  height?: number | string;
  /** Cursor move callback. */
  onCursorMove?: (cursor: CursorState | null) => void;
  /** Signal visibility state (controlled). */
  signalVisibility?: Record<string, boolean>;
}

export function TransientPlot({
  data,
  signals,
  colors,
  theme,
  width = '100%',
  height = 300,
  onCursorMove,
  signalVisibility,
}: TransientPlotProps) {
  const rendererRef = useRef<TransientRenderer | null>(null);
  const interactionRef = useRef<InteractionHandler | null>(null);
  const resolvedTheme = resolveTheme(theme);

  const handleResize = useCallback(
    (canvas: HTMLCanvasElement) => {
      if (rendererRef.current) {
        rendererRef.current.render();
      }
    },
    [],
  );

  const { refCallback } = useCanvas(handleResize);

  const canvasRefCallback = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      // Cleanup previous
      rendererRef.current?.destroy();
      interactionRef.current?.destroy();
      rendererRef.current = null;
      interactionRef.current = null;

      refCallback(canvas);

      if (canvas) {
        const renderer = new TransientRenderer(canvas, { theme: resolvedTheme });
        rendererRef.current = renderer;

        const datasets = normalizeTransientData(data, signals);
        renderer.setData(datasets, signals);

        if (colors) {
          for (const [name, color] of Object.entries(colors)) {
            renderer.setSignalColor(name, color);
          }
        }

        if (onCursorMove) {
          renderer.on('cursorMove', onCursorMove);
        }

        const interaction = new InteractionHandler(canvas, {
          onCursorMove: (pixelX) => {
            renderer.setCursorPixelX(pixelX);
            renderer.render();
          },
          onZoom: (pixelX, factor, shiftKey) => {
            if (shiftKey) renderer.zoomY(factor);
            else renderer.zoomAt(pixelX, factor);
            renderer.render();
          },
          onPan: (dx, dy) => {
            renderer.pan(dx, dy);
            renderer.render();
          },
          onDoubleClick: () => {
            renderer.fitToData();
            renderer.render();
          },
        });
        interactionRef.current = interaction;

        renderer.render();
      }
    },
    [data, signals, resolvedTheme, colors, onCursorMove, refCallback],
  );

  // Update visibility when prop changes
  useEffect(() => {
    if (!rendererRef.current || !signalVisibility) return;
    for (const [name, visible] of Object.entries(signalVisibility)) {
      rendererRef.current.setSignalVisibility(name, visible);
    }
    rendererRef.current.render();
  }, [signalVisibility]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      rendererRef.current?.destroy();
      interactionRef.current?.destroy();
    };
  }, []);

  const style: CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
    position: 'relative',
  };

  return (
    <div style={style}>
      <canvas
        ref={canvasRefCallback}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  );
}
```

- [ ] **Step 5: Write BodePlot tests**

```tsx
// src/react/BodePlot.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BodePlot } from './BodePlot.js';

function mockACResult() {
  const voltageMap = new Map([
    ['out', [
      { magnitude: 1, phase: 0 },
      { magnitude: 0.707, phase: -45 },
      { magnitude: 0.1, phase: -84 },
    ]],
  ]);
  return {
    frequencies: [100, 1000, 10000],
    voltage(node: string) {
      const v = voltageMap.get(node);
      if (!v) throw new Error(`Unknown: ${node}`);
      return v;
    },
    current() { return []; },
  };
}

describe('BodePlot', () => {
  it('renders two canvas elements (magnitude + phase)', () => {
    const { container } = render(
      <BodePlot data={mockACResult()} signals={['out']} />,
    );
    const canvases = container.querySelectorAll('canvas');
    expect(canvases.length).toBe(2);
  });

  it('renders with magnitude-only pane', () => {
    const { container } = render(
      <BodePlot data={mockACResult()} signals={['out']} defaultPanes="magnitude" />,
    );
    expect(container.firstChild).toBeDefined();
  });
});
```

- [ ] **Step 6: Run tests to verify BodePlot fails**

Run: `cd packages/ui && pnpm test -- src/react/BodePlot.test.tsx`
Expected: FAIL — `./BodePlot.js` module not found.

- [ ] **Step 7: Implement BodePlot.tsx**

```tsx
// src/react/BodePlot.tsx
import { useRef, useEffect, useCallback, useState, type CSSProperties } from 'react';
import { BodeRenderer } from '../core/bode-renderer.js';
import { resolveTheme } from '../core/theme.js';
import { normalizeACData } from '../core/data.js';
import { InteractionHandler } from '../core/interaction.js';
import type { ThemeConfig, CursorState } from '../core/types.js';
import { useCanvas } from './use-renderer.js';

export interface BodePlotProps {
  /** ACResult from @spice-ts/core, or array of ACDataset for overlay. */
  data: unknown;
  /** Signal names to display. */
  signals: string[];
  /** Signal color overrides. */
  colors?: Record<string, string>;
  /** Theme preset or custom config. */
  theme?: 'dark' | 'light' | ThemeConfig;
  /** Which panes to show initially. Default 'both'. */
  defaultPanes?: 'both' | 'magnitude' | 'phase';
  /** CSS width. Default '100%'. */
  width?: number | string;
  /** CSS height. Default 300 per visible pane. */
  height?: number | string;
  /** Cursor move callback. */
  onCursorMove?: (cursor: CursorState | null) => void;
  /** Signal visibility state (controlled). */
  signalVisibility?: Record<string, boolean>;
}

export function BodePlot({
  data,
  signals,
  colors,
  theme,
  defaultPanes = 'both',
  width = '100%',
  height,
  onCursorMove,
  signalVisibility,
}: BodePlotProps) {
  const rendererRef = useRef<BodeRenderer | null>(null);
  const magInteractionRef = useRef<InteractionHandler | null>(null);
  const phaseInteractionRef = useRef<InteractionHandler | null>(null);
  const resolvedTheme = resolveTheme(theme);
  const [magVisible, setMagVisible] = useState(defaultPanes !== 'phase');
  const [phaseVisible, setPhaseVisible] = useState(defaultPanes !== 'magnitude');

  const magCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const phaseCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const handleResize = useCallback(() => {
    rendererRef.current?.render();
  }, []);

  const { refCallback: magRefCallback } = useCanvas(handleResize);
  const { refCallback: phaseRefCallback } = useCanvas(handleResize);

  // Initialize renderer when both canvases are available
  useEffect(() => {
    const magCanvas = magCanvasRef.current;
    const phaseCanvas = phaseCanvasRef.current;
    if (!magCanvas || !phaseCanvas) return;

    rendererRef.current?.destroy();
    magInteractionRef.current?.destroy();
    phaseInteractionRef.current?.destroy();

    const renderer = new BodeRenderer(magCanvas, phaseCanvas, {
      theme: resolvedTheme,
      defaultPanes,
    });
    rendererRef.current = renderer;

    const datasets = normalizeACData(data, signals);
    renderer.setData(datasets, signals);

    if (colors) {
      for (const [name, color] of Object.entries(colors)) {
        renderer.setSignalColor(name, color);
      }
    }

    if (onCursorMove) {
      renderer.on('cursorMove', onCursorMove);
    }

    const createInteraction = (canvas: HTMLCanvasElement) =>
      new InteractionHandler(canvas, {
        onCursorMove: (pixelX) => {
          renderer.setCursorPixelX(pixelX);
          renderer.render();
        },
        onZoom: (pixelX, factor, _shiftKey) => {
          renderer.zoomAt(pixelX, factor);
          renderer.render();
        },
        onPan: (dx, dy) => {
          renderer.pan(dx, dy);
          renderer.render();
        },
        onDoubleClick: () => {
          renderer.fitToData();
          renderer.render();
        },
      });

    magInteractionRef.current = createInteraction(magCanvas);
    phaseInteractionRef.current = createInteraction(phaseCanvas);

    renderer.render();

    return () => {
      renderer.destroy();
      magInteractionRef.current?.destroy();
      phaseInteractionRef.current?.destroy();
    };
  }, [data, signals, resolvedTheme, defaultPanes, colors, onCursorMove]);

  // Sync pane visibility
  useEffect(() => {
    if (!rendererRef.current) return;
    rendererRef.current.setPaneVisible('magnitude', magVisible);
    rendererRef.current.setPaneVisible('phase', phaseVisible);
    rendererRef.current.render();
  }, [magVisible, phaseVisible]);

  // Sync signal visibility
  useEffect(() => {
    if (!rendererRef.current || !signalVisibility) return;
    for (const [name, visible] of Object.entries(signalVisibility)) {
      rendererRef.current.setSignalVisibility(name, visible);
    }
    rendererRef.current.render();
  }, [signalVisibility]);

  const paneHeight = height
    ? typeof height === 'number' ? height : height
    : 200;

  const containerStyle: CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    display: 'flex',
    flexDirection: 'column',
  };

  const paneHeaderStyle: CSSProperties = {
    padding: '4px 8px',
    fontSize: `${resolvedTheme.fontSize - 1}px`,
    fontFamily: resolvedTheme.font,
    color: resolvedTheme.textMuted,
    background: resolvedTheme.surface,
    borderBottom: `1px solid ${resolvedTheme.border}`,
    cursor: 'pointer',
    userSelect: 'none',
  };

  const canvasStyle: CSSProperties = { width: '100%', height: '100%', display: 'block' };

  return (
    <div style={containerStyle}>
      <div
        style={paneHeaderStyle}
        onClick={() => setMagVisible((v) => !v)}
      >
        {magVisible ? '▾' : '▸'} Magnitude (dB)
      </div>
      <div style={{ height: magVisible ? (typeof paneHeight === 'number' ? `${paneHeight}px` : paneHeight) : 0, overflow: 'hidden' }}>
        <canvas
          ref={(el) => {
            magCanvasRef.current = el;
            magRefCallback(el);
          }}
          style={canvasStyle}
        />
      </div>
      <div
        style={paneHeaderStyle}
        onClick={() => setPhaseVisible((v) => !v)}
      >
        {phaseVisible ? '▾' : '▸'} Phase (°)
      </div>
      <div style={{ height: phaseVisible ? (typeof paneHeight === 'number' ? `${paneHeight}px` : paneHeight) : 0, overflow: 'hidden' }}>
        <canvas
          ref={(el) => {
            phaseCanvasRef.current = el;
            phaseRefCallback(el);
          }}
          style={canvasStyle}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Run all React tests**

Run: `cd packages/ui && pnpm test -- src/react/`
Expected: All TransientPlot and BodePlot tests PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/ui/src/react/use-renderer.ts packages/ui/src/react/TransientPlot.tsx packages/ui/src/react/TransientPlot.test.tsx packages/ui/src/react/BodePlot.tsx packages/ui/src/react/BodePlot.test.tsx
git commit -m "feat(ui): add React TransientPlot and BodePlot components"
```

---

### Task 13: React components — Legend and CursorTooltip

**Files:**
- Create: `packages/ui/src/react/Legend.tsx`
- Create: `packages/ui/src/react/Legend.test.tsx`
- Create: `packages/ui/src/react/CursorTooltip.tsx`

- [ ] **Step 1: Write Legend tests**

```tsx
// src/react/Legend.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { Legend } from './Legend.js';

describe('Legend', () => {
  const signals = [
    { id: 'out', label: 'V(out)', color: '#4ade80', visible: true },
    { id: 'in', label: 'V(in)', color: '#60a5fa', visible: true },
  ];

  it('renders signal labels', () => {
    const { getByText } = render(
      <Legend signals={signals} onToggle={() => {}} />,
    );
    expect(getByText('V(out)')).toBeDefined();
    expect(getByText('V(in)')).toBeDefined();
  });

  it('calls onToggle with signal id when clicked', () => {
    const onToggle = vi.fn();
    const { getByText } = render(
      <Legend signals={signals} onToggle={onToggle} />,
    );
    fireEvent.click(getByText('V(out)'));
    expect(onToggle).toHaveBeenCalledWith('out');
  });

  it('dims hidden signals', () => {
    const hiddenSignals = [
      { id: 'out', label: 'V(out)', color: '#4ade80', visible: false },
      { id: 'in', label: 'V(in)', color: '#60a5fa', visible: true },
    ];
    const { container } = render(
      <Legend signals={hiddenSignals} onToggle={() => {}} />,
    );
    const items = container.querySelectorAll('[data-signal-id]');
    expect(items.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/ui && pnpm test -- src/react/Legend.test.tsx`
Expected: FAIL — `./Legend.js` module not found.

- [ ] **Step 3: Implement Legend.tsx**

```tsx
// src/react/Legend.tsx
import type { CSSProperties } from 'react';

export interface LegendSignal {
  id: string;
  label: string;
  color: string;
  visible: boolean;
}

export interface LegendProps {
  signals: LegendSignal[];
  onToggle: (signalId: string) => void;
  style?: CSSProperties;
}

export function Legend({ signals, onToggle, style }: LegendProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px',
        padding: '8px 0',
        ...style,
      }}
    >
      {signals.map((signal) => (
        <div
          key={signal.id}
          data-signal-id={signal.id}
          onClick={() => onToggle(signal.id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            cursor: 'pointer',
            opacity: signal.visible ? 1 : 0.35,
            transition: 'opacity 0.15s',
            userSelect: 'none',
          }}
        >
          <div
            style={{
              width: '12px',
              height: '3px',
              borderRadius: '1px',
              background: signal.color,
            }}
          />
          <span>{signal.label}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run Legend tests**

Run: `cd packages/ui && pnpm test -- src/react/Legend.test.tsx`
Expected: All Legend tests PASS.

- [ ] **Step 5: Implement CursorTooltip.tsx**

```tsx
// src/react/CursorTooltip.tsx
import type { CSSProperties } from 'react';
import type { CursorState, ThemeConfig } from '../core/types.js';
import { formatSI } from '../core/format.js';

export interface CursorTooltipProps {
  cursor: CursorState | null;
  theme: ThemeConfig;
  /** Format the x-axis value (default: formatSI + inferred unit). */
  formatX?: (x: number) => string;
  style?: CSSProperties;
}

export function CursorTooltip({ cursor, theme, formatX, style }: CursorTooltipProps) {
  if (!cursor) return null;

  const xLabel = formatX ? formatX(cursor.x) : formatSI(cursor.x);

  const tooltipStyle: CSSProperties = {
    position: 'absolute',
    left: cursor.pixelX + 12,
    top: 8,
    background: theme.tooltipBg,
    border: `1px solid ${theme.tooltipBorder}`,
    borderRadius: '6px',
    padding: '6px 10px',
    fontSize: `${theme.fontSize}px`,
    fontFamily: theme.font,
    color: theme.text,
    minWidth: '120px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
    pointerEvents: 'none',
    zIndex: 10,
    ...style,
  };

  return (
    <div style={tooltipStyle}>
      <div style={{ color: theme.textMuted, marginBottom: '4px' }}>
        {xLabel}
      </div>
      {cursor.values.map((v) => (
        <div
          key={v.signalId}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}
        >
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: v.color,
              flexShrink: 0,
            }}
          />
          <span>
            {v.label} = {formatSI(v.value)}{v.unit}
          </span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/react/Legend.tsx packages/ui/src/react/Legend.test.tsx packages/ui/src/react/CursorTooltip.tsx
git commit -m "feat(ui): add React Legend and CursorTooltip components"
```

---

### Task 14: React WaveformViewer (pre-composed)

**Files:**
- Create: `packages/ui/src/react/WaveformViewer.tsx`
- Create: `packages/ui/src/react/WaveformViewer.test.tsx`
- Modify: `packages/ui/src/react/index.ts`

- [ ] **Step 1: Write WaveformViewer tests**

```tsx
// src/react/WaveformViewer.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { WaveformViewer } from './WaveformViewer.js';

function mockTransientResult() {
  const voltageMap = new Map([['out', [0, 2.5, 5]]]);
  return {
    time: [0, 1e-3, 2e-3],
    voltage(node: string) {
      const v = voltageMap.get(node);
      if (!v) throw new Error(`Unknown: ${node}`);
      return v;
    },
    current() { return []; },
  };
}

function mockACResult() {
  const voltageMap = new Map([
    ['out', [
      { magnitude: 1, phase: 0 },
      { magnitude: 0.707, phase: -45 },
    ]],
  ]);
  return {
    frequencies: [100, 10000],
    voltage(node: string) {
      const v = voltageMap.get(node);
      if (!v) throw new Error(`Unknown: ${node}`);
      return v;
    },
    current() { return []; },
  };
}

describe('WaveformViewer', () => {
  it('renders transient-only view', () => {
    const { container } = render(
      <WaveformViewer transient={mockTransientResult()} signals={['out']} />,
    );
    expect(container.querySelectorAll('canvas').length).toBeGreaterThanOrEqual(1);
  });

  it('renders AC-only view', () => {
    const { container } = render(
      <WaveformViewer ac={mockACResult()} signals={['out']} />,
    );
    expect(container.querySelectorAll('canvas').length).toBeGreaterThanOrEqual(1);
  });

  it('renders both transient and AC stacked', () => {
    const { container } = render(
      <WaveformViewer
        transient={mockTransientResult()}
        ac={mockACResult()}
        signals={['out']}
      />,
    );
    // At least 3 canvases: 1 transient + 2 Bode panes
    expect(container.querySelectorAll('canvas').length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/ui && pnpm test -- src/react/WaveformViewer.test.tsx`
Expected: FAIL — `./WaveformViewer.js` module not found.

- [ ] **Step 3: Implement WaveformViewer.tsx**

```tsx
// src/react/WaveformViewer.tsx
import { useState, useCallback, useEffect, useRef, type CSSProperties } from 'react';
import { TransientPlot, type TransientPlotProps } from './TransientPlot.js';
import { BodePlot, type BodePlotProps } from './BodePlot.js';
import { Legend, type LegendSignal } from './Legend.js';
import { CursorTooltip } from './CursorTooltip.js';
import { StreamingController } from '../core/streaming.js';
import { resolveTheme } from '../core/theme.js';
import { formatTime, formatFrequency } from '../core/format.js';
import type { ThemeConfig, CursorState, TransientDataset } from '../core/types.js';
import { DEFAULT_PALETTE } from '../core/types.js';

export interface WaveformViewerProps {
  /** Transient result or dataset array. */
  transient?: TransientPlotProps['data'];
  /** AC result or dataset array. */
  ac?: BodePlotProps['data'];
  /** Async stream from simulateStream(). Renders progressively as data arrives. */
  stream?: AsyncIterable<{ time: number; voltages: Map<string, number>; currents: Map<string, number> }>;
  /** Signal names to display. */
  signals: string[];
  /** Signal color overrides. */
  colors?: Record<string, string>;
  /** Theme preset or custom config. */
  theme?: 'dark' | 'light' | ThemeConfig;
}

/**
 * Pre-composed waveform viewer. When both transient and ac are provided,
 * renders them stacked vertically (transient on top, Bode below).
 * When streaming, displays only the analysis type being streamed.
 */
export function WaveformViewer({
  transient,
  ac,
  stream,
  signals,
  colors,
  theme,
}: WaveformViewerProps) {
  const resolvedTheme = resolveTheme(theme);
  const [cursor, setCursor] = useState<CursorState | null>(null);
  const [visibility, setVisibility] = useState<Record<string, boolean>>(() => {
    const v: Record<string, boolean> = {};
    for (const s of signals) v[s] = true;
    return v;
  });
  const [streamData, setStreamData] = useState<TransientDataset[] | null>(null);
  const controllerRef = useRef<StreamingController | null>(null);
  const rafRef = useRef<number>(0);

  // Streaming: consume async iterator, update data on rAF
  useEffect(() => {
    if (!stream) return;

    let dirty = false;
    const controller = new StreamingController(signals, () => { dirty = true; });
    controllerRef.current = controller;

    // rAF loop: only update React state at display refresh rate
    const loop = () => {
      if (dirty) {
        dirty = false;
        setStreamData([controller.getDataset()]);
      }
      if (controller.isRunning()) {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        // Final update after stream ends
        setStreamData([controller.getDataset()]);
      }
    };
    rafRef.current = requestAnimationFrame(loop);

    controller.consume(stream as AsyncIterable<any>);

    return () => {
      controller.stop();
      cancelAnimationFrame(rafRef.current);
    };
  }, [stream, signals]);

  // Use streaming data if available, otherwise the transient prop
  const transientData = streamData ?? transient;

  const legendSignals: LegendSignal[] = signals.map((name, i) => ({
    id: name,
    label: name,
    color: colors?.[name] ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length],
    visible: visibility[name] ?? true,
  }));

  const handleToggle = useCallback((signalId: string) => {
    setVisibility((prev) => ({ ...prev, [signalId]: !prev[signalId] }));
  }, []);

  const containerStyle: CSSProperties = {
    background: resolvedTheme.surface,
    border: `1px solid ${resolvedTheme.border}`,
    borderRadius: '8px',
    padding: '16px',
    fontFamily: resolvedTheme.font,
    color: resolvedTheme.text,
    position: 'relative',
  };

  return (
    <div style={containerStyle}>
      {transientData && (
        <TransientPlot
          data={transientData}
          signals={signals}
          colors={colors}
          theme={resolvedTheme}
          onCursorMove={setCursor}
          signalVisibility={visibility}
        />
      )}
      {ac && !stream && (
        <div style={{ marginTop: transientData ? '16px' : 0 }}>
          <BodePlot
            data={ac}
            signals={signals}
            colors={colors}
            theme={resolvedTheme}
            onCursorMove={!transientData ? setCursor : undefined}
            signalVisibility={visibility}
          />
        </div>
      )}
      <Legend signals={legendSignals} onToggle={handleToggle} />
      <CursorTooltip
        cursor={cursor}
        theme={resolvedTheme}
        formatX={transientData ? (x) => formatTime(x) : (x) => formatFrequency(x)}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/ui && pnpm test -- src/react/WaveformViewer.test.tsx`
Expected: All WaveformViewer tests PASS.

- [ ] **Step 5: Wire up react/index.ts exports**

```typescript
// src/react/index.ts
export { TransientPlot, type TransientPlotProps } from './TransientPlot.js';
export { BodePlot, type BodePlotProps } from './BodePlot.js';
export { Legend, type LegendProps, type LegendSignal } from './Legend.js';
export { CursorTooltip, type CursorTooltipProps } from './CursorTooltip.js';
export { WaveformViewer, type WaveformViewerProps } from './WaveformViewer.js';
```

- [ ] **Step 6: Run full test suite and build**

Run: `cd packages/ui && pnpm test && pnpm build && pnpm lint`
Expected: All tests PASS, build succeeds with both subpath outputs, no type errors.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/react/WaveformViewer.tsx packages/ui/src/react/WaveformViewer.test.tsx packages/ui/src/react/index.ts
git commit -m "feat(ui): add WaveformViewer pre-composed React component"
```

---

### Task 15: Example app with dev server

**Files:**
- Create: `examples/08-waveform-viewer/index.html`
- Create: `examples/08-waveform-viewer/main.tsx`
- Create: `examples/08-waveform-viewer/package.json`
- Create: `examples/08-waveform-viewer/tsconfig.json`
- Create: `examples/08-waveform-viewer/vite.config.ts`

This is a standalone Vite dev server for visual testing. It runs a real simulation and renders results with the viewer.

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@spice-ts/example-waveform-viewer",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build"
  },
  "dependencies": {
    "@spice-ts/core": "workspace:*",
    "@spice-ts/ui": "workspace:*",
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.4.0",
    "vite": "^8.0.8"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM"]
  },
  "include": ["./**/*.ts", "./**/*.tsx"]
}
```

- [ ] **Step 3: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
```

- [ ] **Step 4: Create index.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>spice-ts Waveform Viewer</title>
    <style>
      *, *::before, *::after { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 24px;
        background: hsl(224, 71%, 4%);
        color: hsl(210, 40%, 98%);
        font-family: 'Inter', -apple-system, sans-serif;
      }
      h1 { font-size: 18px; font-weight: 600; margin-bottom: 16px; }
      h2 { font-size: 14px; font-weight: 500; margin: 24px 0 8px; color: hsl(215, 20%, 55%); }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create main.tsx**

```tsx
import { createRoot } from 'react-dom/client';
import { useState, useEffect } from 'react';
import { simulate } from '@spice-ts/core';
import { WaveformViewer } from '@spice-ts/ui/react';
import type { SimulationResult } from '@spice-ts/core';

const RC_NETLIST = `
* RC Low-Pass Filter
V1 in 0 PULSE(0 5 0 1n 1n 5m 10m)
R1 in out 1k
C1 out 0 100n
.tran 1u 10m
.ac dec 20 1 10Meg
`;

function App() {
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    simulate(RC_NETLIST)
      .then(setResult)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <div style={{ color: 'red' }}>Error: {error}</div>;
  if (!result) return <div>Running simulation...</div>;

  return (
    <div>
      <h1>spice-ts Waveform Viewer</h1>

      <h2>Transient — RC Step Response</h2>
      <WaveformViewer
        transient={result.transient}
        signals={['out', 'in']}
        colors={{ out: '#4ade80', in: '#60a5fa' }}
        theme="dark"
      />

      <h2>AC — Bode Plot</h2>
      <WaveformViewer
        ac={result.ac}
        signals={['out']}
        colors={{ out: '#f97316' }}
        theme="dark"
      />

      <h2>Light Theme</h2>
      <WaveformViewer
        transient={result.transient}
        signals={['out']}
        colors={{ out: '#16a34a' }}
        theme="light"
      />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
```

- [ ] **Step 6: Update pnpm-workspace.yaml**

Add the example to the workspace:
```yaml
packages:
  - "packages/*"
  - "examples"
  - "examples/08-waveform-viewer"
```

- [ ] **Step 7: Install and run dev server**

Run: `pnpm install`

Run: `cd examples/08-waveform-viewer && pnpm dev`
Expected: Vite dev server starts. Open the URL in browser and visually verify:
1. Transient plot shows V(in) step and V(out) RC charging curve
2. Bode plot shows magnitude rolloff and phase shift
3. Hover shows cursor crosshair + tooltip with values
4. Scroll wheel zooms, click-drag pans, double-click fits
5. Legend click toggles signal visibility
6. Light theme renders correctly
7. Bode pane headers collapse/expand magnitude and phase

- [ ] **Step 8: Commit**

```bash
git add examples/08-waveform-viewer/ pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "feat(ui): add waveform viewer example app with Vite dev server"
```

---

### Task 16: Final integration test and cleanup

**Files:**
- Modify: `packages/ui/src/core/index.ts` (verify)
- Modify: `packages/ui/src/react/index.ts` (verify)

- [ ] **Step 1: Run full monorepo test suite**

Run: `pnpm -r test`
Expected: All tests pass across all packages (core + ui).

- [ ] **Step 2: Run full monorepo build**

Run: `pnpm build`
Expected: All packages build successfully.

- [ ] **Step 3: Run full monorepo lint**

Run: `pnpm lint`
Expected: No type errors.

- [ ] **Step 4: Verify package exports work**

Run a quick smoke test from the examples directory:
```bash
cd examples/08-waveform-viewer && pnpm build
```
Expected: Vite builds successfully, confirming the package exports resolve correctly.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore(ui): verify full monorepo integration"
```
