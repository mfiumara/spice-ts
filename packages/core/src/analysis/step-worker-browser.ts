import {
  executeStepWorkerMessage,
  type ReplyPort,
  type RunMessage,
} from './step-worker-runtime.js';

const scope = globalThis as typeof globalThis & {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: { data: RunMessage }) => void): void;
};

const port: ReplyPort = {
  postMessage: message => scope.postMessage(message),
  onMessage: listener => scope.addEventListener('message', event => listener(event.data)),
};
port.onMessage(message => { void executeStepWorkerMessage(message, port); });
