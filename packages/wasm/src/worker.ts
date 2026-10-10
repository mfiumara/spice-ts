import { mapProtocolErrorV1, simulateProtocolV1, validateProtocolV1 } from '@spice-ts/core';
import type { WorkerRequest, WorkerResponse } from './worker-protocol.js';

type MessagePortLike = {
  postMessage(value: WorkerResponse): void;
  on?(event: 'message', listener: (value: WorkerRequest) => void): void;
};

async function execute(message: WorkerRequest): Promise<void> {
  try {
    const data = message.operation === 'validate'
      ? await validateProtocolV1(message.request)
      : await simulateProtocolV1(message.request);
    post({ id: message.id, ok: true, data });
  } catch (error) {
    post({ id: message.id, ok: false, error: mapProtocolErrorV1(error) });
  }
}

let parentPort: MessagePortLike | null = null;

function post(message: WorkerResponse): void {
  if (parentPort) parentPort.postMessage(message);
  else globalThis.postMessage(message);
}

if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('message', (event: MessageEvent<WorkerRequest>) => { void execute(event.data); });
} else {
  const workerThreads = await import('node:worker_threads');
  parentPort = workerThreads.parentPort;
  parentPort?.on?.('message', (message: WorkerRequest) => { void execute(message); });
}
