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
  /** Fixed x-axis domain [min, max]. Reserved for future use. */
  xDomain?: [number, number];
  /** X-axis label. Default 'Sweep (V)'. */
  xLabel?: string;
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
  xDomain: _xDomain, // reserved for future use — not yet forwarded to renderer
  xLabel = 'Sweep (V)',
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
          onZoom: (pixelX, factor, _shiftKey) => {
            renderer.zoomAt(pixelX, factor);
            renderer.render();
          },
          onPan: (dx, _dy) => {
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
  }, [data, signals, colors]);

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
      <div style={{ textAlign: 'center', fontSize: 11, color: '#666', marginTop: 2 }}>{xLabel}</div>
    </div>
  );
}
