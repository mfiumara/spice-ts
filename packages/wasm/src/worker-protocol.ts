import type { SimulationRequestV1 } from '@spice-ts/protocol';

export type WorkerOperation = 'validate' | 'simulate';

export interface WorkerRequest {
  id: number;
  operation: WorkerOperation;
  request: SimulationRequestV1;
}

export interface WorkerSuccess {
  id: number;
  ok: true;
  data: unknown;
}

export interface WorkerFailure {
  id: number;
  ok: false;
  error: unknown;
}

export type WorkerResponse = WorkerSuccess | WorkerFailure;
