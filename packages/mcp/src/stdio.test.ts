import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { SimulationRequestV1, SimulationResultV1 } from '@spice-ts/protocol';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

let transport: StdioClientTransport | undefined;

afterEach(async () => {
  await transport?.close();
  transport = undefined;
});

describe('stdio transport', () => {
  it('lists and invokes the deterministic tool surface', async () => {
    transport = new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx', 'src/stdio.ts'],
      cwd: process.cwd(),
      stderr: 'pipe',
    });
    const client = new Client({ name: 'spice-ts-mcp-test', version: '1.0.0' });
    await client.connect(transport);

    const listed = await client.listTools();
    expect(listed.tools.map(tool => tool.name)).toEqual([
      'spice_capabilities', 'spice_validate', 'spice_simulate',
    ]);
    expect(listed.tools.every(tool => tool.inputSchema.type === 'object')).toBe(true);

    const response = await client.callTool({ name: 'spice_capabilities', arguments: {} });
    expect(response).toMatchObject({
      structuredContent: { protocolVersion: '1' },
    });

    const request = JSON.parse(await readFile(
      fileURLToPath(new URL('../fixtures/simulate-request.json', import.meta.url)),
      'utf8',
    )) as SimulationRequestV1;
    const expected = JSON.parse(await readFile(
      fileURLToPath(new URL('../fixtures/simulate-response.json', import.meta.url)),
      'utf8',
    )) as SimulationResultV1;
    const simulation = await client.callTool({
      name: 'spice_simulate',
      arguments: { request },
    });
    expect(simulation.structuredContent).toEqual(expected);
  });
});
