import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import { sha256CanonicalJson } from '@spice-ts/protocol';
import type {
  SimulationEventV1,
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
      streaming: {
        defaultChunkPoints: 256,
        maxChunkPoints: 1024,
        maxRetainedJobs: 16,
        runningJobTtlMs: 30_000,
        terminalJobTtlMs: 60_000,
        maxUnreadEvents: 256,
        maxUnreadBytes: 1024 * 1024,
      },
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

  it.each([
    ['abnormal exit', (worker: UnexpectedExitWorker) => worker.exit(9), 0],
    ['termination', (worker: UnexpectedExitWorker) => worker.terminateUnexpectedly(), 1],
    ['error followed by duplicate exits', (worker: UnexpectedExitWorker) => worker.failRepeatedly(), 1],
  ])('keeps a stable terminal when an isolated worker has %s before points', async (
    _name,
    stopWorker,
    expectedTerminationCount,
  ) => {
    const worker = new UnexpectedExitWorker();
    const request = await fixture<SimulationRequestV1>('simulate-request.json');
    const execute = createToolExecutor({
      workerFactory: () => worker as unknown as ExecutionWorker,
    });
    const started = await execute('spice_simulation_start', { request });
    const { jobId, cursor } = started.structuredContent as { jobId: string; cursor: string };

    stopWorker(worker);
    await flushMicrotasks();
    const failed = await execute('spice_simulation_read', { jobId, cursor });
    const readAfterTerminal = await execute('spice_simulation_read', { jobId, cursor });

    expect(readAfterTerminal).toEqual(failed);
    expect(failed.structuredContent).toEqual({
      status: 'failed', events: [], nextCursor: null,
      terminal: {
        apiVersion: '1', ok: false, requestId: jobId,
        error: {
          code: 'INTERNAL_ERROR', message: 'The isolated simulation worker failed',
          retryable: false, phase: 'transport', details: {},
        },
        diagnostics: [],
        partial: {
          status: 'partial', analyses: [], partialEventSha256: sha256CanonicalJson([]),
        },
      },
    });
    expect(worker.terminate).toHaveBeenCalledTimes(expectedTerminationCount);
    expect(JSON.stringify(failed)).not.toContain('private worker failure');
  });

  it('retains a final worker batch before processing an immediate unexpected exit', async () => {
    class FinalBatchWorker extends EventEmitter {
      readonly terminate = vi.fn(() => 1);

      postMessage(message: unknown): void {
        if (!isWorkerOperation(message)) return;
        this.emit('message', {
          type: 'events',
          events: [
            { type: 'analysis-start', analysis: 'tran', analysisIndex: 0 },
            {
              type: 'point', analysisIndex: 0, pointIndex: 0,
              point: { type: 'tran', timeS: 0, voltagesV: { out: 0 }, currentsA: {} },
            },
            {
              type: 'point', analysisIndex: 0, pointIndex: 1,
              point: { type: 'tran', timeS: 1e-6, voltagesV: { out: 0.5 }, currentsA: {} },
            },
          ],
        });
        this.emit('exit', 7);
        this.emit('exit', 7);
      }
    }
    const worker = new FinalBatchWorker();
    const request = await fixture<SimulationRequestV1>('simulate-request.json');
    const execute = createToolExecutor({
      workerFactory: () => worker as unknown as ExecutionWorker,
    });
    const started = await execute('spice_simulation_start', { request });
    const { jobId, cursor } = started.structuredContent as { jobId: string; cursor: string };
    await flushMicrotasks();

    const first = await execute('spice_simulation_read', { jobId, cursor, maxPoints: 1 });
    const firstData = first.structuredContent as unknown as SimulationReadDataV1;
    expect(firstData).toMatchObject({
      status: 'running',
      events: [
        { type: 'analysis-start', analysis: 'tran', analysisIndex: 0 },
        { type: 'point', analysisIndex: 0, pointIndex: 0 },
      ],
    });

    const failed = await execute('spice_simulation_read', {
      jobId, cursor: firstData.nextCursor, maxPoints: 1,
    });
    const replay = await execute('spice_simulation_read', {
      jobId, cursor: firstData.nextCursor, maxPoints: 99,
    });
    expect(replay).toEqual(failed);
    expect(failed.structuredContent).toMatchObject({
      status: 'failed',
      events: [{ type: 'point', analysisIndex: 0, pointIndex: 1 }],
      nextCursor: null,
      terminal: {
        error: { code: 'INTERNAL_ERROR', phase: 'transport', details: {} },
        partial: {
          analyses: [{ analysis: 'tran', analysisIndex: 0, emittedPointCount: 2, complete: false }],
        },
      },
    });
    const terminal = failed.structuredContent as unknown as {
      events: SimulationEventV1[];
      terminal: { partial?: { partialEventSha256: string } };
    };
    const deliveredPoints = [...firstData.events, ...terminal.events]
      .filter(event => event.type === 'point');
    expect(terminal.terminal.partial?.partialEventSha256)
      .toBe(sha256CanonicalJson(deliveredPoints));
    expect(worker.terminate).not.toHaveBeenCalled();
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

  it('exposes a canonical point while worker simulation is still live and cancels that work', async () => {
    class StreamingWorker extends EventEmitter {
      readonly terminate = vi.fn(() => 0);
      resultSent = false;

      postMessage(message: unknown): void {
        if (!isWorkerOperation(message)) return;
        queueMicrotask(() => this.emit('message', {
          type: 'events',
          events: [
            { type: 'analysis-start', analysis: 'tran', analysisIndex: 0 },
            {
              type: 'point', analysisIndex: 0, pointIndex: 0,
              point: {
                type: 'tran', timeS: 0,
                voltagesV: { in: 1, out: 0 }, currentsA: { V1: 0 },
              },
            },
          ],
        }));
      }
    }
    const worker = new StreamingWorker();
    const request = await fixture<SimulationRequestV1>('simulate-request.json');
    const execute = createToolExecutor({
      workerFactory: () => worker as unknown as ExecutionWorker,
    });

    const started = await execute('spice_simulation_start', { request });
    const { jobId, cursor } = started.structuredContent as { jobId: string; cursor: string };
    const first = await readWhenReady(execute, { jobId, cursor, maxPoints: 1 });
    const firstData = first.structuredContent as unknown as SimulationReadDataV1;

    expect(firstData).toMatchObject({
      status: 'running',
      events: [
        { type: 'analysis-start', analysis: 'tran', analysisIndex: 0 },
        { type: 'point', analysisIndex: 0, pointIndex: 0, point: { type: 'tran', timeS: 0 } },
      ],
    });
    expect(worker.resultSent).toBe(false);

    const cancelled = await execute('spice_simulation_cancel', { jobId });
    expect(cancelled.structuredContent).toMatchObject({
      status: 'cancelled',
      terminal: {
        partial: {
          analyses: [{ analysis: 'tran', analysisIndex: 0, emittedPointCount: 1, complete: false }],
        },
      },
    });
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(worker.resultSent).toBe(false);
  });

  it('keeps real transient point events canonical while the terminal result is pending', async () => {
    const request: SimulationRequestV1 = {
      apiVersion: '1',
      input: {
        format: 'spice',
        source: 'V1 in 0 1\nR1 in out 1k\nC1 out 0 1u\n.tran 1u 3u',
      },
    };
    const execute = createToolExecutor();
    const started = await execute('spice_simulation_start', { request });
    const { jobId, cursor } = started.structuredContent as { jobId: string; cursor: string };
    const first = await readWhenReady(execute, { jobId, cursor, maxPoints: 2 });
    const firstData = first.structuredContent as unknown as SimulationReadDataV1;

    expect(firstData.status).toBe('running');
    expect(firstData.events.filter(event => event.type === 'point')).toHaveLength(2);
    expect('terminal' in firstData).toBe(false);

    const events = [...firstData.events];
    let nextCursor = firstData.nextCursor;
    let complete: Extract<SimulationReadDataV1, { status: 'complete' }> | undefined;
    while (nextCursor !== null) {
      const response = await readWhenReady(execute, { jobId, cursor: nextCursor, maxPoints: 2 });
      const data = response.structuredContent as unknown as SimulationReadDataV1;
      events.push(...data.events);
      nextCursor = data.nextCursor;
      if (data.status === 'complete') complete = data;
    }

    expect(complete).toBeDefined();
    const result = complete!.terminal.data.analyses[0];
    expect(result?.type).toBe('tran');
    if (result?.type !== 'tran') throw new Error('Expected transient result');
    const points = events.filter((event): event is Extract<SimulationEventV1, { type: 'point' }> =>
      event.type === 'point');
    expect(points).toHaveLength(result.timeS.length);
    points.forEach((event, index) => {
      expect(event.point).toEqual({
        type: 'tran', timeS: result.timeS[index],
        voltagesV: Object.fromEntries(Object.entries(result.voltagesV).map(([name, values]) => [name, values[index]])),
        currentsA: Object.fromEntries(Object.entries(result.currentsA).map(([name, values]) => [name, values[index]])),
      });
    });
  });

  it('stops live stepped-transient delivery at maxResultPoints', async () => {
    const request: SimulationRequestV1 = {
      apiVersion: '1',
      input: {
        format: 'spice',
        source: [
          'V1 in 0 1',
          'R1 in out 1k',
          'C1 out 0 1u',
          '.tran 1u 3u',
          '.step param R1 list 1k 2k',
        ].join('\n'),
      },
      options: { limits: { maxResultPoints: 4 } },
    };
    const execute = createToolExecutor();
    const started = await execute('spice_simulation_start', { request });
    const { jobId } = started.structuredContent as { jobId: string };
    let cursor = (started.structuredContent as { cursor: string }).cursor;
    const points: SimulationEventV1[] = [];
    let terminal: SimulationReadDataV1 | undefined;

    for (let read = 0; read < 100; read++) {
      const response = await readWhenReady(execute, { jobId, cursor, maxPoints: 2 });
      const data = response.structuredContent as unknown as SimulationReadDataV1;
      points.push(...data.events.filter((event: SimulationEventV1) => event.type === 'point'));
      if (data.status !== 'running') {
        terminal = data;
        break;
      }
      cursor = data.nextCursor;
    }

    expect(points).toHaveLength(4);
    expect(terminal).toMatchObject({
      status: 'failed',
      events: [],
      nextCursor: null,
      terminal: {
        apiVersion: '1', ok: false, requestId: jobId,
        error: {
          code: 'RESOURCE_LIMIT', phase: 'solve', retryable: false,
          details: { limit: 'maxResultPoints', maximum: 4, actual: 6 },
        },
        partial: {
          analyses: expect.any(Array),
          partialEventSha256: sha256CanonicalJson(points),
        },
      },
    });
    expect(JSON.stringify(terminal)).not.toContain('spice-ts');
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
    const malformedCursor = await executeTool('spice_simulation_read', {
      jobId, cursor: 'not-a-cursor',
    });

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
    expect(malformedCursor).toMatchObject({
      isError: true,
      structuredContent: { error: { code: 'INVALID_REQUEST', phase: 'validation' } },
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

  it('replays terminal cursors until deterministic terminal expiry', async () => {
    const clock = new ManualClock();
    const request = await fixture<SimulationRequestV1>('simulate-request.json');
    const result = await fixture<SimulationResultV1>('simulate-response.json');
    const execute = createToolExecutor({
      clock,
      streamLimits: { runningJobTtlMs: 100, terminalJobTtlMs: 50 },
      simulate: async () => result,
    });
    const started = await execute('spice_simulation_start', { request });
    const { jobId, cursor } = started.structuredContent as { jobId: string; cursor: string };
    await Promise.resolve();
    await Promise.resolve();

    const complete = await execute('spice_simulation_read', { jobId, cursor });
    clock.advanceBy(49);
    const replay = await execute('spice_simulation_read', { jobId, cursor, maxPoints: 1 });
    expect(replay).toEqual(complete);

    clock.advanceBy(1);
    const expired = await execute('spice_simulation_read', { jobId, cursor });
    expect(expired).toMatchObject({
      isError: true,
      structuredContent: {
        error: {
          code: 'INVALID_REQUEST', phase: 'validation',
          message: 'The simulation job was not found', details: {},
        },
      },
    });
  });

  it('expires a running job and terminates its worker without wall-clock sleeps', async () => {
    class PendingWorker extends EventEmitter {
      readonly terminate = vi.fn(() => 0);
      postMessage(message: unknown): void {
        if (!isWorkerOperation(message)) return;
        queueMicrotask(() => this.emit('message', {
          type: 'events',
          events: [
            { type: 'analysis-start', analysis: 'tran', analysisIndex: 0 },
            {
              type: 'point', analysisIndex: 0, pointIndex: 0,
              point: { type: 'tran', timeS: 0, voltagesV: { out: 0 }, currentsA: {} },
            },
          ],
        }));
      }
    }
    const clock = new ManualClock();
    const worker = new PendingWorker();
    const request = await fixture<SimulationRequestV1>('simulate-request.json');
    const execute = createToolExecutor({
      clock,
      streamLimits: { runningJobTtlMs: 25, terminalJobTtlMs: 50 },
      workerFactory: () => worker as unknown as ExecutionWorker,
    });
    const started = await execute('spice_simulation_start', { request });
    const { jobId, cursor } = started.structuredContent as { jobId: string; cursor: string };
    await flushMicrotasks();
    const first = await execute('spice_simulation_read', { jobId, cursor });
    const firstData = first.structuredContent as unknown as SimulationReadDataV1;
    const points = firstData.events.filter(event => event.type === 'point');

    clock.advanceBy(25);
    await Promise.resolve();
    const expired = await execute('spice_simulation_read', {
      jobId, cursor: firstData.nextCursor,
    });

    expect(expired.structuredContent).toMatchObject({
      status: 'failed', events: [], nextCursor: null,
      terminal: {
        error: {
          code: 'RESOURCE_LIMIT', phase: 'transport',
          details: { limit: 'runningJobTtlMs', maximum: 25, actual: 25 },
        },
        partial: {
          analyses: [{ analysis: 'tran', analysisIndex: 0, emittedPointCount: 1, complete: false }],
          partialEventSha256: sha256CanonicalJson(points),
        },
      },
    });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it.each([
    ['events', { maxUnreadEvents: 1, maxUnreadBytes: 1024 * 1024 }, 'maxUnreadEvents', 2],
    ['bytes', { maxUnreadEvents: 256, maxUnreadBytes: 1 }, 'maxUnreadBytes', expect.any(Number)],
  ])('fails before retaining an over-limit unread batch by %s', async (
    _name, streamLimits, limit, actual,
  ) => {
    class StreamingWorker extends EventEmitter {
      readonly terminate = vi.fn(() => 0);
      postMessage(message: unknown): void {
        if (!isWorkerOperation(message)) return;
        queueMicrotask(() => this.emit('message', {
          type: 'events',
          events: [
            { type: 'analysis-start', analysis: 'tran', analysisIndex: 0 },
            {
              type: 'point', analysisIndex: 0, pointIndex: 0,
              point: { type: 'tran', timeS: 0, voltagesV: { out: 0 }, currentsA: {} },
            },
          ],
        }));
      }
    }
    const request = await fixture<SimulationRequestV1>('simulate-request.json');
    const execute = createToolExecutor({
      streamLimits,
      workerFactory: () => new StreamingWorker() as unknown as ExecutionWorker,
    });
    const started = await execute('spice_simulation_start', { request });
    const { jobId, cursor } = started.structuredContent as { jobId: string; cursor: string };
    await flushMicrotasks();
    const failed = await execute('spice_simulation_read', { jobId, cursor });

    expect(failed.structuredContent).toMatchObject({
      status: 'failed', events: [], nextCursor: null,
      terminal: {
        error: {
          code: 'RESOURCE_LIMIT', phase: 'transport',
          details: { limit, maximum: streamLimits[limit === 'maxUnreadEvents' ? 'maxUnreadEvents' : 'maxUnreadBytes'], actual },
        },
        partial: { analyses: [], partialEventSha256: sha256CanonicalJson([]) },
      },
    });
  });

  it('cancels a worker blocked on an unread batch without delivering it', async () => {
    class BackpressuredWorker extends EventEmitter {
      readonly terminate = vi.fn(() => 0);
      readonly acknowledgements: unknown[] = [];
      postMessage(message: unknown): void {
        if (!isWorkerOperation(message)) {
          this.acknowledgements.push(message);
          return;
        }
        queueMicrotask(() => this.emit('message', {
          type: 'events',
          events: [
            { type: 'analysis-start', analysis: 'tran', analysisIndex: 0 },
            {
              type: 'point', analysisIndex: 0, pointIndex: 0,
              point: { type: 'tran', timeS: 0, voltagesV: { out: 0 }, currentsA: {} },
            },
          ],
        }));
      }
    }
    const worker = new BackpressuredWorker();
    const request = await fixture<SimulationRequestV1>('simulate-request.json');
    const execute = createToolExecutor({
      streamLimits: { maxUnreadEvents: 2, maxUnreadBytes: 1024 },
      workerFactory: () => worker as unknown as ExecutionWorker,
    });
    const started = await execute('spice_simulation_start', { request });
    const { jobId } = started.structuredContent as { jobId: string };
    await Promise.resolve();
    await Promise.resolve();

    const cancelled = await execute('spice_simulation_cancel', { jobId });
    await Promise.resolve();

    expect(cancelled.structuredContent).toMatchObject({
      status: 'cancelled', events: [],
      terminal: { partial: { analyses: [], partialEventSha256: sha256CanonicalJson([]) } },
    });
    expect(worker.acknowledgements).toEqual([]);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('cleans up a worker-death terminal when its retention expires', async () => {
    class DeadWorker extends EventEmitter {
      readonly terminate = vi.fn(() => 1);
      postMessage(): void { queueMicrotask(() => this.emit('exit', 1)); }
    }
    const clock = new ManualClock();
    const request = await fixture<SimulationRequestV1>('simulate-request.json');
    const execute = createToolExecutor({
      clock,
      streamLimits: { runningJobTtlMs: 100, terminalJobTtlMs: 10 },
      workerFactory: () => new DeadWorker() as unknown as ExecutionWorker,
    });
    const started = await execute('spice_simulation_start', { request });
    const { jobId, cursor } = started.structuredContent as { jobId: string; cursor: string };
    await Promise.resolve();
    await Promise.resolve();
    const failed = await execute('spice_simulation_read', { jobId, cursor });
    expect(failed.structuredContent).toMatchObject({
      status: 'failed', terminal: { error: { code: 'INTERNAL_ERROR' } },
    });

    clock.advanceBy(10);
    const cleaned = await execute('spice_simulation_cancel', { jobId });
    expect(cleaned).toMatchObject({
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

function isWorkerOperation(value: unknown): boolean {
  return value !== null && typeof value === 'object' && 'operation' in value;
}

class ManualClock {
  private time = 0;
  private nextTimerId = 1;
  private readonly timers = new Map<number, { deadline: number; callback: () => void }>();

  now(): number { return this.time; }

  setTimeout(callback: () => void, delayMs: number): number {
    const id = this.nextTimerId++;
    this.timers.set(id, { deadline: this.time + delayMs, callback });
    return id;
  }

  clearTimeout(id: unknown): void {
    if (typeof id === 'number') this.timers.delete(id);
  }

  advanceBy(milliseconds: number): void {
    this.time += milliseconds;
    for (const [id, timer] of [...this.timers]) {
      if (timer.deadline <= this.time) {
        this.timers.delete(id);
        timer.callback();
      }
    }
  }
}

class UnexpectedExitWorker extends EventEmitter {
  readonly terminate = vi.fn(() => 1);

  postMessage(): void {}

  exit(code: number): void {
    this.emit('exit', code);
  }

  terminateUnexpectedly(): void {
    this.terminate();
    this.emit('exit', 1);
  }

  failRepeatedly(): void {
    this.emit('error', new Error('private worker failure'));
    this.emit('exit', 1);
    this.emit('exit', 1);
  }
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 8; index++) await Promise.resolve();
}
