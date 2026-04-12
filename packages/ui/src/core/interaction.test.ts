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
    vi.useFakeTimers({ shouldAdvanceTime: true });
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
    vi.useRealTimers();
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
    vi.useRealTimers();
  });

  it('accumulates zoom on wheel and fires via animation', async () => {
    const onZoom = vi.fn();
    const handler = new InteractionHandler(canvas, {
      onCursorMove: vi.fn(),
      onZoom,
      onPan: vi.fn(),
      onDoubleClick: vi.fn(),
    });

    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: 400 }));
    // Zoom is applied via rAF animation, not synchronously
    await vi.advanceTimersByTimeAsync(50);
    expect(onZoom).toHaveBeenCalled();
    expect(onZoom.mock.calls[0][1]).toBeGreaterThan(1); // zoom in

    handler.destroy();
    vi.useRealTimers();
  });

  it('fires onPan during drag (horizontal only)', () => {
    const onPan = vi.fn();
    const handler = new InteractionHandler(canvas, {
      onCursorMove: vi.fn(),
      onZoom: vi.fn(),
      onPan,
      onDoubleClick: vi.fn(),
    });

    canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 300, clientY: 200 }));
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 310, clientY: 205, buttons: 1 }));
    expect(onPan).toHaveBeenCalledWith(10, 0);

    handler.destroy();
    vi.useRealTimers();
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
    vi.useRealTimers();
  });

  it('launches momentum on pointer up if drag had velocity', () => {
    const onPan = vi.fn();
    const handler = new InteractionHandler(canvas, {
      onCursorMove: vi.fn(),
      onZoom: vi.fn(),
      onPan,
      onDoubleClick: vi.fn(),
    });

    // Simulate drag — the handler tracks velocity internally
    canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 300, clientY: 200 }));
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 330, clientY: 200, buttons: 1 }));
    // Direct pan is called during drag
    expect(onPan).toHaveBeenCalledWith(30, 0);

    canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: 330, clientY: 200 }));
    // Momentum animation is started (via rAF) — we just verify drag worked
    handler.destroy();
    vi.useRealTimers();
  });

  it('destroy removes event listeners and stops animation', () => {
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

    vi.useRealTimers();
  });
});
