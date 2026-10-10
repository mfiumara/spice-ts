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
          devices: ['R', 'I', 'V'],
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

  it('rejects unsupported analyses and devices without falling back', async () => {
    const wasm = await engine('spice-ts-wasm');
    try {
      for (const [name, source] of Object.entries({
        transient: 'V1 in 0 1\nR1 in 0 1k\n.tran 1u 1m',
        capacitor: 'V1 in 0 1\nC1 in 0 1u\n.op',
        waveform: 'V1 in 0 PULSE(0 1 0 1n 1n 1m 2m)\nR1 in 0 1k\n.op',
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
