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
  /** CSS height. Default 200 per visible pane. */
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
        {magVisible ? '\u25be' : '\u25b8'} Magnitude (dB)
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
        {phaseVisible ? '\u25be' : '\u25b8'} Phase (\u00b0)
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
