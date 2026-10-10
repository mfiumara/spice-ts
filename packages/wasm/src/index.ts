import Ajv2020 from 'ajv/dist/2020.js';
import {
  protocolSchemasV1,
  sha256,
  sha256CanonicalJson,
  type AnalysisResultV1,
  type BackendV1,
  type DiagnosticV1,
  type FailureEnvelopeV1,
  type JsonObject,
  type PartialAnalysisV1,
  type ResolvedOptionsV1,
  type RunMetadataV1,
  type SimulationEventV1,
  type SimulationReadDataV1,
  type SimulationRequestV1,
  type SimulationResultV1,
  type SpiceApiErrorV1,
  type StreamTerminalV1,
  type SuccessEnvelopeV1,
} from '@spice-ts/protocol';
import { bundledWorker } from './build-manifest.js';
import type { WorkerOperation, WorkerRequest, WorkerResponse } from './worker-protocol.js';

const PACKAGE_VERSION = '0.3.0';
const DEFAULT_CHUNK_POINTS = 256;
const ajv = new Ajv2020({ allErrors: true, strict: true });
for (const schema of Object.values(protocolSchemasV1)) ajv.addSchema(schema);
const validateRequestSchema = ajv.getSchema('https://spice-ts.dev/schemas/v1/simulation-request.schema.json');

export interface SpiceWorkerManifestV1 {
  schemaVersion: 1;
  engineBuildId: string;
  worker: { url: string; sha256: string };
}

export interface WorkerLike {
  postMessage(message: unknown): void;
  onMessage(listener: (event: MessageEvent) => void): () => void;
  onError(listener: (event: ErrorEvent) => void): () => void;
  onExit?(listener: (code: number) => void): () => void;
  terminate(): void | Promise<number>;
}

export type WorkerFactory = (url: URL) => WorkerLike | Promise<WorkerLike>;

export interface CreateSpiceEngineOptions {
  backend: 'spice-ts-js' | 'spice-ts-wasm';
  manifest?: SpiceWorkerManifestV1;
  manifestUrl?: string | URL;
  workerFactory?: WorkerFactory;
}

export interface RequestOptions {
  requestId: string;
}

export interface StreamOptions extends RequestOptions {
  chunkPoints?: number;
}

export interface ProtocolValidationResultV1 {
  status: 'valid';
  nodeCount: number;
  branchCount: number;
  analysisCount: number;
}

type ValidationEnvelope = SuccessEnvelopeV1<ProtocolValidationResultV1 & JsonObject> | FailureEnvelopeV1;
type SimulationEnvelope = SuccessEnvelopeV1<SimulationResultV1> | FailureEnvelopeV1;

export interface SpiceEngineCapabilitiesV1 {
  protocolVersions: readonly ['1'];
  nativeSchemaVersions: readonly ['1.0'];
  backends: readonly ['spice-ts-js'];
  analyses: readonly ['op', 'dc', 'tran', 'ac'];
  determinism: readonly ['strict', 'relaxed'];
  streamChunkPoints: 256;
  engineBuildId: string;
}

export interface SpiceEngine {
  readonly capabilities: SpiceEngineCapabilitiesV1;
  validate(request: SimulationRequestV1, options: RequestOptions): Promise<ValidationEnvelope>;
  simulate(request: SimulationRequestV1, options: RequestOptions): Promise<SimulationEnvelope>;
  simulateStream(request: SimulationRequestV1, options: StreamOptions): AsyncGenerator<SimulationReadDataV1>;
  cancel(requestId: string): Promise<{ requestId: string; status: 'cancelling' | 'not-found' }>;
  close(): Promise<void>;
}

export class SpiceEngineError extends Error {
  constructor(readonly error: SpiceApiErrorV1) {
    super(error.message);
    this.name = 'SpiceEngineError';
  }
}

interface ActiveJob {
  cancel(): void;
}

interface StreamJobState {
  cancelled: boolean;
}

