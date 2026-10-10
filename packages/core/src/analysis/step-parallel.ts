import type { SimulationResult, StepResult } from '../results.js';
import {
  ACResult, DCResult, DCSweepResult, TransferFunctionResult, TransientResult,
} from '../results.js';
import type {
  ConvergenceTelemetry, SimulationOptions, SimulationWarning, StepAnalysis,
  StepWorker, StepWorkerTask,
} from '../types.js';
import { generateStepValues } from './step.js';
import { scheduleStepTasks } from './step-scheduler.js';

interface PlainResult {
  voltageMap?: Map<string, number>;
  currentMap?: Map<string, number>;
  voltageArrays?: Map<string, unknown>;
  currentArrays?: Map<string, unknown>;
  time?: number[];
  frequencies?: number[];
  sweepValues?: Float64Array;
  outputNode?: string;
  outputSource?: string;
  inputSource?: string;
  transfer?: number;
  inputResistance?: number;
  outputResistance?: number;
}

function reviveStepResult(step: StepResult): StepResult {
  const plain = step as unknown as {
    dc?: PlainResult; transient?: PlainResult; ac?: PlainResult; dcSweep?: PlainResult;
    transferFunction?: PlainResult;
  };
  return {
    paramName: step.paramName,
    paramValue: step.paramValue,
    dc: plain.dc && !(plain.dc instanceof DCResult)
      ? new DCResult(plain.dc.voltageMap!, plain.dc.currentMap!) : step.dc,
    transient: plain.transient && !(plain.transient instanceof TransientResult)
      ? new TransientResult(
        plain.transient.time!,
        plain.transient.voltageArrays as Map<string, number[]>,
        plain.transient.currentArrays as Map<string, number[]>,
      ) : step.transient,
    ac: plain.ac && !(plain.ac instanceof ACResult)
      ? new ACResult(
        plain.ac.frequencies!,
        plain.ac.voltageArrays as Map<string, { magnitude: number; phase: number }[]>,
        plain.ac.currentArrays as Map<string, { magnitude: number; phase: number }[]>,
      ) : step.ac,
    dcSweep: plain.dcSweep && !(plain.dcSweep instanceof DCSweepResult)
      ? new DCSweepResult(
        plain.dcSweep.sweepValues!,
        plain.dcSweep.voltageArrays as Map<string, Float64Array>,
        plain.dcSweep.currentArrays as Map<string, Float64Array>,
      ) : step.dcSweep,
    transferFunction: plain.transferFunction
      && !(plain.transferFunction instanceof TransferFunctionResult)
      ? new TransferFunctionResult(
        plain.transferFunction.outputNode!,
        plain.transferFunction.inputSource!,
        plain.transferFunction.transfer!,
        plain.transferFunction.inputResistance!,
        plain.transferFunction.outputResistance!,
        plain.transferFunction.outputSource,
      ) : step.transferFunction,
  };
}

function singleStepNetlist(netlist: string, step: StepAnalysis, value: number): string {
  const replacement = `.step param ${step.param} list ${value}`;
  return netlist.replace(/^\s*\.step\b.*$/im, replacement);
}

function mergeConvergence(target: ConvergenceTelemetry, source?: ConvergenceTelemetry): void {
  if (!source) return;
  const dcKeys = [
    'newtonIterations', 'acceptedSolves', 'rejectedSolves', 'sourceStepAttempts',
    'sourceStepFailures', 'gminStepAttempts', 'gminStepFailures',
  ] as const;
  for (const key of dcKeys) target.dc[key] += source.dc[key];
  target.dc.failure ??= source.dc.failure;
  const transientKeys = [
    'acceptedSteps', 'rejectedSteps', 'newtonIterations', 'nrRetries', 'lteRetries',
  ] as const;
  for (const key of transientKeys) target.transient[key] += source.transient[key];
  const minimum = source.transient.minimumAcceptedTimestep;
  if (minimum !== null) {
    target.transient.minimumAcceptedTimestep = target.transient.minimumAcceptedTimestep === null
      ? minimum : Math.min(target.transient.minimumAcceptedTimestep, minimum);
  }
  target.transient.failure ??= source.transient.failure;
}

interface WorkerMessage {
  type: 'result' | 'error';
  result?: SimulationResult;
  message?: string;
}

interface MessageWorker {
  postMessage(message: unknown): void;
  terminate(): unknown;
  addEventListener?: (type: string, listener: (event: unknown) => void) => void;
  removeEventListener?: (type: string, listener: (event: unknown) => void) => void;
  on?: (type: string, listener: (value: WorkerMessage | Error) => void) => void;
  off?: (type: string, listener: (value: WorkerMessage | Error) => void) => void;
}

declare const Worker: new (url: URL, options: { type: 'module' }) => MessageWorker;

function siblingModuleUrl(filename: string): URL {
  return new URL(filename, import.meta.url);
}

