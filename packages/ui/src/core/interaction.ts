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

const ZOOM_FRICTION = 0.4;
const ZOOM_STOP_THRESHOLD = 0.0005;
const PAN_FRICTION = 0.92;
const PAN_STOP_THRESHOLD = 0.3;

/**
 * Attaches pointer/wheel event listeners to a canvas for zoom, pan, and cursor interaction.
 * Includes smooth zoom animation and momentum panning for a premium feel.
 */
export class InteractionHandler {
  private canvas: HTMLCanvasElement;
  private callbacks: InteractionCallbacks;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private lastDragTime = 0;
  private destroyed = false;

  // Animation state
  private animFrameId = 0;
  private zoomAccumulator = 0;  // accumulated zoom input (log-space)
  private panMomentumX = 0;     // momentum velocity in px/frame
  private animating = false;

  // Drag velocity tracking (exponential moving average)
  private dragVelocityX = 0;

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
    cancelAnimationFrame(this.animFrameId);
    this.canvas.removeEventListener('pointermove', this.boundPointerMove);
    this.canvas.removeEventListener('pointerdown', this.boundPointerDown);
    this.canvas.removeEventListener('pointerup', this.boundPointerUp);
    this.canvas.removeEventListener('pointerleave', this.boundPointerLeave);
    this.canvas.removeEventListener('wheel', this.boundWheel);
    this.canvas.removeEventListener('dblclick', this.boundDblClick);
  }

  private toCanvasX(clientX: number): number {
    const rect = this.canvas.getBoundingClientRect();
    return clientX - rect.left;
  }

  // --- Animation loop ---

  private startAnimation(): void {
    if (this.animating) return;
    this.animating = true;
    this.animFrameId = requestAnimationFrame(this.animate);
  }

  private animate = (): void => {
    if (this.destroyed) { this.animating = false; return; }

    let needsMore = false;

    // Smooth zoom: apply a fraction of the accumulated zoom each frame
    if (Math.abs(this.zoomAccumulator) > ZOOM_STOP_THRESHOLD) {
      const factor = Math.exp(this.zoomAccumulator * (1 - ZOOM_FRICTION));
      this.callbacks.onZoom(0, factor, false);
      this.zoomAccumulator *= ZOOM_FRICTION;
      needsMore = true;
    } else {
      this.zoomAccumulator = 0;
    }

    // Momentum pan: apply decaying velocity
    if (Math.abs(this.panMomentumX) > PAN_STOP_THRESHOLD) {
      this.callbacks.onPan(this.panMomentumX, 0);
      this.panMomentumX *= PAN_FRICTION;
      needsMore = true;
    } else {
      this.panMomentumX = 0;
    }

    if (needsMore) {
      this.animFrameId = requestAnimationFrame(this.animate);
    } else {
      this.animating = false;
    }
  };

  // --- Event handlers ---

  private handlePointerMove(e: PointerEvent): void {
    if (this.destroyed) return;

    if (this.dragging && (e.buttons & 1)) {
      const dx = e.clientX - this.lastX;
      const now = performance.now();
      const dt = now - this.lastDragTime;

      // Track velocity with exponential moving average
      if (dt > 0 && dt < 100) {
        const instantVelocity = dx / dt * 16; // normalize to ~per-frame at 60fps
        this.dragVelocityX = this.dragVelocityX * 0.5 + instantVelocity * 0.5;
      }

      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.lastDragTime = now;

      // Stop any ongoing momentum and apply pan directly
      this.panMomentumX = 0;
      this.callbacks.onPan(dx, 0);
    } else {
      this.callbacks.onCursorMove(this.toCanvasX(e.clientX));
    }
  }

  private handlePointerDown(e: PointerEvent): void {
    if (this.destroyed) return;
    this.dragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.lastDragTime = performance.now();
    this.dragVelocityX = 0;
    this.panMomentumX = 0; // stop any coasting
    this.canvas.setPointerCapture?.(e.pointerId);
  }

  private handlePointerUp(e: PointerEvent): void {
    if (!this.dragging) return;
    this.dragging = false;
    this.canvas.releasePointerCapture?.(e.pointerId);

    // Launch momentum with the tracked drag velocity
    if (Math.abs(this.dragVelocityX) > PAN_STOP_THRESHOLD) {
      this.panMomentumX = this.dragVelocityX;
      this.startAnimation();
    }
    this.dragVelocityX = 0;
  }

  private handlePointerLeave(_e: PointerEvent): void {
    if (this.destroyed) return;
    if (this.dragging) {
      // Don't stop momentum — let it coast
      this.dragging = false;
      if (Math.abs(this.dragVelocityX) > PAN_STOP_THRESHOLD) {
        this.panMomentumX = this.dragVelocityX;
        this.startAnimation();
      }
      this.dragVelocityX = 0;
    }
    this.callbacks.onCursorMove(null);
  }

  private handleWheel(e: WheelEvent): void {
    if (this.destroyed) return;
    e.preventDefault();

    // Horizontal scroll (trackpad swipe) → pan horizontally
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      this.callbacks.onPan(-e.deltaX, 0);
      return;
    }

    // Vertical scroll → accumulate zoom (applied smoothly in animation loop)
    this.zoomAccumulator += e.deltaY * -0.003;
    this.startAnimation();
  }

  private handleDblClick(_e: MouseEvent): void {
    if (this.destroyed) return;
    this.callbacks.onDoubleClick();
  }
}
