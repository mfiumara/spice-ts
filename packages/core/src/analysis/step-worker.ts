import { simulate } from '../simulate.js';
import type { StepWorkerTask } from '../types.js';

interface RunMessage { type: 'run'; task: StepWorkerTask }
interface ReplyPort {
  postMessage(message: unknown): void;
  onMessage(listener: (message: RunMessage) => void): void;
}

async function execute(message: RunMessage, port: ReplyPort): Promise<void> {
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

const scope = globalThis as typeof globalThis & {
  postMessage?: (message: unknown) => void;
  addEventListener?: (type: 'message', listener: (event: { data: RunMessage }) => void) => void;
};

if (scope.postMessage && scope.addEventListener) {
  const port: ReplyPort = {
    postMessage: message => scope.postMessage!(message),
    onMessage: listener => scope.addEventListener!('message', event => listener(event.data)),
  };
  port.onMessage(message => { void execute(message, port); });
} else {
  void import('node:worker_threads').then(({ parentPort }) => {
    if (!parentPort) throw new Error('Step worker started without a parent port');
    const port: ReplyPort = {
      postMessage: message => parentPort.postMessage(message),
      onMessage: listener => parentPort.on('message', listener),
    };
    port.onMessage(message => { void execute(message, port); });
  });
}
