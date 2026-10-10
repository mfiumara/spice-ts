import { mapProtocolErrorV1, simulateProtocolV1 } from './adapter.js';
import { sha256CanonicalJson } from './canonical-json.js';
import type { ProtocolExecutionOptionsV1 } from './execution-guard.js';
import type {
  AnalysisResultV1,
  ProtocolCapabilitiesV1,
  ProtocolCompletionV1,
  ProtocolExecutionMetadataV1,
  ProtocolTerminalEnvelopeV1,
  SimulationRequestV1,
} from './types.js';

export interface ProtocolEnvelopeExecutionOptionsV1 extends ProtocolExecutionOptionsV1 {
  /** Caller correlation id. Defaults to a deterministic id derived from the request. */
  requestId?: string;
}

const CAPABILITIES: ProtocolCapabilitiesV1 = {
  apiVersion: '1',
  kind: 'capabilities',
  capabilityId: 'protocol-v1',
  analyses: [
    { id: 'analysis:op', type: 'op' },
    { id: 'analysis:dc', type: 'dc' },
    { id: 'analysis:tran', type: 'tran' },
    { id: 'analysis:ac', type: 'ac' },
  ],
  inputFormats: [
    { id: 'input:spice', format: 'spice' },
    { id: 'input:spice-ts', format: 'spice-ts' },
  ],
  limits: [
    { id: 'limit:maxSourceBytes', name: 'maxSourceBytes', unit: 'bytes' },
    { id: 'limit:maxVirtualFiles', name: 'maxVirtualFiles', unit: 'count' },
    { id: 'limit:maxIncludeDepth', name: 'maxIncludeDepth', unit: 'depth' },
    { id: 'limit:maxComponents', name: 'maxComponents', unit: 'count' },
    { id: 'limit:maxSubcircuitDepth', name: 'maxSubcircuitDepth', unit: 'depth' },
    { id: 'limit:maxAnalyses', name: 'maxAnalyses', unit: 'count' },
    { id: 'limit:maxResultPoints', name: 'maxResultPoints', unit: 'count' },
    { id: 'limit:maxSerializedResultBytes', name: 'maxSerializedResultBytes', unit: 'bytes' },
    { id: 'limit:maxWallTimeMs', name: 'maxWallTimeMs', unit: 'milliseconds' },
  ],
  completions: ['complete', 'failed', 'limited', 'cancelled'],
};

/** Return a fresh JSON-safe capability document with stable protocol ordering. */
export function protocolCapabilitiesV1(): ProtocolCapabilitiesV1 {
  return structuredClone(CAPABILITIES);
}

/** Execute a bounded request and always resolve to a terminal protocol envelope. */
export async function executeProtocolV1(
  request: SimulationRequestV1,
  options: ProtocolEnvelopeExecutionOptionsV1 = {},
): Promise<ProtocolTerminalEnvelopeV1> {
  const now = options.now ?? (() => performance.now());
  const startedAtMs = finiteTime(now());
  const inputHash = sha256CanonicalJson(request);
  const requestId = sanitizeText(options.requestId ?? `request:${inputHash}`);
  const completed: AnalysisResultV1[] = [];
  const execution: ProtocolExecutionOptionsV1 = {
    signal: options.signal,
    now,
    onSafePoint: options.onSafePoint,
    onAnalysisComplete: analysis => {
      completed.push(analysis);
      options.onAnalysisComplete?.(analysis);
    },
  };

  try {
    const result = sanitizeValue(await simulateProtocolV1(request, execution));
    const resultHash = sha256CanonicalJson(result);
    const metadata = metadataFor(
      inputHash, startedAtMs, now, 'complete', false,
      requestedAnalysisCount(request), result.analyses, resultHash,
    );
    return sanitizeValue({
      apiVersion: '1', kind: 'terminal', ok: true, requestId,
      data: result, metadata,
    }) as ProtocolTerminalEnvelopeV1;
  } catch (cause) {
    const error = sanitizeValue(mapProtocolErrorV1(cause));
    const completion: Exclude<ProtocolCompletionV1, 'complete'> = error.code === 'CANCELLED'
      ? 'cancelled'
      : error.code === 'RESOURCE_LIMIT' ? 'limited' : 'failed';
    const partialAnalyses = sanitizeValue(completed);
    const metadata = metadataFor(
      inputHash, startedAtMs, now, completion, partialAnalyses.length > 0,
      requestedAnalysisCount(request), partialAnalyses,
    );
    return sanitizeValue({
      apiVersion: '1', kind: 'terminal', ok: false, requestId,
      error, partial: { status: 'partial', analyses: partialAnalyses }, metadata,
    }) as ProtocolTerminalEnvelopeV1;
  }
}

function metadataFor(
  inputHash: string,
  startedAtMs: number,
  now: () => number,
  completion: ProtocolCompletionV1,
  partial: boolean,
  requestedAnalyses: number,
  analyses: AnalysisResultV1[],
  resultHash?: string,
): ProtocolExecutionMetadataV1 {
  const finishedAtMs = finiteTime(now());
  return {
    protocolVersion: '1',
    executionId: `execution:${inputHash}`,
    inputId: `input:${inputHash}`,
    ...(resultHash ? { resultId: `result:${resultHash}` as const } : {}),
    completion,
    partial,
    timing: {
      startedAtMs,
      finishedAtMs,
      durationMs: Math.max(0, finishedAtMs - startedAtMs),
    },
    counts: {
      requestedAnalyses,
      completedAnalyses: new Set(analyses.map(analysis => analysis.analysisIndex)).size,
      resultPoints: pointCount(analyses),
    },
  };
}

function requestedAnalysisCount(request: SimulationRequestV1): number {
  if (request.input.format === 'spice-ts') return request.input.document.analyses.length;
  if (request.input.format === 'circuit-json') return request.input.analyses.length;
  return Array.from(request.input.source.matchAll(/^\s*\.(?:op|dc|tran|ac|noise|tf|sens)\b/gim)).length;
}

function pointCount(analyses: AnalysisResultV1[]): number {
  return analyses.reduce((total, analysis) => {
    switch (analysis.type) {
      case 'op': return total + 1;
      case 'dc': return total + analysis.axis.values.length;
      case 'tran': return total + analysis.timeS.length;
      case 'ac': return total + analysis.frequencyHz.length;
    }
  }, 0);
}

function finiteTime(value: number): number {
  return Number.isFinite(value) ? (Object.is(value, -0) ? 0 : value) : 0;
}

function sanitizeText(value: string): string {
  return value.replace(/\bspice-ts\b(?!-(?:js|wasm))/g, 'spice-ts-js');
}

function sanitizeValue<T>(value: T): T {
  if (typeof value === 'string') return sanitizeText(value) as T;
  if (Array.isArray(value)) return value.map(sanitizeValue) as T;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).map(([key, entry]) => [sanitizeText(key), sanitizeValue(entry)]);
    return Object.fromEntries(entries) as T;
  }
  return (Object.is(value, -0) ? 0 : value) as T;
}

