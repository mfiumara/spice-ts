import { describe, expect, it } from 'vitest';
import { mapProtocolErrorV1, simulateProtocolV1, validateProtocolV1 } from './adapter.js';
import type { SimulationRequestV1, SpiceApiErrorV1 } from './types.js';
import type { ProtocolExecutionOptionsV1, ProtocolSafePointV1 } from './execution-guard.js';

function spice(source: string, limits: NonNullable<SimulationRequestV1['options']>['limits'] = {}): SimulationRequestV1 {
  return { apiVersion: '1', input: { format: 'spice', source }, options: { limits } };
}

async function publicFailure(operation: Promise<unknown>): Promise<SpiceApiErrorV1> {
  try {
    await operation;
  } catch (error) {
    return mapProtocolErrorV1(error);
  }
  throw new Error('expected protocol operation to fail');
}

function cancelAt(target: ProtocolSafePointV1): ProtocolExecutionOptionsV1 {
  const controller = new AbortController();
  return {
    signal: controller.signal,
    onSafePoint(safePoint) {
      if (safePoint === target) controller.abort();
    },
  };
}

const nonlinear = [
  'V1 in 0 5',
  'R1 in out 1k',
  'D1 out 0 DM',
  '.model DM D(IS=1e-12)',
].join('\n');

describe('protocol-v1 cooperative execution guard', () => {
  it.each([
    ['parse:line', spice(`${nonlinear}\n.op`)],
    ['compile:device', spice(`${nonlinear}\n.op`)],
    ['solve:newton-iteration', spice(`${nonlinear}\n.op`)],
    ['solve:transient-step', spice('V1 in 0 PULSE(0 1 0 1n 1n 1u 2u)\nR1 in out 1k\nC1 out 0 1n\n.tran 1n 20u')],
    ['solve:ac-point', spice('V1 in 0 AC 1\nR1 in out 1k\nC1 out 0 1n\n.ac lin 100 1 1Meg')],
  ] as const)('stops real work at the %s safe point', async (safePoint, request) => {
    const error = await publicFailure(simulateProtocolV1(request, cancelAt(safePoint)));
    expect(error).toEqual({
      code: 'CANCELLED',
      message: 'The protocol request was cancelled',
      retryable: false,
      phase: safePoint.startsWith('parse') ? 'parse' : safePoint.startsWith('compile') ? 'compile' : 'solve',
      details: { safePoint },
    });
  });

  it('enforces a synchronous deadline inside real transient work', async () => {
    let expired = false;
    const request = spice(
      'V1 in 0 PULSE(0 1 0 1n 1n 1u 2u)\nR1 in out 1k\nC1 out 0 1n\n.tran 1n 20u',
      { maxWallTimeMs: 5 },
    );
    const error = await publicFailure(simulateProtocolV1(request, {
      now: () => expired ? 6 : 0,
      onSafePoint: safePoint => { if (safePoint === 'solve:transient-step') expired = true; },
    }));
    expect(error).toMatchObject({
      code: 'RESOURCE_LIMIT', phase: 'solve',
      details: { limit: 'maxWallTimeMs', configured: 5, observed: 6, safePoint: 'solve:transient-step' },
    });
  });

  it('propagates cancellation through parametric solver expansion', async () => {
    const request = spice([
      nonlinear, '.op', '.step param R1 list 1k 2k 3k',
    ].join('\n'));
    const error = await publicFailure(simulateProtocolV1(
      request,
      cancelAt('solve:newton-iteration'),
    ));
    expect(error).toMatchObject({
      code: 'CANCELLED', phase: 'solve',
      details: { safePoint: 'solve:newton-iteration' },
    });
  });
});

