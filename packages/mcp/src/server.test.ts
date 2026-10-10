import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import { sha256CanonicalJson } from '@spice-ts/protocol';
import type {
  SimulationReadDataV1,
  SimulationRequestV1,
  SimulationResultV1,
} from '@spice-ts/protocol';
import { describe, expect, it, vi } from 'vitest';
import { createToolExecutor, DEFAULT_MCP_LIMITS, executeTool } from './server.js';
import type { ExecutionWorker } from './server.js';

const fixture = async <T>(name: string): Promise<T> => JSON.parse(await readFile(
  fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)),
  'utf8',
)) as T;

describe('bounded protocol-v1 tools', () => {
  it('returns deterministic typed capability discovery', async () => {
    const first = await executeTool('spice_capabilities', {});
    const second = await executeTool('spice_capabilities', {});

    expect(first).toEqual(second);
    expect(first.isError).not.toBe(true);
    expect(first.structuredContent).toMatchObject({
      protocolVersion: '1',
      analyses: ['op', 'dc', 'tran', 'ac'],
      inputFormats: ['spice', 'spice-ts'],
      limits: DEFAULT_MCP_LIMITS,
      streaming: { defaultChunkPoints: 256, maxChunkPoints: 1024, maxRetainedJobs: 16 },
    });
  });

  it('validates and simulates a golden protocol request', async () => {
    const request = await fixture<SimulationRequestV1>('simulate-request.json');
    const expected = await fixture<SimulationResultV1>('simulate-response.json');

    const validation = await executeTool('spice_validate', { request });
    const simulation = await executeTool('spice_simulate', { request });

    expect(validation.structuredContent).toEqual({
      status: 'valid', nodeCount: 1, branchCount: 1, analysisCount: 1,
    });
    expect(simulation.structuredContent).toEqual(expected);
    expect(simulation.content).toEqual([{ type: 'text', text: JSON.stringify(expected) }]);
  });

  it.each([
    ['document bytes', { ...DEFAULT_MCP_LIMITS, maxDocumentBytes: 8 }, 'maxDocumentBytes'],
    ['analysis count', { ...DEFAULT_MCP_LIMITS, maxAnalyses: 0 }, 'maxAnalyses'],
    ['point count', { ...DEFAULT_MCP_LIMITS, maxResultPoints: 0 }, 'maxResultPoints'],
    ['serialized result bytes', { ...DEFAULT_MCP_LIMITS, maxSerializedResultBytes: 8 }, 'maxSerializedResultBytes'],
  ])('returns a structured resource error for %s', async (_name, limits, limit) => {
    const request = await fixture<SimulationRequestV1>('simulate-request.json');
    const response = await executeTool('spice_simulate', { request }, { limits });

    expect(response.isError).toBe(true);
    expect(response.structuredContent).toMatchObject({
      error: {
        code: 'RESOURCE_LIMIT', phase: expect.any(String), retryable: false,
        details: { limit },
      },
    });
    expect(JSON.stringify(response)).not.toContain('spice-ts-js');
  });

  it('honours cancellation without calling the simulator', async () => {
    const request = await fixture<SimulationRequestV1>('simulate-request.json');
    const controller = new AbortController();
    const simulate = vi.fn();
    controller.abort();

    const response = await executeTool('spice_simulate', { request }, {
      signal: controller.signal,
      simulate,
    });

    expect(simulate).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      isError: true,
      structuredContent: { error: { code: 'CANCELLED', phase: 'transport', retryable: false } },
    });
  });

  it('honours cancellation while a simulation is pending', async () => {
    const request = await fixture<SimulationRequestV1>('simulate-request.json');
    const controller = new AbortController();
    const simulate = vi.fn(() => new Promise<SimulationResultV1>(() => undefined));

    const pending = executeTool('spice_simulate', { request }, {
      signal: controller.signal,
      simulate,
    });
    controller.abort();

    await expect(pending).resolves.toMatchObject({
      isError: true,
      structuredContent: { error: { code: 'CANCELLED', phase: 'transport' } },
    });
  });

  it('preflights SPICE-suffixed transient point counts', async () => {
    const request: SimulationRequestV1 = {
      apiVersion: '1',
      input: { format: 'spice', source: 'V1 a 0 1\nR1 a 0 1k\n.tran 1u 1' },
    };
    const simulate = vi.fn();

    const response = await executeTool('spice_simulate', { request }, { simulate });

    expect(simulate).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      isError: true,
      structuredContent: { error: { code: 'RESOURCE_LIMIT', details: { limit: 'maxResultPoints' } } },
    });
  });

  it('enforces wall time and suppresses late backend failures', async () => {
    vi.useFakeTimers();
    const request = await fixture<SimulationRequestV1>('simulate-request.json');
    const simulate = vi.fn(() => new Promise<SimulationResultV1>((_resolve, reject) => {
      setTimeout(() => reject(new Error('spice-ts-js private failure')), 20);
    }));

    const pending = executeTool('spice_simulate', { request }, {
      limits: { ...DEFAULT_MCP_LIMITS, maxWallTimeMs: 10 },
      simulate,
    });
    await vi.advanceTimersByTimeAsync(10);
    const response = await pending;
    await vi.advanceTimersByTimeAsync(10);
    vi.useRealTimers();

    expect(response).toMatchObject({
      isError: true,
      structuredContent: { error: { code: 'RESOURCE_LIMIT', phase: 'solve', details: { limit: 'maxWallTimeMs' } } },
    });
    expect(JSON.stringify(response)).not.toContain('spice-ts-js');
  });

  it('enforces wall time while the real adapter is synchronously solving', async () => {
    const request: SimulationRequestV1 = {
      apiVersion: '1',
      input: {
        format: 'spice',
        source: [
          'V1 in 0 1',
          'R1 in out 1k',
          'C1 out 0 1u',
          '.tran 1u 20m',
        ].join('\n'),
      },
    };

    const response = await executeTool('spice_simulate', { request }, {
      limits: { ...DEFAULT_MCP_LIMITS, maxWallTimeMs: 1 },
    });

    expect(response).toMatchObject({
      isError: true,
      structuredContent: {
        error: {
          code: 'RESOURCE_LIMIT',
          phase: 'solve',
          details: { limit: 'maxWallTimeMs', maximum: 1 },
        },
      },
    });
  });

  it('enforces a zero wall-time limit on real adapter operating-point work', async () => {
    const request: SimulationRequestV1 = {
      apiVersion: '1',
      input: { format: 'spice', source: 'V1 in 0 1\nR1 in 0 1k\n.op' },
    };

    const response = await executeTool('spice_simulate', { request }, {
      limits: { ...DEFAULT_MCP_LIMITS, maxWallTimeMs: 0 },
    });

    expect(response).toMatchObject({
      isError: true,
      structuredContent: {
        error: {
          code: 'RESOURCE_LIMIT', phase: 'solve',
          details: { limit: 'maxWallTimeMs', maximum: 0 },
        },
      },
    });
  });

  it('aborts real adapter work running in an isolated worker', async () => {
    const request: SimulationRequestV1 = {
      apiVersion: '1',
      input: {
        format: 'spice',
        source: 'V1 in 0 1\nR1 in out 1k\nC1 out 0 1u\n.tran 1u 20m',
      },
    };
    const controller = new AbortController();

    const pending = executeTool('spice_simulate', { request }, { signal: controller.signal });
    setTimeout(() => controller.abort(), 5);

    await expect(pending).resolves.toMatchObject({
      isError: true,
      structuredContent: { error: { code: 'CANCELLED', phase: 'transport' } },
    });
  });

  it('maps isolated worker death to a deterministic public error', async () => {
    class DeadWorker extends EventEmitter {
      postMessage(): void { queueMicrotask(() => this.emit('exit', 1)); }
      terminate(): number { return 1; }
    }
    const request = await fixture<SimulationRequestV1>('simulate-request.json');

    const response = await executeTool('spice_simulate', { request }, {
      workerFactory: () => new DeadWorker() as unknown as ExecutionWorker,
    });

    expect(response).toMatchObject({
      isError: true,
      structuredContent: {
        error: {
          code: 'INTERNAL_ERROR', phase: 'transport', retryable: false,
          message: 'The isolated simulation worker failed', details: {},
        },
      },
    });
  });

  it('returns and cancels a live stream job before an injected simulation completes', async () => {
    const request = await fixture<SimulationRequestV1>('simulate-request.json');
    const result = await fixture<SimulationResultV1>('simulate-response.json');
    let completeSimulation!: (result: SimulationResultV1) => void;
    const simulation = new Promise<SimulationResultV1>((resolve) => {
      completeSimulation = resolve;
    });
    const execute = createToolExecutor({ simulate: () => simulation });
    let startSettled = false;

    const startedPromise = execute('spice_simulation_start', { request }).then((started) => {
      startSettled = true;
      return started;
    });
    await Promise.resolve();
    await Promise.resolve();
    const settledBeforeSimulationCompletion = startSettled;
    expect(settledBeforeSimulationCompletion).toBe(true);
    const started = await startedPromise;
    const { jobId, cursor } = started.structuredContent as { jobId: string; cursor: string };
    const pendingRead = await execute('spice_simulation_read', { jobId, cursor });
    const cancelled = await execute('spice_simulation_cancel', { jobId });
    completeSimulation(result);
    await Promise.resolve();

    expect(pendingRead.structuredContent).toEqual({
      status: 'running', events: [], nextCursor: cursor,
    });
    expect(cancelled.structuredContent).toMatchObject({
      status: 'cancelled',
      terminal: {
        error: { code: 'CANCELLED', phase: 'solve' },
        partial: { analyses: [], partialEventSha256: sha256CanonicalJson([]) },
      },
    });
    await expect(execute('spice_simulation_cancel', { jobId })).resolves.toEqual(cancelled);
  });

  it('terminates the isolated worker when a live stream job is cancelled', async () => {
    class PendingWorker extends EventEmitter {
      readonly terminate = vi.fn(() => 0);
      postMessage(): void {}
    }
    const worker = new PendingWorker();
    const request = await fixture<SimulationRequestV1>('simulate-request.json');
    const execute = createToolExecutor({
      workerFactory: () => worker as unknown as ExecutionWorker,
    });

    const started = await execute('spice_simulation_start', { request });
    const { jobId } = started.structuredContent as { jobId: string };
    await execute('spice_simulation_cancel', { jobId });
    await Promise.resolve();

    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('streams canonical analysis events in bounded replayable chunks', async () => {
    const request: SimulationRequestV1 = {
      apiVersion: '1',
      input: {
        format: 'spice',
        source: 'V1 in 0 1\nR1 in out 1k\nC1 out 0 1u\n.tran 1u 3u',
      },
    };
    const result: SimulationResultV1 = {
      status: 'complete',
      analyses: [{
        type: 'tran', analysisIndex: 0, timeS: [0, 1e-6, 2e-6, 3e-6],
        voltagesV: { in: [1, 1, 1, 1], out: [0, 0.5, 0.75, 0.875] },
        currentsA: { V1: [0, 0, 0, 0] },
      }],
    };
    const started = await executeTool('spice_simulation_start', { request }, {
      simulate: async () => result,
    });
    expect(started.structuredContent).toMatchObject({ status: 'running' });
    const { jobId, cursor } = started.structuredContent as { jobId: string; cursor: string };

    const first = await readWhenReady(executeTool, { jobId, cursor, maxPoints: 2 });
    const replay = await executeTool('spice_simulation_read', { jobId, cursor, maxPoints: 4 });
    expect(replay).toEqual(first);
    const firstData = first.structuredContent as unknown as SimulationReadDataV1;
    expect(firstData).toMatchObject({
      status: 'running',
      events: [
        { type: 'analysis-start', analysis: 'tran', analysisIndex: 0 },
        { type: 'point', analysisIndex: 0, pointIndex: 0, point: { type: 'tran' } },
        { type: 'point', analysisIndex: 0, pointIndex: 1, point: { type: 'tran' } },
      ],
    });

    const second = await executeTool('spice_simulation_read', {
      jobId,
      cursor: firstData.nextCursor,
      maxPoints: 2,
    });
    const secondData = second.structuredContent as unknown as SimulationReadDataV1;
    expect(secondData.status).toBe('running');
    const final = await executeTool('spice_simulation_read', {
      jobId,
      cursor: secondData.nextCursor,
      maxPoints: 2,
    });
    const finalData = final.structuredContent as unknown as SimulationReadDataV1;
    expect(finalData).toMatchObject({
      status: 'complete',
      events: [{ type: 'analysis-end', analysis: 'tran', analysisIndex: 0, pointCount: 4 }],
      nextCursor: null,
      terminal: { apiVersion: '1', ok: true, requestId: jobId, data: { status: 'complete' } },
    });
    expect(finalData.status === 'complete' && finalData.terminal.metadata.resultSha256)
      .toBe(sha256CanonicalJson(finalData.status === 'complete' ? finalData.terminal.data : null));

    const values = JSON.parse(JSON.stringify([firstData, secondData, finalData])) as unknown;
    expect(containsExactString(values, 'spice-ts')).toBe(false);
  });

  it('cancels deterministically at an emitted cursor and returns the protocol partial terminal', async () => {
    const request: SimulationRequestV1 = {
      apiVersion: '1',
      input: {
        format: 'spice',
        source: 'V1 in 0 1\nR1 in out 1k\nC1 out 0 1u\n.tran 1u 3u',
      },
    };
    const started = await executeTool('spice_simulation_start', { request });
    const { jobId, cursor } = started.structuredContent as { jobId: string; cursor: string };
    const first = await readWhenReady(executeTool, { jobId, cursor, maxPoints: 2 });
    const emitted = (first.structuredContent as unknown as SimulationReadDataV1).events;

    const cancelled = await executeTool('spice_simulation_cancel', { jobId });
    const replay = await executeTool('spice_simulation_cancel', { jobId });
    expect(replay).toEqual(cancelled);
    expect(cancelled.structuredContent).toMatchObject({
      status: 'cancelled', events: [], nextCursor: null,
      terminal: {
        apiVersion: '1', ok: false, requestId: jobId,
        error: { code: 'CANCELLED', phase: 'solve', retryable: true },
        partial: {
          status: 'partial',
          analyses: [{ analysis: 'tran', analysisIndex: 0, emittedPointCount: 2, complete: false }],
          partialEventSha256: sha256CanonicalJson(emitted.filter(event => event.type === 'point')),
        },
      },
    });
    expect(JSON.stringify(cancelled.structuredContent)).not.toContain('resultSha256');
    expect(containsExactString(cancelled.structuredContent, 'spice-ts')).toBe(false);
  });

  it('rejects malformed stream requests and hard chunk bounds without creating jobs', async () => {
    const request = await fixture<SimulationRequestV1>('simulate-request.json');
    const malformed = await executeTool('spice_simulation_read', { jobId: 'missing' });
    const started = await executeTool('spice_simulation_start', { request });
    const { jobId, cursor } = started.structuredContent as { jobId: string; cursor: string };
    const bounded = await executeTool('spice_simulation_read', { jobId, cursor, maxPoints: 1025 });

    expect(malformed).toMatchObject({
      isError: true,
      structuredContent: { error: { code: 'INVALID_REQUEST', phase: 'validation' } },
    });
    expect(bounded).toMatchObject({
      isError: true,
      structuredContent: {
        error: {
          code: 'RESOURCE_LIMIT', phase: 'transport',
          details: { limit: 'maxStreamChunkPoints', maximum: 1024, actual: 1025 },
        },
      },
    });
  });

  it('returns public structured stream failures without internal backend names', async () => {
    const request = await fixture<SimulationRequestV1>('simulate-request.json');
    const execute = createToolExecutor({
      simulate: async () => {
        throw {
          code: 'INTERNAL_ERROR', message: 'spice-ts failed', retryable: false,
          phase: 'solve', details: { backend: 'spice-ts' },
        };
      },
    });
    const started = await execute('spice_simulation_start', { request });
    const { jobId, cursor } = started.structuredContent as { jobId: string; cursor: string };
    const response = await readWhenReady(execute, { jobId, cursor });

    expect(response.structuredContent).toMatchObject({
      status: 'failed',
      terminal: { error: { code: 'INTERNAL_ERROR', phase: 'solve' } },
    });
    expect(containsExactString(response.structuredContent, 'spice-ts')).toBe(false);
    expect(JSON.stringify(response.structuredContent)).not.toContain('spice-ts failed');
  });

  it('bounds retained unfinished jobs and evicts the oldest terminal job', async () => {
    const request = await fixture<SimulationRequestV1>('simulate-request.json');
    const result = await fixture<SimulationResultV1>('simulate-response.json');
    const execute = createToolExecutor({ simulate: async () => result });
    const starts = [];
    for (let index = 0; index < 16; index++) {
      starts.push(await execute('spice_simulation_start', { request }));
    }
    const rejected = await execute('spice_simulation_start', { request });
    expect(rejected).toMatchObject({
      isError: true,
      structuredContent: {
        error: { code: 'RESOURCE_LIMIT', details: { limit: 'maxRetainedStreamJobs', maximum: 16, actual: 17 } },
      },
    });

    const first = starts[0]!.structuredContent as { jobId: string };
    await execute('spice_simulation_cancel', { jobId: first.jobId });
    const replacement = await execute('spice_simulation_start', { request });
    expect(replacement.isError).not.toBe(true);
    const evicted = await execute('spice_simulation_cancel', { jobId: first.jobId });
    expect(evicted).toMatchObject({
      isError: true,
      structuredContent: { error: { code: 'INVALID_REQUEST' } },
    });
  });
});

async function readWhenReady(
  execute: ReturnType<typeof createToolExecutor> | typeof executeTool,
  args: { jobId: string; cursor: string; maxPoints?: number },
): Promise<Awaited<ReturnType<typeof executeTool>>> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const response = await execute('spice_simulation_read', args);
    const data = response.structuredContent as unknown as SimulationReadDataV1;
    if (data.status !== 'running' || data.events.length > 0) return response;
    await new Promise<void>(resolve => setTimeout(resolve, 1));
  }
  throw new Error('Simulation job did not produce events');
}

function containsExactString(value: unknown, target: string): boolean {
  if (value === target) return true;
  if (Array.isArray(value)) return value.some(entry => containsExactString(entry, target));
  if (value !== null && typeof value === 'object') {
    return Object.values(value).some(entry => containsExactString(entry, target));
  }
  return false;
}
