import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InteractionHandler } from './interaction.js';

function createTestCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 400;
  canvas.getBoundingClientRect = () => ({
    x: 0, y: 0, width: 800, height: 400, top: 0, left: 0, right: 800, bottom: 400, toJSON() {},
  });
  return canvas;
}

describe('InteractionHandler', () => {
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    canvas = createTestCanvas();
  });

  it('fires onCursorMove on pointermove', () => {
    const onCursor = vi.fn();
    const handler = new InteractionHandler(canvas, {
      onCursorMove: onCursor,
      onZoom: vi.fn(),
      onPan: vi.fn(),
      onDoubleClick: vi.fn(),
    });

    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 200, clientY: 150 }));
    expect(onCursor).toHaveBeenCalledWith(200);

    handler.destroy();
  });

  it('fires onCursorMove(null) on pointerleave', () => {
    const onCursor = vi.fn();
    const handler = new InteractionHandler(canvas, {
      onCursorMove: onCursor,
      onZoom: vi.fn(),
      onPan: vi.fn(),
      onDoubleClick: vi.fn(),
    });

    canvas.dispatchEvent(new PointerEvent('pointerleave'));
    expect(onCursor).toHaveBeenCalledWith(null);

    handler.destroy();
  });

  it('fires onZoom on wheel event', () => {
    const onZoom = vi.fn();
    const handler = new InteractionHandler(canvas, {
      onCursorMove: vi.fn(),
      onZoom,
      onPan: vi.fn(),
      onDoubleClick: vi.fn(),
    });

    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: 400 }));
    expect(onZoom).toHaveBeenCalledWith(400, expect.any(Number), false);

    handler.destroy();
  });

  it('fires onZoom with shiftKey for vertical zoom', () => {
    const onZoom = vi.fn();
    const handler = new InteractionHandler(canvas, {
      onCursorMove: vi.fn(),
      onZoom,
      onPan: vi.fn(),
      onDoubleClick: vi.fn(),
    });

    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: 400, shiftKey: true }));
    expect(onZoom).toHaveBeenCalledWith(400, expect.any(Number), true);

    handler.destroy();
  });

  it('fires onPan during drag', () => {
    const onPan = vi.fn();
    const handler = new InteractionHandler(canvas, {
      onCursorMove: vi.fn(),
      onZoom: vi.fn(),
      onPan,
      onDoubleClick: vi.fn(),
    });

    canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 300, clientY: 200 }));
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 310, clientY: 205, buttons: 1 }));
    expect(onPan).toHaveBeenCalledWith(10, 5);

    handler.destroy();
  });

  it('fires onDoubleClick on dblclick', () => {
    const onDoubleClick = vi.fn();
    const handler = new InteractionHandler(canvas, {
      onCursorMove: vi.fn(),
      onZoom: vi.fn(),
      onPan: vi.fn(),
      onDoubleClick,
    });

    canvas.dispatchEvent(new MouseEvent('dblclick'));
    expect(onDoubleClick).toHaveBeenCalled();

    handler.destroy();
  });

  it('destroy removes event listeners', () => {
    const onCursor = vi.fn();
    const handler = new InteractionHandler(canvas, {
      onCursorMove: onCursor,
      onZoom: vi.fn(),
      onPan: vi.fn(),
      onDoubleClick: vi.fn(),
    });

    handler.destroy();
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 100 }));
    expect(onCursor).not.toHaveBeenCalled();
  });
});
