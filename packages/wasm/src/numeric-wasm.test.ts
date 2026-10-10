import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { sha256, type SimulationRequestV1 } from '@spice-ts/protocol';
import {
  createSpiceEngine,
  SpiceEngineError,
  type SpiceEngine,
  type SpiceWorkerManifestV1,
  type WorkerLike,
} from './index.js';

const circuits = [
  'V1 in 0 5\nR1 in 0 1k\n.op',
  'I1 0 out 2m\nR1 out 0 2k\n.op',
  'V1 in 0 12\nR1 in out 2k\nR2 out 0 1k\n.op',
  'V1 a 0 10\nR1 a b 1k\nI1 b 0 1m\nR2 b 0 2k\n.op',
] as const;

const transientCircuit = [
  'Bounded passive RC transient',
  'V1 in 0 PULSE(0 1 0 100u 100u 10m 20m)',
  'R1 in out 1k',
  'C1 out 0 1u',
  '.tran 100u 1m',
  '.end',
].join('\n');

async function engine(backend: 'spice-ts-js' | 'spice-ts-wasm'): Promise<SpiceEngine> {
  return createSpiceEngine({ backend });
}

function request(source: string, options?: SimulationRequestV1['options']): SimulationRequestV1 {
  return { apiVersion: '1', input: { format: 'spice', source }, ...(options ? { options } : {}) };
}

