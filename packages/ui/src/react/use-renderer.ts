import { useRef, useEffect, useCallback } from 'react';

/**
 * Shared hook for managing a canvas element with DPI scaling and resize observation.
 * Returns a ref callback to attach to the canvas, and the current canvas element.
 */
export function useCanvas(onResize?: (canvas: HTMLCanvasElement) => void) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  const refCallback = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      // Cleanup old observer
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }

      canvasRef.current = canvas;

      if (canvas) {
        const updateSize = () => {
          const dpr = window.devicePixelRatio || 1;
          const rect = canvas.getBoundingClientRect();
          canvas.width = rect.width * dpr;
          canvas.height = rect.height * dpr;
          onResize?.(canvas);
        };

        updateSize();
        observerRef.current = new ResizeObserver(updateSize);
        observerRef.current.observe(canvas);
      }
    },
    [onResize],
  );

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
    };
  }, []);

  return { refCallback, canvasRef };
}
