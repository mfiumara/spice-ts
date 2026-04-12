import { useRef, useEffect, useCallback, type CSSProperties } from 'react';
import { TransientRenderer } from '../core/renderer.js';
import { resolveTheme } from '../core/theme.js';
import { normalizeTransientData } from '../core/data.js';
import { InteractionHandler } from '../core/interaction.js';
import type { ThemeConfig, CursorState } from '../core/types.js';
import { useCanvas } from './use-renderer.js';

export interface TransientPlotHandle {
  fitToData(): void;
}

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
  /** Ref to access imperative methods like fitToData(). */
  handleRef?: React.MutableRefObject<TransientPlotHandle | null>;
  /** Fixed x-axis domain [min, max] in seconds. Useful for streaming. */
  xDomain?: [number, number];
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
  handleRef,
  xDomain,
}: TransientPlotProps) {
  const rendererRef = useRef<TransientRenderer | null>(null);
  const interactionRef = useRef<InteractionHandler | null>(null);
  const resolvedTheme = resolveTheme(theme);

  const handleResize = useCallback(
    (_canvas: HTMLCanvasElement) => {
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

        if (xDomain) {
          renderer.setFixedXDomain(xDomain);
        }

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

        if (handleRef) {
          handleRef.current = {
            fitToData() {
              renderer.fitToData();
              renderer.render();
            },
          };
        }

        renderer.render();
      }
    },
    [data, signals, resolvedTheme, colors, onCursorMove, refCallback, handleRef, xDomain],
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
