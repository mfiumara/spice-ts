/** Configuration for visual theme colors and fonts. */
export interface ThemeConfig {
  background: string;
  surface: string;
  border: string;
  grid: string;
  text: string;
  textMuted: string;
  cursor: string;
  tooltipBg: string;
  tooltipBorder: string;
  font: string;
  fontSize: number;
}

export interface CursorValue {
  signalId: string;
  label: string;
  value: number;
  unit: string;
  color: string;
}

export interface CursorState {
  x: number;
  pixelX: number;
  values: CursorValue[];
}

export interface SignalConfig {
  name: string;
  color?: string;
  visible?: boolean;
}

export interface TransientDataset {
  time: number[];
  signals: Map<string, number[]>;
  label: string;
}

export interface ACDataset {
  frequencies: number[];
  magnitudes: Map<string, number[]>;
  phases: Map<string, number[]>;
  label: string;
}

export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface RendererEvents {
  cursorMove: (state: CursorState | null) => void;
}

/** A single transient simulation step (duck-type compatible with core's TransientStep). */
export interface StreamingTransientStep {
  time: number;
  voltages: Map<string, number>;
  currents: Map<string, number>;
}

/** A single AC simulation point (duck-type compatible with core's ACPoint). */
export interface StreamingACPoint {
  frequency: number;
  voltages: Map<string, { magnitude: number; phase: number }>;
  currents: Map<string, { magnitude: number; phase: number }>;
}

export const DEFAULT_PALETTE = [
  '#4ade80', '#60a5fa', '#f97316', '#a78bfa',
  '#f472b6', '#facc15', '#2dd4bf', '#fb923c',
] as const;