describe('bounded numeric WebAssembly backend', () => {
  it('advertises the exact bounded slice and artifact identity', async () => {
    const wasm = await engine('spice-ts-wasm');
    try {
      expect(wasm.capabilities).toMatchObject({
        backends: ['spice-ts-wasm'],
        analyses: ['op'],
        nativeSchemaVersions: [],
        engineBuildId: expect.stringMatching(/^spice-ts-wasm-[0-9a-f]{16}$/),
        numericWasm: {
          kernel: 'dense-gaussian-f64-v1',
          artifactSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
          artifactBytes: 1190,
          inputFormats: ['spice'],
          devices: ['R', 'C', 'I', 'V'],
          analyses: ['op', 'tran'],
          fallback: 'reject',
          limits: { maxSystemOrder: 64, memoryPages: 3 },
        },
      });
    } finally {
      await wasm.close();
    }
  });

  it('matches the TypeScript backend on a fixed linear OP circuit suite', async () => {
    const js = await engine('spice-ts-js');
    const wasm = await engine('spice-ts-wasm');
    try {
      for (const [index, source] of circuits.entries()) {
        const input = request(source);
        const [expected, actual] = await Promise.all([
          js.simulate(input, { requestId: `js-${index}` }),
          wasm.simulate(input, { requestId: `wasm-${index}` }),
        ]);
        expect(expected.ok).toBe(true);
        expect(actual.ok).toBe(true);
        if (!expected.ok || !actual.ok) continue;
        expect(actual.metadata).toMatchObject({
          backend: 'spice-ts-wasm',
          resolvedOptions: { backend: 'spice-ts-wasm' },
        });
        const expectedOp = expected.data.analyses[0];
        const actualOp = actual.data.analyses[0];
        expect(expectedOp?.type).toBe('op');
        expect(actualOp?.type).toBe('op');
        if (expectedOp?.type !== 'op' || actualOp?.type !== 'op') continue;
        expect(Object.keys(actualOp.voltagesV)).toEqual(Object.keys(expectedOp.voltagesV));
        for (const [name, value] of Object.entries(expectedOp.voltagesV)) {
          expect(actualOp.voltagesV[name]).toBeCloseTo(value, 12);
        }
        expect(Object.keys(actualOp.currentsA)).toEqual(Object.keys(expectedOp.currentsA));
        for (const [name, value] of Object.entries(expectedOp.currentsA)) {
          expect(actualOp.currentsA[name]).toBeCloseTo(value, 12);
        }
      }
    } finally {
      await Promise.all([js.close(), wasm.close()]);
    }
  });

  it('runs bounded passive RC transient analysis with canonical stream ordering', async () => {
    const wasm = await engine('spice-ts-wasm');
    try {
      const result = await wasm.simulate(request(transientCircuit), { requestId: 'tran-result' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const transient = result.data.analyses[0];
      expect(transient?.type).toBe('tran');
      if (transient?.type !== 'tran') return;
      expect(transient.timeS).toHaveLength(11);
      expect(transient.timeS[0]).toBe(0);
      expect(transient.timeS.at(-1)).toBeCloseTo(1e-3, 15);
      expect(transient.voltagesV.out[0]).toBe(0);
      expect(transient.voltagesV.out.at(-1)).toBeGreaterThan(0.5);

      const reads = [];
      for await (const read of wasm.simulateStream(request(transientCircuit), {
        requestId: 'tran-stream', chunkPoints: 4,
      })) reads.push(read);
      expect(reads.map(read => read.status)).toEqual(['running', 'running', 'complete']);
      const events = reads.flatMap(read => read.events);
      expect(events.map(event => event.type)).toEqual([
        'analysis-start',
        ...Array.from({ length: 11 }, () => 'point'),
        'analysis-end',
      ]);
      expect(events.filter(event => event.type === 'point').map(event => event.pointIndex))
        .toEqual(Array.from({ length: 11 }, (_, index) => index));
    } finally {
      await wasm.close();
    }
  });

  it('resets transient state between requests on the same engine', async () => {
    const wasm = await engine('spice-ts-wasm');
    try {
      const first = await wasm.simulate(request(transientCircuit), { requestId: 'reuse-1' });
      const second = await wasm.simulate(request(transientCircuit), { requestId: 'reuse-2' });
      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (first.ok && second.ok) expect(second.data).toEqual(first.data);
    } finally {
      await wasm.close();
    }
  });

  it('rejects unsupported analyses and devices without falling back', async () => {
    const wasm = await engine('spice-ts-wasm');
    try {
      for (const [name, source] of Object.entries({
        nonlinear: 'V1 in 0 1\nD1 in 0 D\n.model D D\n.tran 1u 1m',
        inductor: 'V1 in 0 1\nL1 in 0 1m\n.tran 1u 1m',
        controlled: 'V1 in 0 1\nE1 out 0 in 0 2\n.tran 1u 1m',
        stepped: 'V1 in 0 1\nR1 in 0 1k\n.tran 1u 1m\n.step param R1 list 1k 2k',
      })) {
        const result = await wasm.simulate(request(source), { requestId: `unsupported-${name}` });
        expect(result).toMatchObject({
          ok: false,
          error: { code: 'UNSUPPORTED_FEATURE', retryable: false },
          metadata: { backend: 'spice-ts-wasm' },
        });
      }
    } finally {
      await wasm.close();
    }
  });

  it('returns exact diagnostics for unsupported transient controls', async () => {
    const wasm = await engine('spice-ts-wasm');
    try {
      for (const [source, feature, message] of [
        ['V1 in 0 1\nR1 in 0 1k\n.tran 1u 1m 1u', 'tran-start-time', 'Transient start time is not supported'],
        ['V1 in 0 1\nR1 in 0 1k\n.tran 1u 1m 0 100n', 'tran-max-timestep', 'Transient maximum timestep is not supported'],
        ['V1 in 0 1\nR1 in 0 1k\n.tran 1u 1m uic', 'tran-uic', 'Transient UIC is not supported'],
      ] as const) {
        const result = await wasm.simulate(request(source), { requestId: feature });
        expect(result).toMatchObject({
          ok: false,
          error: {
            code: 'UNSUPPORTED_FEATURE', message,
            details: { backend: 'spice-ts-wasm', feature },
          },
        });
      }
      const option = await wasm.simulate(request(transientCircuit, { integrationMethod: 'euler' }), {
        requestId: 'integration-method',
      });
      expect(option).toMatchObject({
        ok: false,
        error: {
          code: 'UNSUPPORTED_FEATURE', message: 'Only trapezoidal transient integration is supported',
          details: { backend: 'spice-ts-wasm', feature: 'integration-method' },
        },
      });
    } finally {
      await wasm.close();
    }
  });

  it('enforces caller and backend resource ceilings before allocation', async () => {
    const wasm = await engine('spice-ts-wasm');
    try {
      const limited = await wasm.simulate(request(circuits[0], {
        limits: { maxComponents: 1 },
      }), { requestId: 'component-limit' });
      expect(limited).toMatchObject({
        ok: false,
        error: { code: 'RESOURCE_LIMIT', details: { limit: 'maxComponents', configured: 1, observed: 2 } },
      });

      const oversized = Array.from({ length: 65 }, (_, index) => `V${index + 1} n${index + 1} 0 ${index + 1}`).join('\n') + '\n.op';
      const bounded = await wasm.simulate(request(oversized), { requestId: 'order-limit' });
      expect(bounded).toMatchObject({
        ok: false,
        error: { code: 'RESOURCE_LIMIT', details: { limit: 'maxSystemOrder', configured: 64 } },
      });

      const tooManyPoints = await wasm.simulate(request(transientCircuit, {
        limits: { maxResultPoints: 10 },
      }), { requestId: 'point-limit' });
      expect(tooManyPoints).toMatchObject({
        ok: false,
        error: { code: 'RESOURCE_LIMIT', details: { limit: 'maxResultPoints', configured: 10, observed: 11 } },
      });
    } finally {
      await wasm.close();
    }
  });

  it('rejects a correctly hashed but invalid numeric artifact before worker construction', async () => {
    const workerUrl = new URL('../dist/worker.js', import.meta.url);
    const workerBytes = new Uint8Array(await readFile(workerUrl));
    const invalid = Uint8Array.from([0, 97, 115, 109, 1, 0, 0]);
    const manifest: SpiceWorkerManifestV1 = {
      schemaVersion: 1,
      engineBuildId: `spice-ts-js-${sha256(workerBytes).slice(0, 16)}`,
      worker: { url: workerUrl.href, sha256: sha256(workerBytes) },
      numericWasm: {
        url: `data:application/wasm;base64,${Buffer.from(invalid).toString('base64')}`,
        sha256: sha256(invalid),
        byteLength: invalid.byteLength,
        engineBuildId: `spice-ts-wasm-${sha256(invalid).slice(0, 16)}`,
      },
    };
    let constructions = 0;
    await expect(createSpiceEngine({
      backend: 'spice-ts-wasm',
      manifest,
      workerFactory: () => { constructions++; throw new Error('must not construct'); },
    })).rejects.toBeInstanceOf(SpiceEngineError);
    expect(constructions).toBe(0);
  });

  it('registers cancellation before asynchronous WASM worker construction', async () => {
    const wasm = await engine('spice-ts-wasm');
    try {
      const pending = wasm.simulate(request(circuits[0]), { requestId: 'wasm-cancel' });
      expect(await wasm.cancel('wasm-cancel')).toEqual({ requestId: 'wasm-cancel', status: 'cancelling' });
      await expect(pending).resolves.toMatchObject({ ok: false, error: { code: 'CANCELLED' } });
    } finally {
      await wasm.close();
    }
  });

  it('terminates an unresponsive worker at the caller wall-time bound', async () => {
    let terminations = 0;
    const silentWorker: WorkerLike = {
      postMessage() {},
      onMessage() { return () => {}; },
      onError() { return () => {}; },
      terminate() { terminations++; },
    };
    const wasm = await createSpiceEngine({
      backend: 'spice-ts-wasm',
      workerFactory: () => silentWorker,
    });
    try {
      const result = await wasm.simulate(request(circuits[0], {
        limits: { maxWallTimeMs: 5 },
      }), { requestId: 'wasm-deadline' });
      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'RESOURCE_LIMIT',
          phase: 'solve',
          details: { limit: 'maxWallTimeMs', configured: 5, observed: 5 },
        },
      });
      expect(terminations).toBe(1);
    } finally {
      await wasm.close();
    }
  });
});
