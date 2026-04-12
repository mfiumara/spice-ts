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
  private fixedXDomain: [number, number] | null = null;
  private userHasZoomed = false;
  private hasData = false;
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

    if (!this.hasData || !this.userHasZoomed) {
      this.computeDefaultDomains();
    }
    this.updateScales();
    this.hasData = true;
  }

  setFixedXDomain(domain: [number, number] | null): void {
    this.fixedXDomain = domain;
    if (domain) {
      this.xDomain = domain;
      this.updateScales();
    }
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

    // Clamp cursor to the plot area
    const plotLeft = this.margin.left;
    const plotRight = this.margin.left + this.getPlotWidth(this.magCanvas);
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

  zoomAt(_pixelX: number, factor: number): void {
    this.userHasZoomed = true;
    const [lx0, lx1] = [Math.log10(this.xDomain[0]), Math.log10(this.xDomain[1])];
    const logCenter = (lx0 + lx1) / 2;
    const halfSpan = (lx1 - lx0) / 2 / factor;
    this.xDomain = [Math.pow(10, logCenter - halfSpan), Math.pow(10, logCenter + halfSpan)];
    this.updateScales();
  }

  pan(dx: number, _dy: number): void {
    this.userHasZoomed = true;
    const plotWidth = this.getPlotWidth(this.magCanvas);
    const [lx0, lx1] = [Math.log10(this.xDomain[0]), Math.log10(this.xDomain[1])];
    const logShift = (dx / plotWidth) * (lx1 - lx0);
    this.xDomain = [Math.pow(10, lx0 - logShift), Math.pow(10, lx1 - logShift)];
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

    // Suppress unused variable warnings
    void width;
    void height;
  }

  private computeDefaultDomains(): void {
    if (this.datasets.length === 0) return;

    // X domain: use fixed domain if set, otherwise compute from data
    if (this.fixedXDomain) {
      this.xDomain = this.fixedXDomain;
    } else {
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