export async function createSpiceEngine(options: CreateSpiceEngineOptions): Promise<SpiceEngine> {
  if (options.backend !== 'spice-ts-js') {
    throw backendUnavailable(String(options.backend));
  }

  const usesBundledManifest = options.manifest === undefined && options.manifestUrl === undefined;
  const manifest = options.manifest ?? await loadManifest(options.manifestUrl ?? defaultManifestUrl());
  validateManifest(manifest);
  if (usesBundledManifest
    && (manifest.engineBuildId !== bundledWorker.engineBuildId || manifest.worker.sha256 !== bundledWorker.sha256)) {
    throw backendUnavailable('spice-ts-js', 'The worker build manifest does not match the facade build');
  }
  const assetUrl = new URL(manifest.worker.url, options.manifestUrl ?? defaultManifestUrl());
  const workerBytes = await loadBytes(assetUrl).catch(() => {
    throw backendUnavailable('spice-ts-js', 'The module-worker asset could not be loaded');
  });
  const observedSha256 = sha256(workerBytes);
  if (observedSha256 !== manifest.worker.sha256) {
    throw backendUnavailable('spice-ts-js', 'The module-worker checksum does not match the build manifest', {
      expectedSha256: manifest.worker.sha256,
      observedSha256,
    });
  }
  const verifiedWorker = verifiedWorkerUrl(workerBytes);

  const factory = options.workerFactory ?? defaultWorkerFactory;
  const jobs = new Map<string, ActiveJob>();
  let closed = false;
  let operationId = 0;

  const capabilities: SpiceEngineCapabilitiesV1 = Object.freeze({
    protocolVersions: ['1'],
    nativeSchemaVersions: ['1.0'],
    backends: ['spice-ts-js'],
    analyses: ['op', 'dc', 'tran', 'ac'],
    determinism: ['strict', 'relaxed'],
    streamChunkPoints: DEFAULT_CHUNK_POINTS,
    engineBuildId: manifest.engineBuildId,
  } as const);

  const execute = async (
    operation: WorkerOperation,
    request: SimulationRequestV1,
    requestId: string,
    streamState?: StreamJobState,
  ): Promise<ValidationEnvelope | SimulationEnvelope> => {
    if (closed) return failure(requestId, transportError('BACKEND_UNAVAILABLE', 'The spice engine is closed'), request, manifest);
    if (!validateRequestSchema?.(request)) return invalidRequestFailure(requestId, validateRequestSchema?.errors ?? []);
    const rejected = rejectedBackend(request, requestId, manifest);
    if (rejected) return rejected;
    if (jobs.has(requestId)) return failure(requestId, transportError('INVALID_REQUEST', `Request '${requestId}' is already active`), request, manifest);

    let cancellationRequested = false;
    let cancelCurrent = (): void => {
      cancellationRequested = true;
      if (streamState) streamState.cancelled = true;
    };
    jobs.set(requestId, { cancel: () => cancelCurrent() });

    let worker: WorkerLike;
    try {
      worker = await factory(verifiedWorker.url);
    } catch {
      jobs.delete(requestId);
      return failure(
        requestId,
        cancellationRequested
          ? cancelledError()
          : transportError('BACKEND_UNAVAILABLE', 'The module worker could not be constructed'),
        request,
        manifest,
      );
    }
    if (cancellationRequested) {
      jobs.delete(requestId);
      void worker.terminate();
      return failure(requestId, cancelledError(), request, manifest);
    }

    const id = ++operationId;
    return new Promise(resolve => {
      let settled = false;
      let removeMessage = (): void => {};
      let removeError = (): void => {};
      let removeExit = (): void => {};
      const cleanup = (preserveJob = false): void => {
        removeMessage();
        removeError();
        removeExit();
        if (!preserveJob) jobs.delete(requestId);
        void worker.terminate();
      };
      const finish = (value: ValidationEnvelope | SimulationEnvelope, preserveJob = false): void => {
        if (settled) return;
        settled = true;
        cleanup(preserveJob);
        resolve(value);
      };
      const onMessage = (event: MessageEvent): void => {
        const response = event.data as WorkerResponse;
        if (response.id !== id) return;
        if (!response.ok) {
          finish(failure(requestId, response.error as SpiceApiErrorV1, request, manifest));
          return;
        }
        if (operation === 'validate') {
          finish(success(requestId, response.data as ProtocolValidationResultV1 & JsonObject, request, manifest));
        } else {
          if (streamState) cancelCurrent = () => { streamState.cancelled = true; };
          finish(success(requestId, response.data as SimulationResultV1, request, manifest), streamState !== undefined);
        }
      };
      const onError = (event: ErrorEvent): void => {
        finish(failure(requestId, transportError('BACKEND_UNAVAILABLE', event.message || 'The module worker failed'), request, manifest));
      };
      const onExit = (code: number): void => {
        finish(failure(requestId, transportError('BACKEND_UNAVAILABLE', `The module worker exited before replying (code ${code})`), request, manifest));
      };
      removeMessage = worker.onMessage(onMessage);
      removeError = worker.onError(onError);
      removeExit = worker.onExit?.(onExit) ?? removeExit;
      cancelCurrent = () => {
        if (streamState) streamState.cancelled = true;
        finish(failure(requestId, cancelledError(), request, manifest));
      };
      const message: WorkerRequest = { id, operation, request };
      worker.postMessage(message);
    });
  };

  const engine: SpiceEngine = {
    capabilities,
    validate: (request, requestOptions) => execute('validate', request, requestOptions.requestId) as Promise<ValidationEnvelope>,
    simulate: (request, requestOptions) => execute('simulate', request, requestOptions.requestId) as Promise<SimulationEnvelope>,
    async *simulateStream(request, streamOptions) {
      const chunkPoints = streamOptions.chunkPoints ?? DEFAULT_CHUNK_POINTS;
      if (!Number.isInteger(chunkPoints) || chunkPoints <= 0) {
        yield failedRead(failure(streamOptions.requestId, transportError('INVALID_REQUEST', 'chunkPoints must be a positive integer'), request, manifest));
        return;
      }
      const streamState: StreamJobState = { cancelled: false };
      const envelope = await execute('simulate', request, streamOptions.requestId, streamState) as SimulationEnvelope;
      if (!envelope.ok) {
        yield failedRead(envelope);
        return;
      }

      const emitted: SimulationEventV1[] = [];
      let pending: SimulationEventV1[] = [];
      let emittedPointCount = 0;
      try {
        for (const event of resultEvents(envelope.data)) {
          if (streamState.cancelled) {
            yield cancelledRead(streamOptions.requestId, request, manifest, emitted);
            return;
          }
          pending.push(event);
          if (event.type === 'point') emittedPointCount++;
          if (event.type === 'point' && emittedPointCount % chunkPoints === 0) {
            emitted.push(...pending);
            const events = pending;
            pending = [];
            yield { status: 'running', events, nextCursor: String(emittedPointCount) };
          }
        }
        if (streamState.cancelled) {
          yield cancelledRead(streamOptions.requestId, request, manifest, emitted);
          return;
        }
        emitted.push(...pending);
        yield { status: 'complete', events: pending, nextCursor: null, terminal: envelope };
      } finally {
        jobs.delete(streamOptions.requestId);
      }
    },
    async cancel(requestId) {
      const job = jobs.get(requestId);
      if (!job) return { requestId, status: 'not-found' };
      job.cancel();
      return { requestId, status: 'cancelling' };
    },
    async close() {
      closed = true;
      for (const job of jobs.values()) job.cancel();
      jobs.clear();
      verifiedWorker.dispose();
    },
  };
  return engine;
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
      type: 'tran', timeS, voltagesV: indexedRecord(analysis.voltagesV, index), currentsA: indexedRecord(analysis.currentsA, index),
    }));
    case 'ac': return analysis.frequencyHz.map((frequencyHz, index) => ({
      type: 'ac', frequencyHz,
      voltagePhasors: indexedRecord(analysis.voltagePhasors, index),
      currentPhasors: indexedRecord(analysis.currentPhasors, index),
    }));
  }
}

