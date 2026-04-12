import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransientRenderer } from './renderer.js';
import { DARK_THEME } from './theme.js';
import type { TransientDataset } from './types.js';

function createTestCanvas(width = 800, height = 400): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  // getBoundingClientRect is not available in jsdom
  canvas.getBoundingClientRect = () => ({
    x: 0, y: 0, width, height, top: 0, left: 0, right: width, bottom: height, toJSON() {},
  });
  return canvas;
}

function createTestData(): TransientDataset[] {
  const time = [0, 1e-3, 2e-3, 3e-3, 4e-3, 5e-3];
  const signals = new Map<string, number[]>();
  signals.set('out', [0, 1, 2, 3, 4, 5]);
  signals.set('in', [5, 5, 5, 5, 5, 5]);
  return [{ time, signals, label: '' }];
}

describe('TransientRenderer', () => {
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    canvas = createTestCanvas();
  });

  it('constructs without error', () => {
    const renderer = new TransientRenderer(canvas, { theme: DARK_THEME });
    expect(renderer).toBeDefined();
    renderer.destroy();
  });

  it('setData and render without error', () => {
    const renderer = new TransientRenderer(canvas, { theme: DARK_THEME });
    renderer.setData(createTestData(), ['out', 'in']);
    renderer.render();
    renderer.destroy();
  });

  it('emits cursorMove events', () => {
    const renderer = new TransientRenderer(canvas, { theme: DARK_THEME });
    renderer.setData(createTestData(), ['out']);

    const callback = vi.fn();
    renderer.on('cursorMove', callback);

    // Simulate a cursor update at pixel position
    renderer.setCursorPixelX(200);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        x: expect.any(Number),
        pixelX: 200,
        values: expect.any(Array),
      }),
    );

    renderer.destroy();
  });

  it('setCursorPixelX(null) clears cursor', () => {
    const renderer = new TransientRenderer(canvas, { theme: DARK_THEME });
    renderer.setData(createTestData(), ['out']);

    const callback = vi.fn();
    renderer.on('cursorMove', callback);

    renderer.setCursorPixelX(null);
    expect(callback).toHaveBeenCalledWith(null);

    renderer.destroy();
  });

  it('fitToData resets zoom to show all data', () => {
    const renderer = new TransientRenderer(canvas, { theme: DARK_THEME });
    renderer.setData(createTestData(), ['out']);
    // zoom in
    renderer.zoomAt(400, 2);
    renderer.fitToData();
    renderer.render();
    renderer.destroy();
  });

  it('setSignalVisibility hides/shows signals', () => {
    const renderer = new TransientRenderer(canvas, { theme: DARK_THEME });
    renderer.setData(createTestData(), ['out', 'in']);
    renderer.setSignalVisibility('out', false);
    renderer.render(); // should not throw even with hidden signal
    renderer.destroy();
  });

  it('destroy cleans up', () => {
    const renderer = new TransientRenderer(canvas, { theme: DARK_THEME });
    renderer.destroy();
    // Calling render after destroy should not throw
    renderer.render();
  });
});
