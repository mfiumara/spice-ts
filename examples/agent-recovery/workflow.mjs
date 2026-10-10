import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

async function main() {
const directory = new URL('.', import.meta.url);
const serverArgument = process.argv.indexOf('--server');
if (serverArgument < 0 || !process.argv[serverArgument + 1]) {
  throw new Error('Usage: node workflow.mjs --server /absolute/path/to/@spice-ts/mcp/dist/stdio.js');
}

const client = new StdioClient(resolve(process.argv[serverArgument + 1]));
const invalidRequest = JSON.parse(await readFile(new URL('./invalid-request.json', directory), 'utf8'));
const expectedResult = JSON.parse(await readFile(new URL('./expected-result.json', directory), 'utf8'));

try {
  await client.connect();

  const listed = await client.call('tools/list', {});
  const capabilityNames = listed.tools.map(({ name }) => name);
  const capabilities = structured(await client.call('tools/call', {
    name: 'spice_capabilities',
    arguments: {},
  }));
  const invalid = await client.call('tools/call', {
    name: 'spice_validate',
    arguments: { request: invalidRequest },
  });
  const diagnosis = resourceLimit(invalid);
  const observed = integer(diagnosis.details.actual, 'diagnosis.details.actual');

  const correctedRequest = structuredClone(invalidRequest);
  correctedRequest.options.limits.maxResultPoints = observed;
  const validation = structured(await client.call('tools/call', {
    name: 'spice_validate',
    arguments: { request: correctedRequest },
  }));
  const result = structured(await client.call('tools/call', {
    name: 'spice_simulate',
    arguments: { request: correctedRequest },
  }));

  assert.deepEqual(result, expectedResult, 'corrected simulation result drifted');
  const resultSha256 = createHash('sha256').update(JSON.stringify(result)).digest('hex');
  const report = {
    transport: 'stdio',
    callOrder: [
      'tools/list',
      'spice_capabilities',
      'spice_validate:invalid',
      'spice_validate:corrected',
      'spice_simulate:corrected',
    ],
    tools: capabilityNames,
    capabilities: {
      protocolVersion: capabilities.protocolVersion,
      analyses: capabilities.analyses,
      inputFormats: capabilities.inputFormats,
      limits: capabilities.limits,
    },
    invalidRequest: {
      requestedMaxResultPoints: invalidRequest.options.limits.maxResultPoints,
      diagnosis,
    },
    correction: {
      action: 'set-maxResultPoints-to-diagnosed-actual',
      maxResultPoints: observed,
      retainedLimits: correctedRequest.options.limits,
    },
    validation,
    verification: {
      method: 'exact-json-and-sha256',
      expectedFixture: 'expected-result.json',
      matched: true,
      resultSha256,
    },
    result,
  };

  const encoded = `${JSON.stringify(report, null, 2)}\n`;
  if (/(?:spice-ts-js|ngspice|eecircuit)/.test(encoded)) {
    throw new Error('Stable workflow output leaked an engine identifier');
  }
  process.stdout.write(encoded);
} finally {
  await client.close();
}
}

function structured(response) {
  const value = record(response.structuredContent, 'structuredContent');
  const text = response.content?.[0];
  assert.equal(text?.type, 'text', 'tool response must include text content');
  assert.equal(text.text, JSON.stringify(value), 'text and structured tool content disagree');
  return value;
}

function resourceLimit(response) {
  assert.equal(response.isError, true, 'invalid request must fail');
  const value = structured(response);
  const error = record(value.error, 'error');
  const details = record(error.details, 'error.details');
  assert.deepEqual(Object.keys(error), ['code', 'message', 'retryable', 'phase', 'details']);
  assert.equal(error.code, 'RESOURCE_LIMIT');
  assert.equal(error.retryable, false);
  assert.equal(error.phase, 'validation');
  assert.equal(details.limit, 'maxResultPoints');
  assert.equal(integer(details.maximum, 'error.details.maximum'), 0);
  assert.ok(integer(details.actual, 'error.details.actual') > 0);
  return error;
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

class StdioClient {
  constructor(serverPath) {
    this.serverPath = serverPath;
    this.nextId = 1;
    this.pending = new Map();
    this.stderr = '';
    this.buffer = '';
  }

  async connect() {
    this.child = spawn(process.execPath, [this.serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child.stdout.setEncoding('utf8');
    this.child.stderr.setEncoding('utf8');
    this.child.stdout.on('data', chunk => this.receive(chunk));
    this.child.stderr.on('data', chunk => { this.stderr += chunk; });
    this.child.once('error', error => this.rejectAll(error));
    this.child.once('exit', (code, signal) => {
      if (this.pending.size > 0) {
        this.rejectAll(new Error(`MCP server exited early (${code ?? signal}): ${this.stderr}`));
      }
    });

    await this.call('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'spice-ts-file-recovery-example', version: '1.0.0' },
    });
    this.notify('notifications/initialized', {});
  }

  call(method, params) {
    const id = this.nextId++;
    const message = { jsonrpc: '2.0', id, method, params };
    return new Promise((resolvePromise, rejectPromise) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        rejectPromise(new Error(`Timed out waiting for ${method}: ${this.stderr}`));
      }, 5_000);
      this.pending.set(id, {
        resolve: value => {
          clearTimeout(timeout);
          resolvePromise(value);
        },
        reject: error => {
          clearTimeout(timeout);
          rejectPromise(error);
        },
      });
      this.write(message);
    });
  }

  notify(method, params) {
    this.write({ jsonrpc: '2.0', method, params });
  }

  write(message) {
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  receive(chunk) {
    this.buffer += chunk;
    while (this.buffer.includes('\n')) {
      const boundary = this.buffer.indexOf('\n');
      const line = this.buffer.slice(0, boundary).replace(/\r$/, '');
      this.buffer = this.buffer.slice(boundary + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      if (message.id === undefined) continue;
      const pending = this.pending.get(message.id);
      if (!pending) throw new Error(`Unexpected JSON-RPC response id: ${message.id}`);
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(`JSON-RPC ${message.error.code}: ${message.error.message}`));
      } else {
        pending.resolve(message.result);
      }
    }
  }

  rejectAll(error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  async close() {
    if (!this.child || this.child.exitCode !== null) return;
    this.child.stdin.end();
    const exited = new Promise(resolvePromise => this.child.once('exit', resolvePromise));
    const forced = new Promise(resolvePromise => setTimeout(() => {
      if (this.child.exitCode === null) this.child.kill();
      resolvePromise();
    }, 1_000));
    await Promise.race([exited, forced]);
  }
}

await main();