function adaptMessageWorker(worker: MessageWorker): StepWorker {
  return {
    run(task) {
      return new Promise<SimulationResult>((resolve, reject) => {
        const cleanup = () => {
          worker.removeEventListener?.('message', onBrowserMessage);
          worker.removeEventListener?.('error', onBrowserError);
          worker.off?.('message', onNodeMessage);
          worker.off?.('error', onNodeError);
        };
        const settle = (message: WorkerMessage) => {
          cleanup();
          if (message.type === 'result') resolve(message.result!);
          else reject(new Error(message.message ?? 'Step worker failed'));
        };
        const onBrowserMessage = (value: unknown) => {
          const event = value as { data: WorkerMessage };
          settle(event.data);
        };
        const onBrowserError = (value: unknown) => {
          const event = value as { error?: unknown; message?: string };
          cleanup();
          reject(event.error instanceof Error
            ? event.error
            : new Error(event.message ?? 'Step worker failed to load'));
        };
        const onNodeMessage = (value: WorkerMessage | Error) => settle(value as WorkerMessage);
        const onNodeError = (value: WorkerMessage | Error) => {
          cleanup();
          reject(value);
        };
        worker.addEventListener?.('message', onBrowserMessage);
        worker.addEventListener?.('error', onBrowserError);
        worker.on?.('message', onNodeMessage);
        worker.on?.('error', onNodeError);
        try {
          worker.postMessage({ type: 'run', task });
        } catch (error) {
          cleanup();
          reject(error);
        }
      });
    },
    terminate: () => { worker.terminate(); },
  };
}

async function createAutomaticWorker(): Promise<StepWorker | null> {
  const globalScope = globalThis as typeof globalThis & {
    Worker?: new (url: URL, options: { type: 'module' }) => MessageWorker;
  };
  if (globalScope.Worker) {
    try {
      // Keep this exact static form so Vite and other bundlers compile the worker as a module.
      return adaptMessageWorker(new Worker(
        new URL('./step-worker-browser.js', import.meta.url), { type: 'module' },
      ));
    } catch {
      return null;
    }
  }
  try {
    const [{ Worker }, { pathToFileURL }] = await Promise.all([
      import('node:worker_threads'),
      import('node:url'),
    ]);
    const workerUrl = typeof __filename === 'string'
      ? pathToFileURL(`${__dirname}/step-worker.cjs`)
      : siblingModuleUrl('step-worker.js');
    return adaptMessageWorker(new Worker(workerUrl) as MessageWorker);
  } catch {
    return null;
  }
}

export async function solveStepInWorkers(
  netlist: string,
  step: StepAnalysis,
  options: SimulationOptions,
  warnings: SimulationWarning[],
  convergence: ConvergenceTelemetry,
): Promise<StepResult[] | null> {
  const workerOptions = options.stepWorkers;
  if (!workerOptions) return null;
  if (options.resolveInclude || (options.simulator && options.simulator !== 'spice-ts')) return null;

  const values = generateStepValues(step);
  const maxWorkers = Math.max(1, Math.min(
    values.length,
    Math.floor(workerOptions.maxWorkers ?? 4),
  ));
  const factory = workerOptions.workerFactory ?? createAutomaticWorker;
  const workers: StepWorker[] = [];
  for (let index = 0; index < maxWorkers; index++) {
    const worker = await factory(index);
    if (!worker) {
      await Promise.allSettled(workers.map(existing => Promise.resolve(existing.terminate())));
      return null;
    }
    workers.push(worker);
  }
  if (workerOptions.signal?.aborted) {
    await Promise.allSettled(workers.map(worker => Promise.resolve(
      worker.terminate(workerOptions.signal!.reason),
    )));
    throw workerOptions.signal.reason ?? new Error('Step worker execution aborted');
  }

  const { stepWorkers: _stepWorkers, resolveInclude: _resolveInclude, simulator: _simulator, ...cloneable } = options;
  const tasks: StepWorkerTask[] = values.map((value, index) => ({
    index,
    netlist: singleStepNetlist(netlist, step, value),
    options: cloneable,
  }));
  const outputs = await scheduleStepTasks(tasks, {
    create: workerIndex => {
      let terminated = false;
      const terminate = (reason?: unknown) => {
        if (terminated) return;
        terminated = true;
        return workers[workerIndex].terminate(reason);
      };
      return {
        execute: task => workers[workerIndex].run(task),
        cancel: terminate,
        dispose: terminate,
      };
    },
  }, {
    maxWorkers,
    signal: workerOptions.signal,
    onComplete: ({ index, result }) => {
      const revived = reviveStepResult(result.steps![0]);
      workerOptions.onComplete?.({ index, result: revived });
    },
  });

  const results: StepResult[] = [];
  for (const output of outputs) {
    if (!output.steps?.[0]) throw new Error('Step worker returned no step result');
    results.push(reviveStepResult(output.steps[0]));
    warnings.push(...output.warnings);
    mergeConvergence(convergence, output.convergence);
  }
  return results;
}
