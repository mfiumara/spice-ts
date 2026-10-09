import {
  executeStepWorkerMessage,
  type ReplyPort,
} from './step-worker-runtime.js';

void import('node:worker_threads').then(({ parentPort }) => {
  if (!parentPort) throw new Error('Step worker started without a parent port');
  const port: ReplyPort = {
    postMessage: message => parentPort.postMessage(message),
    onMessage: listener => parentPort.on('message', listener),
  };
  port.onMessage(message => { void executeStepWorkerMessage(message, port); });
});
