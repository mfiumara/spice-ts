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

    controller.consume(stream as AsyncIterable<Parameters<typeof controller.consume>[0] extends AsyncIterable<infer T> ? T : never>);

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
      {transientData != null && (
        <TransientPlot
          data={transientData}
          signals={signals}
          colors={colors}
          theme={resolvedTheme}
          onCursorMove={setCursor}
          signalVisibility={visibility}
        />
      )}
      {ac != null && !stream && (
        <div style={{ marginTop: transientData != null ? '16px' : 0 }}>
          <BodePlot
            data={ac}
            signals={signals}
            colors={colors}
            theme={resolvedTheme}
            onCursorMove={transientData == null ? setCursor : undefined}
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
