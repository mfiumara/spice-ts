import { GrowableBuffer } from './buffer.js';
import type { TransientDataset, ACDataset } from './types.js';

interface StreamingStep {
  time: number;
  voltages: Map<string, number>;
  currents: Map<string, number>;
}

interface ACStreamingStep {
  frequency: number;
  voltages: Map<string, { magnitude: number; phase: number }>;
  currents: Map<string, { magnitude: number; phase: number }>;
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

/**
 * Consumes an async stream of AC analysis points and accumulates
 * frequency/magnitude/phase data into growable buffers.
 */
export class ACStreamingController {
  private freqBuffer = new GrowableBuffer();
  private magBuffers = new Map<string, GrowableBuffer>();
  private phaseBuffers = new Map<string, GrowableBuffer>();
  private signals: string[];
  private onData: () => void;
  private running = false;

  constructor(signals: string[], onData: () => void) {
    this.signals = signals;
    this.onData = onData;
    for (const name of signals) {
      this.magBuffers.set(name, new GrowableBuffer());
      this.phaseBuffers.set(name, new GrowableBuffer());
    }
  }

  async consume(stream: AsyncIterable<ACStreamingStep>): Promise<void> {
    this.running = true;
    let count = 0;
    for await (const step of stream) {
      if (!this.running) break;

      this.freqBuffer.push(step.frequency);
      for (const name of this.signals) {
        const phasor = step.voltages.get(name) ?? step.currents.get(name);
        const mag = phasor ? 20 * Math.log10(Math.max(phasor.magnitude, 1e-30)) : -600;
        const phase = phasor ? phasor.phase : 0;
        this.magBuffers.get(name)!.push(mag);
        this.phaseBuffers.get(name)!.push(phase);
      }
      this.onData();

      if (++count % 50 === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
    this.running = false;
  }

  stop(): void { this.running = false; }
  isRunning(): boolean { return this.running; }

  getDataset(): ACDataset {
    const frequencies = Array.from(this.freqBuffer.toArray());
    const magnitudes = new Map<string, number[]>();
    const phases = new Map<string, number[]>();
    for (const name of this.signals) {
      magnitudes.set(name, Array.from(this.magBuffers.get(name)!.toArray()));
      phases.set(name, Array.from(this.phaseBuffers.get(name)!.toArray()));
    }
    return { frequencies, magnitudes, phases, label: '' };
  }

  clear(): void {
    this.freqBuffer.clear();
    for (const buf of this.magBuffers.values()) buf.clear();
    for (const buf of this.phaseBuffers.values()) buf.clear();
  }
}
