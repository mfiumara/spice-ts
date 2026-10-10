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

export interface ToolExecutionOptions {
  limits?: McpLimits;
  signal?: AbortSignal;
  validate?: typeof validateProtocolV1;
  simulate?: typeof simulateProtocolV1;
  workerFactory?: () => ExecutionWorker;
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
  type: 'result' | 'error';
  result?: unknown;
  error?: SpiceApiErrorV1;
}

interface WorkerRequest {
  operation: 'validate' | 'simulate';
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
      required: ['defaultChunkPoints', 'maxChunkPoints', 'maxRetainedJobs'],
      properties: {
        defaultChunkPoints: { const: DEFAULT_STREAM_CHUNK_POINTS },
        maxChunkPoints: { const: MAX_STREAM_CHUNK_POINTS },
        maxRetainedJobs: { const: MAX_RETAINED_STREAM_JOBS },
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
  }),
});

export async function executeTool(
  name: string,
  args: unknown,
  options: ToolExecutionOptions = {},
): Promise<CallToolResult> {
  return executeToolWithStore(name, args, options, defaultStreamStore);
}

export function createToolExecutor(baseOptions: ToolExecutionOptions = {}): ToolExecutor {
  const store = new StreamStore();
  return (name, args, options = {}) => executeToolWithStore(
    name,
    args,
    { ...baseOptions, ...options },
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
    if (name === 'spice_capabilities') return success(capabilities);
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
    const result = options.simulate
      ? await boundedCall(() => options.simulate!(bounded), effective.maxWallTimeMs, options.signal)
      : await runInWorker<SimulationResultV1>('simulate', bounded, effective.maxWallTimeMs, options);
    enforceResultBounds(result, effective);
    if (name === 'spice_simulation_start') return success(streamStore.start(bounded, result));
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
  result: SimulationResultV1;
  events: SimulationEventV1[];
  cursorOffsets: Map<string, number>;
  replay: Map<string, SimulationReadDataV1>;
  emitted: SimulationEventV1[];
  terminal?: SimulationReadDataV1;
}

class StreamStore {
  private readonly jobs = new Map<string, StreamJob>();
  private nextJobId = 1;

  start(request: SimulationRequestV1, result: SimulationResultV1): JsonObject {
    if (this.jobs.size >= MAX_RETAINED_STREAM_JOBS) {
      const completed = [...this.jobs].find(([, job]) => job.terminal !== undefined);
      if (completed) this.jobs.delete(completed[0]);
    }
    if (this.jobs.size >= MAX_RETAINED_STREAM_JOBS) {
      throw apiError('RESOURCE_LIMIT', 'The retained stream-job limit was exceeded', 'transport', {
        limit: 'maxRetainedStreamJobs', maximum: MAX_RETAINED_STREAM_JOBS,
        actual: this.jobs.size + 1,
      });
    }
    const jobId = `job-${this.nextJobId++}`;
    const cursor = streamCursor(jobId, 0);
    this.jobs.set(jobId, {
      request,
      result,
      events: resultEvents(result),
      cursorOffsets: new Map([[cursor, 0]]),
      replay: new Map(),
      emitted: [],
    });
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

    const events: SimulationEventV1[] = [];
    let pointCount = 0;
    let nextOffset = offset;
    while (nextOffset < job.events.length) {
      const event = job.events[nextOffset]!;
      if (event.type === 'point' && pointCount >= args.maxPoints) break;
      events.push(event);
      nextOffset++;
      if (event.type === 'point') {
        pointCount++;
        if (pointCount === args.maxPoints) break;
      }
    }
    job.emitted.push(...events);

    let data: SimulationReadDataV1;
    if (nextOffset < job.events.length) {
      const nextCursor = streamCursor(args.jobId, nextOffset);
      job.cursorOffsets.set(nextCursor, nextOffset);
      data = { status: 'running', events, nextCursor };
    } else {
      data = {
        status: 'complete', events, nextCursor: null,
        terminal: successTerminal(args.jobId, job.request, job.result),
      };
      job.terminal = data;
    }
    job.replay.set(args.cursor, data);
    return data;
  }

  cancel(jobId: string): SimulationReadDataV1 {
    const job = this.job(jobId);
    if (job.terminal) return job.terminal;
    const terminal: StreamTerminalV1 = {
      apiVersion: '1', ok: false, requestId: jobId,
      error: {
        code: 'CANCELLED', message: 'The simulation job was cancelled',
        retryable: true, phase: 'solve', details: {},
      },
      diagnostics: [],
      partial: {
        status: 'partial',
        analyses: partialAnalyses(job.emitted),
        partialEventSha256: sha256CanonicalJson(job.emitted.filter(event => event.type === 'point')),
      },
    };
    const data: SimulationReadDataV1 = {
      status: 'cancelled', events: [], nextCursor: null, terminal,
    };
    job.terminal = data;
    return data;
  }

  private job(jobId: string): StreamJob {
    const job = this.jobs.get(jobId);
    if (!job) throw apiError('INVALID_REQUEST', 'The simulation job was not found', 'validation', {});
    return job;
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
parentPort.once('message', async ({ operation, request, coreModulePath }) => {
  const core = require(coreModulePath);
  try {
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
    const finish = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', onAbort);
      worker.off('message', onMessage);
      worker.off('error', onError);
      worker.off('exit', onExit);
      void Promise.resolve(worker.terminate()).catch(() => undefined);
      outcome();
    };
    const onMessage = (message: WorkerReply) => finish(() => {
      if (message.type === 'result') resolve(message.result as T);
      else reject(message.error ?? workerFailure());
    });
    const onError = () => finish(() => reject(workerFailure()));
    const onExit = () => finish(() => reject(workerFailure()));
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