describe('protocol-v1 deterministic resource limits', () => {
  it.each([
    ['maxSourceBytes', spice('V1 a 0 1\nR1 a 0 1k\n.op', { maxSourceBytes: 8 }), 'validation', 8],
    ['maxVirtualFiles', {
      apiVersion: '1',
      input: { format: 'spice', source: '.include one\n.op', virtualFiles: { one: 'R1 a 0 1k', two: 'R2 b 0 1k' } },
      options: { limits: { maxVirtualFiles: 1 } },
    }, 'validation', 1],
    ['maxIncludeDepth', {
      apiVersion: '1',
      input: { format: 'spice', source: '.include one\n.op', virtualFiles: { one: '.include two', two: 'R1 a 0 1k' } },
      options: { limits: { maxIncludeDepth: 1 } },
    }, 'parse', 1],
    ['maxComponents', spice('V1 a 0 1\nR1 a 0 1k\n.op', { maxComponents: 1 }), 'compile', 1],
    ['maxSubcircuitDepth', spice([
      '.subckt INNER p n', 'R1 p n 1k', '.ends',
      '.subckt OUTER p n', 'X1 p n INNER', '.ends',
      'V1 a 0 1', 'XTOP a 0 OUTER', '.op',
    ].join('\n'), { maxSubcircuitDepth: 1 }), 'compile', 1],
    ['maxAnalyses', spice('V1 a 0 1\nR1 a 0 1k\n.op\n.op', { maxAnalyses: 1 }), 'validation', 1],
    ['maxResultPoints', spice('V1 a 0 1\nR1 a 0 1k\n.dc V1 0 2 1', { maxResultPoints: 2 }), 'validation', 2],
    ['maxSerializedResultBytes', spice('V1 a 0 1\nR1 a 0 1k\n.op', { maxSerializedResultBytes: 8 }), 'serialize', 8],
  ] as const)('reports configured and observed values for %s', async (limit, request, phase, configured) => {
    const error = await publicFailure(simulateProtocolV1(request as SimulationRequestV1));
    expect(error).toMatchObject({
      code: 'RESOURCE_LIMIT', phase,
      details: { limit, configured, observed: expect.any(Number) },
    });
    expect(error.details.observed).toBeGreaterThan(configured);
  });

  it('applies the same document and expansion guards during validation', async () => {
    const error = await publicFailure(validateProtocolV1(
      spice('V1 a 0 1\nR1 a 0 1k\n.op', { maxComponents: 1 }),
    ));
    expect(error).toMatchObject({
      code: 'RESOURCE_LIMIT', phase: 'compile',
      details: { limit: 'maxComponents', configured: 1, observed: 2 },
    });
  });

  it('preflights result points across parametric expansion', async () => {
    const error = await publicFailure(simulateProtocolV1(spice([
      'V1 a 0 1', 'R1 a 0 1k', '.op', '.step param R1 list 1k 2k 3k',
    ].join('\n'), { maxResultPoints: 2 })));
    expect(error).toMatchObject({
      code: 'RESOURCE_LIMIT', phase: 'validation',
      details: { limit: 'maxResultPoints', configured: 2, observed: 3 },
    });
  });

  it('stops adaptive transient work at the observed point ceiling', async () => {
    const error = await publicFailure(simulateProtocolV1(spice(
      'V1 a 0 1\nR1 a 0 1k\n.tran 0 1',
      { maxResultPoints: 1 },
    )));
    expect(error).toMatchObject({
      code: 'RESOURCE_LIMIT', phase: 'solve',
      details: { limit: 'maxResultPoints', configured: 1, observed: 2 },
    });
  });

  it('stops before a later analysis when the serialized result ceiling is exceeded', async () => {
    const safePoints: ProtocolSafePointV1[] = [];
    const error = await publicFailure(simulateProtocolV1(
      spice('V1 a 0 1\nR1 a 0 1k\n.op\n.op', { maxSerializedResultBytes: 8 }),
      { onSafePoint: safePoint => safePoints.push(safePoint) },
    ));

    expect(error).toMatchObject({
      code: 'RESOURCE_LIMIT', phase: 'serialize',
      details: { limit: 'maxSerializedResultBytes', configured: 8, observed: expect.any(Number) },
    });
    expect(safePoints.filter(safePoint => safePoint === 'serialize:analysis')).toHaveLength(1);
    const firstSerialization = safePoints.indexOf('serialize:analysis');
    expect(firstSerialization).toBeGreaterThan(-1);
    expect(safePoints.slice(firstSerialization + 1)).not.toContain('solve:newton-iteration');
  });

  it('never leaks the internal backend name from guard failures', async () => {
    const error = await publicFailure(simulateProtocolV1(
      spice('V1 spice-ts 0 1\nR1 spice-ts 0 1k\n.op', { maxComponents: 1 }),
    ));
    expect(JSON.stringify(error)).not.toMatch(/\bspice-ts\b(?!-(?:js|wasm))/);
  });
});
