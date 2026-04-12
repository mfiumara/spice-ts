import { describe, it, expect, vi } from 'vitest';
import { StreamingController } from './streaming.js';

// Helper: create an async generator that yields TransientStep-like objects
async function* mockStream(steps: { time: number; voltages: Map<string, number> }[]) {
  for (const step of steps) {
    yield step;
  }
}

describe('StreamingController', () => {
  it('collects streaming data into datasets', async () => {
    const onData = vi.fn();
    const controller = new StreamingController(['out'], onData);

    const steps = [
      { time: 0, voltages: new Map([['out', 0]]), currents: new Map() },
      { time: 1e-3, voltages: new Map([['out', 2.5]]), currents: new Map() },
      { time: 2e-3, voltages: new Map([['out', 5]]), currents: new Map() },
    ];

    await controller.consume(mockStream(steps));

    // onData should have been called at least once
    expect(onData).toHaveBeenCalled();

    const dataset = controller.getDataset();
    expect(dataset.time.length).toBe(3);
    expect(dataset.signals.get('out')!.length).toBe(3);
    expect(dataset.signals.get('out')![2]).toBe(5);
  });

  it('stop() halts consumption', async () => {
    const onData = vi.fn();
    const controller = new StreamingController(['out'], onData);

    // Stream that yields a few steps then pauses — allows stop() to be called
    async function* stoppableStream() {
      let t = 0;
      while (true) {
        yield { time: t, voltages: new Map([['out', t]]), currents: new Map<string, number>() };
        t += 1e-3;
        // Yield to the event loop so stop() can be called
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    const promise = controller.consume(stoppableStream());
    // Stop after a tick
    await new Promise((r) => setTimeout(r, 10));
    controller.stop();
    await promise;

    expect(controller.getDataset().time.length).toBeGreaterThan(0);
  });

  it('clear() resets buffers', async () => {
    const controller = new StreamingController(['out'], vi.fn());
    const steps = [
      { time: 0, voltages: new Map([['out', 1]]), currents: new Map() },
    ];
    await controller.consume(mockStream(steps));
    expect(controller.getDataset().time.length).toBe(1);

    controller.clear();
    expect(controller.getDataset().time.length).toBe(0);
  });
});
