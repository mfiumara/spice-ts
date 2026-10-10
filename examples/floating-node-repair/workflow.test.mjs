import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const workflow = fileURLToPath(new URL('./workflow.mjs', import.meta.url));
const server = fileURLToPath(new URL('../../packages/mcp/dist/stdio.js', import.meta.url));
const expected = readFileSync(new URL('./expected-output.json', import.meta.url), 'utf8');

test('repairs a floating node and keeps solve-only singularity distinct', () => {
  const output = execFileSync(process.execPath, [workflow, '--server', server], {
    cwd: fileURLToPath(new URL('.', import.meta.url)),
    encoding: 'utf8',
    timeout: 10_000,
  });

  assert.equal(output, expected);
});
