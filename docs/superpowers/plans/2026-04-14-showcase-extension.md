# Showcase Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all 9 placeholder showcase circuits, add a Power Electronics group with buck/boost/buck-boost converters, add a `DCSweepPlot` component to `@spice-ts/ui`, and add a collapsible syntax-highlighted netlist view in the sidebar.

**Architecture:** A new `DCSweepRenderer` class (parallel to `TransientRenderer`) drives a new `DCSweepPlot` React component. The showcase gains a `'dc'` view mode and calls `simulate()` directly (no streaming) for DC sweep circuits. A `NetlistView` component tokenizes the active netlist inline and renders it with colored spans — no external deps.

**Tech Stack:** React 18, TypeScript, Canvas 2D API, Vitest + React Testing Library, Vite, pnpm workspaces.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `packages/ui/src/core/types.ts` | Modify | Add `DCSweepDataset` interface |
| `packages/ui/src/core/index.ts` | Modify | Export `DCSweepDataset` |
| `packages/ui/src/core/dc-sweep-renderer.ts` | **Create** | `DCSweepRenderer` class (canvas, mirrors `TransientRenderer`) |
| `packages/ui/src/react/DCSweepPlot.tsx` | **Create** | React wrapper for `DCSweepRenderer` |
| `packages/ui/src/react/DCSweepPlot.test.tsx` | **Create** | Component tests |
| `packages/ui/src/react/index.ts` | Modify | Export `DCSweepPlot` |
| `examples/showcase/main.tsx` | Modify | All circuit netlists, DC sweep path, diagram panel |
| `examples/showcase/showcase.css` | Modify | Styles for diagram panel + netlist highlighting |

---

## Task 1: Add `DCSweepDataset` type and export it

**Files:**
- Modify: `packages/ui/src/core/types.ts`
- Modify: `packages/ui/src/core/index.ts`

- [ ] **Step 1: Add type to `types.ts`**

Open `packages/ui/src/core/types.ts`. After the `ACDataset` interface (line 43), add:

```ts
export interface DCSweepDataset {
  /** The swept source values (e.g. volts for a voltage sweep). */
  sweepValues: number[];
  /** Node voltages or branch currents at each sweep point. */
  signals: Map<string, number[]>;
  /** Optional label for .step overlays. */
  label: string;
}
```

- [ ] **Step 2: Export from `core/index.ts`**

In `packages/ui/src/core/index.ts`, change the first `export type` block from:

```ts
export type {
  ThemeConfig, CursorState, CursorValue, SignalConfig,
  TransientDataset, ACDataset, Margins, RendererEvents,
  StreamingTransientStep, StreamingACPoint,
} from './types.js';
```

to:

```ts
export type {
  ThemeConfig, CursorState, CursorValue, SignalConfig,
  TransientDataset, ACDataset, DCSweepDataset, Margins, RendererEvents,
  StreamingTransientStep, StreamingACPoint,
} from './types.js';
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd packages/ui && pnpm lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/core/types.ts packages/ui/src/core/index.ts
git commit -m "feat(ui): add DCSweepDataset type"
```

---

## Task 2: Implement `DCSweepRenderer`

**Files:**
- Create: `packages/ui/src/core/dc-sweep-renderer.ts`
- Modify: `packages/ui/src/core/index.ts`

- [ ] **Step 1: Create `dc-sweep-renderer.ts`**

Create `packages/ui/src/core/dc-sweep-renderer.ts` with this complete implementation:

