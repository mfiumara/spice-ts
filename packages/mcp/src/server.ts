import { mapProtocolErrorV1, simulateProtocolV1, validateProtocolV1 } from '@spice-ts/core';
import { commonSchemaV1, sha256CanonicalJson } from '@spice-ts/protocol';
import type {
  AnalysisResultV1,
  AnalysisV1,
  JsonObject,
  JsonValue,
  PartialAnalysisV1,
  ResolvedOptionsV1,
  RunMetadataV1,
  SimulationEventV1,
  SimulationReadDataV1,
  SimulationRequestV1,
  SimulationResultV1,
  SpiceApiErrorV1,
  StreamTerminalV1,
  SuccessEnvelopeV1,
} from '@spice-ts/protocol';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';

export interface McpLimits {
  maxDocumentBytes: number;
  maxAnalyses: number;
  maxResultPoints: number;
  maxSerializedResultBytes: number;
  maxWallTimeMs: number;
}

export interface McpStreamLimits {
  runningJobTtlMs: number;
  terminalJobTtlMs: number;
  maxUnreadEvents: number;
  maxUnreadBytes: number;
}

export interface StreamClock {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface ToolExecutionOptions {
  limits?: McpLimits;
  signal?: AbortSignal;
  validate?: typeof validateProtocolV1;
  simulate?: typeof simulateProtocolV1;
  workerFactory?: () => ExecutionWorker;
}

export interface ToolExecutorOptions extends ToolExecutionOptions {
  clock?: StreamClock;
  streamLimits?: Partial<McpStreamLimits>;
}

export type ToolExecutor = (
  name: string,
  args: unknown,
  options?: ToolExecutionOptions,
) => Promise<CallToolResult>;

export interface ExecutionWorker {
  postMessage(message: unknown): void;
  terminate(): Promise<number> | number;
  on(event: 'message', listener: (message: WorkerReply) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'exit', listener: (code: number) => void): this;
  off(event: 'message', listener: (message: WorkerReply) => void): this;
  off(event: 'error', listener: (error: Error) => void): this;
  off(event: 'exit', listener: (code: number) => void): this;
}

interface WorkerReply {
  type: 'result' | 'error' | 'events';
  result?: unknown;
  error?: SpiceApiErrorV1;
  events?: SimulationEventV1[];
}

interface WorkerRequest {
  operation: 'validate' | 'simulate' | 'stream';
  request: SimulationRequestV1;
  coreModulePath: string;
}

export const DEFAULT_MCP_LIMITS: Readonly<McpLimits> = Object.freeze({
  maxDocumentBytes: 256 * 1024,
  maxAnalyses: 8,
  maxResultPoints: 100_000,
  maxSerializedResultBytes: 4 * 1024 * 1024,
  maxWallTimeMs: 10_000,
});

export const DEFAULT_STREAM_CHUNK_POINTS = 256;
export const MAX_STREAM_CHUNK_POINTS = 1024;
export const MAX_RETAINED_STREAM_JOBS = 16;
export const DEFAULT_MCP_STREAM_LIMITS: Readonly<McpStreamLimits> = Object.freeze({
  runningJobTtlMs: 30_000,
  terminalJobTtlMs: 60_000,
  maxUnreadEvents: 256,
  maxUnreadBytes: 1024 * 1024,
});
const PACKAGE_VERSION = '0.3.0';
const ENGINE_BUILD_ID = 'mcp-node-v1';

const requestInputSchema = {
  type: 'object',
  required: ['request'],
  properties: { request: { $ref: '#/$defs/simulationRequest' } },
  additionalProperties: false,
  $defs: commonSchemaV1.$defs,
};

const capabilitiesOutputSchema = {
  type: 'object',
  required: ['protocolVersion', 'analyses', 'inputFormats', 'limits', 'streaming'],
  properties: {
    protocolVersion: { const: '1' },
    analyses: { type: 'array', items: { enum: ['op', 'dc', 'tran', 'ac'] } },
    inputFormats: { type: 'array', items: { enum: ['spice', 'spice-ts'] } },
    limits: {
      type: 'object',
      required: Object.keys(DEFAULT_MCP_LIMITS),
      properties: Object.fromEntries(Object.keys(DEFAULT_MCP_LIMITS).map(key => [key, { type: 'integer', minimum: 0 }])),
      additionalProperties: false,
    },
    streaming: {
      type: 'object',
      required: [
        'defaultChunkPoints', 'maxChunkPoints', 'maxRetainedJobs',
        'runningJobTtlMs', 'terminalJobTtlMs', 'maxUnreadEvents', 'maxUnreadBytes',
      ],
      properties: {
        defaultChunkPoints: { const: DEFAULT_STREAM_CHUNK_POINTS },
        maxChunkPoints: { const: MAX_STREAM_CHUNK_POINTS },
        maxRetainedJobs: { const: MAX_RETAINED_STREAM_JOBS },
        runningJobTtlMs: { type: 'integer', minimum: 0 },
        terminalJobTtlMs: { type: 'integer', minimum: 0 },
        maxUnreadEvents: { type: 'integer', minimum: 0 },
        maxUnreadBytes: { type: 'integer', minimum: 0 },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
};

const validationOutputSchema = {
  type: 'object',
  required: ['status', 'nodeCount', 'branchCount', 'analysisCount'],
  properties: {
    status: { const: 'valid' },
    nodeCount: { type: 'integer', minimum: 0 },
    branchCount: { type: 'integer', minimum: 0 },
    analysisCount: { type: 'integer', minimum: 0 },
  },
  additionalProperties: false,
};

const streamStartOutputSchema = {
  type: 'object',
  required: ['jobId', 'status', 'cursor'],
  properties: {
    jobId: { type: 'string', minLength: 1 },
    status: { const: 'running' },
    cursor: { type: 'string', minLength: 1 },
  },
  additionalProperties: false,
};

const toolFailureOutputSchema = {
  type: 'object',
  required: ['error'],
  properties: { error: { $ref: '#/$defs/apiError' } },
  additionalProperties: false,
};

const streamStartToolOutputSchema = {
  type: 'object',
  oneOf: [streamStartOutputSchema, toolFailureOutputSchema],
  $defs: commonSchemaV1.$defs,
};

const streamReadInputSchema = {
  type: 'object',
  required: ['jobId', 'cursor'],
  properties: {
    jobId: { type: 'string', minLength: 1 },
    cursor: { type: 'string', minLength: 1 },
    maxPoints: { type: 'integer', minimum: 1, maximum: MAX_STREAM_CHUNK_POINTS },
  },
  additionalProperties: false,
};

const streamCancelInputSchema = {
  type: 'object',
  required: ['jobId'],
  properties: { jobId: { type: 'string', minLength: 1 } },
  additionalProperties: false,
};

const streamToolOutputSchema = {
  type: 'object',
  oneOf: [
    { $ref: '#/$defs/simulationReadData' },
    toolFailureOutputSchema,
  ],
  $defs: commonSchemaV1.$defs,
};

export const MCP_TOOLS = Object.freeze([
  {
    name: 'spice_capabilities',
    description: 'Describe the deterministic bounded spice-ts protocol-v1 tool surface.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    outputSchema: capabilitiesOutputSchema,
  },
  {
    name: 'spice_validate',
    description: 'Parse, compile, and validate one bounded protocol-v1 simulation request without solving it.',
    inputSchema: requestInputSchema,
    outputSchema: validationOutputSchema,
  },
  {
    name: 'spice_simulate',
    description: 'Execute one bounded protocol-v1 simulation request.',
    inputSchema: requestInputSchema,
    outputSchema: { ...commonSchemaV1.$defs.simulationResult, $defs: commonSchemaV1.$defs },
  },
  {
    name: 'spice_simulation_start',
    description: 'Start one bounded protocol-v1 simulation job and return its first opaque cursor.',
    inputSchema: requestInputSchema,
    outputSchema: streamStartToolOutputSchema,
  },
  {
    name: 'spice_simulation_read',
    description: 'Read one deterministic point-bounded chunk from a simulation job.',
    inputSchema: streamReadInputSchema,
    outputSchema: streamToolOutputSchema,
  },
  {
    name: 'spice_simulation_cancel',
    description: 'Cancel a simulation job and return its protocol-v1 partial terminal.',
    inputSchema: streamCancelInputSchema,
    outputSchema: streamToolOutputSchema,
  },
]) as readonly Tool[];

const capabilities = Object.freeze({
  protocolVersion: '1',
  analyses: Object.freeze(['op', 'dc', 'tran', 'ac']),
  inputFormats: Object.freeze(['spice', 'spice-ts']),
  limits: DEFAULT_MCP_LIMITS,
  streaming: Object.freeze({
    defaultChunkPoints: DEFAULT_STREAM_CHUNK_POINTS,
    maxChunkPoints: MAX_STREAM_CHUNK_POINTS,
    maxRetainedJobs: MAX_RETAINED_STREAM_JOBS,
    ...DEFAULT_MCP_STREAM_LIMITS,
  }),
});

export async function executeTool(
  name: string,
  args: unknown,
  options: ToolExecutionOptions = {},
): Promise<CallToolResult> {
  return executeToolWithStore(name, args, options, defaultStreamStore);
}

export function createToolExecutor(baseOptions: ToolExecutorOptions = {}): ToolExecutor {
  const { clock, streamLimits, ...executionOptions } = baseOptions;
  const store = new StreamStore(streamLimits, clock);
  return (name, args, options = {}) => executeToolWithStore(
    name,
    args,
    { ...executionOptions, ...options },
    store,
  );
}

async function executeToolWithStore(
  name: string,
  args: unknown,
  options: ToolExecutionOptions,
  streamStore: StreamStore,
): Promise<CallToolResult> {
  const limits = options.limits ?? DEFAULT_MCP_LIMITS;
  try {
    if (name === 'spice_capabilities') return success(streamStore.capabilities());
    if (name === 'spice_simulation_read') return success(streamStore.read(streamReadArgs(args)));
    if (name === 'spice_simulation_cancel') return success(streamStore.cancel(streamCancelArgs(args)));
    if (name !== 'spice_validate' && name !== 'spice_simulate' && name !== 'spice_simulation_start') {
      return failure(apiError('INVALID_REQUEST', 'Unknown tool', 'transport', {}));
    }

    const request = toolRequest(args);
    const effective = effectiveLimits(request, limits);
    enforceRequestBounds(request, effective);
    throwIfCancelled(options.signal);

    if (name === 'spice_validate') {
      const bounded = boundedRequest(request, effective);
      const result = options.validate
        ? await boundedCall(() => options.validate!(bounded), effective.maxWallTimeMs, options.signal)
        : await runInWorker<Record<string, unknown>>(
          'validate', bounded, effective.maxWallTimeMs, options,
        );
      return success(result);
    }

    const bounded = boundedRequest(request, effective);
    if (name === 'spice_simulation_start') {
      return success(streamStore.start(bounded, effective, options));
    }
    const result = options.simulate
      ? await boundedCall(() => options.simulate!(bounded), effective.maxWallTimeMs, options.signal)
      : await runInWorker<SimulationResultV1>('simulate', bounded, effective.maxWallTimeMs, options);
    enforceResultBounds(result, effective);
    return success(result);
  } catch (error) {
    return failure(publicError(error));
  }
}

interface StreamReadArgs {
  jobId: string;
  cursor: string;
  maxPoints: number;
}

interface StreamJob {
  request: SimulationRequestV1;
  state:
    | { status: 'pending' }
    | { status: 'ready'; result: SimulationResultV1 }
    | { status: 'failed'; error: SpiceApiErrorV1 };
  controller: AbortController;
  cursorOffsets: Map<string, number>;
  replay: Map<string, SimulationReadDataV1>;
  events: SimulationEventV1[];
  eventBaseOffset: number;
  unreadBytes: number;
  emitted: SimulationEventV1[];
  producedPointCount: number;
  liveEventsProduced: boolean;
  releaseBatch?: () => void;
  batchEndOffset?: number;
  terminal?: SimulationReadDataV1;
  startedAt: number;
  terminalAt?: number;
  runningTimer?: unknown;
  terminalTimer?: unknown;
}

class StreamStore {
  private readonly jobs = new Map<string, StreamJob>();
  private nextJobId = 1;

  private readonly limits: McpStreamLimits;

  constructor(
    limits: Partial<McpStreamLimits> = {},
    private readonly clock: StreamClock = systemClock,
  ) {
    this.limits = { ...DEFAULT_MCP_STREAM_LIMITS, ...limits };
  }

  capabilities(): typeof capabilities {
    return {
      ...capabilities,
      streaming: { ...capabilities.streaming, ...this.limits },
    } as typeof capabilities;
  }

  start(request: SimulationRequestV1, limits: McpLimits, options: ToolExecutionOptions): JsonObject {
    if (this.jobs.size >= MAX_RETAINED_STREAM_JOBS) {
      const completed = [...this.jobs].find(([, job]) => job.terminal !== undefined);
      if (completed) this.delete(completed[0], completed[1]);
    }
    if (this.jobs.size >= MAX_RETAINED_STREAM_JOBS) {
      throw apiError('RESOURCE_LIMIT', 'The retained stream-job limit was exceeded', 'transport', {
        limit: 'maxRetainedStreamJobs', maximum: MAX_RETAINED_STREAM_JOBS,
        actual: this.jobs.size + 1,
      });
    }
    const jobId = `job-${this.nextJobId++}`;
    const cursor = streamCursor(jobId, 0);
    const job: StreamJob = {
      request,
      state: { status: 'pending' },
      controller: new AbortController(),
      cursorOffsets: new Map([[cursor, 0]]),
      replay: new Map(),
      events: [],
      eventBaseOffset: 0,
      unreadBytes: 0,
      emitted: [],
      producedPointCount: 0,
      liveEventsProduced: false,
      startedAt: this.clock.now(),
    };
    this.jobs.set(jobId, job);
    job.runningTimer = this.clock.setTimeout(
      () => this.expireRunning(jobId, job),
      this.limits.runningJobTtlMs,
    );
    void this.solve(jobId, job, limits, options);
    return { jobId, status: 'running', cursor };
  }

  read(args: StreamReadArgs): SimulationReadDataV1 {
    const job = this.job(args.jobId);
    const offset = job.cursorOffsets.get(args.cursor);
    if (offset === undefined) {
      throw apiError('INVALID_REQUEST', 'The stream cursor is invalid for this job', 'validation', {});
    }
    const replay = job.replay.get(args.cursor);
    if (replay) return replay;
    if (job.terminal) return job.terminal;
    const eventEndOffset = job.eventBaseOffset + job.events.length;
    if (job.state.status === 'pending' && offset >= eventEndOffset) {
      return { status: 'running', events: [], nextCursor: args.cursor };
    }

    const events: SimulationEventV1[] = [];
    let pointCount = 0;
    let nextOffset = offset;
    while (nextOffset < eventEndOffset) {
      const event = job.events[nextOffset - job.eventBaseOffset]!;
      if (event.type === 'point' && pointCount >= args.maxPoints) break;
      events.push(event);
      nextOffset++;
      if (event.type === 'point') {
        pointCount++;
        if (pointCount === args.maxPoints) break;
      }
    }
    job.emitted.push(...events);
    const consumedCount = nextOffset - job.eventBaseOffset;
    if (consumedCount > 0) {
      const consumed = job.events.splice(0, consumedCount);
      job.unreadBytes -= serializedEventBytes(consumed);
      job.eventBaseOffset = nextOffset;
    }
    if (events.length > 0 && job.batchEndOffset !== undefined && nextOffset >= job.batchEndOffset) {
      job.releaseBatch?.();
      job.releaseBatch = undefined;
      job.batchEndOffset = undefined;
    }

    let data: SimulationReadDataV1;
    if (nextOffset < eventEndOffset || job.state.status === 'pending') {
      const nextCursor = streamCursor(args.jobId, nextOffset);
      job.cursorOffsets.set(nextCursor, nextOffset);
      data = { status: 'running', events, nextCursor };
    } else if (job.state.status === 'failed') {
      data = failureRead(args.jobId, job.emitted, job.state.error, events);
      job.terminal = data;
    } else {
      data = {
        status: 'complete', events, nextCursor: null,
        terminal: successTerminal(args.jobId, job.request, job.state.result),
      };
      job.terminal = data;
    }
    job.replay.set(args.cursor, data);
    return data;
  }

  cancel(jobId: string): SimulationReadDataV1 {
    const job = this.job(jobId);
    if (job.terminal) return job.terminal;
    job.controller.abort();
    job.releaseBatch?.();
    job.releaseBatch = undefined;
    job.events = [];
    job.unreadBytes = 0;
    const data = failureRead(jobId, job.emitted, {
      code: 'CANCELLED', message: 'The simulation job was cancelled',
      retryable: true, phase: 'solve', details: {},
    });
    job.terminal = data;
    this.enterTerminal(jobId, job);
    return data;
  }

  private async solve(
    jobId: string,
    job: StreamJob,
    limits: McpLimits,
    options: ToolExecutionOptions,
  ): Promise<void> {
    const solveOptions = { ...options, signal: job.controller.signal };
    try {
      const result = options.simulate
        ? await boundedCall(() => options.simulate!(job.request), limits.maxWallTimeMs, job.controller.signal)
        : await runStreamingWorker(job.request, limits.maxWallTimeMs, solveOptions, events => {
          const producedPointCount = job.producedPointCount
            + events.filter(event => event.type === 'point').length;
          enforceMaximum(
            'maxResultPoints', limits.maxResultPoints, producedPointCount, 'solve',
          );
          this.retainEvents(events, job);
          job.liveEventsProduced = true;
          job.producedPointCount = producedPointCount;
          job.batchEndOffset = job.eventBaseOffset + job.events.length;
          return new Promise<void>(resolve => { job.releaseBatch = resolve; });
        });
      enforceResultBounds(result, limits);
      if (!job.terminal) {
        if (!job.liveEventsProduced) this.retainEvents(resultEvents(result), job);
        job.state = { status: 'ready', result };
        this.enterTerminal(jobId, job);
      }
    } catch (error) {
      if (!job.terminal) {
        const publicFailure = publicError(error);
        job.state = { status: 'failed', error: publicFailure };
        if (job.events.length === 0) job.terminal = failureRead(jobId, job.emitted, publicFailure);
        this.enterTerminal(jobId, job);
      }
    }
  }

  private retainEvents(events: SimulationEventV1[], job: StreamJob): void {
    const unreadEvents = job.events.length + events.length;
    enforceStreamMaximum('maxUnreadEvents', this.limits.maxUnreadEvents, unreadEvents);
    const unreadBytes = job.unreadBytes + serializedEventBytes(events);
    enforceStreamMaximum('maxUnreadBytes', this.limits.maxUnreadBytes, unreadBytes);
    job.events.push(...events);
    job.unreadBytes = unreadBytes;
  }

  private expireRunning(jobId: string, job: StreamJob): void {
    if (this.jobs.get(jobId) !== job || job.terminalAt !== undefined) return;
    job.controller.abort();
    job.releaseBatch?.();
    job.releaseBatch = undefined;
    job.events = [];
    job.unreadBytes = 0;
    const error = apiError(
      'RESOURCE_LIMIT', 'The simulation job TTL was exceeded', 'transport',
      {
        limit: 'runningJobTtlMs', maximum: this.limits.runningJobTtlMs,
        actual: this.clock.now() - job.startedAt,
      },
    );
    job.state = { status: 'failed', error };
    job.terminal = failureRead(jobId, job.emitted, error);
    this.enterTerminal(jobId, job);
  }

  private enterTerminal(jobId: string, job: StreamJob): void {
    if (job.terminalAt !== undefined) return;
    job.terminalAt = this.clock.now();
    if (job.runningTimer !== undefined) this.clock.clearTimeout(job.runningTimer);
    job.runningTimer = undefined;
    job.terminalTimer = this.clock.setTimeout(
      () => this.delete(jobId, job),
      this.limits.terminalJobTtlMs,
    );
  }

  private delete(jobId: string, job: StreamJob): void {
    if (this.jobs.get(jobId) !== job) return;
    if (job.runningTimer !== undefined) this.clock.clearTimeout(job.runningTimer);
    if (job.terminalTimer !== undefined) this.clock.clearTimeout(job.terminalTimer);
    job.controller.abort();
    job.releaseBatch?.();
    this.jobs.delete(jobId);
  }

  private job(jobId: string): StreamJob {
    const job = this.jobs.get(jobId);
    if (!job) throw apiError('INVALID_REQUEST', 'The simulation job was not found', 'validation', {});
    return job;
  }
}

function failureRead(
  jobId: string,
  emitted: SimulationEventV1[],
  error: SpiceApiErrorV1,
  events: SimulationEventV1[] = [],
): SimulationReadDataV1 {
  const terminal: StreamTerminalV1 = {
    apiVersion: '1', ok: false, requestId: jobId,
    error,
    diagnostics: [],
    partial: {
      status: 'partial',
      analyses: partialAnalyses(emitted),
      partialEventSha256: sha256CanonicalJson(emitted.filter(event => event.type === 'point')),
    },
  };
  return {
    status: error.code === 'CANCELLED' ? 'cancelled' : 'failed',
    events, nextCursor: null, terminal,
  };
}

const systemClock: StreamClock = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => {
    const timer = setTimeout(callback, delayMs);
    timer.unref();
    return timer;
  },
  clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

function serializedEventBytes(events: SimulationEventV1[]): number {
  return events.reduce((total, event) => total + Buffer.byteLength(JSON.stringify(event)), 0);
}

function enforceStreamMaximum(
  limit: 'maxUnreadEvents' | 'maxUnreadBytes',
  maximum: number,
  actual: number,
): void {
  if (actual > maximum) {
    throw apiError('RESOURCE_LIMIT', 'A configured stream retention limit was exceeded', 'transport', {
      limit, maximum, actual,
    });
  }
}

const defaultStreamStore = new StreamStore();

function streamReadArgs(args: unknown): StreamReadArgs {
  if (!isRecord(args) || typeof args.jobId !== 'string' || typeof args.cursor !== 'string') {
    throw apiError('INVALID_REQUEST', "Expected 'jobId' and 'cursor' strings", 'validation', {});
  }
  const maxPoints = args.maxPoints ?? DEFAULT_STREAM_CHUNK_POINTS;
  if (!Number.isInteger(maxPoints) || (maxPoints as number) <= 0) {
    throw apiError('INVALID_REQUEST', "'maxPoints' must be a positive integer", 'validation', {});
  }
  enforceMaximum('maxStreamChunkPoints', MAX_STREAM_CHUNK_POINTS, maxPoints as number, 'transport');
  return { jobId: args.jobId, cursor: args.cursor, maxPoints: maxPoints as number };
}

function streamCancelArgs(args: unknown): string {
  if (!isRecord(args) || typeof args.jobId !== 'string') {
    throw apiError('INVALID_REQUEST', "Expected a 'jobId' string", 'validation', {});
  }
  return args.jobId;
}

function streamCursor(jobId: string, offset: number): string {
  return Buffer.from(`${jobId}:${offset}`, 'utf8').toString('base64url');
}

function resultEvents(result: SimulationResultV1): SimulationEventV1[] {
  const events: SimulationEventV1[] = [];
  for (const analysis of result.analyses) {
    const common = { analysisIndex: analysis.analysisIndex, ...(analysis.step ? { step: analysis.step } : {}) };
    events.push({ type: 'analysis-start', analysis: analysis.type, ...common });
    const points = analysisPoints(analysis);
    points.forEach((point, pointIndex) => events.push({ type: 'point', ...common, pointIndex, point }));
    events.push({ type: 'analysis-end', analysis: analysis.type, ...common, pointCount: points.length });
  }
  return events;
}

function analysisPoints(analysis: AnalysisResultV1): Array<Extract<SimulationEventV1, { type: 'point' }>['point']> {
  switch (analysis.type) {
    case 'op': return [];
    case 'dc': return analysis.axis.values.map((value, index) => ({
      type: 'dc', axis: { name: analysis.axis.name, unit: analysis.axis.unit, value },
      voltagesV: indexedRecord(analysis.voltagesV, index), currentsA: indexedRecord(analysis.currentsA, index),
    }));
    case 'tran': return analysis.timeS.map((timeS, index) => ({
      type: 'tran', timeS,
      voltagesV: indexedRecord(analysis.voltagesV, index), currentsA: indexedRecord(analysis.currentsA, index),
    }));
    case 'ac': return analysis.frequencyHz.map((frequencyHz, index) => ({
      type: 'ac', frequencyHz,
      voltagePhasors: indexedRecord(analysis.voltagePhasors, index),
      currentPhasors: indexedRecord(analysis.currentPhasors, index),
    }));
  }
}

function indexedRecord<T>(record: Record<string, T[]>, index: number): Record<string, T> {
  return Object.fromEntries(Object.entries(record).map(([key, values]) => [key, values[index]!]));
}

function partialAnalyses(events: SimulationEventV1[]): PartialAnalysisV1[] {
  const analyses = new Map<string, PartialAnalysisV1>();
  for (const event of events) {
    if (event.type === 'diagnostic') continue;
    const key = `${event.analysisIndex}:${event.step?.index ?? ''}`;
    if (event.type === 'analysis-start' && event.analysis !== 'op') {
      analyses.set(key, {
        analysis: event.analysis, analysisIndex: event.analysisIndex,
        ...(event.step ? { step: event.step } : {}), emittedPointCount: 0, complete: false,
      });
    } else if (event.type === 'point') {
      const analysis = analyses.get(key);
      if (analysis) analysis.emittedPointCount++;
    } else if (event.type === 'analysis-end') {
      const analysis = analyses.get(key);
      if (analysis) analysis.complete = true;
    }
  }
  return [...analyses.values()];
}

function successTerminal(
  requestId: string,
  request: SimulationRequestV1,
  result: SimulationResultV1,
): SuccessEnvelopeV1<SimulationResultV1> {
  return {
    apiVersion: '1', ok: true, requestId, data: result, diagnostics: [],
    metadata: runMetadata(request, sha256CanonicalJson(result)),
  };
}

function runMetadata(request: SimulationRequestV1, resultSha256: string): RunMetadataV1 {
  return {
    protocolVersion: '1',
    ...(request.input.format === 'spice-ts' ? { nativeSchemaVersion: '1.0' as const } : {}),
    spiceTsVersion: PACKAGE_VERSION,
    engineBuildId: ENGINE_BUILD_ID,
    backend: 'spice-ts-js',
    backendVersion: PACKAGE_VERSION,
    resolvedOptions: resolvedOptions(request),
    inputSha256: sha256CanonicalJson(request.input),
    resultSha256,
    runtime: { family: 'node', version: process.versions.node },
    architecture: process.arch,
    determinism: request.options?.determinism ?? 'strict',
  };
}

function resolvedOptions(request: SimulationRequestV1): ResolvedOptionsV1 {
  const options = request.options;
  return {
    backend: 'spice-ts-js', abstol: options?.abstol ?? 1e-12, vntol: options?.vntol ?? 1e-6,
    reltol: options?.reltol ?? 1e-3, maxIterations: options?.maxIterations ?? 100,
    maxTransientIterations: options?.maxTransientIterations ?? 50,
    maxTimestep: options?.maxTimestep ?? Number.MAX_VALUE,
    integrationMethod: options?.integrationMethod ?? 'trapezoidal', trtol: options?.trtol ?? 7,
    gmin: options?.gmin ?? 0, determinism: options?.determinism ?? 'strict',
    ...(options?.limits ? { limits: options.limits } : {}),
  };
}

function effectiveLimits(request: SimulationRequestV1, configured: McpLimits): McpLimits {
  const requested = request.options?.limits;
  return {
    maxDocumentBytes: Math.min(requested?.maxSourceBytes ?? configured.maxDocumentBytes, configured.maxDocumentBytes),
    maxAnalyses: Math.min(requested?.maxAnalyses ?? configured.maxAnalyses, configured.maxAnalyses),
    maxResultPoints: Math.min(requested?.maxResultPoints ?? configured.maxResultPoints, configured.maxResultPoints),
    maxSerializedResultBytes: Math.min(requested?.maxSerializedResultBytes ?? configured.maxSerializedResultBytes, configured.maxSerializedResultBytes),
    maxWallTimeMs: Math.min(requested?.maxWallTimeMs ?? configured.maxWallTimeMs, configured.maxWallTimeMs),
  };
}

function toolRequest(args: unknown): SimulationRequestV1 {
  if (!isRecord(args) || !isRecord(args.request)) {
    throw apiError('INVALID_REQUEST', "Expected an object containing 'request'", 'validation', {});
  }
  const request = args.request;
  if (request.apiVersion !== '1' || !isRecord(request.input)) {
    throw apiError('INVALID_REQUEST', 'Expected a protocol-v1 simulation request', 'validation', {});
  }
  const format = request.input.format;
  if (format !== 'spice' && format !== 'spice-ts') {
    throw apiError('UNSUPPORTED_FEATURE', 'The requested input format is unavailable', 'validation', {});
  }
  if (isRecord(request.options) && request.options.backend !== undefined && request.options.backend !== 'spice-ts-js') {
    throw apiError('BACKEND_UNAVAILABLE', 'The requested simulation backend is unavailable', 'validation', {});
  }
  return request as unknown as SimulationRequestV1;
}

function boundedRequest(request: SimulationRequestV1, limits: McpLimits): SimulationRequestV1 {
  const requested = request.options?.limits;
  return {
    ...request,
    options: {
      ...request.options,
      backend: 'spice-ts-js',
      limits: {
        ...requested,
        maxSourceBytes: Math.min(requested?.maxSourceBytes ?? limits.maxDocumentBytes, limits.maxDocumentBytes),
        maxAnalyses: Math.min(requested?.maxAnalyses ?? limits.maxAnalyses, limits.maxAnalyses),
        maxResultPoints: Math.min(requested?.maxResultPoints ?? limits.maxResultPoints, limits.maxResultPoints),
        maxSerializedResultBytes: Math.min(requested?.maxSerializedResultBytes ?? limits.maxSerializedResultBytes, limits.maxSerializedResultBytes),
        maxWallTimeMs: Math.min(requested?.maxWallTimeMs ?? limits.maxWallTimeMs, limits.maxWallTimeMs),
      },
    },
  };
}

function enforceRequestBounds(request: SimulationRequestV1, limits: McpLimits): void {
  const documentBytes = Buffer.byteLength(JSON.stringify(request.input));
  enforceMaximum('maxDocumentBytes', limits.maxDocumentBytes, documentBytes, 'validation');

  const analyses = requestAnalyses(request);
  enforceMaximum('maxAnalyses', limits.maxAnalyses, analyses.length, 'validation');
  enforceMaximum('maxResultPoints', limits.maxResultPoints, estimatedPoints(analyses), 'validation');
}

function requestAnalyses(request: SimulationRequestV1): AnalysisV1[] {
  if (request.input.format === 'spice-ts') return request.input.document.analyses;
  if (request.input.format !== 'spice') return request.input.analyses;

  const analyses: AnalysisV1[] = [];
  for (const sourceLine of request.input.source.split(/\r?\n/)) {
    const tokens = sourceLine.trim().split(/\s+/);
    switch (tokens[0]?.toLowerCase()) {
      case '.op': analyses.push({ type: 'op' }); break;
      case '.dc': analyses.push({ type: 'dc', source: tokens[1] ?? '', start: numberToken(tokens[2]), stop: numberToken(tokens[3]), step: numberToken(tokens[4]) }); break;
      case '.tran': analyses.push({ type: 'tran', timestep: numberToken(tokens[1]), stopTime: numberToken(tokens[2]), startTime: tokens[3] === undefined ? undefined : numberToken(tokens[3]) }); break;
      case '.ac': analyses.push({ type: 'ac', variation: acVariation(tokens[1]), points: numberToken(tokens[2]), startFreq: numberToken(tokens[3]), stopFreq: numberToken(tokens[4]) }); break;
    }
  }
  return analyses;
}

function numberToken(value: string | undefined): number {
  if (value === undefined) return Number.NaN;
  const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)([a-z]+)?$/i.exec(value);
  if (!match) return Number.NaN;
  const suffix = match[2]?.toLowerCase() ?? '';
  const multiplier: Record<string, number> = {
    '': 1, t: 1e12, g: 1e9, meg: 1e6, k: 1e3, m: 1e-3,
    u: 1e-6, n: 1e-9, p: 1e-12, f: 1e-15,
  };
  const scale = multiplier[suffix];
  return scale === undefined ? Number.NaN : Number(match[1]) * scale;
}

function acVariation(value: string | undefined): 'dec' | 'oct' | 'lin' {
  const normalized = value?.toLowerCase();
  return normalized === 'oct' || normalized === 'lin' ? normalized : 'dec';
}

function estimatedPoints(analyses: AnalysisV1[]): number {
  return analyses.reduce((total, analysis) => {
    switch (analysis.type) {
      case 'op': return total + 1;
      case 'dc': return total + linearPointCount(analysis.start, analysis.stop, analysis.step);
      case 'tran': return total + linearPointCount(analysis.startTime ?? 0, analysis.stopTime, analysis.timestep);
      case 'ac': {
        if (analysis.variation === 'lin') return total + analysis.points;
        const base = analysis.variation === 'dec' ? 10 : 2;
        const intervals = Math.max(0, Math.log(analysis.stopFreq / analysis.startFreq) / Math.log(base));
        return total + Math.floor(intervals * analysis.points + 1 + 1e-12);
      }
    }
  }, 0);
}

function linearPointCount(start: number, stop: number, step: number): number {
  if (!Number.isFinite(start) || !Number.isFinite(stop) || !Number.isFinite(step) || step === 0) return 0;
  return Math.max(0, Math.floor(Math.abs((stop - start) / step) + 1 + 1e-12));
}

function enforceResultBounds(result: SimulationResultV1, limits: McpLimits): void {
  let points = 0;
  for (const analysis of result.analyses) {
    switch (analysis.type) {
      case 'op': points += 1; break;
      case 'dc': points += analysis.axis.values.length; break;
      case 'tran': points += analysis.timeS.length; break;
      case 'ac': points += analysis.frequencyHz.length; break;
    }
  }
  enforceMaximum('maxResultPoints', limits.maxResultPoints, points, 'serialize');
  enforceMaximum('maxSerializedResultBytes', limits.maxSerializedResultBytes, Buffer.byteLength(JSON.stringify(result)), 'serialize');
}

function enforceMaximum(
  limit: keyof McpLimits | 'maxStreamChunkPoints',
  maximum: number,
  actual: number,
  phase: SpiceApiErrorV1['phase'],
): void {
  if (actual > maximum) {
    throw apiError('RESOURCE_LIMIT', 'A configured resource limit was exceeded', phase, { limit, maximum, actual });
  }
}

async function boundedCall<T>(operation: () => Promise<T>, wallTimeMs: number, signal?: AbortSignal): Promise<T> {
  throwIfCancelled(signal);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let abortHandler: (() => void) | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(apiError(
      'RESOURCE_LIMIT',
      'The simulation wall-time limit was exceeded',
      'solve',
      { limit: 'maxWallTimeMs', maximum: wallTimeMs },
    )), wallTimeMs);
  });
  const cancellationPromise = new Promise<never>((_resolve, reject) => {
    abortHandler = () => reject(cancelledError());
    signal?.addEventListener('abort', abortHandler, { once: true });
  });
  try {
    return await Promise.race([operation(), timeoutPromise, cancellationPromise]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    if (abortHandler) signal?.removeEventListener('abort', abortHandler);
  }
}

const workerSource = String.raw`
const { parentPort } = require('node:worker_threads');

const compareCodePoints = (left, right) => {
  const a = Array.from(left, character => character.codePointAt(0));
  const b = Array.from(right, character => character.codePointAt(0));
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
};

const sortedMap = (values, convert = value => value) => Object.fromEntries(
  [...values.entries()].sort(([left], [right]) => compareCodePoints(left, right))
    .map(([name, value]) => [name, convert(value)]),
);

const pointEvent = (point, common, pointIndex) => 'time' in point
  ? {
    type: 'point', ...common, pointIndex,
    point: {
      type: 'tran', timeS: point.time,
      voltagesV: sortedMap(point.voltages), currentsA: sortedMap(point.currents),
    },
  }
  : {
    type: 'point', ...common, pointIndex,
    point: {
      type: 'ac', frequencyHz: point.frequency,
      voltagePhasors: sortedMap(point.voltages, value => ({
        magnitude: value.magnitude, phaseDegrees: value.phase,
      })),
      currentPhasors: sortedMap(point.currents, value => ({
        magnitude: value.magnitude, phaseDegrees: value.phase,
      })),
    },
  };

const coreOptions = options => ({
  simulator: options?.backend === 'ngspice-wasm' ? 'ngspice-wasm' : 'spice-ts',
  abstol: options?.abstol,
  vntol: options?.vntol,
  reltol: options?.reltol,
  maxIterations: options?.maxIterations,
  maxTransientIterations: options?.maxTransientIterations,
  maxTimestep: options?.maxTimestep,
  integrationMethod: options?.integrationMethod,
  trtol: options?.trtol,
  gmin: options?.gmin,
});

const sendEvents = events => new Promise(resolve => {
  parentPort.once('message', resolve);
  parentPort.postMessage({ type: 'events', events });
});

async function streamProtocol(core, request) {
  if (request.input.format !== 'spice') return;
  const files = request.input.virtualFiles ?? {};
  const circuit = await core.parseTitlelessAsync(request.input.source, async path => {
    const source = files[path];
    if (source === undefined) throw new Error('A virtual include was not provided');
    return source;
  });
  const analyses = [...circuit.analyses];
  if (!analyses.every(analysis => analysis.type === 'tran' || analysis.type === 'ac')) return;
  const hasSteps = circuit.compile().steps.length > 0;

  for (let analysisIndex = 0; analysisIndex < analyses.length; analysisIndex++) {
    const analysis = analyses[analysisIndex];
    circuit.analyses.splice(0, circuit.analyses.length, analysis);
    let activeKey;
    let activeCommon;
    let pointIndex = 0;
    let batchPointCount = 0;
    let events = [];
    for await (const entry of core.simulateStepStream(circuit, coreOptions(request.options))) {
      const step = hasSteps
        ? { index: entry.stepIndex, parameter: entry.paramName, value: entry.paramValue }
        : undefined;
      const key = hasSteps ? String(entry.stepIndex) : '';
      const common = { analysisIndex, ...(step ? { step } : {}) };
      if (key !== activeKey) {
        if (activeCommon) {
          events.push({ type: 'analysis-end', analysis: analysis.type, ...activeCommon, pointCount: pointIndex });
        }
        activeKey = key;
        activeCommon = common;
        pointIndex = 0;
        events.push({ type: 'analysis-start', analysis: analysis.type, ...common });
      }
      events.push(pointEvent(entry.point, common, pointIndex++));
      batchPointCount++;
      if (batchPointCount === 2) {
        await sendEvents(events);
        events = [];
        batchPointCount = 0;
      }
    }
    if (activeCommon) {
      events.push({
        type: 'analysis-end', analysis: analysis.type, ...activeCommon, pointCount: pointIndex,
      });
    }
    if (events.length > 0) await sendEvents(events);
  }
}

parentPort.once('message', async ({ operation, request, coreModulePath }) => {
  const core = require(coreModulePath);
  try {
    if (operation === 'stream') await streamProtocol(core, request);
    const result = operation === 'validate'
      ? await core.validateProtocolV1(request)
      : await core.simulateProtocolV1(request);
    parentPort.postMessage({ type: 'result', result });
  } catch (error) {
    parentPort.postMessage({ type: 'error', error: core.mapProtocolErrorV1(error) });
  }
});
`;

const packageRequire = createRequire(typeof __filename === 'string' ? __filename : import.meta.url);
const coreModulePath = packageRequire.resolve('@spice-ts/core');

function createExecutionWorker(): ExecutionWorker {
  return new Worker(workerSource, { eval: true }) as unknown as ExecutionWorker;
}

async function runStreamingWorker(
  request: SimulationRequestV1,
  wallTimeMs: number,
  options: ToolExecutionOptions,
  onEvents: (events: SimulationEventV1[]) => Promise<void>,
): Promise<SimulationResultV1> {
  throwIfCancelled(options.signal);
  const worker = (options.workerFactory ?? createExecutionWorker)();
  return new Promise<SimulationResultV1>((resolve, reject) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout>;
    const finish = (outcome: () => void, terminateWorker = true) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', onAbort);
      worker.off('message', onMessage);
      worker.off('error', onError);
      worker.off('exit', onExit);
      if (terminateWorker) void Promise.resolve(worker.terminate()).catch(() => undefined);
      outcome();
    };
    const onMessage = (message: WorkerReply) => {
      if (message.type === 'events') {
        if (!message.events) return finish(() => reject(workerFailure()));
        let retained: Promise<void>;
        try {
          retained = onEvents(message.events);
        } catch (error) {
          finish(() => reject(publicError(error)));
          return;
        }
        void retained
          .then(() => { if (!settled) worker.postMessage({ type: 'ack' }); })
          .catch(error => finish(() => reject(publicError(error))));
        return;
      }
      finish(() => {
        if (message.type === 'result') resolve(message.result as SimulationResultV1);
        else reject(message.error ?? workerFailure());
      });
    };
    const onError = () => finish(() => reject(workerFailure()));
    const onExit = () => finish(() => reject(workerFailure()), false);
    const onAbort = () => finish(() => reject(cancelledError()));

    worker.on('message', onMessage);
    worker.on('error', onError);
    worker.on('exit', onExit);
    options.signal?.addEventListener('abort', onAbort, { once: true });
    timeout = setTimeout(() => finish(() => reject(apiError(
      'RESOURCE_LIMIT',
      'The simulation wall-time limit was exceeded',
      'solve',
      { limit: 'maxWallTimeMs', maximum: wallTimeMs },
    ))), wallTimeMs);
    try {
      const message: WorkerRequest = { operation: 'stream', request, coreModulePath };
      worker.postMessage(message);
    } catch {
      finish(() => reject(workerFailure()));
    }
  });
}

