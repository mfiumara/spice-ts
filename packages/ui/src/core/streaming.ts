import { GrowableBuffer } from './buffer.js';
import type { TransientDataset } from './types.js';

interface StreamingStep {
  time: number;
  voltages: Map<string, number>;
  currents: Map<string, number>;
}

/**
 * Consumes an async stream of simulation steps and accumulates data
 * into growable buffers. Calls onData after each step so the renderer
 * can schedule a repaint.
 */
export class StreamingController {
  private timeBuffer = new GrowableBuffer();
  private signalBuffers = new Map<string, GrowableBuffer>();
  private signals: string[];
  private onData: () => void;
  private running = false;

  constructor(signals: string[], onData: () => void) {
    this.signals = signals;
    this.onData = onData;
    for (const name of signals) {
      this.signalBuffers.set(name, new GrowableBuffer());
    }
  }

  /** Consume an async iterator of streaming steps. Resolves when done or stopped. */
  async consume(stream: AsyncIterable<StreamingStep>): Promise<void> {
    this.running = true;
    let count = 0;
    for await (const step of stream) {
      if (!this.running) break;

      this.timeBuffer.push(step.time);
      for (const name of this.signals) {
        const buf = this.signalBuffers.get(name)!;
        const value = step.voltages.get(name) ?? step.currents.get(name) ?? 0;
        buf.push(value);
      }
      this.onData();

      // Yield to the event loop every N steps so requestAnimationFrame
      // can fire and update the display. Without this, the for-await loop
      // runs entirely in microtasks and never gives the browser a paint frame.
      if (++count % 200 === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
    this.running = false;
  }

  /** Stop consuming the stream. */
  stop(): void {
    this.running = false;
  }

  /** Whether the stream is actively being consumed. */
  isRunning(): boolean {
    return this.running;
  }

  /** Get the accumulated data as a TransientDataset. */
  getDataset(): TransientDataset {
    const time = Array.from(this.timeBuffer.toArray());
    const signals = new Map<string, number[]>();
    for (const [name, buf] of this.signalBuffers) {
      signals.set(name, Array.from(buf.toArray()));
    }
    return { time, signals, label: '' };
  }

  /** Clear all accumulated data. */
  clear(): void {
    this.timeBuffer.clear();
    for (const buf of this.signalBuffers.values()) {
      buf.clear();
    }
  }
}
