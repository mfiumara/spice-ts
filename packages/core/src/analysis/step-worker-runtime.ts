import { simulate } from '../simulate.js';
import type { StepWorkerTask } from '../types.js';

export interface RunMessage { type: 'run'; task: StepWorkerTask }

export interface ReplyPort {
  postMessage(message: unknown): void;
  onMessage(listener: (message: RunMessage) => void): void;
}

export async function executeStepWorkerMessage(
  message: RunMessage,
  port: ReplyPort,
): Promise<void> {
  try {
    const result = await simulate(message.task.netlist, {
      ...message.task.options,
      stepWorkers: false,
    });
    port.postMessage({ type: 'result', result });
  } catch (error) {
    port.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