async function runInWorker<T>(
  operation: 'validate' | 'simulate',
  request: SimulationRequestV1,
  wallTimeMs: number,
  options: ToolExecutionOptions,
): Promise<T> {
  throwIfCancelled(options.signal);
  const worker = (options.workerFactory ?? createExecutionWorker)();
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout>;
    const finish = (outcome: () => void, terminateWorker = true) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', onAbort);
      worker.off('message', onMessage);
      worker.off('error', onError);
      worker.off('exit', onExit);
      if (terminateWorker) void Promise.resolve(worker.terminate()).catch(() => undefined);
      outcome();
    };
    const onMessage = (message: WorkerReply) => finish(() => {
      if (message.type === 'result') resolve(message.result as T);
      else reject(message.error ?? workerFailure());
    });
    const onError = () => finish(() => reject(workerFailure()));
    const onExit = () => finish(() => reject(workerFailure()), false);
    const onAbort = () => finish(() => reject(cancelledError()));

    worker.on('message', onMessage);
    worker.on('error', onError);
    worker.on('exit', onExit);
    options.signal?.addEventListener('abort', onAbort, { once: true });
    timeout = setTimeout(() => finish(() => reject(apiError(
      'RESOURCE_LIMIT',
      'The simulation wall-time limit was exceeded',
      'solve',
      { limit: 'maxWallTimeMs', maximum: wallTimeMs },
    ))), wallTimeMs);
    try {
      const message: WorkerRequest = { operation, request, coreModulePath };
      worker.postMessage(message);
    } catch {
      finish(() => reject(workerFailure()));
    }
  });
}

