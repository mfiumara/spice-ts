import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const workflow = fileURLToPath(new URL('./partial-terminal.mjs', import.meta.url));
const floatingNodeWorkflow = fileURLToPath(new URL('../../floating-node-repair/workflow.mjs', import.meta.url));
const server = fileURLToPath(new URL('../../../packages/mcp/dist/stdio.js', import.meta.url));

// Hang guard only (see #411/#424): workflows have no wall-clock deadline, so a
// loaded CI runner makes them slower, never wrong.
const HANG_GUARD_MS = 120_000;

function run(script, args = []) {
  return execFileSync(process.execPath, [script, ...args], {
    cwd: fileURLToPath(new URL('.', import.meta.url)),
    encoding: 'utf8',
    timeout: HANG_GUARD_MS,
  });
}

test('workflow A: floating node -> INVALID_CIRCUIT -> repair -> OP, solve-only SINGULAR_MATRIX', { timeout: HANG_GUARD_MS }, () => {
  const expected = readFileSync(new URL('../../floating-node-repair/expected-output.json', import.meta.url), 'utf8');
  assert.equal(run(floatingNodeWorkflow, ['--server', server]), expected);
});

test('workflow B: threshold-cancelled circuit-json transient yields a schema-valid partial terminal without resultSha256', { timeout: HANG_GUARD_MS }, () => {
  const expected = readFileSync(new URL('./expected-output.json', import.meta.url), 'utf8');
  assert.equal(run(workflow), expected);
});
