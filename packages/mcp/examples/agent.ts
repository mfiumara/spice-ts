import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../src/index.js';

const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
const server = createMcpServer();
const client = new Client({ name: 'spice-ts-agent-example', version: '1.0.0' });

await Promise.all([
  server.connect(serverTransport),
  client.connect(clientTransport),
]);

const request = {
  apiVersion: '1' as const,
  input: {
    format: 'spice' as const,
    source: 'V1 in 0 10\nR1 in out 1k\nR2 out 0 1k\n.op',
  },
};

const capabilities = await client.callTool({ name: 'spice_capabilities', arguments: {} });
const validation = await client.callTool({ name: 'spice_validate', arguments: { request } });
const simulation = await client.callTool({ name: 'spice_simulate', arguments: { request } });

console.log(JSON.stringify({
  capabilities: capabilities.structuredContent,
  validation: validation.structuredContent,
  simulation: simulation.structuredContent,
}, null, 2));

await client.close();
await server.close();
