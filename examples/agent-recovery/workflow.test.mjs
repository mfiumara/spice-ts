import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const workflow = fileURLToPath(new URL('./workflow.mjs', import.meta.url));
const server = fileURLToPath(new URL('../../packages/mcp/dist/stdio.js', import.meta.url));
const slowStartServer = fileURLToPath(new URL('./slow-start-server.mjs', import.meta.url));
const expected = readFileSync(new URL('./expected-output.json', import.meta.url), 'utf8');

// Hang guard only: the workflow itself has no wall-clock deadline, so a slow
// machine makes it slower, never wrong. A server that dies fails it at once.
const HANG_GUARD_MS = 120_000;

function runWorkflow(serverPath, env = {}) {
  return execFileSync(process.execPath, [workflow, '--server', serverPath], {
    cwd: fileURLToPath(new URL('.', import.meta.url)),
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: HANG_GUARD_MS,
  });
}

test('recovers an invalid file request through built MCP stdio', { timeout: HANG_GUARD_MS }, () => {
  assert.equal(runWorkflow(server), expected);
});

test('waits for an MCP server that is slow to start instead of timing out', { timeout: HANG_GUARD_MS }, () => {
  // Longer than any fixed per-request deadline a client might pick for a fast machine.
  const output = runWorkflow(slowStartServer, {
    SPICE_TS_SLOW_START_MS: '6000',
    SPICE_TS_SLOW_START_SERVER: server,
  });

  assert.equal(output, expected);
});

test('fails fast with the server stderr when the MCP server exits early', { timeout: HANG_GUARD_MS }, () => {
  // Without SPICE_TS_SLOW_START_SERVER the stand-in server throws on startup.
  const started = Date.now();
  assert.throws(
    () => runWorkflow(slowStartServer, { SPICE_TS_SLOW_START_MS: '0', SPICE_TS_SLOW_START_SERVER: '' }),
    error => /MCP server exited early/.test(error.stderr)
      && /Set SPICE_TS_SLOW_START_MS and SPICE_TS_SLOW_START_SERVER/.test(error.stderr),
  );
  assert.ok(Date.now() - started < HANG_GUARD_MS / 2, 'early exit must not wait for the hang guard');
});
