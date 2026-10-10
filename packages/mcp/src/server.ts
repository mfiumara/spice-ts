import { mapProtocolErrorV1, simulateProtocolV1, validateProtocolV1 } from '@spice-ts/core';
import { commonSchemaV1 } from '@spice-ts/protocol';
import type {
  AnalysisV1,
  JsonObject,
  JsonValue,
  SimulationRequestV1,
  SimulationResultV1,
  SpiceApiErrorV1,
} from '@spice-ts/protocol';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
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

export const DEFAULT_MCP_LIMITS: Readonly<McpLimits> = Object.freeze({
  maxDocumentBytes: 256 * 1024,
  maxAnalyses: 8,
  maxResultPoints: 100_000,
  maxSerializedResultBytes: 4 * 1024 * 1024,
  maxWallTimeMs: 10_000,
});

const requestInputSchema = {
  type: 'object',
  required: ['request'],
  properties: { request: { $ref: '#/$defs/simulationRequest' } },
  additionalProperties: false,
  $defs: commonSchemaV1.$defs,
};

const capabilitiesOutputSchema = {
  type: 'object',
  required: ['protocolVersion', 'analyses', 'inputFormats', 'limits'],
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
]) as readonly Tool[];

const capabilities = Object.freeze({
  protocolVersion: '1',
  analyses: Object.freeze(['op', 'dc', 'tran', 'ac']),
  inputFormats: Object.freeze(['spice', 'spice-ts']),
  limits: DEFAULT_MCP_LIMITS,
});

export async function executeTool(
  name: string,
  args: unknown,
  options: ToolExecutionOptions = {},
): Promise<CallToolResult> {
  const limits = options.limits ?? DEFAULT_MCP_LIMITS;
  try {
    if (name === 'spice_capabilities') return success(capabilities);
    if (name !== 'spice_validate' && name !== 'spice_simulate') {
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
    return success(result);
  } catch (error) {
    return failure(publicError(error));
  }
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

function enforceMaximum(limit: keyof McpLimits, maximum: number, actual: number, phase: SpiceApiErrorV1['phase']): void {
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
parentPort.once('message', async ({ operation, request }) => {
  const core = await import('@spice-ts/core');
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
      worker.postMessage({ operation, request });
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
    return value.replaceAll('spice-ts-js', 'simulation backend').replaceAll('spice-ts-wasm', 'simulation backend').replaceAll('ngspice-wasm', 'simulation backend');
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
