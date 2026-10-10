/** A transport-neutral executor backed by a browser Worker, worker_thread, or local task. */
export interface StepTaskExecutor<TTask, TResult> {
  /** Execute one task. An executor is never asked to execute two tasks concurrently. */
  execute(task: TTask, index: number): Promise<TResult>;
  /** Stop the currently executing task, if any. */
  cancel(reason: unknown): void | Promise<void>;
  /** Release transport resources. Called exactly once by the scheduler. */
  dispose(): void | Promise<void>;
}

/** Creates executor slots without coupling scheduling to a particular worker runtime. */
export interface StepTaskExecutorFactory<TTask, TResult> {
  create(workerIndex: number): StepTaskExecutor<TTask, TResult> | Promise<StepTaskExecutor<TTask, TResult>>;
}

export interface StepTaskCompletion<TTask, TResult> {
  index: number;
  task: TTask;
  result: TResult;
}

/** Structural subset shared by DOM AbortSignal and Node's AbortSignal. */
export interface StepTaskAbortSignal {
  readonly aborted: boolean;
  readonly reason?: unknown;
  addEventListener(type: 'abort', listener: () => void, options?: { once?: boolean }): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}

export interface StepTaskSchedulerOptions<TTask, TResult> {
  maxWorkers: number;
  signal?: StepTaskAbortSignal;
  onComplete?: (completion: StepTaskCompletion<TTask, TResult>) => void;
}

type TaskOutcome<TResult> =
  | { kind: 'completed'; result: TResult }
  | { kind: 'failed'; error: unknown }
  | { kind: 'stopped' };

function abortReason(signal: StepTaskAbortSignal): unknown {
  if (signal.reason !== undefined) return signal.reason;
  const error = new Error('Step task scheduling aborted');
  error.name = 'AbortError';
  return error;
}

function clampWorkerCount(maxWorkers: number, taskCount: number): number {
  const integral = Math.floor(maxWorkers);
  const lowerBounded = Number.isNaN(integral) ? 1 : Math.max(1, integral);
  return Math.min(taskCount, lowerBounded);
}

async function settleAll(actions: Array<() => void | Promise<void>>): Promise<void> {
  await Promise.allSettled(actions.map(action => Promise.resolve().then(action)));
}

/**
 * Run indexed .step tasks with deterministic result ordering and bounded concurrency.
 *
 * Executors are pooled by slot. Completions are emitted as soon as they occur, while
 * the returned result array is always ordered by the tasks' original zero-based index.
 */
export async function scheduleStepTasks<TTask, TResult>(
  tasks: readonly TTask[],
  factory: StepTaskExecutorFactory<TTask, TResult>,
  options: StepTaskSchedulerOptions<TTask, TResult>,
): Promise<TResult[]> {
  if (tasks.length === 0) return [];

  const workerCount = clampWorkerCount(options.maxWorkers, tasks.length);
  const executors: StepTaskExecutor<TTask, TResult>[] = [];
  const disposalPromises = new Map<StepTaskExecutor<TTask, TResult>, Promise<void>>();
  const results = new Array<TResult>(tasks.length);
  let nextIndex = 0;
  let stopped = false;
  let firstFailure: unknown;
  let resolveStopped!: () => void;
  const stoppedPromise = new Promise<void>(resolve => {
    resolveStopped = resolve;
  });
  let failureCleanup: Promise<void> | undefined;

  const dispose = (executor: StepTaskExecutor<TTask, TResult>): Promise<void> => {
    const existing = disposalPromises.get(executor);
    if (existing) return existing;
    const disposal = Promise.resolve().then(() => executor.dispose());
    disposalPromises.set(executor, disposal);
    return disposal;
  };

  const cleanUpExecutor = async (
    executor: StepTaskExecutor<TTask, TResult>,
    reason: unknown,
  ): Promise<void> => {
    await settleAll([() => executor.cancel(reason)]);
    await settleAll([() => dispose(executor)]);
  };

  const cleanUpFailure = (reason: unknown): Promise<void> => {
    const snapshot = executors.slice();
    return (async () => {
      // Ask every executor to stop before disposing any of them.
      await settleAll(snapshot.map(executor => () => executor.cancel(reason)));
      await settleAll(snapshot.map(executor => () => dispose(executor)));
    })();
  };

  const fail = (reason: unknown): void => {
    if (stopped) return;
    stopped = true;
    firstFailure = reason;
    resolveStopped();
    failureCleanup = cleanUpFailure(reason);
  };

  const onAbort = (): void => fail(abortReason(options.signal!));
  options.signal?.addEventListener('abort', onAbort, { once: true });

  try {
    if (options.signal?.aborted) fail(abortReason(options.signal));

    for (let workerIndex = 0; workerIndex < workerCount && !stopped; workerIndex++) {
      let executor: StepTaskExecutor<TTask, TResult>;
      try {
        executor = await factory.create(workerIndex);
      } catch (error) {
        fail(error);
        break;
      }

      if (stopped) {
        await cleanUpExecutor(executor, firstFailure);
        break;
      }
      executors.push(executor);
    }

    if (!stopped) {
      const runExecutor = async (executor: StepTaskExecutor<TTask, TResult>): Promise<void> => {
        while (!stopped) {
          const index = nextIndex++;
          if (index >= tasks.length) return;
          const task = tasks[index];

          const execution = Promise.resolve()
            .then(() => executor.execute(task, index))
            .then<TaskOutcome<TResult>, TaskOutcome<TResult>>(
              result => ({ kind: 'completed', result }),
              error => ({ kind: 'failed', error }),
            );
          const outcome = await Promise.race<TaskOutcome<TResult>>([
            execution,
            stoppedPromise.then(() => ({ kind: 'stopped' })),
          ]);

          if (outcome.kind === 'stopped') return;
          if (outcome.kind === 'failed') {
            fail(outcome.error);
            return;
          }

          results[index] = outcome.result;
          try {
            options.onComplete?.({ index, task, result: outcome.result });
          } catch (error) {
            fail(error);
            return;
          }
        }
      };

      await Promise.all(executors.map(runExecutor));
    }

    if (stopped) {
      await failureCleanup;
      throw firstFailure;
    }

    // On success, all executions have settled. Dispose every transport slot.
    try {
      await Promise.all(executors.map(dispose));
    } catch (error) {
      if (!stopped) throw error;
    }
    if (stopped) {
      await failureCleanup;
      throw firstFailure;
    }
    return results;
  } finally {
    options.signal?.removeEventListener('abort', onAbort);
  }
}
