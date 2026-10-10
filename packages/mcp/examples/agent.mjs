import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';

/**
 * @typedef {{
 *   code: string,
 *   message: string,
 *   retryable: boolean,
 *   phase: string,
 *   details: Record<string, unknown>,
 * }} PublicError
 */

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL('../dist/stdio.js', import.meta.url))],
  stderr: 'pipe',
});
const client = new Client({ name: 'spice-ts-bounded-agent-example', version: '1.0.0' });

const request = {
  apiVersion: '1',
  input: {
    format: 'spice',
    source: 'V1 in 0 10\nR1 in out 1k\nR2 out 0 1k\n.op',
  },
};

try {
  await client.connect(transport);

  const capabilities = structured(await client.callTool({
    name: 'spice_capabilities',
    arguments: {},
  }));
  const validation = structured(await client.callTool({
    name: 'spice_validate',
    arguments: { request },
  }));

  const bounded = await client.callTool({
    name: 'spice_simulate',
    arguments: {
      request: {
        ...request,
        options: { limits: { maxResultPoints: 0 } },
      },
    },
  });
  const error = resourceLimit(bounded);

  // Recover from public fields only. No backend identifier or error-message parsing.
  const observed = integer(error.details.actual, 'error.details.actual');
  const recovered = structured(await client.callTool({
    name: 'spice_simulate',
    arguments: {
      request: {
        ...request,
        options: { limits: { maxResultPoints: observed } },
      },
    },
  }));

  const report = {
    callOrder: [
      'spice_capabilities',
      'spice_validate',
      'spice_simulate:bounded',
      'spice_simulate:recovered',
    ],
    capabilities: {
      protocolVersion: capabilities.protocolVersion,
      analyses: capabilities.analyses,
      inputFormats: capabilities.inputFormats,
      maxResultPoints: record(capabilities.limits, 'capabilities.limits').maxResultPoints,
    },
    validation,
    boundedFailure: { error },
    recovery: {
      action: 'raise-maxResultPoints-to-observed',
      maxResultPoints: observed,
      result: recovered,
    },
  };

  const encoded = JSON.stringify(report, null, 2);
  if (/(?:spice-ts-js|spice-ts-wasm|ngspice-wasm)/.test(encoded)) {
    throw new Error('Public workflow output leaked a backend identifier');
  }
  process.stdout.write(`${encoded}\n`);
} finally {
  await client.close();
}

function structured(response) {
  const value = record(response.structuredContent, 'structuredContent');
  const text = response.content?.[0];
  if (text?.type !== 'text' || text.text !== JSON.stringify(value)) {
    throw new Error('MCP text and structured content disagree');
  }
  return value;
}

/** @returns {PublicError} */
function resourceLimit(response) {
  if (response.isError !== true) throw new Error('Expected a bounded simulation failure');
  const value = structured(response);
  const error = record(value.error, 'error');
  const details = record(error.details, 'error.details');
  const expectedKeys = ['code', 'message', 'retryable', 'phase', 'details'];
  if (JSON.stringify(Object.keys(error)) !== JSON.stringify(expectedKeys)
    || error.code !== 'RESOURCE_LIMIT'
    || error.retryable !== false
    || error.phase !== 'validation'
    || details.limit !== 'maxResultPoints'
    || integer(details.actual, 'error.details.actual') <= integer(details.maximum, 'error.details.maximum')) {
    throw new Error(`Unexpected resource-limit shape: ${JSON.stringify(value)}`);
  }
  return /** @type {PublicError} */ (error);
}

function record(value, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Expected ${name} to be an object`);
  }
  return value;
}

function integer(value, name) {
  if (!Number.isInteger(value)) throw new Error(`Expected ${name} to be an integer`);
  return value;
}