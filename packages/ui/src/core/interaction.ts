export interface InteractionCallbacks {
  /** Called with pixel X on hover, or null on leave. */
  onCursorMove: (pixelX: number | null) => void;
  /** Called on scroll-wheel zoom. factor >1 = zoom in. shiftKey = vertical zoom. */
  onZoom: (pixelX: number, factor: number, shiftKey: boolean) => void;
  /** Called during drag with pixel deltas. */
  onPan: (dx: number, dy: number) => void;
  /** Called on double-click (fit to data). */
  onDoubleClick: () => void;
}

/**
 * Attaches pointer/wheel event listeners to a canvas for zoom, pan, and cursor interaction.
 * Framework-agnostic — works with any HTMLCanvasElement.
 */
export class InteractionHandler {
  private canvas: HTMLCanvasElement;
  private callbacks: InteractionCallbacks;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private destroyed = false;

  private boundPointerMove: (e: PointerEvent) => void;
  private boundPointerDown: (e: PointerEvent) => void;
  private boundPointerUp: (e: PointerEvent) => void;
  private boundPointerLeave: (e: PointerEvent) => void;
  private boundWheel: (e: WheelEvent) => void;
  private boundDblClick: (e: MouseEvent) => void;

  constructor(canvas: HTMLCanvasElement, callbacks: InteractionCallbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks;

    this.boundPointerMove = this.handlePointerMove.bind(this);
    this.boundPointerDown = this.handlePointerDown.bind(this);
    this.boundPointerUp = this.handlePointerUp.bind(this);
    this.boundPointerLeave = this.handlePointerLeave.bind(this);
    this.boundWheel = this.handleWheel.bind(this);
    this.boundDblClick = this.handleDblClick.bind(this);

    canvas.addEventListener('pointermove', this.boundPointerMove);
    canvas.addEventListener('pointerdown', this.boundPointerDown);
    canvas.addEventListener('pointerup', this.boundPointerUp);
    canvas.addEventListener('pointerleave', this.boundPointerLeave);
    canvas.addEventListener('wheel', this.boundWheel, { passive: false });
    canvas.addEventListener('dblclick', this.boundDblClick);
  }

  destroy(): void {
    this.destroyed = true;
    this.canvas.removeEventListener('pointermove', this.boundPointerMove);
    this.canvas.removeEventListener('pointerdown', this.boundPointerDown);
    this.canvas.removeEventListener('pointerup', this.boundPointerUp);
    this.canvas.removeEventListener('pointerleave', this.boundPointerLeave);
    this.canvas.removeEventListener('wheel', this.boundWheel);
    this.canvas.removeEventListener('dblclick', this.boundDblClick);
  }

  private handlePointerMove(e: PointerEvent): void {
    if (this.destroyed) return;

    if (this.dragging && (e.buttons & 1)) {
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.callbacks.onPan(dx, dy);
    } else {
      this.callbacks.onCursorMove(e.clientX);
    }
  }

  private handlePointerDown(e: PointerEvent): void {
    if (this.destroyed) return;
    this.dragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.canvas.setPointerCapture?.(e.pointerId);
  }

  private handlePointerUp(e: PointerEvent): void {
    this.dragging = false;
    this.canvas.releasePointerCapture?.(e.pointerId);
  }

  private handlePointerLeave(_e: PointerEvent): void {
    if (this.destroyed) return;
    this.dragging = false;
    this.callbacks.onCursorMove(null);
  }

  private handleWheel(e: WheelEvent): void {
    if (this.destroyed) return;
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
    this.callbacks.onZoom(e.clientX, zoomFactor, e.shiftKey);
  }

  private handleDblClick(_e: MouseEvent): void {
    if (this.destroyed) return;
    this.callbacks.onDoubleClick();
  }
}
