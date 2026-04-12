import { describe, it, expect, vi } from 'vitest';
import { StreamingController, ACStreamingController } from './streaming.js';

// Helper: create an async generator that yields TransientStep-like objects
async function* mockStream(steps: { time: number; voltages: Map<string, number>; currents: Map<string, number> }[]) {
  for (const step of steps) {
    yield step;
  }
}

async function* mockACStream(steps: { frequency: number; voltages: Map<string, { magnitude: number; phase: number }>; currents: Map<string, { magnitude: number; phase: number }> }[]) {
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

  it('isRunning() reflects consumption state', async () => {
    const controller = new StreamingController(['out'], vi.fn());
    expect(controller.isRunning()).toBe(false);

    const steps = [{ time: 0, voltages: new Map([['out', 1]]), currents: new Map() }];
    const promise = controller.consume(mockStream(steps));
    await promise;
    expect(controller.isRunning()).toBe(false);
  });

  it('falls back to currents when voltage signal is missing', async () => {
    const onData = vi.fn();
    const controller = new StreamingController(['I(R1)'], onData);
    const steps = [
      {
        time: 0,
        voltages: new Map<string, number>(),
        currents: new Map([['I(R1)', 0.01]]),
      },
    ];
    await controller.consume(mockStream(steps));
    const dataset = controller.getDataset();
    expect(dataset.signals.get('I(R1)')![0]).toBe(0.01);
  });

  it('uses 0 when signal is in neither voltages nor currents', async () => {
    const controller = new StreamingController(['missing'], vi.fn());
    const steps = [
      { time: 0, voltages: new Map<string, number>(), currents: new Map<string, number>() },
    ];
    await controller.consume(mockStream(steps));
    const dataset = controller.getDataset();
    expect(dataset.signals.get('missing')![0]).toBe(0);
  });
});

describe('ACStreamingController', () => {
  it('collects AC streaming data into an ACDataset', async () => {
    const onData = vi.fn();
    const controller = new ACStreamingController(['out'], onData);

    const steps = [
      {
        frequency: 100,
        voltages: new Map([['out', { magnitude: 1.0, phase: 0 }]]),
        currents: new Map(),
      },
      {
        frequency: 1000,
        voltages: new Map([['out', { magnitude: 0.707, phase: -45 }]]),
        currents: new Map(),
      },
      {
        frequency: 10000,
        voltages: new Map([['out', { magnitude: 0.1, phase: -84 }]]),
        currents: new Map(),
      },
    ];

    await controller.consume(mockACStream(steps));

    expect(onData).toHaveBeenCalled();

    const dataset = controller.getDataset();
    expect(dataset.frequencies).toHaveLength(3);
    expect(dataset.frequencies[0]).toBe(100);
    expect(dataset.magnitudes.get('out')).toHaveLength(3);
    expect(dataset.phases.get('out')).toHaveLength(3);
  });

  it('converts magnitude to dB via 20*log10', async () => {
    const controller = new ACStreamingController(['out'], vi.fn());

    // magnitude=1 → 0 dB, magnitude=10 → 20 dB
    const steps = [
      {
        frequency: 100,
        voltages: new Map([['out', { magnitude: 1.0, phase: 0 }]]),
        currents: new Map(),
      },
      {
        frequency: 1000,
        voltages: new Map([['out', { magnitude: 10.0, phase: 0 }]]),
        currents: new Map(),
      },
    ];

    await controller.consume(mockACStream(steps));

    const dataset = controller.getDataset();
    const mags = dataset.magnitudes.get('out')!;
    expect(mags[0]).toBeCloseTo(0, 5);    // 20*log10(1) = 0
    expect(mags[1]).toBeCloseTo(20, 5);   // 20*log10(10) = 20
  });

  it('records phase values correctly', async () => {
    const controller = new ACStreamingController(['out'], vi.fn());

    const steps = [
      {
        frequency: 1000,
        voltages: new Map([['out', { magnitude: 1, phase: -45 }]]),
        currents: new Map(),
      },
    ];

    await controller.consume(mockACStream(steps));
    const dataset = controller.getDataset();
    expect(dataset.phases.get('out')![0]).toBe(-45);
  });

  it('falls back to currents when voltage phasor is missing', async () => {
    const controller = new ACStreamingController(['I(R1)'], vi.fn());

    const steps = [
      {
        frequency: 1000,
        voltages: new Map<string, { magnitude: number; phase: number }>(),
        currents: new Map([['I(R1)', { magnitude: 0.01, phase: -10 }]]),
      },
    ];

    await controller.consume(mockACStream(steps));
    const dataset = controller.getDataset();
    const mags = dataset.magnitudes.get('I(R1)')!;
    // 20*log10(0.01) = -40
    expect(mags[0]).toBeCloseTo(-40, 3);
  });

  it('uses -600 dB when phasor is absent', async () => {
    const controller = new ACStreamingController(['missing'], vi.fn());

    const steps = [
      {
        frequency: 1000,
        voltages: new Map<string, { magnitude: number; phase: number }>(),
        currents: new Map<string, { magnitude: number; phase: number }>(),
      },
    ];

    await controller.consume(mockACStream(steps));
    const dataset = controller.getDataset();
    expect(dataset.magnitudes.get('missing')![0]).toBe(-600);
    expect(dataset.phases.get('missing')![0]).toBe(0);
  });

  it('stop() halts AC consumption', async () => {
    const onData = vi.fn();
    const controller = new ACStreamingController(['out'], onData);

    async function* infiniteACStream() {
      let f = 10;
      while (true) {
        yield {
          frequency: f,
          voltages: new Map([['out', { magnitude: 1, phase: 0 }]]),
          currents: new Map<string, { magnitude: number; phase: number }>(),
        };
        f *= 1.1;
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    const promise = controller.consume(infiniteACStream());
    await new Promise((r) => setTimeout(r, 10));
    controller.stop();
    await promise;

    expect(controller.getDataset().frequencies.length).toBeGreaterThan(0);
    expect(controller.isRunning()).toBe(false);
  });

  it('clear() resets all AC buffers', async () => {
    const controller = new ACStreamingController(['out'], vi.fn());
    const steps = [
      {
        frequency: 100,
        voltages: new Map([['out', { magnitude: 1, phase: 0 }]]),
        currents: new Map(),
      },
    ];

    await controller.consume(mockACStream(steps));
    expect(controller.getDataset().frequencies).toHaveLength(1);

    controller.clear();
    const dataset = controller.getDataset();
    expect(dataset.frequencies).toHaveLength(0);
    expect(dataset.magnitudes.get('out')).toHaveLength(0);
    expect(dataset.phases.get('out')).toHaveLength(0);
  });

  it('isRunning() is false before and after consume', async () => {
    const controller = new ACStreamingController(['out'], vi.fn());
    expect(controller.isRunning()).toBe(false);

    await controller.consume(mockACStream([]));
    expect(controller.isRunning()).toBe(false);
  });
});
