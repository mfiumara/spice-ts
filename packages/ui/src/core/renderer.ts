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
