import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import type { SimulationRequestV1, SimulationResultV1 } from '@spice-ts/protocol';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_MCP_LIMITS, executeTool } from './server.js';
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
});
