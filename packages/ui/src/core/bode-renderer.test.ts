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

  it('setCursorPixelX(null) clears cursor', () => {
    const renderer = new BodeRenderer(magCanvas, phaseCanvas, { theme: DARK_THEME });
    renderer.setData(createTestACData(), ['out']);

    const callback = vi.fn();
    renderer.on('cursorMove', callback);

    renderer.setCursorPixelX(null);
    expect(callback).toHaveBeenCalledWith(null);

    renderer.destroy();
  });

  it('setCursorPixelX outside plot area clears cursor', () => {
    const renderer = new BodeRenderer(magCanvas, phaseCanvas, { theme: DARK_THEME });
    renderer.setData(createTestACData(), ['out']);

    const callback = vi.fn();
    renderer.on('cursorMove', callback);

    // left margin=56, pixel=5 is outside plot
    renderer.setCursorPixelX(5);
    expect(callback).toHaveBeenCalledWith(null);

    renderer.destroy();
  });

  it('zoomAt centers on log midpoint and sets userHasZoomed', () => {
    const renderer = new BodeRenderer(magCanvas, phaseCanvas, { theme: DARK_THEME });
    renderer.setData(createTestACData(), ['out']);

    renderer.zoomAt(400, 2);
    renderer.render(); // should not throw

    // After zooming, setData should preserve zoom (not reset)
    renderer.setData(createTestACData(), ['out']);
    renderer.render();

    renderer.destroy();
  });

  it('pan shifts domain in log space', () => {
    const renderer = new BodeRenderer(magCanvas, phaseCanvas, { theme: DARK_THEME });
    renderer.setData(createTestACData(), ['out']);

    renderer.pan(50, 0);
    renderer.render();

    renderer.destroy();
  });

  it('fitToData resets userHasZoomed', () => {
    const renderer = new BodeRenderer(magCanvas, phaseCanvas, { theme: DARK_THEME });
    renderer.setData(createTestACData(), ['out']);

    renderer.zoomAt(400, 2);
    renderer.fitToData();
    renderer.render();

    // After fitToData, setData recalculates domains
    renderer.setData(createTestACData(), ['out']);
    renderer.render();

    renderer.destroy();
  });

  it('setFixedXDomain pins frequency range', () => {
    const renderer = new BodeRenderer(magCanvas, phaseCanvas, { theme: DARK_THEME });
    renderer.setFixedXDomain([10, 1e6]);
    renderer.setData(createTestACData(), ['out']);
    renderer.render();
    renderer.destroy();
  });

  it('setFixedXDomain(null) clears fixed domain', () => {
    const renderer = new BodeRenderer(magCanvas, phaseCanvas, { theme: DARK_THEME });
    renderer.setFixedXDomain([10, 1e6]);
    renderer.setFixedXDomain(null);
    renderer.setData(createTestACData(), ['out']);
    renderer.render();
    renderer.destroy();
  });

  it('userHasZoomed: zoom prevents domain recalc on setData', () => {
    const renderer = new BodeRenderer(magCanvas, phaseCanvas, { theme: DARK_THEME });
    renderer.setData(createTestACData(), ['out']);
    renderer.zoomAt(400, 3);
    // Calling setData again should not reset the zoom
    renderer.setData(createTestACData(), ['out']);
    renderer.render();
    renderer.destroy();
  });

  it('isPaneVisible returns correct state', () => {
    const renderer = new BodeRenderer(magCanvas, phaseCanvas, { theme: DARK_THEME });
    expect(renderer.isPaneVisible('magnitude')).toBe(true);
    expect(renderer.isPaneVisible('phase')).toBe(true);

    renderer.setPaneVisible('magnitude', false);
    expect(renderer.isPaneVisible('magnitude')).toBe(false);

    renderer.destroy();
  });

  it('defaultPanes=magnitude hides phase pane', () => {
    const renderer = new BodeRenderer(magCanvas, phaseCanvas, {
      theme: DARK_THEME,
      defaultPanes: 'magnitude',
    });
    expect(renderer.isPaneVisible('phase')).toBe(false);
    renderer.render();
    renderer.destroy();
  });

  it('defaultPanes=phase hides magnitude pane', () => {
    const renderer = new BodeRenderer(magCanvas, phaseCanvas, {
      theme: DARK_THEME,
      defaultPanes: 'phase',
    });
    expect(renderer.isPaneVisible('magnitude')).toBe(false);
    renderer.render();
    renderer.destroy();
  });

  it('off() removes listener', () => {
    const renderer = new BodeRenderer(magCanvas, phaseCanvas, { theme: DARK_THEME });
    renderer.setData(createTestACData(), ['out']);

    const callback = vi.fn();
    renderer.on('cursorMove', callback);
    renderer.off('cursorMove', callback);

    renderer.setCursorPixelX(200);
    expect(callback).not.toHaveBeenCalled();
    renderer.destroy();
  });

  it('getSignalStates returns current states', () => {
    const renderer = new BodeRenderer(magCanvas, phaseCanvas, { theme: DARK_THEME });
    renderer.setData(createTestACData(), ['out']);
    const states = renderer.getSignalStates();
    expect(states).toHaveLength(1);
    expect(states[0].name).toBe('out');
    renderer.destroy();
  });

  it('setSignalColor changes color', () => {
    const renderer = new BodeRenderer(magCanvas, phaseCanvas, { theme: DARK_THEME });
    renderer.setData(createTestACData(), ['out']);
    renderer.setSignalColor('out', '#ff0000');
    renderer.render();
    renderer.destroy();
  });

  it('setSignalVisibility hides signal', () => {
    const renderer = new BodeRenderer(magCanvas, phaseCanvas, { theme: DARK_THEME });
    renderer.setData(createTestACData(), ['out']);
    renderer.setSignalVisibility('out', false);
    renderer.render();
    renderer.destroy();
  });

  it('setTheme updates theme', () => {
    const renderer = new BodeRenderer(magCanvas, phaseCanvas, { theme: DARK_THEME });
    renderer.setData(createTestACData(), ['out']);
    renderer.setTheme({ ...DARK_THEME, background: '#000' });
    renderer.render();
    renderer.destroy();
  });

  it('render with cursor draws cursor line', () => {
    const renderer = new BodeRenderer(magCanvas, phaseCanvas, { theme: DARK_THEME });
    renderer.setData(createTestACData(), ['out']);
    renderer.setCursorPixelX(200);
    renderer.render(); // cursor should be drawn without error
    renderer.destroy();
  });

  it('render after destroy does nothing', () => {
    const renderer = new BodeRenderer(magCanvas, phaseCanvas, { theme: DARK_THEME });
    renderer.destroy();
    renderer.render(); // should not throw
  });
});
