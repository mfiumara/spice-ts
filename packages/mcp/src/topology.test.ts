import { validateProtocolV1 } from '@spice-ts/core';
import { describe, expect, it } from 'vitest';
import { executeTool } from './server.js';

const cases = [
  { source: 'V1 a 0 1\nR1 a tip 1k\n.op', code: 'FLOATING_NODE', nodes: ['tip'], elements: ['R1'] },
  { source: 'V1 a 0 1\nR1 a 0 1k\nC1 a sense 1u\nI1 sense 0 1m\n.op', code: 'NO_DC_PATH_TO_GROUND', nodes: ['sense'], elements: ['C1', 'I1'] },
  { source: 'V1 a 0 1\nL1 a b 1m\nV2 b 0 2\n.op', code: 'VOLTAGE_SOURCE_LOOP', nodes: ['0', 'a', 'b'], elements: ['L1', 'V1', 'V2'] },
];

describe('spice_validate topology warnings', () => {
  it.each(cases)('reports $code without rejecting the request', async ({ source, code, nodes, elements }) => {
    const result = await executeTool('spice_validate', { request: { apiVersion: '1', input: { format: 'spice', source } } });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ status: 'valid', diagnostics: [
      { code, severity: 'warning', nodes, elements, hint: expect.stringMatching(/^[^\n]+$/) },
    ] });
    expect((result.structuredContent as { diagnostics: unknown[] }).diagnostics).toHaveLength(1);
  });

  it.each([
    'V1 a 0 1\nR1 a b 1k\nR2 b 0 1k\nC1 b 0 1u\n.op',
    `${cases[1]!.source}\n.options rshunt=1G`,
    // Existing golden request, RC transient and DC sweep MCP decks.
    'V1 in 0 10\nR1 in 0 1k\n.op',
    'V1 a 0 PULSE(0 1 0 1n 1n 5u 10u)\nR1 a b 1k\nC1 b 0 1n\n.tran 1u 20u',
    'V1 a 0 1\nR1 a 0 1k\n.dc V1 0 2 1',
  ])('accepts a grounded or shunted deck', async source => {
    const result = await executeTool('spice_validate', { request: { apiVersion: '1', input: { format: 'spice', source } } });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ status: 'valid' });
    expect((result.structuredContent as { diagnostics?: unknown[] }).diagnostics ?? []).toEqual([]);
  });

  it('uses warnings with an injected core validator too', async () => {
    const result = await executeTool('spice_validate', { request: { apiVersion: '1', input: { format: 'spice', source: cases[2]!.source } } }, { validate: validateProtocolV1 });
    expect(result.structuredContent).toMatchObject({ diagnostics: [{ code: 'VOLTAGE_SOURCE_LOOP' }] });
  });
});
