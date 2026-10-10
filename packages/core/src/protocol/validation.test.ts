import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

const { simulateSpy } = vi.hoisted(() => ({
  simulateSpy: vi.fn(() => {
    throw new Error('numerical solve must not run during validation');
  }),
}));

vi.mock('../simulate.js', () => ({ simulate: simulateSpy }));

import { mapProtocolErrorV1, validateProtocolV1 } from './adapter.js';
import { TopologyPreflightError } from '../validation/topology-preflight.js';
import type { SimulationRequestV1 } from './types.js';

function sourceFixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

function request(source: string): SimulationRequestV1 {
  return { apiVersion: '1', input: { format: 'spice', source } };
}

function canonicalHash(value: unknown): string {
  const canonical = (current: unknown): unknown => {
    if (Array.isArray(current)) return current.map(canonical);
    if (current !== null && typeof current === 'object') {
      const record = current as Record<string, unknown>;
      return Object.fromEntries(Object.keys(record).sort().map(key => [key, canonical(record[key])]));
    }
    return Object.is(current, -0) ? 0 : current;
  };
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

describe('protocol v1 topology validation', () => {
  it.each([
    ['topology-floating.cir', 'FLOATING_COMPONENT', ['a', 'b'], ['/input/source/lines/0'], '4edc2f75094dd88b1435d0257d41af699489cf2729a2f046d8ff3736ce35c063'],
    ['topology-no-dc-reference.cir', 'NO_DC_REFERENCE', ['sense'], ['/input/source/lines/1', '/input/source/lines/2'], '75a321d175413a1775e65e4c8a5476c5ec1c8e42fe1a873fc0d9fd794e4026f2'],
    ['topology-vccs-floating-control.cir', 'NO_DC_REFERENCE', ['c', 'd'], ['/input/source/lines/1', '/input/source/lines/2'], '51ed3e8ce7b4040c807b6d00b06afd1ac584c96ba742dd610cd7646928ab8345'],
    ['topology-ideal-loop.cir', 'IDEAL_SOURCE_LOOP', ['0', 'a', 'b'], ['/input/source/lines/0', '/input/source/lines/1', '/input/source/lines/2'], '8d472b101c4d934d5470b3332c9cf164e3ce64f68382f30fd56d0064e12e89d9'],
  ] as const)('maps %s to typed INVALID_CIRCUIT details before solve', async (fixtureName, kind, involvedNodes, sourcePaths, expectedHash) => {
    let caught: unknown;
    try {
      await validateProtocolV1(request(sourceFixture(fixtureName)));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(TopologyPreflightError);
    const mapped = mapProtocolErrorV1(caught);
    expect(mapped).toEqual({
      code: 'INVALID_CIRCUIT',
      message: expect.any(String),
      retryable: false,
      phase: 'validation',
      details: { kind, involvedNodes, sourcePaths },
    });
    expect(canonicalHash(mapped)).toBe(expectedHash);
    expect(simulateSpy).not.toHaveBeenCalled();
  });

  it('accepts valid disconnected grounded controls without numerically solving', async () => {
    const result = await validateProtocolV1(request(sourceFixture('topology-valid-disconnected.cir')));

    expect(result).toEqual({ status: 'valid', nodeCount: 2, branchCount: 2, analysisCount: 1 });
    expect(simulateSpy).not.toHaveBeenCalled();
    expect(canonicalHash(result)).toBe('48a4d28f73e23476e9fb124cb4e55433b8f52df4c128725556ff3c72f9000a5f');
  });

  it('reports native-document component JSON pointers', async () => {
    const nativeRequest: SimulationRequestV1 = {
      apiVersion: '1',
      input: {
        format: 'spice-ts',
        document: {
          format: 'spice-ts', schemaVersion: '1.0',
          circuit: {
            nets: ['a', 'b'],
            components: [{
              type: 'R', id: 'R1', name: 'R1',
              ports: [{ name: 'p', net: 'a' }, { name: 'n', net: 'b' }],
              params: { resistance: 1000 },
            }],
          },
          analyses: [{ type: 'op' }], models: [], subcircuits: [],
        },
      },
    };

    await expect(validateProtocolV1(nativeRequest)).rejects.toMatchObject({
      kind: 'FLOATING_COMPONENT',
      involvedNodes: ['a', 'b'],
      sourcePaths: ['/input/document/circuit/components/0'],
    });
    expect(simulateSpy).not.toHaveBeenCalled();
  });
});
