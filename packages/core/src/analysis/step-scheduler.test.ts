import { describe, expect, it, vi } from 'vitest';
import {
  scheduleStepTasks,
  type StepTaskExecutor,
  type StepTaskExecutorFactory,
} from './step-scheduler.js';

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (predicate()) return;
    await flushMicrotasks();
  }
  throw new Error('Condition did not become true');
}

describe('scheduleStepTasks', () => {
  it('bounds executions, reports actual completion order, and returns index order', async () => {
    const controls = Array.from({ length: 4 }, () => deferred<string>());
    const started: number[] = [];
    const completions: number[] = [];
    const disposals: Array<ReturnType<typeof vi.fn>> = [];
    let active = 0;
    let peakActive = 0;

    const factory: StepTaskExecutorFactory<string, string> = {
      create: vi.fn((workerIndex: number): StepTaskExecutor<string, string> => {
        const dispose = vi.fn();
        disposals[workerIndex] = dispose;
        return {
          async execute(_task, index) {
            started.push(index);
            active++;
            peakActive = Math.max(peakActive, active);
            try {
              return await controls[index].promise;
            } finally {
              active--;
            }
          },
          cancel: vi.fn(),
          dispose,
        };
      }),
    };

    const scheduled = scheduleStepTasks(['a', 'b', 'c', 'd'], factory, {
      maxWorkers: 2,
      onComplete: ({ index }) => completions.push(index),
    });

    await flushMicrotasks();
    expect(started).toEqual([0, 1]);

    controls[1].resolve('result-b');
    await waitUntil(() => completions.length === 1);
    expect(completions).toEqual([1]);
    expect(started).toEqual([0, 1, 2]);

    controls[2].resolve('result-c');
    await waitUntil(() => completions.length === 2);
    controls[3].resolve('result-d');
    await waitUntil(() => completions.length === 3);
    controls[0].resolve('result-a');

    await expect(scheduled).resolves.toEqual([
      'result-a',
      'result-b',
      'result-c',
      'result-d',
    ]);
    expect(completions).toEqual([1, 2, 3, 0]);
    expect(peakActive).toBe(2);
    expect(factory.create).toHaveBeenCalledTimes(2);
    expect(disposals).toHaveLength(2);
    expect(disposals.every(dispose => dispose.mock.calls.length === 1)).toBe(true);
  });

  it('clamps maxWorkers to one and to the task count', async () => {
    const run = async (maxWorkers: number, taskCount: number) => {
      const create = vi.fn((): StepTaskExecutor<number, number> => ({
        execute: async task => task * 2,
        cancel: vi.fn(),
        dispose: vi.fn(),
      }));
      const results = await scheduleStepTasks(
        Array.from({ length: taskCount }, (_, index) => index),
        { create },
        { maxWorkers },
      );
      return { create, results };
    };

    const belowRange = await run(0, 3);
    expect(belowRange.create).toHaveBeenCalledTimes(1);
    expect(belowRange.results).toEqual([0, 2, 4]);

    const aboveRange = await run(99, 2);
    expect(aboveRange.create).toHaveBeenCalledTimes(2);
    expect(aboveRange.results).toEqual([0, 2]);
  });

  it('returns an empty result without creating executors for no tasks', async () => {
    const create = vi.fn();

    await expect(scheduleStepTasks([], { create }, { maxWorkers: 4 })).resolves.toEqual([]);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects on the first task error and cancels every in-flight executor', async () => {
    const controls = [deferred<string>(), deferred<string>(), deferred<string>()];
    const started: number[] = [];
    const executors: Array<{
      cancel: ReturnType<typeof vi.fn>;
      dispose: ReturnType<typeof vi.fn>;
    }> = [];
    const failure = new Error('task failed');

    const factory: StepTaskExecutorFactory<string, string> = {
      create(workerIndex) {
        const cancel = vi.fn();
        const dispose = vi.fn();
        executors[workerIndex] = { cancel, dispose };
        return {
          execute: async (_task, index) => {
            started.push(index);
            return controls[index].promise;
          },
          cancel,
          dispose,
        };
      },
    };

    const scheduled = scheduleStepTasks(['a', 'b', 'c'], factory, { maxWorkers: 2 });
    await flushMicrotasks();
    controls[1].reject(failure);

    await expect(scheduled).rejects.toBe(failure);
    expect(started).toEqual([0, 1]);
    for (const executor of executors) {
      expect(executor.cancel).toHaveBeenCalledOnce();
      expect(executor.cancel).toHaveBeenCalledWith(failure);
      expect(executor.dispose).toHaveBeenCalledOnce();
    }
  });

  it('rejects with the abort reason and cancels all in-flight work', async () => {
    const controls = [deferred<number>(), deferred<number>()];
    const executors: Array<{
      cancel: ReturnType<typeof vi.fn>;
      dispose: ReturnType<typeof vi.fn>;
    }> = [];
    const controller = new AbortController();
    const abortReason = new Error('stop requested');

    const scheduled = scheduleStepTasks([10, 20], {
      create(workerIndex) {
        const cancel = vi.fn();
        const dispose = vi.fn();
        executors[workerIndex] = { cancel, dispose };
        return {
          execute: async (_task, index) => controls[index].promise,
          cancel,
          dispose,
        };
      },
    }, { maxWorkers: 2, signal: controller.signal });

    await flushMicrotasks();
    controller.abort(abortReason);

    await expect(scheduled).rejects.toBe(abortReason);
    for (const executor of executors) {
      expect(executor.cancel).toHaveBeenCalledWith(abortReason);
      expect(executor.dispose).toHaveBeenCalledOnce();
    }
  });
});
