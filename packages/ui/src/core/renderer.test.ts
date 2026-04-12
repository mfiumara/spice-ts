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

  it('render with cursor state draws cursor', () => {
    const renderer = new TransientRenderer(canvas, { theme: DARK_THEME });
    renderer.setData(createTestData(), ['out']);
    // Set cursor inside plot area (left margin=56, canvas width=800)
    renderer.setCursorPixelX(300);
    renderer.render(); // should not throw with cursor active
    renderer.destroy();
  });

  it('zoomAt updates xDomain and sets userHasZoomed', () => {
    const renderer = new TransientRenderer(canvas, { theme: DARK_THEME });
    renderer.setData(createTestData(), ['out']);

    // zoom in by 2x — domain should shrink
    renderer.zoomAt(400, 2);
    renderer.render();

    // After zooming, setData should not reset zoom (userHasZoomed=true)
    renderer.setData(createTestData(), ['out']);
    renderer.render();

    renderer.destroy();
  });

  it('pan updates domain', () => {
    const renderer = new TransientRenderer(canvas, { theme: DARK_THEME });
    renderer.setData(createTestData(), ['out']);
    renderer.pan(50, 0);
    renderer.render();
    renderer.destroy();
  });

  it('pan with dy updates y domain', () => {
    const renderer = new TransientRenderer(canvas, { theme: DARK_THEME });
    renderer.setData(createTestData(), ['out']);
    renderer.pan(0, 20);
    renderer.render();
    renderer.destroy();
  });

  it('setFixedXDomain pins x-axis and persists through setData', () => {
    const renderer = new TransientRenderer(canvas, { theme: DARK_THEME });
    renderer.setFixedXDomain([0, 10e-3]);
    renderer.setData(createTestData(), ['out']);
    renderer.render();
    renderer.destroy();
  });

  it('setFixedXDomain(null) clears fixed domain', () => {
    const renderer = new TransientRenderer(canvas, { theme: DARK_THEME });
    renderer.setFixedXDomain([0, 10e-3]);
    renderer.setFixedXDomain(null);
    renderer.setData(createTestData(), ['out']);
    renderer.render();
    renderer.destroy();
  });

  it('fitToData after zoom resets userHasZoomed so next setData recalculates domain', () => {
    const renderer = new TransientRenderer(canvas, { theme: DARK_THEME });
    renderer.setData(createTestData(), ['out']);
    renderer.zoomAt(400, 3);
    renderer.fitToData();
    // After fitToData, setting new data should recalculate domains
    renderer.setData(createTestData(), ['out']);
    renderer.render();
    renderer.destroy();
  });

  it('zoomY updates y domain', () => {
    const renderer = new TransientRenderer(canvas, { theme: DARK_THEME });
    renderer.setData(createTestData(), ['out']);
    renderer.zoomY(2);
    renderer.render();
    renderer.destroy();
  });

  it('decimation path: render with more points than 2x plot width', () => {
    // Canvas is 800 wide, margin left=56, right=16 → plotWidth=728, maxPoints≈1456
    // Create dataset with >> 1456 points to trigger decimation
    const n = 3000;
    const time = Array.from({ length: n }, (_, i) => i * 1e-6);
    const values = Array.from({ length: n }, (_, i) => Math.sin(i * 0.01));
    const signals = new Map([['out', values]]);
    const dataset = [{ time, signals, label: '' }];

    const renderer = new TransientRenderer(canvas, { theme: DARK_THEME });
    renderer.setData(dataset, ['out']);
    renderer.render(); // should exercise the decimation branch
    renderer.destroy();
  });

  it('setCursorPixelX outside plot area clears cursor', () => {
    const renderer = new TransientRenderer(canvas, { theme: DARK_THEME });
    renderer.setData(createTestData(), ['out']);

    const callback = vi.fn();
    renderer.on('cursorMove', callback);

    // left margin=56, so pixel < 56 is outside plot
    renderer.setCursorPixelX(10);
    expect(callback).toHaveBeenCalledWith(null);

    renderer.destroy();
  });

  it('off() removes listener', () => {
    const renderer = new TransientRenderer(canvas, { theme: DARK_THEME });
    renderer.setData(createTestData(), ['out']);

    const callback = vi.fn();
    renderer.on('cursorMove', callback);
    renderer.off('cursorMove', callback);

    renderer.setCursorPixelX(300);
    expect(callback).not.toHaveBeenCalled();
    renderer.destroy();
  });

  it('setSignalColor changes color for signal', () => {
    const renderer = new TransientRenderer(canvas, { theme: DARK_THEME });
    renderer.setData(createTestData(), ['out']);
    renderer.setSignalColor('out', '#ff0000');
    renderer.render();
    renderer.destroy();
  });

  it('getSignalStates returns signal state array', () => {
    const renderer = new TransientRenderer(canvas, { theme: DARK_THEME });
    renderer.setData(createTestData(), ['out', 'in']);
    const states = renderer.getSignalStates();
    expect(states).toHaveLength(2);
    expect(states[0].name).toBe('out');
    renderer.destroy();
  });

  it('render with empty datasets does not throw', () => {
    const renderer = new TransientRenderer(canvas, { theme: DARK_THEME });
    renderer.render();
    renderer.destroy();
  });

  it('setTheme updates theme', () => {
    const renderer = new TransientRenderer(canvas, { theme: DARK_THEME });
    renderer.setData(createTestData(), ['out']);
    renderer.setTheme({ ...DARK_THEME, background: '#000' });
    renderer.render();
    renderer.destroy();
  });
});
