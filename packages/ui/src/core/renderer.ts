import { createLinearScale, computeYExtent, bisectData, type LinearScale } from './scales.js';
import { formatTime, formatVoltage } from './format.js';
import type { ThemeConfig, TransientDataset, CursorState, CursorValue, Margins, RendererEvents } from './types.js';
import { DEFAULT_PALETTE } from './types.js';

/** Linearly interpolate y at a given x between data points. */
function interpolateAt(xArr: number[], yArr: number[], x: number): number {
  if (xArr.length === 0) return 0;
  if (x <= xArr[0]) return yArr[0];
  if (x >= xArr[xArr.length - 1]) return yArr[yArr.length - 1];

  // Binary search for the interval containing x
  let lo = 0;
  let hi = xArr.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xArr[mid] <= x) lo = mid;
    else hi = mid;
  }

  const x0 = xArr[lo];
  const x1 = xArr[hi];
  const t = (x - x0) / (x1 - x0);
  return yArr[lo] + t * (yArr[hi] - yArr[lo]);
}

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
  private fixedXDomain: [number, number] | null = null;
  private userHasZoomed = false;
  private hasData = false;
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

    // Only auto-set domains on first data load or if user hasn't manually zoomed.
    // During streaming, we don't want to reset the user's zoom on every data update.
    if (!this.hasData || !this.userHasZoomed) {
      this.computeDefaultDomains();
      this.updateScales();
    } else {
      // Just update scales (domain unchanged, but plot dimensions may have changed)
      this.updateScales();
    }
    this.hasData = true;
  }

  /** Pin the x-axis to a fixed range (e.g. [0, stopTime] during streaming). */
  setFixedXDomain(domain: [number, number] | null): void {
    this.fixedXDomain = domain;
    if (domain) {
      this.xDomain = domain;
      this.updateScales();
    }
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

    // Clamp cursor to the plot area
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
      const signalArr = ds.signals.get(s.name);
      if (!signalArr || ds.time.length === 0) continue;

      // Interpolate value at exact cursor X position
      const interpValue = interpolateAt(ds.time, signalArr, dataX);

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

  /** Zoom at a pixel x position by a factor (>1 zooms in, <1 zooms out). */
  zoomAt(pixelX: number, factor: number): void {
    this.userHasZoomed = true;
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
    this.userHasZoomed = true;
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
    this.userHasZoomed = false;
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

    // X domain: use fixed domain if set, otherwise compute from data
    if (this.fixedXDomain) {
      this.xDomain = this.fixedXDomain;
    } else {
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

    // Max points to draw — roughly 2 per CSS pixel for visual fidelity
    const maxPoints = Math.ceil(plotWidth * 2);

    for (const s of this.signalStates) {
      if (!s.visible) continue;
      const ds = this.datasets[s.datasetIndex];
      const yArr = ds.signals.get(s.name);
      if (!yArr || ds.time.length === 0) continue;

      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      const n = ds.time.length;
      if (n <= maxPoints) {
        // Few enough points — draw them all
        ctx.moveTo(left + this.xScale(ds.time[0]), top + this.yScale(yArr[0]));
        for (let i = 1; i < n; i++) {
          ctx.lineTo(left + this.xScale(ds.time[i]), top + this.yScale(yArr[i]));
        }
      } else {
        // Min/max decimation: split data into buckets, draw min and max per bucket.
        // This preserves peaks/spikes that stride-based sampling would miss.
        const bucketSize = n / maxPoints;
        ctx.moveTo(left + this.xScale(ds.time[0]), top + this.yScale(yArr[0]));

        for (let b = 0; b < maxPoints; b++) {
          const start = Math.floor(b * bucketSize);
          const end = Math.min(Math.floor((b + 1) * bucketSize), n);
          if (start >= end) continue;

          let minVal = yArr[start];
          let maxVal = yArr[start];
          let minIdx = start;
          let maxIdx = start;
          for (let i = start + 1; i < end; i++) {
            if (yArr[i] < minVal) { minVal = yArr[i]; minIdx = i; }
            if (yArr[i] > maxVal) { maxVal = yArr[i]; maxIdx = i; }
          }

          // Draw min and max in time order to maintain waveform continuity
          if (minIdx <= maxIdx) {
            ctx.lineTo(left + this.xScale(ds.time[minIdx]), top + this.yScale(minVal));
            ctx.lineTo(left + this.xScale(ds.time[maxIdx]), top + this.yScale(maxVal));
          } else {
            ctx.lineTo(left + this.xScale(ds.time[maxIdx]), top + this.yScale(maxVal));
            ctx.lineTo(left + this.xScale(ds.time[minIdx]), top + this.yScale(minVal));
          }
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

    // Dots at intersection with each visible signal (on the waveform line)
    for (const v of this.cursorState.values) {
      const py = top + this.yScale(v.value);
      ctx.fillStyle = v.color;
      ctx.strokeStyle = this.theme.background;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, py, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}
