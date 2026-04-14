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

  /** Update theme. */
  setTheme(theme: ThemeConfig): void {
    this.theme = theme;
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
