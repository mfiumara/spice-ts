import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BodeRenderer } from './bode-renderer.js';
import { DARK_THEME } from './theme.js';
import type { ACDataset } from './types.js';

function createTestCanvas(width = 800, height = 300): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getBoundingClientRect = () => ({
    x: 0, y: 0, width, height, top: 0, left: 0, right: width, bottom: height, toJSON() {},
  });
  return canvas;
}

function createTestACData(): ACDataset[] {
  const frequencies = [100, 1000, 10000, 100000, 1000000];
  const magnitudes = new Map([['out', [0, -1, -3, -10, -20]]]);
  const phases = new Map([['out', [0, -10, -45, -75, -85]]]);
  return [{ frequencies, magnitudes, phases, label: '' }];
}

describe('BodeRenderer', () => {
  let magCanvas: HTMLCanvasElement;
  let phaseCanvas: HTMLCanvasElement;

  beforeEach(() => {
    magCanvas = createTestCanvas();
    phaseCanvas = createTestCanvas(800, 200);
  });

  it('constructs without error', () => {
    const renderer = new BodeRenderer(magCanvas, phaseCanvas, { theme: DARK_THEME });
    expect(renderer).toBeDefined();
    renderer.destroy();
  });

  it('setData and render without error', () => {
    const renderer = new BodeRenderer(magCanvas, phaseCanvas, { theme: DARK_THEME });
    renderer.setData(createTestACData(), ['out']);
    renderer.render();
    renderer.destroy();
  });

  it('collapsing magnitude pane still renders phase', () => {
    const renderer = new BodeRenderer(magCanvas, phaseCanvas, { theme: DARK_THEME });
    renderer.setData(createTestACData(), ['out']);
    renderer.setPaneVisible('magnitude', false);
    renderer.render(); // should not throw
    renderer.destroy();
  });

  it('collapsing phase pane still renders magnitude', () => {
    const renderer = new BodeRenderer(magCanvas, phaseCanvas, { theme: DARK_THEME });
    renderer.setData(createTestACData(), ['out']);
    renderer.setPaneVisible('phase', false);
    renderer.render();
    renderer.destroy();
  });

  it('emits cursorMove events', () => {
    const renderer = new BodeRenderer(magCanvas, phaseCanvas, { theme: DARK_THEME });
    renderer.setData(createTestACData(), ['out']);

    const callback = vi.fn();
    renderer.on('cursorMove', callback);

    renderer.setCursorPixelX(200);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        x: expect.any(Number),
        values: expect.any(Array),
      }),
    );

    renderer.destroy();
  });
});
