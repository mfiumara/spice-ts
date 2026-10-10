import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { executeTool, MCP_TOOLS } from './server.js';
import type { ToolExecutionOptions } from './server.js';

export function createMcpServer(options: Omit<ToolExecutionOptions, 'signal'> = {}): Server {
  const server = new Server(
    { name: '@spice-ts/mcp', version: '0.3.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: [...MCP_TOOLS] }));
  server.setRequestHandler(CallToolRequestSchema, (request, extra) => executeTool(
    request.params.name,
    request.params.arguments ?? {},
    { ...options, signal: extra.signal },
  ));
  return server;
}

export { DEFAULT_MCP_LIMITS, executeTool, MCP_TOOLS } from './server.js';
export type { McpLimits, ToolExecutionOptions } from './server.js';