function indexedRecord<T>(record: Record<string, T[]>, index: number): Record<string, T> {
  return Object.fromEntries(Object.entries(record).map(([key, values]) => [key, values[index]! ]));
}

function cancelledRead(
  requestId: string,
  request: SimulationRequestV1,
  manifest: SpiceWorkerManifestV1,
  events: SimulationEventV1[],
): SimulationReadDataV1 {
  const terminal: StreamTerminalV1 = {
    ...failure(requestId, cancelledError(), request, manifest),
    partial: {
      status: 'partial',
      analyses: partialAnalyses(events),
      partialEventSha256: sha256CanonicalJson(events.filter(event => event.type === 'point')),
    },
  };
  return { status: 'cancelled', events: [], nextCursor: null, terminal };
}

function failedRead(envelope: FailureEnvelopeV1): SimulationReadDataV1 {
  const terminal: StreamTerminalV1 = {
    ...envelope,
    partial: { status: 'partial', analyses: [], partialEventSha256: sha256CanonicalJson([]) },
  };
  return { status: envelope.error.code === 'CANCELLED' ? 'cancelled' : 'failed', events: [], nextCursor: null, terminal };
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

function rejectedBackend(
  request: SimulationRequestV1,
  requestId: string,
  manifest: SpiceWorkerManifestV1,
): FailureEnvelopeV1 | undefined {
  const backend = (request.options as { backend?: string } | undefined)?.backend;
  if (backend === undefined || backend === 'spice-ts-js') return undefined;
  return failure(requestId, transportError('BACKEND_UNAVAILABLE', `Protocol backend '${backend}' is not available in this engine`, { backend }), request, manifest);
}

function invalidRequestFailure(
  requestId: string,
  errors: readonly { instancePath?: string; keyword?: string }[],
): FailureEnvelopeV1 {
  return {
    apiVersion: '1', ok: false, requestId, diagnostics: [],
    error: {
      code: 'INVALID_REQUEST', message: 'The protocol request does not match the v1 schema',
      retryable: false, phase: 'validation',
      details: {
        errors: errors.slice(0, 16).map(error => ({
          path: error.instancePath ?? '', keyword: error.keyword ?? 'schema',
        })),
      },
    },
  };
}

function success<T extends JsonObject | SimulationResultV1>(
  requestId: string,
  data: T,
  request: SimulationRequestV1,
  manifest: SpiceWorkerManifestV1,
): SuccessEnvelopeV1<T> {
  return {
    apiVersion: '1', ok: true, requestId, data, diagnostics: [],
    metadata: metadata(request, manifest, sha256CanonicalJson(data)),
  };
}

function failure(
  requestId: string,
  error: SpiceApiErrorV1,
  request: SimulationRequestV1,
  manifest: SpiceWorkerManifestV1,
): FailureEnvelopeV1 {
  return {
    apiVersion: '1', ok: false, requestId, error, diagnostics: [],
    metadata: {
      protocolVersion: '1', spiceTsVersion: PACKAGE_VERSION, engineBuildId: manifest.engineBuildId,
      backend: 'spice-ts-js', backendVersion: PACKAGE_VERSION,
      resolvedOptions: resolvedOptions(request), inputSha256: sha256CanonicalJson(request.input),
      runtime: runtime(), architecture: architecture(), determinism: request.options?.determinism ?? 'strict',
    },
  };
}

function metadata(request: SimulationRequestV1, manifest: SpiceWorkerManifestV1, resultSha256: string): RunMetadataV1 {
  return {
    protocolVersion: '1',
    ...(request.input.format === 'spice-ts' ? { nativeSchemaVersion: '1.0' as const } : {}),
    spiceTsVersion: PACKAGE_VERSION,
    engineBuildId: manifest.engineBuildId,
    backend: 'spice-ts-js',
    backendVersion: PACKAGE_VERSION,
    resolvedOptions: resolvedOptions(request),
    inputSha256: sha256CanonicalJson(request.input),
    resultSha256,
    runtime: runtime(),
    architecture: architecture(),
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

function runtime(): { family: string; version: string } {
  if (typeof process !== 'undefined' && process.versions?.node) return { family: 'node', version: process.versions.node };
  return { family: 'browser', version: 'unknown' };
}

function architecture(): string {
  return typeof process !== 'undefined' && process.arch ? process.arch : 'browser';
}

function cancelledError(): SpiceApiErrorV1 {
  return { code: 'CANCELLED', message: 'The protocol request was cancelled', retryable: true, phase: 'solve', details: {} };
}

function transportError(code: 'INVALID_REQUEST' | 'BACKEND_UNAVAILABLE', message: string, details: JsonObject = {}): SpiceApiErrorV1 {
  return { code, message, retryable: false, phase: 'transport', details };
}

function backendUnavailable(backend: string, message = `Protocol backend '${backend}' is not available`, details: JsonObject = {}): SpiceEngineError {
  return new SpiceEngineError(transportError('BACKEND_UNAVAILABLE', message, { backend, ...details }));
}

function validateManifest(manifest: SpiceWorkerManifestV1): void {
  if (manifest.schemaVersion !== 1 || !/^spice-ts-js-[0-9a-f]{16}$/.test(manifest.engineBuildId)
    || !/^[0-9a-f]{64}$/.test(manifest.worker.sha256)) {
    throw backendUnavailable('spice-ts-js', 'The worker build manifest is invalid');
  }
  if (manifest.engineBuildId !== `spice-ts-js-${manifest.worker.sha256.slice(0, 16)}`) {
    throw backendUnavailable('spice-ts-js', 'The worker build ID does not match its asset checksum');
  }
}

async function loadManifest(url: string | URL): Promise<SpiceWorkerManifestV1> {
  try {
    return JSON.parse(new TextDecoder().decode(await loadBytes(new URL(url)))) as SpiceWorkerManifestV1;
  } catch (error) {
    if (error instanceof SpiceEngineError) throw error;
    throw backendUnavailable('spice-ts-js', 'The worker build manifest could not be loaded');
  }
}

async function loadBytes(url: URL): Promise<Uint8Array> {
  if (url.protocol === 'file:') {
    const { readFile } = await import('node:fs/promises');
    return new Uint8Array(await readFile(url));
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

function verifiedWorkerUrl(bytes: Uint8Array): { url: URL; dispose(): void } {
  if (typeof process !== 'undefined' && process.versions?.node) {
    return {
      url: new URL(`data:text/javascript;base64,${Buffer.from(bytes).toString('base64')}`),
      dispose: () => {},
    };
  }
  const objectUrl = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: 'text/javascript' }));
  return { url: new URL(objectUrl), dispose: () => URL.revokeObjectURL(objectUrl) };
}

function defaultManifestUrl(): URL {
  return import.meta.url.includes('/src/')
    ? new URL('../dist/manifest.json', import.meta.url)
    : new URL('./manifest.json', import.meta.url);
}

async function defaultWorkerFactory(url: URL): Promise<WorkerLike> {
  if (typeof Worker !== 'undefined') {
    const worker = new Worker(url, { type: 'module' });
    return {
      postMessage: message => worker.postMessage(message),
      onMessage(listener) {
        worker.addEventListener('message', listener);
        return () => worker.removeEventListener('message', listener);
      },
      onError(listener) {
        worker.addEventListener('error', listener);
        return () => worker.removeEventListener('error', listener);
      },
      terminate: () => worker.terminate(),
    };
  }
  const { Worker: NodeWorker } = await import('node:worker_threads');
  const worker = new NodeWorker(url);
  return {
    postMessage: message => worker.postMessage(message),
    onMessage(listener) {
      const wrapped = (data: unknown): void => listener({ data } as MessageEvent);
      worker.on('message', wrapped);
      return () => worker.off('message', wrapped);
    },
    onError(listener) {
      const wrapped = (error: Error): void => listener({ message: error.message } as ErrorEvent);
      worker.on('error', wrapped);
      return () => worker.off('error', wrapped);
    },
    onExit(listener) {
      worker.on('exit', listener);
      return () => worker.off('exit', listener);
    },
    terminate: () => worker.terminate(),
  };
}