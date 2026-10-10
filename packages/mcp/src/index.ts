import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createToolExecutor, MCP_TOOLS } from './server.js';
import type { ToolExecutorOptions } from './server.js';

export function createMcpServer(options: Omit<ToolExecutorOptions, 'signal'> = {}): Server {
  const executeTool = createToolExecutor(options);
  const server = new Server(
    { name: '@spice-ts/mcp', version: '0.3.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: [...MCP_TOOLS] }));
  server.setRequestHandler(CallToolRequestSchema, (request, extra) => executeTool(
    request.params.name,
    request.params.arguments ?? {},
    { signal: extra.signal },
  ));
  return server;
}

export {
  createToolExecutor,
  DEFAULT_MCP_STREAM_LIMITS,
  DEFAULT_MCP_LIMITS,
  DEFAULT_STREAM_CHUNK_POINTS,
  executeTool,
  MAX_RETAINED_STREAM_JOBS,
  MAX_STREAM_CHUNK_POINTS,
  MCP_TOOLS,
} from './server.js';
export type {
  ExecutionWorker,
  McpLimits,
  McpStreamLimits,
  StreamClock,
  ToolExecutionOptions,
  ToolExecutor,
  ToolExecutorOptions,
} from './server.js';