```ts
import { createLinearScale, computeYExtent, type LinearScale } from './scales.js';
import { formatVoltage } from './format.js';
import type {
  ThemeConfig, DCSweepDataset, CursorState, CursorValue, Margins, RendererEvents,
} from './types.js';
import { DEFAULT_PALETTE } from './types.js';

function interpolateAt(xArr: number[], yArr: number[], x: number): number {
  if (xArr.length === 0) return 0;
  if (x <= xArr[0]) return yArr[0];
  if (x >= xArr[xArr.length - 1]) return yArr[yArr.length - 1];
  let lo = 0;
  let hi = xArr.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xArr[mid] <= x) lo = mid; else hi = mid;
  }
  const t = (x - xArr[lo]) / (xArr[hi] - xArr[lo]);
  return yArr[lo] + t * (yArr[hi] - yArr[lo]);
}

export interface DCSweepRendererOptions {
  theme: ThemeConfig;
  /** X-axis tick formatter. Defaults to formatVoltage. */
  xFormatter?: (v: number) => string;
  margin?: Partial<Margins>;
}

interface SignalState {
  name: string;
  color: string;
  visible: boolean;
  datasetIndex: number;
}

export class DCSweepRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private theme: ThemeConfig;
  private xFormatter: (v: number) => string;
  private margin: Margins;
  private dpr: number;

  private datasets: DCSweepDataset[] = [];
  private signalStates: SignalState[] = [];
  private xScale: LinearScale = createLinearScale([0, 1], [0, 1]);
  private yScale: LinearScale = createLinearScale([0, 1], [0, 1]);
  private xDomain: [number, number] = [0, 1];
  private yDomain: [number, number] = [0, 1];
  private userHasZoomed = false;
  private hasData = false;
  private cursorState: CursorState | null = null;
  private destroyed = false;
  private listeners: Partial<{ [K in keyof RendererEvents]: RendererEvents[K][] }> = {};

  constructor(canvas: HTMLCanvasElement, options: DCSweepRendererOptions) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.theme = options.theme;
    this.xFormatter = options.xFormatter ?? formatVoltage;
    this.dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    this.margin = {
      top: options.margin?.top ?? 10,
      right: options.margin?.right ?? 16,
      bottom: options.margin?.bottom ?? 32,
      left: options.margin?.left ?? 56,
    };
  }

  setData(datasets: DCSweepDataset[], signals: string[]): void {
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
    if (!this.hasData || !this.userHasZoomed) {
      this.computeDefaultDomains();
      this.updateScales();
    } else {
      this.updateScales();
    }
    this.hasData = true;
  }

  setSignalColor(name: string, color: string): void {
    for (const s of this.signalStates) {
      const ds = this.datasets[s.datasetIndex];
      const id = ds.label ? `${ds.label}:${s.name}` : s.name;
      if (s.name === name || id === name) s.color = color;
    }
  }

  setSignalVisibility(name: string, visible: boolean): void {
    for (const s of this.signalStates) {
      const ds = this.datasets[s.datasetIndex];
      const id = ds.label ? `${ds.label}:${s.name}` : s.name;
      if (s.name === name || id === name) s.visible = visible;
    }
  }

  getSignalStates(): ReadonlyArray<Readonly<SignalState>> {
    return this.signalStates;
  }

  setCursorPixelX(pixelX: number | null): void {
    if (pixelX === null) {
      this.cursorState = null;
      this.emit('cursorMove', null);
      return;
    }
    const plotLeft = this.margin.left;
    const plotRight = this.margin.left + this.getPlotWidth();
    if (pixelX < plotLeft || pixelX > plotRight) {
      this.cursorState = null;
      this.emit('cursorMove', null);
      return;
    }
    const dataX = this.xScale.invert(pixelX - this.margin.left);
    const values: CursorValue[] = [];
    for (const s of this.signalStates) {
      if (!s.visible) continue;
      const ds = this.datasets[s.datasetIndex];
      const yArr = ds.signals.get(s.name);
      if (!yArr || ds.sweepValues.length === 0) continue;
      const interpValue = interpolateAt(ds.sweepValues, yArr, dataX);
      const label = ds.label ? `${ds.label}: ${s.name}` : s.name;
      values.push({
        signalId: ds.label ? `${ds.label}:${s.name}` : s.name,
        label,
        value: interpValue,
        unit: 'V',
        color: s.color,
      });
    }
    this.cursorState = { x: dataX, pixelX, values };
    this.emit('cursorMove', this.cursorState);
  }

  zoomAt(_pixelX: number, factor: number): void {
    this.userHasZoomed = true;
    const [x0, x1] = this.xDomain;
    const center = (x0 + x1) / 2;
    const halfSpan = (x1 - x0) / 2 / factor;
    this.xDomain = [center - halfSpan, center + halfSpan];
    this.updateScales();
  }

  pan(dx: number, _dy: number): void {
    this.userHasZoomed = true;
    const [x0, x1] = this.xDomain;
    const xShift = (dx / this.getPlotWidth()) * (x1 - x0);
    this.xDomain = [x0 - xShift, x1 - xShift];
    this.updateScales();
  }

  fitToData(): void {
    this.userHasZoomed = false;
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
    if (this.destroyed || !this.ctx) return;
    const ctx = this.ctx;
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    ctx.fillStyle = this.theme.background;
    ctx.fillRect(this.margin.left, this.margin.top, this.getPlotWidth(), this.getPlotHeight());

    this.drawGrid(ctx);
    this.drawWaveforms(ctx);
    this.drawXAxis(ctx, h);
    this.drawYAxis(ctx);
    if (this.cursorState) this.drawCursor(ctx);
    ctx.restore();
  }

  destroy(): void {
    this.destroyed = true;
    this.listeners = {};
  }

  private emit<K extends keyof RendererEvents>(event: K, ...args: Parameters<RendererEvents[K]>): void {
    const arr = this.listeners[event];
    if (!arr) return;
    for (const cb of arr) (cb as (...a: unknown[]) => void)(...args);
  }

  private getPlotWidth(): number {
    return this.canvas.width / this.dpr - this.margin.left - this.margin.right;
  }

  private getPlotHeight(): number {
    return this.canvas.height / this.dpr - this.margin.top - this.margin.bottom;
  }

  private computeDefaultDomains(): void {
    if (this.datasets.length === 0) return;
    let xMin = Infinity, xMax = -Infinity;
    for (const ds of this.datasets) {
      if (ds.sweepValues.length > 0) {
        xMin = Math.min(xMin, ds.sweepValues[0]);
        xMax = Math.max(xMax, ds.sweepValues[ds.sweepValues.length - 1]);
      }
    }
    if (isFinite(xMin) && isFinite(xMax)) this.xDomain = [xMin, xMax];
    const arrays: number[][] = [];
    for (const s of this.signalStates) {
      if (!s.visible) continue;
      const arr = this.datasets[s.datasetIndex].signals.get(s.name);
      if (arr) arrays.push(arr);
    }
    if (arrays.length > 0) this.yDomain = computeYExtent(arrays);
  }

  private updateScales(): void {
    this.xScale = createLinearScale(this.xDomain, [0, this.getPlotWidth()]);
    this.yScale = createLinearScale(this.yDomain, [this.getPlotHeight(), 0]);
  }

  private drawGrid(ctx: CanvasRenderingContext2D): void {
    const pw = this.getPlotWidth();
    const ph = this.getPlotHeight();
    const { left, top } = this.margin;
    ctx.strokeStyle = this.theme.grid;
    ctx.lineWidth = 0.5;
    for (const tick of this.xScale.ticks(6)) {
      const x = left + this.xScale(tick);
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + ph); ctx.stroke();
    }
    for (const tick of this.yScale.ticks(5)) {
      const y = top + this.yScale(tick);
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(left + pw, y); ctx.stroke();
    }
  }

  private drawWaveforms(ctx: CanvasRenderingContext2D): void {
    const { left, top } = this.margin;
    const pw = this.getPlotWidth();
    const ph = this.getPlotHeight();
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, pw, ph);
    ctx.clip();
    for (const s of this.signalStates) {
      if (!s.visible) continue;
      const ds = this.datasets[s.datasetIndex];
      const yArr = ds.signals.get(s.name);
      if (!yArr || ds.sweepValues.length === 0) continue;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(left + this.xScale(ds.sweepValues[0]), top + this.yScale(yArr[0]));
      for (let i = 1; i < ds.sweepValues.length; i++) {
        ctx.lineTo(left + this.xScale(ds.sweepValues[i]), top + this.yScale(yArr[i]));
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawXAxis(ctx: CanvasRenderingContext2D, _height: number): void {
    const { left } = this.margin;
    const y = this.margin.top + this.getPlotHeight();
    ctx.fillStyle = this.theme.textMuted;
    ctx.font = `${this.theme.fontSize}px ${this.theme.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const tick of this.xScale.ticks(6)) {
      ctx.fillText(this.xFormatter(tick), left + this.xScale(tick), y + 6);
    }
  }

  private drawYAxis(ctx: CanvasRenderingContext2D): void {
    const { left, top } = this.margin;
    ctx.fillStyle = this.theme.textMuted;
    ctx.font = `${this.theme.fontSize}px ${this.theme.font}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const tick of this.yScale.ticks(5)) {
      ctx.fillText(formatVoltage(tick), left - 6, top + this.yScale(tick));
    }
  }

  private drawCursor(ctx: CanvasRenderingContext2D): void {
    if (!this.cursorState) return;
    const { left, top } = this.margin;
    const ph = this.getPlotHeight();
    const x = this.cursorState.pixelX;
    ctx.strokeStyle = this.theme.cursor;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + ph); ctx.stroke();
    ctx.setLineDash([]);
    for (const v of this.cursorState.values) {
      const py = top + this.yScale(v.value);
      ctx.fillStyle = v.color;
      ctx.strokeStyle = this.theme.background;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, py, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }
}
```

- [ ] **Step 2: Export `DCSweepRenderer` from `core/index.ts`**

In `packages/ui/src/core/index.ts`, add at the end:

```ts
export { DCSweepRenderer, type DCSweepRendererOptions } from './dc-sweep-renderer.js';
```

- [ ] **Step 3: Type-check**

```bash
cd packages/ui && pnpm lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/core/dc-sweep-renderer.ts packages/ui/src/core/index.ts
git commit -m "feat(ui): add DCSweepRenderer"
```

---

## Task 3: `DCSweepPlot` component — tests then implementation

**Files:**
- Create: `packages/ui/src/react/DCSweepPlot.test.tsx`
- Create: `packages/ui/src/react/DCSweepPlot.tsx`
- Modify: `packages/ui/src/react/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/ui/src/react/DCSweepPlot.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { DCSweepPlot } from './DCSweepPlot.js';
import type { DCSweepDataset } from '../core/types.js';

function mockDataset(): DCSweepDataset {
  return {
    sweepValues: [0, 0.5, 1.0, 1.5, 1.8],
    signals: new Map([['out', [1.8, 1.75, 1.0, 0.05, 0.02]]]),
    label: '',
  };
}

describe('DCSweepPlot', () => {
  it('renders a canvas element', () => {
    const { container } = render(
      <DCSweepPlot data={[mockDataset()]} signals={['out']} />,
    );
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('renders with custom dimensions', () => {
    const { container } = render(
      <DCSweepPlot data={[mockDataset()]} signals={['out']} width={500} height={300} />,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.width).toBe('500px');
    expect(wrapper.style.height).toBe('300px');
  });

  it('renders with string width/height', () => {
    const { container } = render(
      <DCSweepPlot data={[mockDataset()]} signals={['out']} width="80%" height="200px" />,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.width).toBe('80%');
    expect(wrapper.style.height).toBe('200px');
  });

  it('calls onCursorMove when provided', () => {
    const onCursorMove = vi.fn();
    render(
      <DCSweepPlot
        data={[mockDataset()]}
        signals={['out']}
        onCursorMove={onCursorMove}
      />,
    );
    expect(onCursorMove).not.toHaveBeenCalled();
  });

  it('renders with signalVisibility prop', () => {
    const { container } = render(
      <DCSweepPlot
        data={[mockDataset()]}
        signals={['out']}
        signalVisibility={{ out: false }}
      />,
    );
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('renders with colors prop', () => {
    const { container } = render(
      <DCSweepPlot
        data={[mockDataset()]}
        signals={['out']}
        colors={{ out: '#ff0000' }}
      />,
    );
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('renders with xDomain prop', () => {
    const { container } = render(
      <DCSweepPlot
        data={[mockDataset()]}
        signals={['out']}
        xDomain={[0, 1.8]}
      />,
    );
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('renders with multiple datasets', () => {
    const ds2: DCSweepDataset = {
      sweepValues: [0, 0.5, 1.0, 1.5, 1.8],
      signals: new Map([['out', [0.02, 0.05, 1.0, 1.75, 1.78]]]),
      label: 'run2',
    };
    const { container } = render(
      <DCSweepPlot data={[mockDataset(), ds2]} signals={['out']} />,
    );
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('renders with dark theme', () => {
    const { container } = render(
      <DCSweepPlot data={[mockDataset()]} signals={['out']} theme="dark" />,
    );
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('unmounts cleanly', () => {
    const { unmount } = render(
      <DCSweepPlot data={[mockDataset()]} signals={['out']} />,
    );
    unmount();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd packages/ui && pnpm test -- --reporter=verbose DCSweepPlot
```

Expected: FAIL — `DCSweepPlot` not found.

- [ ] **Step 3: Implement `DCSweepPlot.tsx`**

Create `packages/ui/src/react/DCSweepPlot.tsx`:

```tsx
import { useRef, useEffect, useCallback, type CSSProperties } from 'react';
import { DCSweepRenderer } from '../core/dc-sweep-renderer.js';
import { resolveTheme } from '../core/theme.js';
import { InteractionHandler } from '../core/interaction.js';
import type { ThemeConfig, CursorState, DCSweepDataset } from '../core/types.js';
import { useCanvas } from './use-renderer.js';

export interface DCSweepPlotProps {
  /** One or more DC sweep datasets to overlay. */
  data: DCSweepDataset[];
  /** Signal names to display. */
  signals: string[];
  /** Signal color overrides. Key is plain signal name or "label:name". */
  colors?: Record<string, string>;
  /** Theme preset or custom config. */
  theme?: 'dark' | 'light' | ThemeConfig;
  /** CSS width. Default '100%'. */
  width?: number | string;
  /** CSS height. Default 300. */
  height?: number | string;
  /** Fixed x-axis domain [min, max]. Auto-computed from data if omitted. */
  xDomain?: [number, number];
  /** Cursor move callback. */
  onCursorMove?: (cursor: CursorState | null) => void;
  /** Signal visibility state (controlled). */
  signalVisibility?: Record<string, boolean>;
}

export function DCSweepPlot({
  data,
  signals,
  colors,
  theme,
  width = '100%',
  height = 300,
  xDomain,
  onCursorMove,
  signalVisibility,
}: DCSweepPlotProps) {
  const rendererRef = useRef<DCSweepRenderer | null>(null);
  const interactionRef = useRef<InteractionHandler | null>(null);
  const onCursorMoveRef = useRef(onCursorMove);
  onCursorMoveRef.current = onCursorMove;
  const resolvedTheme = resolveTheme(theme);

  const handleResize = useCallback(() => {
    rendererRef.current?.render();
  }, []);

  const { refCallback } = useCanvas(handleResize);

  const canvasRefCallback = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      rendererRef.current?.destroy();
      interactionRef.current?.destroy();
      rendererRef.current = null;
      interactionRef.current = null;

      refCallback(canvas);

      if (canvas) {
        const renderer = new DCSweepRenderer(canvas, { theme: resolvedTheme });
        rendererRef.current = renderer;

        renderer.on('cursorMove', (state) => {
          onCursorMoveRef.current?.(state);
        });

        const interaction = new InteractionHandler(canvas, {
          onCursorMove: (pixelX) => {
            renderer.setCursorPixelX(pixelX);
            renderer.render();
          },
          onZoom: (_pixelX, factor) => {
            renderer.zoomAt(_pixelX, factor);
            renderer.render();
          },
          onPan: (dx) => {
            renderer.pan(dx, 0);
            renderer.render();
          },
          onDoubleClick: () => {
            renderer.fitToData();
            renderer.render();
          },
        });
        interactionRef.current = interaction;
      }
    },
    [resolvedTheme, refCallback],
  );

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setData(data, signals);
    if (colors) {
      for (const [name, color] of Object.entries(colors)) {
        renderer.setSignalColor(name, color);
      }
    }
    renderer.render();
  }, [data, signals, colors, xDomain]);

  useEffect(() => {
    if (!rendererRef.current || !signalVisibility) return;
    for (const [name, visible] of Object.entries(signalVisibility)) {
      rendererRef.current.setSignalVisibility(name, visible);
    }
    rendererRef.current.render();
  }, [signalVisibility]);

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

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd packages/ui && pnpm test -- --reporter=verbose DCSweepPlot
```

Expected: all 10 tests PASS.

- [ ] **Step 5: Export from `react/index.ts`**

In `packages/ui/src/react/index.ts`, add:

```ts
export { DCSweepPlot, type DCSweepPlotProps } from './DCSweepPlot.js';
```

- [ ] **Step 6: Full test suite**

```bash
cd packages/ui && pnpm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/react/DCSweepPlot.tsx packages/ui/src/react/DCSweepPlot.test.tsx packages/ui/src/react/index.ts
git commit -m "feat(ui): add DCSweepPlot component"
```

---

## Task 4: Implement Filters + update `CircuitDef` interface

**Files:**
- Modify: `examples/showcase/main.tsx`

- [ ] **Step 1: Add `dcNetlist` and `xLabel` to `CircuitDef`**

In `examples/showcase/main.tsx`, change the `CircuitDef` interface from:

```ts
interface CircuitDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  group: string;
  tag?: string;
  tranNetlist?: string;
  acNetlist?: string;
  signals: string[];
}
```

to:

```ts
interface CircuitDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  group: string;
  tag?: string;
  tranNetlist?: string;
  acNetlist?: string;
  dcNetlist?: string;
  xLabel?: string;
  signals: string[];
}
```

- [ ] **Step 2: Implement `rc-lowpass` netlists (already done — verify)**

The `rc-lowpass` entry already has `tranNetlist` and `acNetlist`. No change needed.

- [ ] **Step 3: Implement `rlc-bandpass` netlists**

Replace the `rlc-bandpass` entry in `CIRCUITS`:

```ts
{
  id: 'rlc-bandpass', name: 'RLC Bandpass', desc: 'Impulse + Bode',
  icon: '\u236E', group: 'Filters', tag: '.tran', signals: ['n1'],
  tranNetlist: `
* Series RLC bandpass — impulse in, voltage across C
V1 in 0 PULSE(0 5 0 1n 1n 1u 100u)
R1 in mid 100
L1 mid n1 10m
C1 n1 0 1u
.tran 1u 2m`,
  acNetlist: `
* Series RLC bandpass — frequency response
V1 in 0 AC 1
R1 in mid 100
L1 mid n1 10m
C1 n1 0 1u
.ac dec 100 10 100k`,
},
```

- [ ] **Step 4: Implement `sallen-key` netlist**

Replace the `sallen-key` entry:

```ts
{
  id: 'sallen-key', name: 'Sallen-Key Low-Pass', desc: '2nd-order, –40dB/dec',
  icon: '\u2393', group: 'Filters', tag: '.ac', signals: ['out'],
  acNetlist: `
* Unity-gain Sallen-Key low-pass — VCVS ideal opamp
V1 in 0 AC 1
R1 in n1 10k
R2 n1 n2 10k
C1 n1 out 10n
C2 n2 0 10n
E1 out 0 n2 0 1e6
.ac dec 100 10 1Meg`,
},
```

- [ ] **Step 5: Type-check**

```bash
cd examples/showcase && pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add examples/showcase/main.tsx
git commit -m "feat(showcase): implement Filters group netlists (RLC bandpass, Sallen-Key)"
```

---

## Task 5: Implement Non-Linear group netlists

**Files:**
- Modify: `examples/showcase/main.tsx`

- [ ] **Step 1: Implement `cmos-inverter` with DC sweep**

Replace the `cmos-inverter` entry:

```ts
{
  id: 'cmos-inverter', name: 'CMOS Inverter', desc: 'DC transfer curve',
  icon: '\u23DA', group: 'Non-Linear', tag: '.dc', signals: ['out'],
  xLabel: 'Vin (V)',
  dcNetlist: `
* CMOS inverter DC transfer curve — BSIM3v3 (Level 49)
VDD vdd 0 DC 1.8
VIN in 0 DC 0
.model NMOD NMOS (LEVEL=49 VTH0=0.5 U0=400 TOX=4n)
.model PMOD PMOS (LEVEL=49 VTH0=-0.5 U0=150 TOX=4n)
MP out in vdd vdd PMOD W=20u L=0.18u
MN out in 0   0  NMOD W=10u L=0.18u
.dc VIN 0 1.8 0.01`,
},
```

- [ ] **Step 2: Implement `rectifier` netlist**

Replace the `rectifier` entry:

```ts
{
  id: 'rectifier', name: 'Half-Wave Rectifier', desc: 'Diode clipping',
  icon: '\u23DA', group: 'Non-Linear', tag: '.tran', signals: ['in', 'out'],
  tranNetlist: `
* Half-wave rectifier — sine in, rectified out
V1 in 0 SIN(0 5 1k)
Rs in anode 10
D1 anode out DMOD
Rl out 0 10k
Cl out 0 10u
.model DMOD D(IS=1e-14 N=1)
.tran 1u 4m`,
},
```

- [ ] **Step 3: Implement `cs-amp` netlist**

Replace the `cs-amp` entry:

```ts
{
  id: 'cs-amp', name: 'Common-Source Amp', desc: 'MOSFET gain stage',
  icon: '\u23DA', group: 'Non-Linear', tag: '.ac', signals: ['out'],
  acNetlist: `
* NMOS common-source amplifier — Bode plot
VDD vdd 0 DC 5
VGS in 0 DC 1.5 AC 1
.model NMOD NMOS(VTO=1 KP=1e-4)
M1 out in 0 0 NMOD W=100u L=1u
RD vdd out 10k
.ac dec 100 1 10Meg`,
},
```

- [ ] **Step 4: Type-check**

```bash
cd examples/showcase && pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add examples/showcase/main.tsx
git commit -m "feat(showcase): implement Non-Linear group netlists (CMOS inverter DC, rectifier, CS amp)"
```

---

## Task 6: Implement Opamp Circuits + Impulse Response netlists

**Files:**
- Modify: `examples/showcase/main.tsx`

- [ ] **Step 1: Implement `inv-amp` netlist**

Replace the `inv-amp` entry:

```ts
{
  id: 'inv-amp', name: 'Inverting Amplifier', desc: '.step Rf: 1k→100k',
  icon: '\u25B3', group: 'Opamp Circuits', tag: '.step', signals: ['out'],
  tranNetlist: `
* Inverting opamp amplifier — VCVS model, sweep Rf
V1 in 0 PULSE(0 0.1 0 1u 1u 5m 10m)
Rin in nm 1k
Rf nm out 10k
E1 out 0 0 nm 1e6
.step param Rf list 1k 10k 100k
.tran 10u 20m`,
},
```

- [ ] **Step 2: Implement `integrator` netlist**

Replace the `integrator` entry:

```ts
{
  id: 'integrator', name: 'Integrator', desc: 'Square \u2192 triangle',
  icon: '\u25B3', group: 'Opamp Circuits', tag: '.tran', signals: ['in', 'out'],
  tranNetlist: `
* Opamp integrator — square wave in, triangle wave out
V1 in 0 PULSE(-1 1 0 1n 1n 5m 10m)
Rin in nm 10k
Cf nm out 100n
E1 out 0 0 nm 1e6
.tran 10u 20m`,
},
```

- [ ] **Step 3: Implement `rlc-step` netlist**

Replace the `rlc-step` entry:

```ts
{
  id: 'rlc-step', name: 'RLC Step Response', desc: '.step R: under/over-damped',
  icon: '\u223F', group: 'Impulse Response', tag: '.step', signals: ['n1'],
  tranNetlist: `
* RLC step response — three damping regimes
V1 in 0 PULSE(0 5 0 1n 1n 50m 100m)
R1 in mid 10
L1 mid n1 10m
C1 n1 0 100u
.step param R1 list 10 200 1k
.tran 10u 10m`,
},
```

- [ ] **Step 4: Implement `lc-tank` netlist**

Replace the `lc-tank` entry:

```ts
{
  id: 'lc-tank', name: 'LC Tank', desc: 'Decaying oscillation',
  icon: '\u223F', group: 'Impulse Response', tag: '.tran', signals: ['out'],
  tranNetlist: `
* LC tank — lightly-damped oscillation, f0 ≈ 15.9 kHz
V1 in 0 PULSE(0 5 0 1n 1n 5u 200u)
Rs in n1 10
L1 n1 out 10m
C1 out 0 10n
.tran 100n 200u`,
},
```

- [ ] **Step 5: Type-check**

```bash
cd examples/showcase && pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add examples/showcase/main.tsx
git commit -m "feat(showcase): implement Opamp Circuits and Impulse Response netlists"
```

---

## Task 7: Add Power Electronics group

**Files:**
- Modify: `examples/showcase/main.tsx`

- [ ] **Step 1: Add three Power Electronics circuits to `CIRCUITS`**

Append to the `CIRCUITS` array (after `lc-tank`):

```ts
{
  id: 'buck', name: 'Buck Converter', desc: '12V → ~6V, 50% duty',
  icon: '\u26A1', group: 'Power Electronics', tag: '.tran', signals: ['out'],
  tranNetlist: `
* Buck converter — NMOS switch + freewheeling diode + LC filter
* Vin=12V, D=50%, f=100kHz, Vout≈6V
Vin in 0 DC 12
Vg gate 0 PULSE(0 15 0 1n 1n 5u 10u)
.model NMOD NMOS(VTO=2 KP=10)
.model DMOD D(IS=1e-14 N=1)
M1 sw gate in 0 NMOD W=1m L=1u
D1 0 sw DMOD
L1 sw out 100u
C1 out 0 100u
Rload out 0 10
.tran 100n 200u`,
},
{
  id: 'boost', name: 'Boost Converter', desc: '5V → ~10V, 50% duty',
  icon: '\u26A1', group: 'Power Electronics', tag: '.tran', signals: ['out'],
  tranNetlist: `
* Boost converter — inductor charges from Vin, discharges through D to Cout
* Vin=5V, D=50%, f=100kHz, Vout≈10V
Vin in 0 DC 5
Vg gate 0 PULSE(0 15 0 1n 1n 5u 10u)
.model NMOD NMOS(VTO=2 KP=10)
.model DMOD D(IS=1e-14 N=1)
L1 in sw 100u
M1 sw gate 0 0 NMOD W=1m L=1u
D1 sw out DMOD
C1 out 0 100u
Rload out 0 10
.tran 100n 300u`,
},
{
  id: 'buck-boost', name: 'Buck-Boost Converter', desc: '12V → –Vout (inverting)',
  icon: '\u26A1', group: 'Power Electronics', tag: '.tran', signals: ['neg'],
  tranNetlist: `
* Buck-boost (inverting) — neg node is the negative output rail
* Vin=12V, D=50%, f=100kHz
Vin in 0 DC 12
Vg gate 0 PULSE(0 15 0 1n 1n 5u 10u)
.model NMOD NMOS(VTO=2 KP=10)
.model DMOD D(IS=1e-14 N=1)
M1 in gate sw 0 NMOD W=1m L=1u
L1 sw n1 100u
D1 n1 0 DMOD
C1 n1 neg 100u
Rload neg 0 10
.tran 100n 200u`,
},
```

- [ ] **Step 2: Type-check**

```bash
cd examples/showcase && pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add examples/showcase/main.tsx
git commit -m "feat(showcase): add Power Electronics group (buck, boost, buck-boost)"
```

---

## Task 8: Add DC sweep simulation path and panel

**Files:**
- Modify: `examples/showcase/main.tsx`

- [ ] **Step 1: Update imports in `main.tsx`**

At the top of `examples/showcase/main.tsx`, change:

```ts
import { simulateStepStream } from '@spice-ts/core';
import type { StepStreamEvent } from '@spice-ts/core';
import { TransientPlot, BodePlot, CursorTooltip, Legend } from '@spice-ts/ui/react';
import type { LegendSignal } from '@spice-ts/ui/react';
import { DARK_THEME, formatTime, formatFrequency, formatSI, DEFAULT_PALETTE } from '@spice-ts/ui';
import type { TransientDataset, ACDataset, CursorState } from '@spice-ts/ui';
```

to:

```ts
import { simulateStepStream, simulate } from '@spice-ts/core';
import type { StepStreamEvent, DCSweepResult } from '@spice-ts/core';
import { TransientPlot, BodePlot, DCSweepPlot, CursorTooltip, Legend } from '@spice-ts/ui/react';
import type { LegendSignal } from '@spice-ts/ui/react';
import { DARK_THEME, formatTime, formatFrequency, formatVoltage, formatSI, DEFAULT_PALETTE } from '@spice-ts/ui';
import type { TransientDataset, ACDataset, DCSweepDataset, CursorState } from '@spice-ts/ui';
```

- [ ] **Step 2: Add `buildDCSweepDatasets` helper**

After the `buildLegendSignals` function (around line 154), add:

```ts
function buildDCSweepDatasets(result: DCSweepResult, signals: string[]): DCSweepDataset[] {
  const sweepValues = Array.from(result.sweepValues);
  const signalsMap = new Map<string, number[]>();
  for (const name of signals) {
    try {
      signalsMap.set(name, Array.from(result.voltage(name)));
    } catch {
      try {
        signalsMap.set(name, Array.from(result.current(name)));
      } catch {
        signalsMap.set(name, new Array(sweepValues.length).fill(0));
      }
    }
  }
  return [{ sweepValues, signals: signalsMap, label: '' }];
}
```

- [ ] **Step 3: Add `activeView` dc variant and `dcData` state**

In the `App` function, change:

```ts
const [activeView, setActiveView] = useState<'tran' | 'ac'>('tran');
```

to:

```ts
const [activeView, setActiveView] = useState<'tran' | 'ac' | 'dc'>('tran');
```

After the `[acData, setAcData]` state line, add:

```ts
const [dcData, setDcData] = useState<DCSweepDataset[] | null>(null);
const [dcCursor, setDcCursor] = useState<CursorState | null>(null);
```

- [ ] **Step 4: Update `handleSelectCircuit`**

Change the `setActiveView` line in `handleSelectCircuit` from:

```ts
setActiveView(c.tranNetlist ? 'tran' : 'ac');
```

to:

```ts
setActiveView(c.tranNetlist ? 'tran' : c.acNetlist ? 'ac' : 'dc');
```

Also add `setDcData(null)` and `setDcCursor(null)` alongside the other state resets inside `handleSelectCircuit`:

```ts
setTranData(null);
setAcData(null);
setDcData(null);    // add this
setError(null);
setElapsed(null);
setVisibility({});
stopRef.current = true;
setRunning(false);
```

- [ ] **Step 5: Update `handleRun` to handle DC sweep**

In `handleRun`, replace the existing body with the following (the dc block goes first, existing tran/ac logic remains):

```ts
const handleRun = useCallback(() => {
  // DC sweep path — synchronous simulate(), no streaming
  if (activeView === 'dc') {
    if (!circuit.dcNetlist) return;
    setDcData(null);
    setError(null);
    setRunning(true);
    setElapsed(null);
    setVisibility({});
    stopRef.current = false;
    const t0 = performance.now();
    simulate(circuit.dcNetlist)
      .then(result => {
        if (stopRef.current) return;
        if (!result.dcSweep) { setError('No DC sweep result'); setRunning(false); return; }
        setDcData(buildDCSweepDatasets(result.dcSweep, circuit.signals));
        setRunning(false);
        setElapsed(Math.round(performance.now() - t0));
      })
      .catch((err: unknown) => {
        stopRef.current = true;
        setError(err instanceof Error ? err.message : String(err));
        setRunning(false);
      });
    return;
  }

  // ... existing tran/ac handleRun body unchanged below
  const netlist = activeView === 'tran' ? circuit.tranNetlist : circuit.acNetlist;
  if (!netlist) return;
  // ... rest of existing code
}, [circuit, activeView]);
```

- [ ] **Step 6: Update `hasNetlist` to include `dcNetlist`**

Change:

```ts
const hasNetlist = !!(circuit.tranNetlist || circuit.acNetlist);
```

to:

```ts
const hasNetlist = !!(circuit.tranNetlist || circuit.acNetlist || circuit.dcNetlist);
```

- [ ] **Step 7: Add "DC Sweep" toolbar button**

In the toolbar JSX, after the AC Sweep button block:

```tsx
{circuit.dcNetlist && (
  <button
    className={`toolbar-btn ${activeView === 'dc' ? 'active' : ''}`}
    onClick={() => setActiveView('dc')}
  >DC Sweep</button>
)}
```

- [ ] **Step 8: Add DC sweep panel**

In the `panels` div, after the AC panel block, add:

```tsx
{/* DC sweep panel */}
{activeView === 'dc' && circuit.dcNetlist && (
  <div className="panel">
    <div className="panel-header">
      <h3>DC Sweep &mdash; V({circuit.signals[0]})</h3>
      <span className="panel-badge">.dc</span>
    </div>
    <div className="panel-body">
      {!dcData && !running && (
        <div className="panel-placeholder">Press Run to simulate</div>
      )}
      {!dcData && running && (
        <div className="panel-placeholder">Simulating DC sweep...</div>
      )}
      {dcData && (
        <div style={{ position: 'relative' }}>
          <DCSweepPlot
            data={dcData}
            signals={circuit.signals}
            theme={vaultTecTheme ?? 'dark'}
            colors={vaultTecColors(dcData, circuit.signals)}
            height={280}
            xDomain={undefined}
            onCursorMove={setDcCursor}
            signalVisibility={visibility}
          />
          <Legend
            signals={buildLegendSignals(dcData, circuit.signals, visibility, vaultTec ? vaultTecPalette : undefined)}
            onToggle={handleToggle}
          />
          <CursorTooltip cursor={dcCursor} theme={vaultTecTheme ?? DARK_THEME} formatX={v => `${formatVoltage(v)}`} />
        </div>
      )}
    </div>
  </div>
)}
```

- [ ] **Step 9: Update status bar to handle DC view**

The status bar already shows `elapsed` when it's not null — no change needed.

- [ ] **Step 10: Type-check**

```bash
cd examples/showcase && pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add examples/showcase/main.tsx
git commit -m "feat(showcase): add DC sweep simulation path and panel"
```

---

## Task 9: Add circuit diagram sidebar panel + CSS

**Files:**
- Modify: `examples/showcase/main.tsx`
- Modify: `examples/showcase/showcase.css`

- [ ] **Step 1: Add `NetlistView` component**

In `examples/showcase/main.tsx`, before the `App` function, add the `NetlistLine` and `NetlistView` components:

```tsx
// ─── Netlist syntax highlighting ────────────────────────────────────

const DEVICE_PREFIXES = ['V','R','C','L','M','D','E','F','G','H','Q','I','B'];

function NetlistLine({ line }: { line: string }) {
  const trimmed = line.trim();
  if (!trimmed) return <div style={{ height: '1em' }} />;
  if (trimmed.startsWith('*')) {
    return <div><span className="nl-comment">{trimmed}</span></div>;
  }
  const tokens = trimmed.split(/\s+/);
  const first = tokens[0];
  const upper = first.toUpperCase();

  if (upper === '.STEP' || upper === '.MODEL') {
    return <div><span className="nl-directive">{trimmed}</span></div>;
  }
  if (upper.startsWith('.')) {
    return <div><span className="nl-keyword">{trimmed}</span></div>;
  }
  if (DEVICE_PREFIXES.some(p => upper.startsWith(p))) {
    const ref = tokens[0];
    const rest = tokens.slice(1);
    if (rest.length === 0) return <div><span className="nl-ref">{ref}</span></div>;
    const value = rest[rest.length - 1];
    const nodes = rest.slice(0, -1);
    return (
      <div>
        <span className="nl-ref">{ref}</span>{' '}
        <span className="nl-node">{nodes.join(' ')}</span>{' '}
        <span className="nl-value">{value}</span>
      </div>
    );
  }
  return <div><span className="nl-muted">{trimmed}</span></div>;
}

function NetlistView({ netlist }: { netlist: string }) {
  const lines = netlist.split('\n');
  return (
    <pre className="netlist-view">
      {lines.map((line, i) => <NetlistLine key={i} line={line} />)}
    </pre>
  );
}
```

- [ ] **Step 2: Add `diagramOpen` state**

In the `App` function, near the other `useState` calls, add:

```ts
const [diagramOpen, setDiagramOpen] = useState(true);
```

- [ ] **Step 3: Determine which netlist to show in diagram**

Add this derived value after the `hasNetlist` line:

```ts
const diagramNetlist = activeView === 'dc' ? circuit.dcNetlist
  : activeView === 'ac' ? circuit.acNetlist
  : circuit.tranNetlist;
```

- [ ] **Step 4: Add diagram section to sidebar JSX**

In the sidebar `<aside>` element, after the closing `</div>` of `sidebar-list`, add:

```tsx
{/* ── Circuit diagram ── */}
<div className="diagram-section">
  <button
    className="diagram-toggle"
    onClick={() => setDiagramOpen(prev => !prev)}
  >
    <svg
      className={`chevron ${diagramOpen ? 'open' : ''}`}
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
    <span>Circuit</span>
  </button>
  {diagramOpen && diagramNetlist && (
    <div className="diagram-body">
      <NetlistView netlist={diagramNetlist} />
    </div>
  )}
  {diagramOpen && !diagramNetlist && (
    <div className="diagram-body diagram-empty">Not yet implemented</div>
  )}
</div>
```

- [ ] **Step 5: Add CSS**

In `examples/showcase/showcase.css`, append:

```css
/* ─── Circuit diagram sidebar panel ─── */

.diagram-section {
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}

.diagram-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 8px 12px;
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  text-align: left;
}

.diagram-toggle:hover {
  color: var(--text);
}

.diagram-toggle .chevron {
  width: 12px;
  height: 12px;
  transition: transform 0.15s;
  transform: rotate(0deg);
  flex-shrink: 0;
}

.diagram-toggle .chevron.open {
  transform: rotate(90deg);
}

.diagram-body {
  padding: 0 8px 8px;
  overflow-y: auto;
  max-height: 260px;
}

.diagram-empty {
  color: var(--text-muted);
  font-size: 12px;
  padding: 8px 4px;
}

/* ─── Netlist view syntax highlighting ─── */

.netlist-view {
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 10.5px;
  line-height: 1.65;
  margin: 0;
  padding: 8px;
  background: #0d0d0d;
  border: 1px solid var(--border);
  border-radius: 4px;
  overflow-x: auto;
  white-space: pre;
}

.nl-comment  { color: #555; }
.nl-ref      { color: #7ec8e3; }
.nl-node     { color: #aaaaaa; }
.nl-value    { color: #f0b97a; }
.nl-keyword  { color: #aaaaaa; }
.nl-directive{ color: #c8a3e3; }
.nl-muted    { color: #888; }
```

- [ ] **Step 6: Make sidebar a flex column so diagram stays at bottom**

Open `examples/showcase/showcase.css` and find `.sidebar`. Verify it already uses `display: flex; flex-direction: column`. If `.sidebar-list` has `flex: 1; overflow-y: auto;`, the diagram section will naturally sit below it. If `.sidebar` doesn't have `display: flex; flex-direction: column;`, add:

```css
.sidebar {
  display: flex;
  flex-direction: column;
}
```

And ensure:

```css
.sidebar-list {
  flex: 1;
  overflow-y: auto;
}
```

- [ ] **Step 7: Type-check**

```bash
cd examples/showcase && pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Run dev server and verify visually**

```bash
cd examples/showcase && pnpm dev
```

Open `http://localhost:5173` (or the port shown). Check:
- Sidebar shows a "Circuit" collapsible section below the circuit list
- Clicking the toggle collapses/expands it
- Netlist shows with colored tokens (refs = blue, values = amber, `.step`/`.model` = purple, comments = grey)
- Selecting a circuit updates the diagram
- Switching between Transient/AC/DC views updates the diagram to show the matching netlist
- DC Sweep button appears for CMOS Inverter; clicking Run simulates and shows the transfer curve
- All existing circuits still work (rc-lowpass, rlc-bandpass, etc.)
- Power Electronics circuits show waveforms (may need a few seconds to simulate)

- [ ] **Step 9: Commit**

```bash
git add examples/showcase/main.tsx examples/showcase/showcase.css
git commit -m "feat(showcase): add collapsible netlist diagram panel to sidebar"
```

---

## Task 10: Push to main

- [ ] **Step 1: Full ui test suite**

```bash
cd packages/ui && pnpm test
```

Expected: all tests pass.

- [ ] **Step 2: Type-check showcase**

```bash
cd examples/showcase && pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Push**

```bash
git push origin main
```