function workerFailure(): SpiceApiErrorV1 {
  return apiError('INTERNAL_ERROR', 'The isolated simulation worker failed', 'transport', {});
}

function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw cancelledError();
}

function cancelledError(): SpiceApiErrorV1 {
  return apiError('CANCELLED', 'The request was cancelled', 'transport', {});
}

function publicError(error: unknown): SpiceApiErrorV1 {
  const mapped = isApiError(error) ? error : mapProtocolErrorV1(error);
  return sanitizeError(mapped);
}

function sanitizeError(error: SpiceApiErrorV1): SpiceApiErrorV1 {
  return sanitizeValue(error as unknown as JsonValue) as unknown as SpiceApiErrorV1;
}

function sanitizeValue(value: JsonValue): JsonValue {
  if (typeof value === 'string') {
    return value
      .replaceAll('spice-ts-js', 'simulation backend')
      .replaceAll('spice-ts-wasm', 'simulation backend')
      .replaceAll('ngspice-wasm', 'simulation backend')
      .replaceAll('spice-ts', 'simulation backend');
  }
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sanitizeValue(entry)]));
  }
  return value;
}

function apiError(
  code: SpiceApiErrorV1['code'],
  message: string,
  phase: SpiceApiErrorV1['phase'],
  details: JsonObject,
): SpiceApiErrorV1 {
  return { code, message, retryable: false, phase, details };
}

function isApiError(error: unknown): error is SpiceApiErrorV1 {
  return isRecord(error)
    && typeof error.code === 'string'
    && typeof error.message === 'string'
    && typeof error.retryable === 'boolean'
    && typeof error.phase === 'string'
    && isRecord(error.details);
}

function success(value: object): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value) }],
    structuredContent: value as Record<string, unknown>,
  };
}

function failure(error: SpiceApiErrorV1): CallToolResult {
  const value = { error };
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify(value) }],
    structuredContent: value,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
